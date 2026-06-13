"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPathHints = getPathHints;
exports.mutationBaseDir = mutationBaseDir;
exports.pathExistsFromHint = pathExistsFromHint;
exports.readbackPathsValidateTouchedPaths = readbackPathsValidateTouchedPaths;
exports.pathHintsOverlap = pathHintsOverlap;
exports.mutatesExistingPath = mutatesExistingPath;
const fs_1 = require("fs");
const path_1 = require("path");
function uniquePush(out, seen, value) {
    if (typeof value !== "string")
        return;
    const candidate = value.trim();
    if (!candidate || seen.has(candidate))
        return;
    seen.add(candidate);
    out.push(candidate);
}
function extractPatchPaths(patchText) {
    if (typeof patchText !== "string" || !patchText.trim())
        return [];
    const out = [];
    const seen = new Set();
    const re = /^\*\*\*\s+(?:Update|Delete|Add)\s+File:\s+(.+?)\s*$/gm;
    let match;
    while ((match = re.exec(patchText)) !== null) {
        uniquePush(out, seen, match[1]);
    }
    return out;
}
function getPathHints(input, derivedPaths, options) {
    const includeCwd = options?.includeCwd !== false;
    const out = [];
    const seen = new Set();
    for (const derivedPath of derivedPaths || [])
        uniquePush(out, seen, derivedPath);
    for (const key of ["path", "filePath", "file", "target"])
        uniquePush(out, seen, input[key]);
    if (includeCwd)
        uniquePush(out, seen, input.cwd);
    for (const patchPath of extractPatchPaths(input.patch))
        uniquePush(out, seen, patchPath);
    return out;
}
function mutationBaseDir(input, baseDir) {
    return typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : baseDir;
}
function pathExistsFromHint(pathHint, baseDir) {
    if (!pathHint || /^https?:\/\//i.test(pathHint))
        return false;
    const resolvedPath = (0, path_1.isAbsolute)(pathHint) ? pathHint : (0, path_1.resolve)(baseDir || ".", pathHint);
    return (0, fs_1.existsSync)(resolvedPath);
}
function resolvePathHint(pathHint, baseDir) {
    if (!pathHint || /^https?:\/\//i.test(pathHint))
        return undefined;
    return (0, path_1.isAbsolute)(pathHint) ? (0, path_1.resolve)(pathHint) : (0, path_1.resolve)(baseDir || ".", pathHint);
}
function pathContains(left, right) {
    return left === right || left.startsWith(`${right}${path_1.sep}`);
}
function readbackPathsValidateTouchedPaths(touchedHints, readbackHints, baseDir) {
    const touchedPaths = touchedHints
        .map((pathHint) => resolvePathHint(pathHint, baseDir))
        .filter((value) => Boolean(value));
    const readbackPaths = readbackHints
        .map((pathHint) => resolvePathHint(pathHint, baseDir))
        .filter((value) => Boolean(value));
    if (touchedPaths.length === 0 || readbackPaths.length === 0)
        return false;
    return readbackPaths.some((readbackPath) => touchedPaths.some((touchedPath) => pathContains(readbackPath, touchedPath)));
}
function pathHintsOverlap(leftHints, rightHints, baseDir) {
    const leftPaths = leftHints
        .map((pathHint) => resolvePathHint(pathHint, baseDir))
        .filter((value) => Boolean(value));
    const rightPaths = rightHints
        .map((pathHint) => resolvePathHint(pathHint, baseDir))
        .filter((value) => Boolean(value));
    if (leftPaths.length === 0 || rightPaths.length === 0)
        return false;
    return leftPaths.some((leftPath) => rightPaths.some((rightPath) => pathContains(leftPath, rightPath) || pathContains(rightPath, leftPath)));
}
function mutatesExistingPath(input, derivedPaths, baseDir) {
    const hints = getPathHints(input, derivedPaths, { includeCwd: false });
    const effectiveBaseDir = mutationBaseDir(input, baseDir);
    return hints.some((pathHint) => pathExistsFromHint(pathHint, effectiveBaseDir));
}
