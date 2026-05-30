/**
 * Lightweight gray-area classifier for Proofrail.
 *
 * Deterministic workflow rules remain the source of truth; the classifier only
 * handles ambiguous cases that benefit from semantic judgment.
 */
import { isLikelyMutatingExec } from "./command-risk";
import type {
  ClassifierDecisionName,
  ClassifierEvidenceGapName,
  GuardrailClassifier,
  GuardrailClassifierDecision,
  SessionRuntimeState,
} from "./types";

// ——— normalization ———————————————————————————————————————————————

const VALID_DECISIONS: readonly ClassifierDecisionName[] = [
  "allow", "warn", "ask_user", "block",
];

const VALID_GAPS: readonly ClassifierEvidenceGapName[] = [
  "none",
  "target_state",
  "change_readback",
  "narrow_validation",
  "user_choice",
  "strategy_shift",
  "unclear",
];

export function normalizeClassifierDecision(
  value: GuardrailClassifierDecision | null,
): GuardrailClassifierDecision | null {
  if (!value) return null;

  const decision: ClassifierDecisionName = VALID_DECISIONS.includes(value.decision)
    ? value.decision : "warn";

  const evidenceGap: ClassifierEvidenceGapName = VALID_GAPS.includes(value.evidenceGap)
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

export function shouldRunClassifier(params: {
  sessionState: SessionRuntimeState;
  category: string;
  isMutation: boolean;
  mutatingExec: boolean;
  mutationTouchesExistingPath: boolean;
}): boolean {
  const { sessionState, category, isMutation, mutatingExec, mutationTouchesExistingPath } = params;

  if (!isMutation) return false;
  if (sessionState.pendingVerification) return false;
  if (sessionState.evidenceCount <= 0) return false;
  if (category === "write" && mutationTouchesExistingPath) return true;
  if (category === "exec" && mutatingExec) return true;
  return false;
}

// ——— rule-based classifier ————————————————————————————————————————

/**
 * Default local classifier for ambiguous mutation scenarios.
 *
 * Only activates after at least one evidence step has happened, and only when
 * the current evidence still looks broad rather than target-specific.
 */
export class RuleBasedGrayAreaClassifier implements GuardrailClassifier {
  readonly source = "rule";

  private static readonly BROAD_EVIDENCE_PREFIXES = [
    "search_files:",
    "web_search:",
    "exec observation",
  ];

  classify(params: {
    toolName: string;
    args: Record<string, unknown>;
    sessionState: SessionRuntimeState;
    command: string;
    category: string;
    isMutation: boolean;
  }): GuardrailClassifierDecision | null {
    const { args, sessionState, command, category, isMutation } = params;

    if (!isMutation) return null;
    if (sessionState.pendingVerification || sessionState.evidenceCount <= 0) return null;
    if (category === "exec" && isLikelyMutatingExec(command)) return null;

    const recentEvidence = (sessionState.lastEvidenceLabel ?? "").toLowerCase();

    if (
      category === "write" &&
      sessionState.phase === "execute" &&
      RuleBasedGrayAreaClassifier.BROAD_EVIDENCE_PREFIXES.some((prefix) =>
        recentEvidence.startsWith(prefix),
      )
    ) {
      const target = String(
        args.path ?? args.file ?? args.filePath ?? args.target ?? "the target path",
      ).trim();

      return {
        decision: "block",
        reason:
          "Current evidence is still broad. Inspect the target file directly before editing.",
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
