"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeObservation = describeObservation;
exports.buildToolIntentSignature = buildToolIntentSignature;
exports.isEvidenceObservation = isEvidenceObservation;
exports.isLowSignalObservation = isLowSignalObservation;
exports.describeMutation = describeMutation;
const constants_1 = require("./constants");
const path_1 = require("./path");
const text_1 = require("./text");
const command_risk_1 = require("./command-risk");
const tool_normalize_1 = require("./tool-normalize");
function describeObservation(toolName, input, derivedPaths) {
    const normalizedToolName = (0, tool_normalize_1.normalizeToolName)(toolName);
    if (normalizedToolName === "exec") {
        const command = (0, command_risk_1.getExecCommand)(input);
        return command ? `exec observation: ${(0, text_1.compactLabel)(command, 100)}` : "exec observation";
    }
    const target = (0, path_1.getPathHints)(input, derivedPaths)[0]
        || (0, text_1.firstStringField)(input, ["query", "pattern", "url", "uri"])
        || normalizedToolName
        || toolName;
    return `${normalizedToolName || toolName}: ${(0, text_1.compactLabel)(target, 100)}`;
}
function buildToolIntentSignature(toolName, input, derivedPaths) {
    const normalizedToolName = (0, tool_normalize_1.normalizeToolName)(toolName);
    if (normalizedToolName === "exec") {
        const command = (0, command_risk_1.getExecCommand)(input);
        return command ? `exec:${(0, text_1.compactLabel)(command, 180).toLowerCase()}` : "exec";
    }
    const focus = (0, path_1.getPathHints)(input, derivedPaths)[0]
        || (0, text_1.firstStringField)(input, ["query", "pattern", "url", "uri"])
        || normalizedToolName
        || toolName;
    return `${normalizedToolName || toolName}:${(0, text_1.compactLabel)(focus, 180).toLowerCase()}`;
}
function isEvidenceObservation(category, mutatingExec, lowSignal, errorText) {
    if (lowSignal || errorText)
        return false;
    if (category === "read" || category === "search" || category === "network")
        return true;
    if (category === "exec" && !mutatingExec)
        return true;
    return false;
}
function isLowSignalObservation(toolName, text, errorText) {
    if (errorText)
        return false;
    const normalizedToolName = (0, tool_normalize_1.normalizeToolName)(toolName);
    const normalized = (0, text_1.normalizeSignalText)(text);
    if (!normalized)
        return true;
    if (normalized.length >= 120)
        return false;
    if (constants_1.LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized)))
        return true;
    if ((normalizedToolName.includes("search") || normalizedToolName.includes("grep")) && /(no matches|no results|0 matches|0 results|not found)/i.test(normalized)) {
        return true;
    }
    if (normalizedToolName === "exec" && /^(ok|done|ready|success|completed)$/i.test(normalized)) {
        return true;
    }
    return false;
}
function describeMutation(toolName, input) {
    const normalizedToolName = (0, tool_normalize_1.normalizeToolName)(toolName);
    if (normalizedToolName === "exec") {
        const command = (0, command_risk_1.getExecCommand)(input);
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
