"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFragments = extractTextFragments;
exports.parseResultObject = parseResultObject;
exports.extractTextFromToolResult = extractTextFromToolResult;
exports.normalizeSignalText = normalizeSignalText;
exports.compactLabel = compactLabel;
exports.firstStringField = firstStringField;
exports.looksLikePlainTextFailure = looksLikePlainTextFailure;
const constants_1 = require("./constants");
function extractTextFragments(value, depth = 0) {
    if (value == null || depth > 5)
        return [];
    if (typeof value === "string")
        return [value];
    if (typeof value === "number" || typeof value === "boolean")
        return [String(value)];
    if (Array.isArray(value))
        return value.flatMap((item) => extractTextFragments(item, depth + 1));
    if (typeof value !== "object")
        return [];
    const record = value;
    const fields = ["text", "message", "output", "content", "result", "stdout", "stderr", "summary", "title", "details"];
    const fragments = [];
    for (const field of fields) {
        if (field in record)
            fragments.push(...extractTextFragments(record[field], depth + 1));
    }
    return fragments;
}
function parseResultObject(result) {
    if (result && typeof result === "object" && !Array.isArray(result))
        return result;
    if (typeof result !== "string")
        return undefined;
    try {
        const loaded = JSON.parse(result);
        return loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded : undefined;
    }
    catch {
        return undefined;
    }
}
function extractTextFromToolResult(result) {
    const parsed = parseResultObject(result);
    const source = parsed ?? result;
    const text = extractTextFragments(source)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (text)
        return text;
    return typeof result === "string" ? result.trim() : "";
}
function normalizeSignalText(text) {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
}
function compactLabel(text, maxLength = 160) {
    return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function firstStringField(input, keys) {
    for (const key of keys) {
        if (typeof input[key] === "string" && String(input[key]).trim()) {
            return String(input[key]).trim();
        }
    }
    return "";
}
function looksLikePlainTextFailure(text) {
    const normalized = text.trim();
    if (!normalized)
        return false;
    const lowered = normalized.toLowerCase();
    if ((lowered.includes("0 errors") || lowered.includes("no errors") || lowered.includes("without errors"))
        && !(/traceback|permission denied|command not found|no such file or directory/i.test(normalized))) {
        return false;
    }
    return constants_1.PLAIN_TEXT_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized));
}
