import { MAX_SESSION_STATES, SESSION_STATE_TTL_MS } from "./constants";
import type { SessionRuntimeState } from "./types";

function appendUnique(existing: readonly string[], incoming: readonly string[], limit = 12): readonly string[] {
  const seen = new Set(existing);
  const out = [...existing];
  for (const value of incoming) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(-limit);
}

export function pruneSessionStates(states: Map<string, SessionRuntimeState>): void {
  const now = Date.now();
  for (const [sessionKey, state] of states.entries()) {
    if (now - state.lastUpdatedAt > SESSION_STATE_TTL_MS) states.delete(sessionKey);
  }

  if (states.size <= MAX_SESSION_STATES) return;

  const oldest = [...states.entries()]
    .sort((left, right) => left[1].lastUpdatedAt - right[1].lastUpdatedAt)
    .slice(0, states.size - MAX_SESSION_STATES);

  for (const [sessionKey] of oldest) states.delete(sessionKey);
}

export function getSessionState(states: Map<string, SessionRuntimeState>, sessionKey: string): SessionRuntimeState {
  const existing = states.get(sessionKey);
  if (existing) {
    existing.lastUpdatedAt = Date.now();
    return existing;
  }

  const created: SessionRuntimeState = {
    phase: "observe",
    evidenceCount: 0,
    pendingVerification: false,
    consecutiveLowSignal: 0,
    mutationCount: 0,
    validationCount: 0,
    dangerousCount: 0,
    touchedFiles: [],
    evidencePaths: [],
    evidenceSuggestions: [],
    validationSuggestions: [],
    evidenceLabels: [],
    mutationLabels: [],
    validationLabels: [],
    dangerousLabels: [],
    finalReportRequired: false,
    lastClassifierGuidance: [],
    lastUpdatedAt: Date.now(),
  };
  states.set(sessionKey, created);
  return created;
}

export function appendEvidenceLabel(state: SessionRuntimeState, label?: string): void {
  if (!label) return;
  state.evidenceLabels = appendUnique(state.evidenceLabels, [label]);
}

export function appendMutationLabel(state: SessionRuntimeState, label?: string): void {
  if (!label) return;
  state.mutationLabels = appendUnique(state.mutationLabels, [label]);
}

export function appendValidationLabel(state: SessionRuntimeState, label?: string): void {
  if (!label) return;
  state.validationLabels = appendUnique(state.validationLabels, [label]);
}

export function appendDangerousLabel(state: SessionRuntimeState, label?: string): void {
  if (!label) return;
  state.dangerousLabels = appendUnique(state.dangerousLabels, [label]);
}

export function mergeTouchedFiles(state: SessionRuntimeState, paths: readonly string[]): void {
  state.touchedFiles = appendUnique(state.touchedFiles, paths, 16);
}

export function mergeEvidencePaths(state: SessionRuntimeState, paths: readonly string[]): void {
  state.evidencePaths = appendUnique(state.evidencePaths, paths, 24);
}

export function mergeEvidenceSuggestions(state: SessionRuntimeState, suggestions: readonly string[]): void {
  state.evidenceSuggestions = appendUnique(state.evidenceSuggestions, suggestions, 16);
}

export function clearEvidenceSuggestions(state: SessionRuntimeState): void {
  state.evidenceSuggestions = [];
}

export function mergeValidationSuggestions(state: SessionRuntimeState, suggestions: readonly string[]): void {
  state.validationSuggestions = appendUnique(state.validationSuggestions, suggestions, 16);
}

export function clearValidationSuggestions(state: SessionRuntimeState): void {
  state.validationSuggestions = [];
}

export function recordBlockDecision(state: SessionRuntimeState, message: string, reason: string): void {
  state.lastBlockMessage = message;
  state.lastBlockReason = reason;
}

export function clearBlockDecision(state: SessionRuntimeState, reasons?: readonly string[]): void {
  if (!reasons || reasons.length === 0 || (state.lastBlockReason && reasons.includes(state.lastBlockReason))) {
    state.lastBlockMessage = undefined;
    state.lastBlockReason = undefined;
  }
}

export function recordClassifierDecision(
  state: SessionRuntimeState,
  decision: string,
  reason: string,
  evidenceGap: string,
  guidance: readonly string[],
  source: string,
): void {
  state.lastClassifierDecision = decision as SessionRuntimeState["lastClassifierDecision"];
  state.lastClassifierReason = reason.trim() || undefined;
  state.lastClassifierEvidenceGap = evidenceGap as SessionRuntimeState["lastClassifierEvidenceGap"];
  state.lastClassifierGuidance = guidance.filter((item) => String(item).trim()).slice(0, 6);
  state.lastClassifierSource = source.trim() || undefined;
}

export function clearClassifierDecision(state: SessionRuntimeState): void {
  state.lastClassifierDecision = undefined;
  state.lastClassifierReason = undefined;
  state.lastClassifierEvidenceGap = undefined;
  state.lastClassifierGuidance = [];
  state.lastClassifierSource = undefined;
}
