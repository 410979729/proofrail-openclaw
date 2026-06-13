import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { resolveRuntimeArtifactsDir } from "./audit";
import type { ProofrailApi, CompactionSnapshot } from "./types";

function toSafeSessionKey(sessionKey: string | undefined): string {
  const normalized = typeof sessionKey === "string" && sessionKey.trim()
    ? sessionKey.trim()
    : "default";
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "default";
}

export function writeCompactionSnapshot(api: ProofrailApi, snapshot: CompactionSnapshot): void {
  const snapshotDir = join(resolveRuntimeArtifactsDir(api), "sessions", toSafeSessionKey(snapshot.sessionKey));
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(
    compactionSnapshotPath(api, snapshot.sessionKey),
    JSON.stringify(snapshot, null, 2),
  );
}

function compactionSnapshotPath(api: ProofrailApi, sessionKey: string | undefined): string {
  return join(resolveRuntimeArtifactsDir(api), "sessions", toSafeSessionKey(sessionKey), "last-compaction-snapshot.json");
}

export function readCompactionSnapshot(api: ProofrailApi, sessionKey: string | undefined): CompactionSnapshot | undefined {
  const snapshotPath = compactionSnapshotPath(api, sessionKey);
  if (!existsSync(snapshotPath)) return undefined;
  const parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!parsed || typeof parsed !== "object") return undefined;
  return parsed as CompactionSnapshot;
}
