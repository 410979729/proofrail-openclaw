export type WorkflowPhase = "observe" | "plan" | "execute" | "review" | "wait_user";

export type IsolationMode = "main" | "worktree" | "sandbox";

export type TaskStatus = "planned" | "in_progress" | "blocked" | "review" | "done";

export type PolicyDecisionKind = "allow" | "ask" | "deny";

export interface PlanStep {
  id: string;
  title: string;
  done: boolean;
  verification?: string;
}

export interface PlanRecord {
  id: string;
  title: string;
  goal: string;
  steps: PlanStep[];
  risks: string[];
  verification: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  plan: string[];
  artifacts: string[];
  needsUserInput: boolean;
  needsApproval: boolean;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AskUserQuestionRecord {
  id: string;
  taskId?: string;
  question: string;
  choices?: string[];
  allowFreeform: boolean;
  createdAt: string;
  answeredAt?: string;
}

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  reason: string;
  requiresPlan: boolean;
  requiresIsolation: boolean;
  isolationMode?: IsolationMode;
  approvalMessage?: string;
}