"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plugin_entry_1 = require("openclaw/plugin-sdk/plugin-entry");
const register_hooks_1 = require("./lib/register-hooks");
exports.default = (0, plugin_entry_1.definePluginEntry)({
    id: "proofrail",
    name: "Proofrail for OpenClaw",
    description: "Execution harness and runtime guardrails for OpenClaw agents with evidence-first changes and verification gates.",
    register(api) {
        (0, register_hooks_1.registerProofrailHooks)(api);
    },
});
