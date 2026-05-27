export type ToolCategory = "read" | "write" | "exec" | "search" | "network" | "other";

// Active runtime states in v0.6.x. `plan` and `wait_user` remain reserved in
// forward-looking schemas until workflow tools are implemented.
export type SessionPhase = "observe" | "execute" | "review";
export type DangerousCommandAction = "approve" | "block";

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
  validationSuggestions: readonly string[];
  evidenceLabels: readonly string[];
  mutationLabels: readonly string[];
  validationLabels: readonly string[];
  dangerousLabels: readonly string[];
  finalReportRequired: boolean;
  lastUpdatedAt: number;
}

export interface CompactionSnapshot {
  timestamp: string;
  messageCount: number;
  tokenCount?: number;
  sessionKey?: string;
}

export interface ClaudeCompatLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface ClaudeCompatPluginConfig {
  dangerousCommandAction?: DangerousCommandAction;
  summaryThresholdChars?: number;
  lowSignalBlockThreshold?: number;
}

export interface ClaudeCompatApi {
  id?: string;
  name?: string;
  logger: ClaudeCompatLogger;
  rootDir?: string;
  config?: {
    tools?: {
      exec?: {
        security?: string;
      };
    };
    [key: string]: unknown;
  };
  pluginConfig?: ClaudeCompatPluginConfig | Record<string, unknown>;
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
    handler: (event: unknown, ctx?: ClaudeCompatContext) => unknown,
    options?: HookRegistrationOptions,
  ): void;
}

export interface ClaudeCompatContext {
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

export interface ClaudeCompatEvent {
  tool?: { name?: string };
  toolName?: string;
  sessionId?: string;
  conversationId?: string;
  input?: Record<string, unknown>;
  params?: Record<string, unknown>;
  derivedPaths?: readonly string[];
  context?: {
    pluginConfig?: ClaudeCompatPluginConfig | Record<string, unknown>;
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

export type ProofrailLogger = ClaudeCompatLogger;
export type ProofrailPluginConfig = ClaudeCompatPluginConfig;
export type ProofrailApi = ClaudeCompatApi;
export type ProofrailContext = ClaudeCompatContext;
export type ProofrailEvent = ClaudeCompatEvent;
