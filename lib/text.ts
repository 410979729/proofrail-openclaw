import { PLAIN_TEXT_FAILURE_PATTERNS } from "./constants";

export function extractTextFragments(value: unknown, depth = 0): string[] {
  if (value == null || depth > 5) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => extractTextFragments(item, depth + 1));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const fields = ["text", "message", "output", "content", "result", "stdout", "stderr", "summary", "title"];
  const fragments: string[] = [];
  for (const field of fields) {
    if (field in record) fragments.push(...extractTextFragments(record[field], depth + 1));
  }
  return fragments;
}

export function parseResultObject(result: unknown): Record<string, unknown> | undefined {
  if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  if (typeof result !== "string") return undefined;
  try {
    const loaded = JSON.parse(result);
    return loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function extractTextFromToolResult(result: unknown): string {
  const parsed = parseResultObject(result);
  const source = parsed ?? result;
  const text = extractTextFragments(source)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text) return text;
  return typeof result === "string" ? result.trim() : "";
}

export function normalizeSignalText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function compactLabel(text: string, maxLength = 160): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function firstStringField(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof input[key] === "string" && String(input[key]).trim()) {
      return String(input[key]).trim();
    }
  }
  return "";
}

export function looksLikePlainTextFailure(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  if ((lowered.includes("0 errors") || lowered.includes("no errors") || lowered.includes("without errors"))
    && !(/traceback|permission denied|command not found|no such file or directory/i.test(normalized))) {
    return false;
  }
  return PLAIN_TEXT_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized));
}
