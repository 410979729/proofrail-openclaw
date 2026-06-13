"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeToolName = exports.getToolCategory = exports.getCanonicalToolName = exports.isLowSignalObservation = exports.isEvidenceObservation = exports.describeObservation = exports.describeMutation = exports.buildToolIntentSignature = exports.isLikelyValidationExec = exports.isLikelyMutatingExec = exports.isDangerousCommand = exports.getExecCommand = void 0;
exports.summarizeLargeOutput = summarizeLargeOutput;
exports.resolvePluginConfig = resolvePluginConfig;
exports.getDangerousCommandAction = getDangerousCommandAction;
exports.getEnforcementMode = getEnforcementMode;
exports.getAdvisoryInjection = getAdvisoryInjection;
exports.getValidationPolicy = getValidationPolicy;
exports.getMutationBatchMax = getMutationBatchMax;
exports.getSummaryThreshold = getSummaryThreshold;
exports.getLowSignalBlockThreshold = getLowSignalBlockThreshold;
const constants_1 = require("./constants");
var command_risk_1 = require("./command-risk");
Object.defineProperty(exports, "getExecCommand", { enumerable: true, get: function () { return command_risk_1.getExecCommand; } });
Object.defineProperty(exports, "isDangerousCommand", { enumerable: true, get: function () { return command_risk_1.isDangerousCommand; } });
Object.defineProperty(exports, "isLikelyMutatingExec", { enumerable: true, get: function () { return command_risk_1.isLikelyMutatingExec; } });
Object.defineProperty(exports, "isLikelyValidationExec", { enumerable: true, get: function () { return command_risk_1.isLikelyValidationExec; } });
var evidence_policy_1 = require("./evidence-policy");
Object.defineProperty(exports, "buildToolIntentSignature", { enumerable: true, get: function () { return evidence_policy_1.buildToolIntentSignature; } });
Object.defineProperty(exports, "describeMutation", { enumerable: true, get: function () { return evidence_policy_1.describeMutation; } });
Object.defineProperty(exports, "describeObservation", { enumerable: true, get: function () { return evidence_policy_1.describeObservation; } });
Object.defineProperty(exports, "isEvidenceObservation", { enumerable: true, get: function () { return evidence_policy_1.isEvidenceObservation; } });
Object.defineProperty(exports, "isLowSignalObservation", { enumerable: true, get: function () { return evidence_policy_1.isLowSignalObservation; } });
var tool_normalize_1 = require("./tool-normalize");
Object.defineProperty(exports, "getCanonicalToolName", { enumerable: true, get: function () { return tool_normalize_1.getCanonicalToolName; } });
Object.defineProperty(exports, "getToolCategory", { enumerable: true, get: function () { return tool_normalize_1.getToolCategory; } });
Object.defineProperty(exports, "normalizeToolName", { enumerable: true, get: function () { return tool_normalize_1.normalizeToolName; } });
function summarizeLargeOutput(text, threshold = constants_1.SUMMARY_THRESHOLD_CHARS) {
    if (text.length <= threshold)
        return text;
    const scale = Math.min(1, threshold / constants_1.SUMMARY_THRESHOLD_CHARS);
    const headKeep = Math.max(200, Math.floor(constants_1.SUMMARY_KEEP_HEAD * scale));
    const tailKeep = Math.max(150, Math.floor(constants_1.SUMMARY_KEEP_TAIL * scale));
    const head = text.slice(0, headKeep);
    const tail = text.slice(-tailKeep);
    const omitted = text.length - headKeep - tailKeep;
    return `${head}\n\n[... ${omitted} chars omitted by proofrail ...]\n\n${tail}`;
}
function resolvePluginConfig(api, event) {
    const base = (api.pluginConfig && typeof api.pluginConfig === "object")
        ? api.pluginConfig
        : undefined;
    const fromEvent = (event?.context?.pluginConfig && typeof event.context.pluginConfig === "object")
        ? event.context.pluginConfig
        : undefined;
    return {
        ...base,
        ...fromEvent,
    };
}
function getDangerousCommandAction(api, event) {
    const configured = resolvePluginConfig(api, event).dangerousCommandAction;
    if (configured === "approve" || configured === "block" || configured === "warn" || configured === "allow") {
        return configured;
    }
    return constants_1.DEFAULT_DANGEROUS_COMMAND_ACTION;
}
function getEnforcementMode(api, event) {
    const configured = resolvePluginConfig(api, event).enforcementMode;
    if (configured === "advisory" || configured === "strict" || configured === "guarded" || configured === "off")
        return configured;
    return constants_1.DEFAULT_ENFORCEMENT_MODE;
}
function getAdvisoryInjection(api, event) {
    const configured = resolvePluginConfig(api, event).advisoryInjection;
    if (configured === "compact" || configured === "full" || configured === "off")
        return configured;
    return constants_1.DEFAULT_ADVISORY_INJECTION;
}
function getValidationPolicy(api, event) {
    const configured = resolvePluginConfig(api, event).validationPolicy;
    if (configured === "batch" || configured === "after_each_mutation" || configured === "off")
        return configured;
    if (configured === "immediate")
        return "after_each_mutation";
    return constants_1.DEFAULT_VALIDATION_POLICY;
}
function getMutationBatchMax(api, event) {
    const configured = resolvePluginConfig(api, event).mutationBatchMax;
    if (typeof configured !== "number" || !Number.isFinite(configured))
        return constants_1.DEFAULT_MUTATION_BATCH_MAX;
    return Math.max(1, Math.min(20, Math.floor(configured)));
}
function getSummaryThreshold(api, event) {
    const configured = resolvePluginConfig(api, event).summaryThresholdChars;
    if (typeof configured !== "number" || !Number.isFinite(configured))
        return constants_1.SUMMARY_THRESHOLD_CHARS;
    return Math.max(constants_1.MIN_SUMMARY_THRESHOLD_CHARS, Math.min(constants_1.MAX_SUMMARY_THRESHOLD_CHARS, Math.floor(configured)));
}
function getLowSignalBlockThreshold(api, event) {
    const configured = resolvePluginConfig(api, event).lowSignalBlockThreshold;
    if (typeof configured !== "number" || !Number.isFinite(configured))
        return constants_1.LOW_SIGNAL_BLOCK_THRESHOLD;
    return Math.max(constants_1.MIN_LOW_SIGNAL_BLOCK_THRESHOLD, Math.min(constants_1.MAX_LOW_SIGNAL_BLOCK_THRESHOLD, Math.floor(configured)));
}
