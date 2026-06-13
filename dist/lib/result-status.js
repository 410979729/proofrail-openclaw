"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBlockedToolResult = isBlockedToolResult;
exports.getToolResultStatus = getToolResultStatus;
const text_1 = require("./text");
function unwrapResultPayload(result) {
    const payload = (0, text_1.parseResultObject)(result);
    if (!payload)
        return undefined;
    const details = payload.details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
        return {
            ...payload,
            ...details,
        };
    }
    return payload;
}
function getFirstNumericField(result, keys) {
    for (const key of keys) {
        const value = result[key];
        if (typeof value === "number" && Number.isFinite(value))
            return value;
    }
    return undefined;
}
function isBlockedToolResult(result) {
    const payload = unwrapResultPayload(result);
    return typeof payload?.status === "string" && payload.status.trim().toLowerCase() === "blocked";
}
function getToolResultStatus(result, errorText = "") {
    if (typeof errorText === "string" && errorText.trim())
        return "failure";
    if (typeof result === "string") {
        const text = result.trim();
        if (!text)
            return "unknown";
        return (0, text_1.looksLikePlainTextFailure)(text) ? "failure" : "success";
    }
    const payload = unwrapResultPayload(result);
    if (!payload) {
        return "unknown";
    }
    const exitCode = getFirstNumericField(payload, ["exitCode", "exit_code", "code", "returnCode", "returncode", "status"]);
    const httpStatus = getFirstNumericField(payload, ["statusCode", "httpStatus", "http_status"]);
    if (typeof payload.status === "string" && payload.status.trim().toLowerCase() === "blocked")
        return "failure";
    if (typeof payload.signal === "string" && payload.signal.trim())
        return "failure";
    if (typeof exitCode === "number" && exitCode !== 0)
        return "failure";
    if (typeof httpStatus === "number" && httpStatus >= 400)
        return "failure";
    if (typeof payload.success === "boolean" && !payload.success)
        return "failure";
    if (typeof payload.ok === "boolean" && !payload.ok)
        return "failure";
    if (typeof payload.error === "string" && payload.error.trim())
        return "failure";
    if (payload.errors)
        return "failure";
    if (typeof exitCode === "number")
        return "success";
    if (typeof payload.success === "boolean" && payload.success)
        return "success";
    if (typeof payload.ok === "boolean" && payload.ok)
        return "success";
    if (typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 400)
        return "success";
    const extractedText = (0, text_1.extractTextFromToolResult)(payload);
    if (extractedText)
        return (0, text_1.looksLikePlainTextFailure)(extractedText) ? "failure" : "success";
    return "unknown";
}
