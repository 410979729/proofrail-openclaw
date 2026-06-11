export type ToolCategory = "read" | "write" | "exec" | "search" | "network" | "other";

// Active runtime states in v0.6.x. `plan` and `wait_user` remain reserved in
// forward-looking schemas until workflow tools are implemented.
export type SessionPhase = "observe" | "execute" | "review";
export type EnforcementMode = "advisory" | "strict" | "guarded" | "off";
export type AdvisoryInjectionMode = "compact" | "full" | "off";
export type ValidationPolicy = "batch" | "after_each_mutation" | "off";
export type DangerousCommandAction = "approve" | "block" | "warn" | "allow";
export type ClassifierDecisionName = "allow" | "warn" | "ask_user" | "block";
export type ClassifierEvidenceGapName =
  | "none"
  | "target_state"
  | "change_readback"
  | "narrow_validation"
  | "user_choice"
  | "strategy_shift"
  | "unclear";

export interface SessionRuntimeState {
  phase: SessionPhase;
  evidenceCount: number;
  lastEvidenceLabel?: string;
  pendingVerification: boolean;
  lastMutationLabel?: string;
  consecutiveLowSignal: number;
  lastLowSignalSignature?: string;
  lastLowSignalIntent?: string;
  mutationCount: number;
  validationCount: number;
  dangerousCount: number;
  lastDangerousLabel?: string;
  lastValidationLabel?: string;
  touchedFiles: readonly string[];
  evidencePaths: readonly string[];
  evidenceSuggestions: readonly string[];
  validationSuggestions: readonly string[];
  evidenceLabels: readonly string[];
  mutationLabels: readonly string[];
  validationLabels: readonly string[];
  dangerousLabels: readonly string[];
  finalReportRequired: boolean;
  lastAdvisory?: {
    reason: string;
    message: string;
    severity: "info" | "warn" | "risk";
    target?: string;
    fastestNextAction?: string;
    riskIfIgnored?: string;
    wouldHaveBlockedInStrict: boolean;
    ignored?: boolean;
  };
  unverifiedMutationCount: number;
  lastBlockMessage?: string;
  lastBlockReason?: string;
  lastClassifierDecision?: ClassifierDecisionName;
  lastClassifierReason?: string;
  lastClassifierEvidenceGap?: ClassifierEvidenceGapName;
  lastClassifierGuidance: readonly string[];
  lastClassifierSource?: string;
  lastUpdatedAt: number;
}

export interface CompactionSnapshot {
  timestamp: string;
  messageCount: number;
  tokenCount?: number;
  sessionKey?: string;
}

export interface ProofrailLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface GuardrailClassifierDecision {
  decision: ClassifierDecisionName;
  reason: string;
  evidenceGap: ClassifierEvidenceGapName;
  guidance: readonly string[];
  source: string;
}

export interface GuardrailClassifier {
  classify(params: {
    toolName: string;
    args: Record<string, unknown>;
    sessionState: SessionRuntimeState;
    command: string;
    category: string;
    isMutation: boolean;
  }): GuardrailClassifierDecision | null;
}

export interface ProofrailPluginConfig {
  enforcementMode?: EnforcementMode;
  advisoryInjection?: AdvisoryInjectionMode;
  validationPolicy?: ValidationPolicy | "immediate";
  mutationBatchMax?: number;
  dangerousCommandAction?: DangerousCommandAction;
  summaryThresholdChars?: number;
  lowSignalBlockThreshold?: number;
  llmClassifierEnabled?: boolean;
  llmClassifierProvider?: string;
  llmClassifierModel?: string;
}

export interface ProofrailApi {
  id?: string;
  name?: string;
  logger: ProofrailLogger;
  rootDir?: string;
  config?: {
    tools?: {
      exec?: {
        security?: string;
      };
    };
    [key: string]: unknown;
  };
  pluginConfig?: ProofrailPluginConfig | Record<string, unknown>;
  runtime?: {
    state?: {
      resolveStateDir(...args: unknown[]): string;
    };
    config?: {
      current?(): unknown;
    };
    agent?: {
      resolveAgentWorkspaceDir?(config: unknown, agentId?: string): string | undefined;
    };
  };
  on(
    eventName: string,
    handler: (event: unknown, ctx?: ProofrailContext) => unknown,
    options?: HookRegistrationOptions,
  ): void;
}

export interface ProofrailContext {
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  workspaceDir?: string;
  cwd?: string;
  runId?: string;
  jobId?: string;
  toolKind?: string;
  toolInputKind?: string;
  trace?: unknown;
}

export interface HookRegistrationOptions {
  priority?: number;
}

export interface ProofrailEvent {
  tool?: { name?: string };
  toolName?: string;
  sessionId?: string;
  conversationId?: string;
  input?: Record<string, unknown>;
  params?: Record<string, unknown>;
  derivedPaths?: readonly string[];
  context?: {
    pluginConfig?: ProofrailPluginConfig | Record<string, unknown>;
  };
  result?: unknown;
  error?: string;
  message?: string;
  prompt?: string;
  messageCount?: number;
  tokenCount?: number;
  compactedCount?: number;
  durationMs?: number;
  reason?: string;
  resumedFrom?: string;
  sessionFile?: string;
  transcriptArchived?: boolean;
  nextSessionId?: string;
  nextSessionKey?: string;
}
