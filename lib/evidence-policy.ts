import { LOW_SIGNAL_PATTERNS } from "./constants";
import { getPathHints } from "./path";
import { compactLabel, firstStringField, normalizeSignalText } from "./text";
import type { ToolCategory } from "./types";
import { getExecCommand } from "./command-risk";
import { normalizeToolName } from "./tool-normalize";

export function describeObservation(toolName: string, input: Record<string, unknown>, derivedPaths?: readonly string[]): string {
  const normalizedToolName = normalizeToolName(toolName);

  if (normalizedToolName === "exec") {
    const command = getExecCommand(input);
    return command ? `exec observation: ${compactLabel(command, 100)}` : "exec observation";
  }

  const target = getPathHints(input, derivedPaths)[0]
    || firstStringField(input, ["query", "pattern", "url", "uri"])
    || normalizedToolName
    || toolName;
  return `${normalizedToolName || toolName}: ${compactLabel(target, 100)}`;
}

export function buildToolIntentSignature(toolName: string, input: Record<string, unknown>, derivedPaths?: readonly string[]): string {
  const normalizedToolName = normalizeToolName(toolName);

  if (normalizedToolName === "exec") {
    const command = getExecCommand(input);
    return command ? `exec:${compactLabel(command, 180).toLowerCase()}` : "exec";
  }

  const focus = getPathHints(input, derivedPaths)[0]
    || firstStringField(input, ["query", "pattern", "url", "uri"])
    || normalizedToolName
    || toolName;
  return `${normalizedToolName || toolName}:${compactLabel(focus, 180).toLowerCase()}`;
}

export function isEvidenceObservation(category: ToolCategory, mutatingExec: boolean, lowSignal: boolean, errorText: string): boolean {
  if (lowSignal || errorText) return false;
  if (category === "read" || category === "search" || category === "network") return true;
  if (category === "exec" && !mutatingExec) return true;
  return false;
}

export function isLowSignalObservation(toolName: string, text: string, errorText: string): boolean {
  if (errorText) return false;

  const normalizedToolName = normalizeToolName(toolName);
  const normalized = normalizeSignalText(text);
  if (!normalized) return true;
  if (normalized.length >= 120) return false;
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))) return true;

  if ((normalizedToolName.includes("search") || normalizedToolName.includes("grep")) && /(no matches|no results|0 matches|0 results|not found)/i.test(normalized)) {
    return true;
  }

  if (normalizedToolName === "exec" && /^(ok|done|ready|success|completed)$/i.test(normalized)) {
    return true;
  }

  return false;
}

export function describeMutation(toolName: string, input: Record<string, unknown>): string {
  const normalizedToolName = normalizeToolName(toolName);

  if (normalizedToolName === "exec") {
    const command = getExecCommand(input);
    return `exec: ${command.slice(0, 100)}`;
  }

  const target = typeof input.path === "string"
    ? input.path
    : typeof input.filePath === "string"
      ? input.filePath
      : typeof input.file === "string"
        ? input.file
        : normalizedToolName || toolName;
  return `${normalizedToolName || toolName}: ${String(target).slice(0, 100)}`;
}
