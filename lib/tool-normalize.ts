import { TOOL_CATEGORIES } from "./constants";
import type { ToolCategory } from "./types";

function matchesToolAlias(lowerName: string, alias: string): boolean {
  return lowerName === alias
    || lowerName.endsWith(`.${alias}`)
    || lowerName.endsWith(`__${alias}`)
    || lowerName.includes(`__${alias}__`);
}

export function normalizeToolName(toolName: string): string {
  const lowerName = toolName.trim().toLowerCase();
  if (!lowerName) return "";

  if (["read", "read_file", "image", "pdf", "memory_recall"].some((alias) => matchesToolAlias(lowerName, alias))) {
    return "read";
  }

  if (["edit", "file_edit", "write", "file_write"].some((alias) => matchesToolAlias(lowerName, alias))) {
    return "write";
  }

  if (["glob", "grep", "grep_search", "web_search", "search"].some((alias) => matchesToolAlias(lowerName, alias))) {
    return "search";
  }

  if (["web_fetch", "network"].some((alias) => matchesToolAlias(lowerName, alias))) {
    return "network";
  }

  if (["exec", "bash", "shell", "run_command"].some((alias) => matchesToolAlias(lowerName, alias))) {
    return "exec";
  }

  return lowerName;
}

export function getToolCategory(toolName: string): ToolCategory {
  const normalizedToolName = normalizeToolName(toolName);
  if (normalizedToolName === "read" || normalizedToolName === "write" || normalizedToolName === "exec" || normalizedToolName === "search" || normalizedToolName === "network") {
    return normalizedToolName;
  }
  return TOOL_CATEGORIES[normalizedToolName] || "other";
}

export function getCanonicalToolName(...toolNames: Array<string | undefined>): string {
  const candidates = toolNames.filter((toolName): toolName is string => typeof toolName === "string" && toolName.trim().length > 0);
  if (candidates.length === 0) return "";

  const knownCandidate = candidates.find((toolName) => getToolCategory(toolName) !== "other");
  return knownCandidate || candidates[0];
}
