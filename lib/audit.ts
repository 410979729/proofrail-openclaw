import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

import type { ProofrailApi } from "./types";

function jsonSafe(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return String(value);
}

export function resolveRuntimeArtifactsDir(api: ProofrailApi): string {
  const stateDir = api.runtime?.state?.resolveStateDir?.();
  if (typeof stateDir === "string" && stateDir.trim()) {
    return join(stateDir, "plugins", api.id || "claude-compat");
  }
  return join(api.rootDir || ".", ".claude-compat");
}

export function defaultAuditLogPath(api: ProofrailApi): string {
  return join(resolveRuntimeArtifactsDir(api), "audit.jsonl");
}

export class AuditLogger {
  constructor(private readonly path?: string) {}

  record(event: string, fields: Record<string, unknown> = {}): void {
    if (!this.path) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, `${JSON.stringify(jsonSafe({ timestamp: new Date().toISOString(), event, ...fields }))}\n`, "utf8");
    } catch {
      // best effort only
    }
  }
}
