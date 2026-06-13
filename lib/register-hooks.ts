import { LOW_SIGNAL_BLOCK_THRESHOLD, MAX_EVIDENCE_COUNT, NEW_BEHAVIOR_RULES, PLUGIN_VERSION } from "./constants";
import { AuditLogger, defaultAuditLogPath, resolveRuntimeArtifactsDir } from "./audit";
import { readCompactionSnapshot, writeCompactionSnapshot } from "./compaction";
import { getPathHints, mutatesExistingPath, pathExistsFromHint, pathHintsOverlap, readbackPathsValidateTouchedPaths } from "./path";
import {
  appendDangerousLabel,
  appendEvidenceLabel,
  appendMutationLabel,
  appendValidationLabel,
  clearAdvisory,
  clearBlockDecision,
  clearClassifierDecision,
  clearEvidenceSuggestions,
  clearValidationSuggestions,
  getSessionState,
  mergeEvidencePaths,
  mergeEvidenceSuggestions,
  mergeTouchedFiles,
  mergeValidationSuggestions,
  markLastAdvisoryIgnored,
  pruneSessionStates,
  recordAdvisory,
  recordBlockDecision,
  recordClassifierDecision,
} from "./session-state";
import { extractTextFromToolResult, firstStringField, normalizeSignalText } from "./text";
import { getToolResultStatus, isBlockedToolResult } from "./result-status";
import {
  closeSummary,
  finalReviewChecklist,
  renderTaskContext,
  taskSnapshot,
} from "./task-ledger";
import { changedPathHints, summarizePaths, suggestEvidence, suggestValidations } from "./validation";
import {
  buildToolIntentSignature,
  describeMutation,
  describeObservation,
  getCanonicalToolName,
  getDangerousCommandAction,
  getAdvisoryInjection,
  getEnforcementMode,
  getExecCommand,
  getLowSignalBlockThreshold,
  getMutationBatchMax,
  getSummaryThreshold,
  getValidationPolicy,
  getToolCategory,
  isDangerousCommand,
  isEvidenceObservation,
  isLikelyMutatingExec,
  isLikelyValidationExec,
  isLowSignalObservation,
  summarizeLargeOutput,
} from "./tooling";
import type { EnforcementMode, ProofrailApi, ProofrailContext, ProofrailEvent, CompactionSnapshot, GuardrailClassifier, SessionRuntimeState } from "./types";
import { normalizeClassifierDecision, RuleBasedGrayAreaClassifier, shouldRunClassifier } from "./classifier";

interface SessionCompactionState {
  count: number;
  snapshot?: CompactionSnapshot;
}

function getEvent(event: unknown): ProofrailEvent {
  return (event || {}) as ProofrailEvent;
}

function getInput(event: ProofrailEvent): Record<string, unknown> {
  return {
    ...(event.params || {}),
    ...(event.input || {}),
  } as Record<string, unknown>;
}

function getDerivedPaths(event: ProofrailEvent): readonly string[] | undefined {
  return Array.isArray(event.derivedPaths) ? event.derivedPaths : undefined;
}

function getSessionKey(ctx?: ProofrailContext, event?: ProofrailEvent): string {
  if (typeof ctx?.sessionKey === "string" && ctx.sessionKey.trim()) return ctx.sessionKey.trim();
  if (typeof ctx?.sessionId === "string" && ctx.sessionId.trim()) return ctx.sessionId.trim();
  if (typeof event?.sessionId === "string" && event.sessionId.trim()) return event.sessionId.trim();
  if (typeof event?.conversationId === "string" && event.conversationId.trim()) return event.conversationId.trim();
  return "default";
}

function getMutationBaseDir(api: ProofrailApi, ctx?: ProofrailContext): string | undefined {
  if (typeof ctx?.workspaceDir === "string" && ctx.workspaceDir.trim()) return ctx.workspaceDir.trim();
  if (typeof ctx?.cwd === "string" && ctx.cwd.trim()) return ctx.cwd.trim();
  const resolved = api.runtime?.agent?.resolveAgentWorkspaceDir?.(api.config, ctx?.agentId);
  if (typeof resolved === "string" && resolved.trim()) return resolved.trim();
  return undefined;
}

function hasRelevantEvidence(
  state: SessionRuntimeState,
  targetPaths: readonly string[],
  requirePathOverlap: boolean,
  baseDir?: string,
): boolean {
  if (state.evidenceCount === 0) return false;
  if (!requirePathOverlap || targetPaths.length === 0) return true;
  return pathHintsOverlap(state.evidencePaths, targetPaths, baseDir);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function shouldHydrateFromSnapshot(state: SessionRuntimeState, snapshot?: CompactionSnapshot): snapshot is CompactionSnapshot {
  if (!snapshot) return false;
  if (state.pendingVerification || state.mutationCount > 0 || state.validationCount > 0 || state.evidenceCount > 0) return false;
  return snapshot.pendingVerification === true || !!snapshot.mutationCount || !!snapshot.validationCount;
}

function hydrateStateFromCompactionSnapshot(state: SessionRuntimeState, snapshot?: CompactionSnapshot): boolean {
  if (!shouldHydrateFromSnapshot(state, snapshot)) return false;
  if (snapshot.phase === "observe" || snapshot.phase === "execute" || snapshot.phase === "review") state.phase = snapshot.phase;
  state.pendingVerification = snapshot.pendingVerification === true;
  state.lastMutationLabel = snapshot.lastMutationLabel;
  state.lastValidatedMutation = snapshot.lastValidatedMutation;
  state.lastValidationCommand = snapshot.lastValidationCommand;
  state.mutationCount = typeof snapshot.mutationCount === "number" ? snapshot.mutationCount : state.mutationCount;
  state.unverifiedMutationCount = typeof snapshot.unverifiedMutationCount === "number" ? snapshot.unverifiedMutationCount : state.unverifiedMutationCount;
  state.validationCount = typeof snapshot.validationCount === "number" ? snapshot.validationCount : state.validationCount;
  state.touchedFiles = asStringArray(snapshot.touchedFiles);
  state.validationSuggestions = asStringArray(snapshot.validationSuggestions);
  state.lastValidationLabel = snapshot.lastValidationLabel;
  state.lastBlockMessage = snapshot.lastBlockMessage;
  state.lastBlockReason = snapshot.lastBlockReason;
  state.advisoryCount = typeof snapshot.advisoryCount === "number" ? snapshot.advisoryCount : state.advisoryCount;
  state.ignoredAdvisoryCount = typeof snapshot.ignoredAdvisoryCount === "number" ? snapshot.ignoredAdvisoryCount : state.ignoredAdvisoryCount;
  state.lastAdvisory = snapshot.lastAdvisory;
  state.lastUpdatedAt = Date.now();
  return true;
}

function restoreCompactionSnapshotIfNeeded(params: {
  api: ProofrailApi;
  audit: AuditLogger;
  compactionStates: Map<string, SessionCompactionState>;
  sessionKey: string;
  state: SessionRuntimeState;
}): void {
  try {
    const snapshot = readCompactionSnapshot(params.api, params.sessionKey);
    if (!hydrateStateFromCompactionSnapshot(params.state, snapshot)) return;
    const existing = params.compactionStates.get(params.sessionKey);
    params.compactionStates.set(params.sessionKey, {
      count: existing?.count || 1,
      snapshot,
    });
    params.audit.record("compaction_state_restored", {
      sessionKey: params.sessionKey,
      pendingVerification: params.state.pendingVerification,
      lastMutationLabel: params.state.lastMutationLabel,
      mutationCount: params.state.mutationCount,
      validationCount: params.state.validationCount,
    });
  } catch (error) {
    params.audit.record("compaction_state_restore_failed", { sessionKey: params.sessionKey, error: String(error) });
  }
}

function recordIgnoredAdvisory(params: {
  state: SessionRuntimeState;
  audit: AuditLogger;
  sessionKey: string;
  toolName: string;
  command?: string;
  toolIntent: string;
  reasons: readonly string[];
}): void {
  const advisory = markLastAdvisoryIgnored(params.state, params.reasons);
  if (!advisory) return;
  params.audit.record("advisory_ignored", {
    sessionKey: params.sessionKey,
    reason: advisory.reason,
    severity: advisory.severity,
    target: advisory.target,
    toolName: params.toolName,
    command: params.command,
    toolIntent: params.toolIntent,
  });
}

function buildStateExplanation(state: SessionRuntimeState, auditLogPath?: string): Record<string, unknown> {
  let nextExpected = "observe";
  if (state.pendingVerification) nextExpected = "validation";
  else if (state.phase === "execute") nextExpected = "minimal mutation or more evidence";
  else if (state.consecutiveLowSignal >= LOW_SIGNAL_BLOCK_THRESHOLD) nextExpected = "change probe strategy";

  return {
    plugin: "proofrail",
    phase: state.phase,
    evidenceCount: state.evidenceCount,
    pendingVerification: state.pendingVerification,
    lastEvidenceLabel: state.lastEvidenceLabel,
    lastMutationLabel: state.lastMutationLabel,
    consecutiveLowSignal: state.consecutiveLowSignal,
    lastLowSignalIntent: state.lastLowSignalIntent,
    mutationCount: state.mutationCount,
    validationCount: state.validationCount,
    dangerousCount: state.dangerousCount,
    lastDangerousLabel: state.lastDangerousLabel,
    lastValidationLabel: state.lastValidationLabel,
    lastValidatedMutation: state.lastValidatedMutation,
    lastValidationCommand: state.lastValidationCommand,
    touchedFiles: [...state.touchedFiles],
    evidencePaths: [...state.evidencePaths],
    evidenceSuggestions: [...state.evidenceSuggestions],
    validationSuggestions: [...state.validationSuggestions],
    evidenceLabels: [...state.evidenceLabels],
    mutationLabels: [...state.mutationLabels],
    validationLabels: [...state.validationLabels],
    dangerousLabels: [...state.dangerousLabels],
    finalReportRequired: state.finalReportRequired,
    advisoryCount: state.advisoryCount,
    ignoredAdvisoryCount: state.ignoredAdvisoryCount,
    lastAdvisory: state.lastAdvisory,
    unverifiedMutationCount: state.unverifiedMutationCount,
    lastBlockMessage: state.lastBlockMessage,
    lastBlockReason: state.lastBlockReason,
    lastClassifierDecision: state.lastClassifierDecision,
    lastClassifierReason: state.lastClassifierReason,
    lastClassifierEvidenceGap: state.lastClassifierEvidenceGap,
    lastClassifierGuidance: [...state.lastClassifierGuidance],
    lastClassifierSource: state.lastClassifierSource,
    task: taskSnapshot(state),
    nextExpected,
    auditLogPath,
  };
}

function workflowRiskBlocks(mode: EnforcementMode): boolean {
  return mode === "strict";
}

function workflowRiskDecision(params: {
  state: SessionRuntimeState;
  audit: AuditLogger;
  sessionKey: string;
  toolName: string;
  toolIntent: string;
  reason: string;
  message: string;
  mode: EnforcementMode;
  severity?: "info" | "warn" | "risk";
  target?: string;
  fastestNextAction?: string;
  riskIfIgnored?: string;
  extra?: Record<string, unknown>;
}): { block: true; blockReason: string } | undefined {
  if (params.mode === "off") return undefined;
  if (workflowRiskBlocks(params.mode)) {
    recordBlockDecision(params.state, params.message, params.reason);
    params.audit.record("tool_decision", {
      sessionKey: params.sessionKey,
      toolName: params.toolName,
      reason: params.reason,
      decision: "block",
      toolIntent: params.toolIntent,
      ...(params.extra || {}),
    });
    return { block: true, blockReason: params.message };
  }
  recordAdvisory(params.state, {
    reason: params.reason,
    message: params.message,
    severity: params.severity,
    target: params.target,
    fastestNextAction: params.fastestNextAction,
    riskIfIgnored: params.riskIfIgnored,
  });
  params.audit.record("tool_advisory", {
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    reason: params.reason,
    severity: params.severity || "warn",
    wouldHaveBlockedInStrict: true,
    toolIntent: params.toolIntent,
    ...(params.extra || {}),
  });
  return undefined;
}

function closeSession(params: {
  sessionStates: Map<string, SessionRuntimeState>;
  sessionKey: string;
  audit: AuditLogger;
  eventName: "session_end" | "session_start" | "session_close";
  extra?: Record<string, unknown>;
}): void {
  const state = params.sessionStates.get(params.sessionKey);
  if (!state) {
    params.audit.record(params.eventName, { sessionKey: params.sessionKey, alreadyClosed: true, ...(params.extra || {}) });
    return;
  }
  const summary = closeSummary(state);
  params.audit.record(params.eventName, {
    sessionKey: params.sessionKey,
    phase: state.phase,
    pendingVerification: state.pendingVerification,
    mutationCount: state.mutationCount,
    validationCount: state.validationCount,
    warning: state.pendingVerification ? "unverified_mutations" : undefined,
    task: summary,
    ...(params.extra || {}),
  });
  params.audit.record("task_summary", { sessionKey: params.sessionKey, ...summary });
  params.sessionStates.delete(params.sessionKey);
}

export function registerProofrailHooks(api: ProofrailApi): void {
  const log = api.logger;
  const compactionStates = new Map<string, SessionCompactionState>();
  const sessionStates = new Map<string, SessionRuntimeState>();
  const auditLogPath = defaultAuditLogPath(api);
  const audit = new AuditLogger(auditLogPath);

  log.info(`[proofrail v${PLUGIN_VERSION}] registering hooks (phase 1+2+3+5+6+ledger)...`);

  api.on("session_start", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    pruneSessionStates(sessionStates);
    const state = getSessionState(sessionStates, sessionKey);
    restoreCompactionSnapshotIfNeeded({ api, audit, compactionStates, sessionKey, state });
    audit.record("session_start", { sessionKey, resumedFrom: event.resumedFrom });
  }, { priority: 30 });

  api.on("session_end", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    closeSession({
      sessionStates,
      sessionKey,
      audit,
      eventName: "session_end",
      extra: {
        reason: event.reason,
        messageCount: event.messageCount,
        durationMs: event.durationMs,
        sessionFile: event.sessionFile,
        transcriptArchived: event.transcriptArchived,
        nextSessionId: event.nextSessionId,
        nextSessionKey: event.nextSessionKey,
      },
    });
  }, { priority: 30 });

  api.on("before_tool_call", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const toolName = getCanonicalToolName(event.toolName, event.tool?.name);
    const input = getInput(event);
    const category = getToolCategory(toolName);
    const derivedPaths = getDerivedPaths(event);
    const sessionKey = getSessionKey(ctx, event);
    const toolIntent = buildToolIntentSignature(toolName, input, derivedPaths);

    pruneSessionStates(sessionStates);
    const state = getSessionState(sessionStates, sessionKey);
    restoreCompactionSnapshotIfNeeded({ api, audit, compactionStates, sessionKey, state });
    const enforcementMode = getEnforcementMode(api, event);
    const validationPolicy = getValidationPolicy(api, event);
    const command = getExecCommand(input);
    const mutationBaseDir = getMutationBaseDir(api, ctx);
    const mutatingExec = category === "exec" && isLikelyMutatingExec(command);
    const targetPaths = category === "write"
      ? getPathHints(input, derivedPaths, { includeCwd: false })
      : changedPathHints(toolName, input, command);
    const mutationTouchesExistingPath = (category === "write" && mutatesExistingPath(input, derivedPaths, mutationBaseDir))
      || (mutatingExec && targetPaths.some((pathHint) => pathExistsFromHint(pathHint, mutationBaseDir)));
    const relevantEvidence = hasRelevantEvidence(state, targetPaths, mutationTouchesExistingPath, mutationBaseDir);
    const isMutation = category === "write" || mutatingExec;

    if (category === "exec" && command) {
      const check = isDangerousCommand(command);
      if (check.dangerous) {
        const dangerousPolicy = getDangerousCommandAction(api, event);
        state.dangerousCount += 1;
        state.lastDangerousLabel = check.label;
        appendDangerousLabel(state, check.label);
        audit.record("dangerous_command", { sessionKey, toolName, command, label: check.label, policy: dangerousPolicy });
        log.warn(`[proofrail/P0] dangerous [${check.label}] policy=${dangerousPolicy}: ${command.slice(0, 120)}`);

        if (dangerousPolicy === "block") {
          const blockReason = `High-risk command blocked by plugin policy: ${check.label}`;
          recordBlockDecision(state, blockReason, "dangerous_command");
          return { block: true, blockReason };
        }

        if (dangerousPolicy === "approve") {
          const blockReason = `High-risk command requires approval before retry: ${check.label}`;
          recordBlockDecision(state, blockReason, "dangerous_command_approve");
          return {
            requireApproval: {
              title: `⚠️ Dangerous command: ${check.label}`,
              description: `A high-risk command was detected and requires user approval.\nCommand: ${command.slice(0, 200)}`,
            },
          };
        }

        // warn / allow: autonomous modes — flow through to workflow guardrails.
        if (dangerousPolicy === "warn") {
          audit.record("tool_warning", { sessionKey, toolName, warning: `dangerous command allowed with audit if workflow checks pass: ${check.label}` });
        } else if (dangerousPolicy === "allow") {
          audit.record("tool_decision", { sessionKey, toolName, decision: { action: "allow" }, reason: "dangerous_command_allow_if_workflow_checks_pass" });
        }
      }
    }

    if (state.pendingVerification && isMutation && validationPolicy !== "off") {
      const blockReason = `Validate the most recent mutation first: ${state.lastMutationLabel || "recent mutation"}`;
      log.info(`[proofrail/P6] block mutation before verification: ${toolIntent}`);
      const mutationBatchMax = getMutationBatchMax(api, event);
      const shouldDeferStrictBlock = validationPolicy === "batch"
        && state.unverifiedMutationCount < mutationBatchMax;
      const decision = workflowRiskDecision({
        state,
        audit,
        sessionKey,
        toolName,
        toolIntent,
        reason: "pending_verification",
        message: blockReason,
        mode: shouldDeferStrictBlock && enforcementMode === "strict" ? "advisory" : enforcementMode,
        severity: state.unverifiedMutationCount >= mutationBatchMax ? "risk" : "warn",
        target: state.touchedFiles[0],
        fastestNextAction: "run the narrowest validation or read back the touched target",
        riskIfIgnored: "More mutations may stack on unverified changes and make recovery harder.",
      });
      if (decision) return decision;
    }

    if (mutatingExec && targetPaths.length === 0) {
      const blockReason = "This exec command looks mutating, but Proofrail cannot identify the changed package, process, path, or service target.";
      const decision = workflowRiskDecision({
        state,
        audit,
        sessionKey,
        toolName,
        toolIntent,
        reason: "unknown_target_mutation",
        message: blockReason,
        mode: enforcementMode,
        severity: "risk",
        target: command.slice(0, 160),
        fastestNextAction: "identify the package, process, path, or service this command changes before continuing",
        riskIfIgnored: "A mutating command with no concrete target is harder to audit, validate, or recover after compaction.",
      });
      if (decision) return decision;
    }

    if (!relevantEvidence && (mutatingExec || mutationTouchesExistingPath)) {
      const blockReason = "Read nearby code, config, logs, or tests first. Collect local evidence on the same target before mutating existing files or processes.";
      const evidenceSuggestions = suggestEvidence({ toolName, args: input, command, mutatingExec });
      log.info(`[proofrail/P6] block mutation without relevant evidence: ${toolIntent}`);
      mergeEvidenceSuggestions(state, evidenceSuggestions);
      const decision = workflowRiskDecision({
        state,
        audit,
        sessionKey,
        toolName,
        toolIntent,
        reason: "missing_evidence",
        message: blockReason,
        mode: enforcementMode,
        severity: "risk",
        target: targetPaths[0],
        fastestNextAction: evidenceSuggestions[0],
        riskIfIgnored: "The mutation may be based on stale or broad evidence.",
        extra: { evidenceSuggestions, targetPaths, evidencePaths: state.evidencePaths },
      });
      if (decision) return decision;
    }

    if (state.consecutiveLowSignal >= getLowSignalBlockThreshold(api, event) && state.lastLowSignalIntent === toolIntent) {
      const blockReason = "Recent tool calls did not produce new facts. Change the path, keywords, log source, host, or validation method before retrying.";
      log.info(`[proofrail/P6] block repeated low-signal probe: ${toolIntent}`);
      const decision = workflowRiskDecision({
        state,
        audit,
        sessionKey,
        toolName,
        toolIntent,
        reason: "low_signal_repeat",
        message: blockReason,
        mode: enforcementMode,
        severity: "warn",
        fastestNextAction: "switch logs, paths, keywords, host, or validation method",
        riskIfIgnored: "Repeated low-signal probing burns time without improving evidence.",
      });
      if (decision) return decision;
    }

    if (category === "write") {
      const target = firstStringField(input, ["path", "file", "filePath", "target"]);
      if (target) {
        log.info(`[proofrail/audit] write tool=${toolName} target=${target.slice(0, 100)}`);
      }
    }

    // ——— gray-area classifier —————————————————————————————————
    clearClassifierDecision(state);
    const classifier = new RuleBasedGrayAreaClassifier();
    if (shouldRunClassifier({
      sessionState: state,
      category,
      isMutation,
      mutatingExec,
      mutationTouchesExistingPath,
    })) {
      const decision = normalizeClassifierDecision(
        classifier.classify({
          toolName,
          args: input,
          sessionState: state,
          command,
          category,
          isMutation,
        }),
      );
      if (decision) {
        recordClassifierDecision(
          state,
          decision.decision,
          decision.reason,
          decision.evidenceGap,
          decision.guidance,
          decision.source,
        );
        audit.record("classifier_decision", {
          sessionKey,
          toolName,
          decision: decision.decision,
          evidenceGap: decision.evidenceGap,
          source: decision.source,
          reason: decision.reason,
          guidance: [...decision.guidance],
        });
        if (decision.decision === "block") {
          const guidance = decision.guidance.map((item) => `- ${item}`).join("\n");
          const blockReason = `Blocked by Proofrail [classifier].\nReason: ${decision.reason}\nEvidence gap: ${decision.evidenceGap}${guidance ? `\nRecommended next step(s):\n${guidance}` : ""}`;
          log.info(`[proofrail/P6] classifier block: ${toolIntent}`);
          const classifierDecision = workflowRiskDecision({
            state,
            audit,
            sessionKey,
            toolName,
            toolIntent,
            reason: "llm_classifier",
            message: blockReason,
            mode: enforcementMode,
            severity: "risk",
            fastestNextAction: decision.guidance[0],
            riskIfIgnored: "The classifier found a workflow ambiguity that strict mode would block.",
          });
          if (classifierDecision) return classifierDecision;
        }
      }
    }

    audit.record("tool_preflight", {
      sessionKey,
      toolName,
      category,
      command,
      isMutation,
      toolIntent,
      decision: "allow",
    });
  }, { priority: 200 });

  api.on("tool_result_persist", (rawEvent) => {
    const event = getEvent(rawEvent);
    const message = event.message || "";
    const summaryThreshold = getSummaryThreshold(api, event);
    if (typeof message !== "string") return;
    if (message.length <= summaryThreshold) return;

    const summarized = summarizeLargeOutput(message, summaryThreshold);
    log.info(`[proofrail/P1] summarized: ${message.length} -> ${summarized.length} chars`);
    audit.record("tool_result_summarized", {
      threshold: summaryThreshold,
      originalChars: message.length,
      summarizedChars: summarized.length,
    });
    return { message: summarized };
  }, { priority: 50 });

  api.on("after_tool_call", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    pruneSessionStates(sessionStates);
    const state = getSessionState(sessionStates, sessionKey);
    restoreCompactionSnapshotIfNeeded({ api, audit, compactionStates, sessionKey, state });
    const validationPolicy = getValidationPolicy(api, event);
    const toolName = getCanonicalToolName(event.toolName, event.tool?.name);
    const input = getInput(event);
    const category = getToolCategory(toolName);
    const derivedPaths = getDerivedPaths(event);
    const errorText = typeof event.error === "string" ? event.error.trim() : "";
    const resultText = errorText || extractTextFromToolResult(event.result);
    const toolIntent = buildToolIntentSignature(toolName, input, derivedPaths);
    const command = getExecCommand(input);
    const mutatingExec = category === "exec" && isLikelyMutatingExec(command);
    const validatingExec = category === "exec" && !mutatingExec && isLikelyValidationExec(command);
    const toolResultStatus = getToolResultStatus(event.result, errorText);
    const blockedResult = isBlockedToolResult(event.result);
    const nonMutatingExec = category === "exec" && !mutatingExec;
    const mutationBaseDir = getMutationBaseDir(api, ctx);
    const lowSignal = isLowSignalObservation(toolName, resultText, errorText);
    const lowSignalSignature = normalizeSignalText(resultText).slice(0, 160) || `${toolName}:empty`;
    const evidenceObservation = isEvidenceObservation(category, mutatingExec, lowSignal, errorText);
    const nonMutatingObservationSucceeded = (category === "read" || nonMutatingExec) && toolResultStatus === "success" && evidenceObservation;
    const touchedPathHints = changedPathHints(toolName, input, command);
    const readbackPaths = category === "read"
      ? getPathHints(input, derivedPaths, { includeCwd: false })
      : nonMutatingExec
        ? touchedPathHints
        : [];
    const readbackValidationSucceeded = state.pendingVerification
      && nonMutatingObservationSucceeded
      && readbackPaths.length > 0
      && readbackPathsValidateTouchedPaths(state.touchedFiles, readbackPaths, mutationBaseDir);
    const verificationSucceeded = state.pendingVerification && (validatingExec || readbackValidationSucceeded);
    const touchedPaths = summarizePaths(touchedPathHints);
    const validationSuggestions = suggestValidations({ toolName, args: input, command, mutatingExec });

    if (lowSignal) {
      state.consecutiveLowSignal = state.lastLowSignalSignature === lowSignalSignature
        ? state.consecutiveLowSignal + 1
        : Math.max(1, state.consecutiveLowSignal + 1);
      state.lastLowSignalSignature = lowSignalSignature;
      state.lastLowSignalIntent = toolIntent;
    } else {
      state.consecutiveLowSignal = 0;
      state.lastLowSignalSignature = undefined;
      state.lastLowSignalIntent = undefined;
    }

    if (evidenceObservation) {
      state.evidenceCount = Math.min(state.evidenceCount + 1, MAX_EVIDENCE_COUNT);
      state.lastEvidenceLabel = describeObservation(toolName, input, derivedPaths);
      appendEvidenceLabel(state, state.lastEvidenceLabel);
      mergeEvidencePaths(state, changedPathHints(toolName, input, command));
      if (!state.pendingVerification) state.phase = "execute";
      clearBlockDecision(state, ["missing_evidence", "low_signal_repeat"]);
      clearAdvisory(state, ["missing_evidence", "low_signal_repeat"]);
      clearEvidenceSuggestions(state);
    }

    if (category === "write" || mutatingExec) {
      if (!blockedResult && toolResultStatus !== "failure") {
        recordIgnoredAdvisory({
          state,
          audit,
          sessionKey,
          toolName,
          command,
          toolIntent,
          reasons: ["missing_evidence", "pending_verification", "unknown_target_mutation", "low_signal_repeat", "llm_classifier"],
        });
        if (validationPolicy !== "off") state.pendingVerification = true;
        state.lastMutationLabel = describeMutation(toolName, input);
        state.mutationCount += 1;
        state.unverifiedMutationCount += 1;
        state.finalReportRequired = true;
        appendMutationLabel(state, state.lastMutationLabel);
        mergeTouchedFiles(state, touchedPathHints);
        mergeValidationSuggestions(state, validationSuggestions);
        state.phase = "review";
      }
    } else if (state.pendingVerification && verificationSucceeded) {
      state.lastValidatedMutation = state.lastMutationLabel;
      state.lastValidationCommand = command || toolIntent;
      state.pendingVerification = false;
      state.lastMutationLabel = undefined;
      state.unverifiedMutationCount = 0;
      state.validationCount += 1;
      state.lastValidationLabel = describeObservation(toolName, input, derivedPaths);
      appendValidationLabel(state, state.lastValidationLabel);
      clearValidationSuggestions(state);
      clearBlockDecision(state, ["pending_verification"]);
      clearAdvisory(state, ["pending_verification", "llm_classifier"]);
      state.phase = state.evidenceCount > 0 ? "execute" : "observe";
    }

    audit.record("tool_result", {
      sessionKey,
      toolName,
      category,
      command,
      status: toolResultStatus,
      blockedResult,
      mutatingExec,
      validatingExec,
      verificationSucceeded,
      nonMutatingObservationSucceeded,
      phase: state.phase,
      pendingVerification: state.pendingVerification,
      touchedPaths,
      validationSuggestions,
      durationMs: event.durationMs,
    });
  }, { priority: 60 });

  api.on("before_prompt_build", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    pruneSessionStates(sessionStates);
    let extra = NEW_BEHAVIOR_RULES;
    const sessionKey = getSessionKey(ctx, event);
    const state = getSessionState(sessionStates, sessionKey);
    restoreCompactionSnapshotIfNeeded({ api, audit, compactionStates, sessionKey, state });
    const compactionState = compactionStates.get(sessionKey);
    const advisoryInjection = getAdvisoryInjection(api, event);

    if (state.phase === "observe") {
      extra += "\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Current phase: Observe\nNot enough local evidence has been collected yet. Read code, config, logs, tests, or health probes near the control path before mutating existing files or processes.";
    } else if (state.phase === "execute") {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Current phase: Execute\nLocal evidence has been collected${state.lastEvidenceLabel ? ` (latest: ${state.lastEvidenceLabel})` : ""}. Continue with the smallest control-path mutation and do not widen scope without reason.`;
    } else if (state.phase === "review") {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Current phase: Review\nA recent mutation occurred (${state.lastMutationLabel || "recent mutation"}). New writes are blocked until a narrow validation runs first.`;
    }

    extra += "\n\n" + renderTaskContext(state);

    if (state.pendingVerification) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] ⚠️ Validate before continuing\nA file, config, or process mutation just happened (${state.lastMutationLabel || "recent mutation"}). Run the narrowest useful validation next before adding more changes.`;
    }

    if (state.lastAdvisory && advisoryInjection !== "off" && !state.lastBlockMessage) {
      const advisory = state.lastAdvisory;
      extra += `\n\n## [SYSTEM-ADDED PLUGIN ADVISORY — GENERATED, NOT USER-PROVIDED] Proofrail advisory\n- Reason: \`${advisory.reason}\`\n- Severity: \`${advisory.severity}\`\n- Message: ${advisory.message}`;
      if (advisory.target) extra += `\n- Target: ${advisory.target}`;
      if (advisory.fastestNextAction) extra += `\n- Fastest valid next action: ${advisory.fastestNextAction}`;
      if (advisory.riskIfIgnored && advisoryInjection === "full") extra += `\n- Risk if ignored: ${advisory.riskIfIgnored}`;
      extra += "\n- This is advisory by default; strict mode would have blocked this workflow risk.";
    }

    if (state.evidenceSuggestions.length > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] Suggested evidence-gathering steps\n${state.evidenceSuggestions.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.validationSuggestions.length > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] Suggested narrow validations\n${state.validationSuggestions.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.touchedFiles.length > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Touched files/paths in this turn\n${state.touchedFiles.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.dangerousCount > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] ⚠️ Dangerous action audit\n${state.dangerousCount} high-risk command(s) were observed in this turn (latest: ${state.lastDangerousLabel}). If autonomous work continues, validate the impact and explain the risk in the final report.`;
    }

    const checklist = finalReviewChecklist(state);
    if (checklist.length > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] Final report requirements / checklist\n${checklist.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.consecutiveLowSignal >= getLowSignalBlockThreshold(api, event)) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] ⚠️ Change the probe now\nThe last ${state.consecutiveLowSignal} tool call(s) produced no new facts. Do not repeat the same command or search layer; switch logs, paths, keywords, host, download source, or upstream docs.`;
    }

    if (state.lastBlockMessage) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] Last tool call was blocked\n- Block reason: \`${state.lastBlockReason || "blocked"}\`\n- Block message: ${state.lastBlockMessage}\n- Treat the block message as the required next step, not as an obstacle to route around.\n- Do not look for alternate tools, wrapper tools, or equivalent mutations that achieve the same blocked outcome.`;
      if (state.lastBlockReason === "pending_verification") {
        extra += "\n- Validate the last mutation before any more changes.";
      } else if (state.lastBlockReason === "missing_evidence") {
        extra += "\n- Gather local evidence on the same control path before retrying the mutation.";
        if (state.evidenceSuggestions.length > 0) {
          extra += `\n- Start with one of these: ${state.evidenceSuggestions.slice(0, 3).join(" | ")}`;
        }
      } else if (state.lastBlockReason === "low_signal_repeat") {
        extra += "\n- Change probe strategy instead of retrying the same intent through another tool.";
      }
    }

    if (state.lastClassifierDecision && state.lastClassifierDecision !== "allow") {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Classifier review\n- Decision: \`${state.lastClassifierDecision}\`\n- Evidence gap: \`${state.lastClassifierEvidenceGap || "unclear"}\`\n- Reason: ${state.lastClassifierReason || "No reason provided."}`;
      if (state.lastClassifierGuidance.length > 0) {
        extra += `\n- Guidance:\n${state.lastClassifierGuidance.map((item) => `  - ${item}`).join("\n")}`;
      }
    }

    if (compactionState?.snapshot && compactionState.count > 0) {
      extra += `\n\n## [SYSTEM-ADDED PLUGIN REMINDER — GENERATED, NOT USER-PROVIDED] ⚠️ Compaction reminder\nThe context was just compacted for the ${compactionState.count} time (${compactionState.snapshot.timestamp}). Please keep in mind:\n- do not lose track of the active task\n- continue following all behavior rules\n- if context feels incomplete, proactively confirm with the user`;
      if (compactionState.snapshot.pendingVerification) {
        extra += `\n- snapshot pending verification: ${compactionState.snapshot.lastMutationLabel || "recent mutation"}\n- valid next step: run the narrowest validation or read back the touched target before adding more mutations`;
      }
    }

    return { appendSystemContext: extra };
  }, { priority: 50 });

  api.on("before_compaction", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    const state = getSessionState(sessionStates, sessionKey);
    const snapshot: CompactionSnapshot = {
      timestamp: new Date().toISOString(),
      messageCount: event.messageCount || 0,
      tokenCount: event.tokenCount,
      sessionKey,
      phase: state.phase,
      pendingVerification: state.pendingVerification,
      lastMutationLabel: state.lastMutationLabel,
      lastValidatedMutation: state.lastValidatedMutation,
      lastValidationCommand: state.lastValidationCommand,
      mutationCount: state.mutationCount,
      unverifiedMutationCount: state.unverifiedMutationCount,
      validationCount: state.validationCount,
      touchedFiles: state.touchedFiles,
      validationSuggestions: state.validationSuggestions,
      lastValidationLabel: state.lastValidationLabel,
      lastBlockMessage: state.lastBlockMessage,
      lastBlockReason: state.lastBlockReason,
      advisoryCount: state.advisoryCount,
      ignoredAdvisoryCount: state.ignoredAdvisoryCount,
      lastAdvisory: state.lastAdvisory,
    };

    const existingCompactionState = compactionStates.get(sessionKey);
    compactionStates.set(sessionKey, {
      count: existingCompactionState?.count || 0,
      snapshot,
    });

    log.info(`[proofrail/compact] before_compaction: ${event.messageCount} msgs, ${event.tokenCount || "?"} tokens`);
    audit.record("before_compaction", {
      sessionKey,
      messageCount: event.messageCount,
      tokenCount: event.tokenCount,
      pendingVerification: state.pendingVerification,
      lastMutationLabel: state.lastMutationLabel,
      unverifiedMutationCount: state.unverifiedMutationCount,
    });

    try {
      writeCompactionSnapshot(api, snapshot);
    } catch (error) {
      log.warn(`[proofrail/compact] failed to write snapshot: ${error}`);
    }
  }, { priority: 100 });

  api.on("after_compaction", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    const existingCompactionState = compactionStates.get(sessionKey);
    const nextCount = (existingCompactionState?.count || 0) + 1;
    compactionStates.set(sessionKey, {
      count: nextCount,
      snapshot: existingCompactionState?.snapshot,
    });
    log.info(`[proofrail/compact] after_compaction #${nextCount}: ${event.compactedCount} msgs compacted, ${event.messageCount} remaining`);
    audit.record("after_compaction", { sessionKey, compactedCount: event.compactedCount, messageCount: event.messageCount, tokenCount: event.tokenCount });
  }, { priority: 100 });

  api.on("before_model_resolve", (rawEvent) => {
    const event = getEvent(rawEvent);
    log.info(`[proofrail/thinking] model resolve phase, prompt length=${(event.prompt || "").length}`);
  }, { priority: 10 });

  (registerProofrailHooks as typeof registerProofrailHooks & {
    explainState?: (sessionKey: string) => Record<string, unknown>;
  }).explainState = (sessionKey: string) => {
    pruneSessionStates(sessionStates);
    const state = getSessionState(sessionStates, sessionKey || "default");
    restoreCompactionSnapshotIfNeeded({ api, audit, compactionStates, sessionKey: sessionKey || "default", state });
    return {
      ...buildStateExplanation(state, auditLogPath),
      artifactsDir: resolveRuntimeArtifactsDir(api),
      enforcementMode: getEnforcementMode(api),
      validationPolicy: getValidationPolicy(api),
      mutationBatchMax: getMutationBatchMax(api),
    };
  };

  log.info(`[proofrail v${PLUGIN_VERSION}] all hooks registered (phase 1-6 + ledger/audit) ✅`);
}

export const registerProofrailHooksCompat = registerProofrailHooks;
