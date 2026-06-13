"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneSessionStates = pruneSessionStates;
exports.getSessionState = getSessionState;
exports.recordAdvisory = recordAdvisory;
exports.clearAdvisory = clearAdvisory;
exports.markLastAdvisoryIgnored = markLastAdvisoryIgnored;
exports.appendEvidenceLabel = appendEvidenceLabel;
exports.appendMutationLabel = appendMutationLabel;
exports.appendValidationLabel = appendValidationLabel;
exports.appendDangerousLabel = appendDangerousLabel;
exports.mergeTouchedFiles = mergeTouchedFiles;
exports.mergeEvidencePaths = mergeEvidencePaths;
exports.mergeEvidenceSuggestions = mergeEvidenceSuggestions;
exports.clearEvidenceSuggestions = clearEvidenceSuggestions;
exports.mergeValidationSuggestions = mergeValidationSuggestions;
exports.clearValidationSuggestions = clearValidationSuggestions;
exports.recordBlockDecision = recordBlockDecision;
exports.clearBlockDecision = clearBlockDecision;
exports.recordClassifierDecision = recordClassifierDecision;
exports.clearClassifierDecision = clearClassifierDecision;
const constants_1 = require("./constants");
function appendUnique(existing, incoming, limit = 12) {
    const seen = new Set(existing);
    const out = [...existing];
    for (const value of incoming) {
        const text = String(value || "").trim();
        if (!text || seen.has(text))
            continue;
        seen.add(text);
        out.push(text);
    }
    return out.slice(-limit);
}
function pruneSessionStates(states) {
    const now = Date.now();
    for (const [sessionKey, state] of states.entries()) {
        if (now - state.lastUpdatedAt > constants_1.SESSION_STATE_TTL_MS)
            states.delete(sessionKey);
    }
    if (states.size <= constants_1.MAX_SESSION_STATES)
        return;
    const oldest = [...states.entries()]
        .sort((left, right) => left[1].lastUpdatedAt - right[1].lastUpdatedAt)
        .slice(0, states.size - constants_1.MAX_SESSION_STATES);
    for (const [sessionKey] of oldest)
        states.delete(sessionKey);
}
function getSessionState(states, sessionKey) {
    const existing = states.get(sessionKey);
    if (existing) {
        existing.lastUpdatedAt = Date.now();
        return existing;
    }
    const created = {
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
        advisoryCount: 0,
        ignoredAdvisoryCount: 0,
        unverifiedMutationCount: 0,
        lastClassifierGuidance: [],
        lastUpdatedAt: Date.now(),
    };
    states.set(sessionKey, created);
    return created;
}
function recordAdvisory(state, params) {
    state.advisoryCount = (state.advisoryCount || 0) + 1;
    state.lastAdvisory = {
        reason: params.reason,
        message: params.message,
        severity: params.severity || "warn",
        target: params.target,
        fastestNextAction: params.fastestNextAction,
        riskIfIgnored: params.riskIfIgnored,
        wouldHaveBlockedInStrict: params.wouldHaveBlockedInStrict !== false,
        ignored: false,
    };
}
function clearAdvisory(state, reasons) {
    if (!state.lastAdvisory)
        return;
    if (!reasons || reasons.length === 0 || reasons.includes(state.lastAdvisory.reason)) {
        state.lastAdvisory = undefined;
    }
}
function markLastAdvisoryIgnored(state, reasons) {
    const advisory = state.lastAdvisory;
    if (!advisory || advisory.ignored)
        return undefined;
    if (reasons && reasons.length > 0 && !reasons.includes(advisory.reason))
        return undefined;
    state.lastAdvisory = { ...advisory, ignored: true };
    state.ignoredAdvisoryCount = (state.ignoredAdvisoryCount || 0) + 1;
    return state.lastAdvisory;
}
function appendEvidenceLabel(state, label) {
    if (!label)
        return;
    state.evidenceLabels = appendUnique(state.evidenceLabels, [label]);
}
function appendMutationLabel(state, label) {
    if (!label)
        return;
    state.mutationLabels = appendUnique(state.mutationLabels, [label]);
}
function appendValidationLabel(state, label) {
    if (!label)
        return;
    state.validationLabels = appendUnique(state.validationLabels, [label]);
}
function appendDangerousLabel(state, label) {
    if (!label)
        return;
    state.dangerousLabels = appendUnique(state.dangerousLabels, [label]);
}
function mergeTouchedFiles(state, paths) {
    state.touchedFiles = appendUnique(state.touchedFiles, paths, 16);
}
function mergeEvidencePaths(state, paths) {
    state.evidencePaths = appendUnique(state.evidencePaths, paths, 24);
}
function mergeEvidenceSuggestions(state, suggestions) {
    state.evidenceSuggestions = appendUnique(state.evidenceSuggestions, suggestions, 16);
}
function clearEvidenceSuggestions(state) {
    state.evidenceSuggestions = [];
}
function mergeValidationSuggestions(state, suggestions) {
    state.validationSuggestions = appendUnique(state.validationSuggestions, suggestions, 16);
}
function clearValidationSuggestions(state) {
    state.validationSuggestions = [];
}
function recordBlockDecision(state, message, reason) {
    state.lastBlockMessage = message;
    state.lastBlockReason = reason;
}
function clearBlockDecision(state, reasons) {
    if (!reasons || reasons.length === 0 || (state.lastBlockReason && reasons.includes(state.lastBlockReason))) {
        state.lastBlockMessage = undefined;
        state.lastBlockReason = undefined;
    }
}
function recordClassifierDecision(state, decision, reason, evidenceGap, guidance, source) {
    state.lastClassifierDecision = decision;
    state.lastClassifierReason = reason.trim() || undefined;
    state.lastClassifierEvidenceGap = evidenceGap;
    state.lastClassifierGuidance = guidance.filter((item) => String(item).trim()).slice(0, 6);
    state.lastClassifierSource = source.trim() || undefined;
}
function clearClassifierDecision(state) {
    state.lastClassifierDecision = undefined;
    state.lastClassifierReason = undefined;
    state.lastClassifierEvidenceGap = undefined;
    state.lastClassifierGuidance = [];
    state.lastClassifierSource = undefined;
}
