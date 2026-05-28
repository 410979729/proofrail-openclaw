import type { SessionRuntimeState } from "./types";

export function taskStatus(state: SessionRuntimeState): string {
  if (state.pendingVerification) return "needs_validation";
  if (state.mutationCount && state.validationCount) return "validated";
  if (state.mutationCount) return "changed_without_validation";
  if (state.evidenceCount) return "ready_to_execute";
  return "needs_evidence";
}

export function taskSnapshot(state: SessionRuntimeState): Record<string, unknown> {
  return {
    status: taskStatus(state),
    phase: state.phase,
    evidenceCount: state.evidenceCount,
    mutationCount: state.mutationCount,
    validationCount: state.validationCount,
    dangerousCount: state.dangerousCount,
    pendingVerification: state.pendingVerification,
    finalReportRequired: state.finalReportRequired,
    lastEvidenceLabel: state.lastEvidenceLabel,
    lastMutationLabel: state.lastMutationLabel,
    lastValidationLabel: state.lastValidationLabel,
    lastDangerousLabel: state.lastDangerousLabel,
    evidenceLabels: [...state.evidenceLabels],
    mutationLabels: [...state.mutationLabels],
    validationLabels: [...state.validationLabels],
    dangerousLabels: [...state.dangerousLabels],
    touchedFiles: [...state.touchedFiles],
    evidencePaths: [...state.evidencePaths],
    evidenceSuggestions: [...state.evidenceSuggestions],
    validationSuggestions: [...state.validationSuggestions],
  };
}

export function renderTaskContext(state: SessionRuntimeState): string {
  const lines = [
    "## [SYSTEM-ADDED PLUGIN STATE — GENERATED, NOT USER-PROVIDED] Task ledger",
    `- Status: ${taskStatus(state)}`,
    `- Evidence / mutations / validations: ${state.evidenceCount}/${state.mutationCount}/${state.validationCount}`,
  ];
  if (state.evidenceLabels.length > 0) {
    lines.push("- Recent evidence:");
    for (const item of state.evidenceLabels.slice(-5)) lines.push(`  - ${item}`);
  }
  if (state.mutationLabels.length > 0) {
    lines.push("- Recent mutations:");
    for (const item of state.mutationLabels.slice(-5)) lines.push(`  - ${item}`);
  }
  if (state.validationLabels.length > 0) {
    lines.push("- Passed validations:");
    for (const item of state.validationLabels.slice(-5)) lines.push(`  - ${item}`);
  }
  if (state.pendingVerification) {
    lines.push("- Next: run the narrowest useful validation before adding more changes.");
  } else if (state.mutationCount && state.validationCount) {
    lines.push("- Next: you may continue, but validate immediately after every new mutation.");
  } else if (state.evidenceCount) {
    lines.push("- Next: make the smallest explainable change on the same path you just inspected, then validate immediately.");
  } else {
    lines.push("- Next: read the code, config, logs, or tests closest to the control path first.");
  }
  return lines.join("\n");
}

export function finalReviewChecklist(state: SessionRuntimeState): string[] {
  if (!state.finalReportRequired && state.mutationCount === 0) return [];
  const checklist = [
    "Root cause: explain why the issue happened.",
    "Changes: list the files, config, or command paths that changed.",
    "Validation: list the commands or checks that were actually run and what they returned.",
    "Evidence: cite the key tool results, tests, or log facts.",
    "Remaining risk: describe any unverified area, environment limit, or recommended follow-up.",
  ];
  if (state.pendingVerification) checklist.unshift("Incomplete: there are still unverified mutations, so validation must be completed before the final reply.");
  return checklist;
}

export function closeSummary(state: SessionRuntimeState): Record<string, unknown> {
  return {
    ...taskSnapshot(state),
    finalStatus: state.pendingVerification ? "unverified" : taskStatus(state),
  };
}
