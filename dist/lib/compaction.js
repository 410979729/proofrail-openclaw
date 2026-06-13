"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeCompactionSnapshot = writeCompactionSnapshot;
exports.readCompactionSnapshot = readCompactionSnapshot;
const fs_1 = require("fs");
const path_1 = require("path");
const audit_1 = require("./audit");
function toSafeSessionKey(sessionKey) {
    const normalized = typeof sessionKey === "string" && sessionKey.trim()
        ? sessionKey.trim()
        : "default";
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "default";
}
function writeCompactionSnapshot(api, snapshot) {
    const snapshotDir = (0, path_1.join)((0, audit_1.resolveRuntimeArtifactsDir)(api), "sessions", toSafeSessionKey(snapshot.sessionKey));
    if (!(0, fs_1.existsSync)(snapshotDir))
        (0, fs_1.mkdirSync)(snapshotDir, { recursive: true });
    (0, fs_1.writeFileSync)(compactionSnapshotPath(api, snapshot.sessionKey), JSON.stringify(snapshot, null, 2));
}
function compactionSnapshotPath(api, sessionKey) {
    return (0, path_1.join)((0, audit_1.resolveRuntimeArtifactsDir)(api), "sessions", toSafeSessionKey(sessionKey), "last-compaction-snapshot.json");
}
function readCompactionSnapshot(api, sessionKey) {
    const snapshotPath = compactionSnapshotPath(api, sessionKey);
    if (!(0, fs_1.existsSync)(snapshotPath))
        return undefined;
    const parsed = JSON.parse((0, fs_1.readFileSync)(snapshotPath, "utf8"));
    if (!parsed || typeof parsed !== "object")
        return undefined;
    return parsed;
}
