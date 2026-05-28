import {
  DEFAULT_DANGEROUS_COMMAND_ACTION,
  LOW_SIGNAL_BLOCK_THRESHOLD,
  MAX_LOW_SIGNAL_BLOCK_THRESHOLD,
  MAX_SUMMARY_THRESHOLD_CHARS,
  MIN_LOW_SIGNAL_BLOCK_THRESHOLD,
  MIN_SUMMARY_THRESHOLD_CHARS,
  SUMMARY_KEEP_HEAD,
  SUMMARY_KEEP_TAIL,
  SUMMARY_THRESHOLD_CHARS,
} from "./constants";
import type { ProofrailApi, ProofrailEvent, ProofrailPluginConfig } from "./types";

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

export function getDangerousCommandAction(api: ProofrailApi, event?: ProofrailEvent): "approve" | "block" {
  const configured = resolvePluginConfig(api, event).dangerousCommandAction;
  if (configured === "approve" || configured === "block") return configured;
  return DEFAULT_DANGEROUS_COMMAND_ACTION;
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
