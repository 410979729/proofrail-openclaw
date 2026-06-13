"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleBasedGrayAreaClassifier = void 0;
exports.normalizeClassifierDecision = normalizeClassifierDecision;
exports.shouldRunClassifier = shouldRunClassifier;
/**
 * Lightweight gray-area classifier for Proofrail.
 *
 * Deterministic workflow rules remain the source of truth; the classifier only
 * handles ambiguous cases that benefit from semantic judgment.
 */
const command_risk_1 = require("./command-risk");
// ——— normalization ———————————————————————————————————————————————
const VALID_DECISIONS = [
    "allow", "warn", "ask_user", "block",
];
const VALID_GAPS = [
    "none",
    "target_state",
    "change_readback",
    "narrow_validation",
    "user_choice",
    "strategy_shift",
    "unclear",
];
function normalizeClassifierDecision(value) {
    if (!value)
        return null;
    const decision = VALID_DECISIONS.includes(value.decision)
        ? value.decision : "warn";
    const evidenceGap = VALID_GAPS.includes(value.evidenceGap)
        ? value.evidenceGap : "unclear";
    const guidance = value.guidance.filter((item) => String(item).trim());
    return {
        decision,
        reason: String(value.reason ?? "").trim(),
        evidenceGap,
        guidance,
        source: String(value.source ?? "rule").trim() || "rule",
    };
}
// ——— activation gate ——————————————————————————————————————————————
function shouldRunClassifier(params) {
    const { sessionState, category, isMutation, mutatingExec, mutationTouchesExistingPath } = params;
    if (!isMutation)
        return false;
    if (sessionState.pendingVerification)
        return false;
    if (sessionState.evidenceCount <= 0)
        return false;
    if (category === "write" && mutationTouchesExistingPath)
        return true;
    if (category === "exec" && mutatingExec)
        return true;
    return false;
}
// ——— rule-based classifier ————————————————————————————————————————
/**
 * Default local classifier for ambiguous mutation scenarios.
 *
 * Only activates after at least one evidence step has happened, and only when
 * the current evidence still looks broad rather than target-specific.
 */
class RuleBasedGrayAreaClassifier {
    source = "rule";
    static BROAD_EVIDENCE_PREFIXES = [
        "search_files:",
        "web_search:",
        "exec observation",
    ];
    classify(params) {
        const { args, sessionState, command, category, isMutation } = params;
        if (!isMutation)
            return null;
        if (sessionState.pendingVerification || sessionState.evidenceCount <= 0)
            return null;
        if (category === "exec" && (0, command_risk_1.isLikelyMutatingExec)(command))
            return null;
        const recentEvidence = (sessionState.lastEvidenceLabel ?? "").toLowerCase();
        if (category === "write" &&
            sessionState.phase === "execute" &&
            RuleBasedGrayAreaClassifier.BROAD_EVIDENCE_PREFIXES.some((prefix) => recentEvidence.startsWith(prefix))) {
            const target = String(args.path ?? args.file ?? args.filePath ?? args.target ?? "the target path").trim();
            return {
                decision: "block",
                reason: "Current evidence is still broad. Inspect the target file directly before editing.",
                evidenceGap: "target_state",
                guidance: [
                    `Inspect ${target} directly before editing.`,
                    "Keep the next change minimal and validate it immediately after the mutation.",
                ],
                source: this.source,
            };
        }
        return null;
    }
}
exports.RuleBasedGrayAreaClassifier = RuleBasedGrayAreaClassifier;
