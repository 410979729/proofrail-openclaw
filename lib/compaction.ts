import { existsSync, mkdirSync, writeFileSync } from "fs";
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
    join(snapshotDir, "last-compaction-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
}