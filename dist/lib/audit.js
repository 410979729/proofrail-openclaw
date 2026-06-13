"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
exports.resolveRuntimeArtifactsDir = resolveRuntimeArtifactsDir;
exports.defaultAuditLogPath = defaultAuditLogPath;
const fs_1 = require("fs");
const path_1 = require("path");
function jsonSafe(value) {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.map(jsonSafe);
    if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
    }
    return String(value);
}
function resolveRuntimeArtifactsDir(api) {
    const stateDir = api.runtime?.state?.resolveStateDir?.();
    if (typeof stateDir === "string" && stateDir.trim()) {
        return (0, path_1.join)(stateDir, "plugins", api.id || "proofrail");
    }
    return (0, path_1.join)(api.rootDir || ".", ".proofrail");
}
function defaultAuditLogPath(api) {
    return (0, path_1.join)(resolveRuntimeArtifactsDir(api), "audit.jsonl");
}
class AuditLogger {
    path;
    constructor(path) {
        this.path = path;
    }
    record(event, fields = {}) {
        if (!this.path)
            return;
        try {
            (0, fs_1.mkdirSync)((0, path_1.dirname)(this.path), { recursive: true });
            (0, fs_1.appendFileSync)(this.path, `${JSON.stringify(jsonSafe({ timestamp: new Date().toISOString(), event, ...fields }))}\n`, "utf8");
        }
        catch {
            // best effort only
        }
    }
}
exports.AuditLogger = AuditLogger;
