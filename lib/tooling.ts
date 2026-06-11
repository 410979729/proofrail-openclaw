import {
  DEFAULT_ADVISORY_INJECTION,
  DEFAULT_DANGEROUS_COMMAND_ACTION,
  DEFAULT_ENFORCEMENT_MODE,
  DEFAULT_MUTATION_BATCH_MAX,
  DEFAULT_VALIDATION_POLICY,
  LOW_SIGNAL_BLOCK_THRESHOLD,
  MAX_LOW_SIGNAL_BLOCK_THRESHOLD,
  MAX_SUMMARY_THRESHOLD_CHARS,
  MIN_LOW_SIGNAL_BLOCK_THRESHOLD,
  MIN_SUMMARY_THRESHOLD_CHARS,
  SUMMARY_KEEP_HEAD,
  SUMMARY_KEEP_TAIL,
  SUMMARY_THRESHOLD_CHARS,
} from "./constants";
import type { AdvisoryInjectionMode, EnforcementMode, ProofrailApi, ProofrailEvent, ProofrailPluginConfig, ValidationPolicy } from "./types";

export {
  getExecCommand,
  isDangerousCommand,
  isLikelyMutatingExec,
  isLikelyValidationExec,
} from "./command-risk";
export {
  buildToolIntentSignature,
  describeMutation,
  describeObservation,
  isEvidenceObservation,
  isLowSignalObservation,
} from "./evidence-policy";
export {
  getCanonicalToolName,
  getToolCategory,
  normalizeToolName,
} from "./tool-normalize";

export function summarizeLargeOutput(text: string, threshold = SUMMARY_THRESHOLD_CHARS): string {
  if (text.length <= threshold) return text;

  const scale = Math.min(1, threshold / SUMMARY_THRESHOLD_CHARS);
  const headKeep = Math.max(200, Math.floor(SUMMARY_KEEP_HEAD * scale));
  const tailKeep = Math.max(150, Math.floor(SUMMARY_KEEP_TAIL * scale));
  const head = text.slice(0, headKeep);
  const tail = text.slice(-tailKeep);
  const omitted = text.length - headKeep - tailKeep;
  return `${head}\n\n[... ${omitted} chars omitted by proofrail ...]\n\n${tail}`;
}

export function resolvePluginConfig(api: ProofrailApi, event?: ProofrailEvent): ProofrailPluginConfig {
  const base = (api.pluginConfig && typeof api.pluginConfig === "object")
    ? api.pluginConfig
    : undefined;
  const fromEvent = (event?.context?.pluginConfig && typeof event.context.pluginConfig === "object")
    ? event.context.pluginConfig
    : undefined;
  return {
    ...(base as Record<string, unknown> | undefined),
    ...(fromEvent as Record<string, unknown> | undefined),
  } as ProofrailPluginConfig;
}

export function getDangerousCommandAction(
  api: ProofrailApi,
  event?: ProofrailEvent,
): "approve" | "block" | "warn" | "allow" {
  const configured = resolvePluginConfig(api, event).dangerousCommandAction;
  if (configured === "approve" || configured === "block" || configured === "warn" || configured === "allow") {
    return configured;
  }
  return DEFAULT_DANGEROUS_COMMAND_ACTION as "approve" | "block" | "warn" | "allow";
}

export function getEnforcementMode(api: ProofrailApi, event?: ProofrailEvent): EnforcementMode {
  const configured = resolvePluginConfig(api, event).enforcementMode;
  if (configured === "advisory" || configured === "strict" || configured === "guarded" || configured === "off") return configured;
  return DEFAULT_ENFORCEMENT_MODE;
}

export function getAdvisoryInjection(api: ProofrailApi, event?: ProofrailEvent): AdvisoryInjectionMode {
  const configured = resolvePluginConfig(api, event).advisoryInjection;
  if (configured === "compact" || configured === "full" || configured === "off") return configured;
  return DEFAULT_ADVISORY_INJECTION;
}

export function getValidationPolicy(api: ProofrailApi, event?: ProofrailEvent): ValidationPolicy {
  const configured = resolvePluginConfig(api, event).validationPolicy;
  if (configured === "batch" || configured === "after_each_mutation" || configured === "off") return configured;
  if (configured === "immediate") return "after_each_mutation";
  return DEFAULT_VALIDATION_POLICY;
}

export function getMutationBatchMax(api: ProofrailApi, event?: ProofrailEvent): number {
  const configured = resolvePluginConfig(api, event).mutationBatchMax;
  if (typeof configured !== "number" || !Number.isFinite(configured)) return DEFAULT_MUTATION_BATCH_MAX;
  return Math.max(1, Math.min(20, Math.floor(configured)));
}

export function getSummaryThreshold(api: ProofrailApi, event?: ProofrailEvent): number {
  const configured = resolvePluginConfig(api, event).summaryThresholdChars;
  if (typeof configured !== "number" || !Number.isFinite(configured)) return SUMMARY_THRESHOLD_CHARS;
  return Math.max(MIN_SUMMARY_THRESHOLD_CHARS, Math.min(MAX_SUMMARY_THRESHOLD_CHARS, Math.floor(configured)));
}

export function getLowSignalBlockThreshold(api: ProofrailApi, event?: ProofrailEvent): number {
  const configured = resolvePluginConfig(api, event).lowSignalBlockThreshold;
  if (typeof configured !== "number" || !Number.isFinite(configured)) return LOW_SIGNAL_BLOCK_THRESHOLD;
  return Math.max(MIN_LOW_SIGNAL_BLOCK_THRESHOLD, Math.min(MAX_LOW_SIGNAL_BLOCK_THRESHOLD, Math.floor(configured)));
}
