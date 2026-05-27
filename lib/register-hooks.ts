import { LOW_SIGNAL_BLOCK_THRESHOLD, MAX_EVIDENCE_COUNT, NEW_BEHAVIOR_RULES, PLUGIN_VERSION } from "./constants";
import { AuditLogger, defaultAuditLogPath, resolveRuntimeArtifactsDir } from "./audit";
import { writeCompactionSnapshot } from "./compaction";
import { mutatesExistingPath } from "./path";
import {
  appendDangerousLabel,
  appendEvidenceLabel,
  appendMutationLabel,
  appendValidationLabel,
  clearValidationSuggestions,
  getSessionState,
  mergeTouchedFiles,
  mergeValidationSuggestions,
  pruneSessionStates,
} from "./session-state";
import { extractTextFromToolResult, firstStringField, normalizeSignalText } from "./text";
import { getToolResultStatus } from "./result-status";
import {
  closeSummary,
  finalReviewChecklist,
  renderTaskContext,
  taskSnapshot,
} from "./task-ledger";
import { changedPathHints, summarizePaths, suggestValidations } from "./validation";
import {
  buildToolIntentSignature,
  describeMutation,
  describeObservation,
  getCanonicalToolName,
  getDangerousCommandAction,
  getExecCommand,
  getLowSignalBlockThreshold,
  getSummaryThreshold,
  getToolCategory,
  isDangerousCommand,
  isEvidenceObservation,
  isLikelyMutatingExec,
  isLikelyValidationExec,
  isLowSignalObservation,
  summarizeLargeOutput,
} from "./tooling";
import type { ProofrailApi, ProofrailContext, ProofrailEvent, CompactionSnapshot, SessionRuntimeState } from "./types";

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
    touchedFiles: [...state.touchedFiles],
    validationSuggestions: [...state.validationSuggestions],
    evidenceLabels: [...state.evidenceLabels],
    mutationLabels: [...state.mutationLabels],
    validationLabels: [...state.validationLabels],
    dangerousLabels: [...state.dangerousLabels],
    finalReportRequired: state.finalReportRequired,
    task: taskSnapshot(state),
    nextExpected,
    auditLogPath,
  };
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
    getSessionState(sessionStates, sessionKey);
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
    const command = getExecCommand(input);
    const mutatingExec = category === "exec" && isLikelyMutatingExec(command);
    const mutationTouchesExistingPath = category === "write" && mutatesExistingPath(input, derivedPaths, getMutationBaseDir(api, ctx));
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
          return {
            block: true,
            blockReason: `High-risk command blocked by plugin policy: ${check.label}`,
          };
        }

        return {
          requireApproval: {
            title: `⚠️ Dangerous command: ${check.label}`,
            description: `A high-risk command was detected and requires user approval.\nCommand: ${command.slice(0, 200)}`,
          },
        };
      }
    }

    if (state.pendingVerification && isMutation) {
      log.info(`[proofrail/P6] block mutation before verification: ${toolIntent}`);
      audit.record("tool_decision", { sessionKey, toolName, reason: "pending_verification", decision: "block", toolIntent });
      return {
        block: true,
        blockReason: `Validate the most recent mutation first: ${state.lastMutationLabel || "recent mutation"}`,
      };
    }

    if (state.evidenceCount === 0 && (mutatingExec || mutationTouchesExistingPath)) {
      log.info(`[proofrail/P6] block mutation without evidence: ${toolIntent}`);
      audit.record("tool_decision", { sessionKey, toolName, reason: "missing_evidence", decision: "block", toolIntent });
      return {
        block: true,
        blockReason: "Read nearby code, config, logs, or tests first. Collect local evidence before mutating existing files or processes.",
      };
    }

    if (state.consecutiveLowSignal >= getLowSignalBlockThreshold(api, event) && state.lastLowSignalIntent === toolIntent) {
      log.info(`[proofrail/P6] block repeated low-signal probe: ${toolIntent}`);
      audit.record("tool_decision", { sessionKey, toolName, reason: "low_signal_repeat", decision: "block", toolIntent });
      return {
        block: true,
        blockReason: "Recent tool calls did not produce new facts. Change the path, keywords, log source, host, or validation method before retrying.",
      };
    }

    if (category === "write") {
      const target = firstStringField(input, ["path", "file", "filePath", "target"]);
      if (target) {
        log.info(`[proofrail/audit] write tool=${toolName} target=${target.slice(0, 100)}`);
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
    const nonMutatingExec = category === "exec" && !mutatingExec;
    const lowSignal = isLowSignalObservation(toolName, resultText, errorText);
    const lowSignalSignature = normalizeSignalText(resultText).slice(0, 160) || `${toolName}:empty`;
    const evidenceObservation = isEvidenceObservation(category, mutatingExec, lowSignal, errorText);
    const nonMutatingObservationSucceeded = nonMutatingExec && toolResultStatus === "success" && evidenceObservation;
    const verificationSucceeded = state.pendingVerification && (validatingExec || nonMutatingObservationSucceeded);
    const touchedPaths = summarizePaths(changedPathHints(toolName, input, command));
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
      if (!state.pendingVerification) state.phase = "execute";
    }

    if (category === "write" || mutatingExec) {
      state.pendingVerification = true;
      state.lastMutationLabel = describeMutation(toolName, input);
      state.mutationCount += 1;
      state.finalReportRequired = true;
      appendMutationLabel(state, state.lastMutationLabel);
      mergeTouchedFiles(state, touchedPaths);
      mergeValidationSuggestions(state, validationSuggestions);
      state.phase = "review";
    } else if (state.pendingVerification && verificationSucceeded) {
      state.pendingVerification = false;
      state.lastMutationLabel = undefined;
      state.validationCount += 1;
      state.lastValidationLabel = describeObservation(toolName, input, derivedPaths);
      appendValidationLabel(state, state.lastValidationLabel);
      clearValidationSuggestions(state);
      state.phase = state.evidenceCount > 0 ? "execute" : "observe";
    }

    audit.record("tool_result", {
      sessionKey,
      toolName,
      category,
      command,
      status: toolResultStatus,
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
    const compactionState = compactionStates.get(sessionKey);

    if (state.phase === "observe") {
      extra += "\n\n## [PLUGIN STATE] Current phase: Observe\nNot enough local evidence has been collected yet. Read code, config, logs, tests, or health probes near the control path before mutating existing files or processes.";
    } else if (state.phase === "execute") {
      extra += `\n\n## [PLUGIN STATE] Current phase: Execute\nLocal evidence has been collected${state.lastEvidenceLabel ? ` (latest: ${state.lastEvidenceLabel})` : ""}. Continue with the smallest control-path mutation and do not widen scope without reason.`;
    } else if (state.phase === "review") {
      extra += `\n\n## [PLUGIN STATE] Current phase: Review\nA recent mutation occurred (${state.lastMutationLabel || "recent mutation"}). New writes are blocked until a narrow validation runs first.`;
    }

    extra += "\n\n" + renderTaskContext(state);

    if (state.pendingVerification) {
      extra += `\n\n## [PLUGIN REMINDER] ⚠️ Validate before continuing\nA file, config, or process mutation just happened (${state.lastMutationLabel || "recent mutation"}). Run the narrowest useful validation next before adding more changes.`;
    }

    if (state.validationSuggestions.length > 0) {
      extra += `\n\n## [PLUGIN REMINDER] Suggested narrow validations\n${state.validationSuggestions.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.touchedFiles.length > 0) {
      extra += `\n\n## [PLUGIN STATE] Touched files/paths in this turn\n${state.touchedFiles.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.dangerousCount > 0) {
      extra += `\n\n## [PLUGIN STATE] ⚠️ Dangerous action audit\n${state.dangerousCount} high-risk command(s) were observed in this turn (latest: ${state.lastDangerousLabel}). If autonomous work continues, validate the impact and explain the risk in the final report.`;
    }

    const checklist = finalReviewChecklist(state);
    if (checklist.length > 0) {
      extra += `\n\n## [PLUGIN REMINDER] Final report requirements / checklist\n${checklist.map((item) => `- ${item}`).join("\n")}`;
    }

    if (state.consecutiveLowSignal >= getLowSignalBlockThreshold(api, event)) {
      extra += `\n\n## [PLUGIN REMINDER] ⚠️ Change the probe now\nThe last ${state.consecutiveLowSignal} tool call(s) produced no new facts. Do not repeat the same command or search layer; switch logs, paths, keywords, host, download source, or upstream docs.`;
    }

    if (compactionState?.snapshot && compactionState.count > 0) {
      extra += `\n\n## [PLUGIN REMINDER] ⚠️ Compaction reminder\nThe context was just compacted for the ${compactionState.count} time (${compactionState.snapshot.timestamp}). Please keep in mind:\n- do not lose track of the active task\n- continue following all behavior rules\n- if context feels incomplete, proactively confirm with the user`;
    }

    return { appendSystemContext: extra };
  }, { priority: 50 });

  api.on("before_compaction", (rawEvent, ctx) => {
    const event = getEvent(rawEvent);
    const sessionKey = getSessionKey(ctx, event);
    const snapshot: CompactionSnapshot = {
      timestamp: new Date().toISOString(),
      messageCount: event.messageCount || 0,
      tokenCount: event.tokenCount,
      sessionKey,
    };

    const existingCompactionState = compactionStates.get(sessionKey);
    compactionStates.set(sessionKey, {
      count: existingCompactionState?.count || 0,
      snapshot,
    });

    log.info(`[proofrail/compact] before_compaction: ${event.messageCount} msgs, ${event.tokenCount || "?"} tokens`);
    audit.record("before_compaction", { sessionKey, messageCount: event.messageCount, tokenCount: event.tokenCount });

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
    return {
      ...buildStateExplanation(state, auditLogPath),
      artifactsDir: resolveRuntimeArtifactsDir(api),
    };
  };

  log.info(`[proofrail v${PLUGIN_VERSION}] all hooks registered (phase 1-6 + ledger/audit) ✅`);
}

export const registerProofrailHooksCompat = registerProofrailHooks;
