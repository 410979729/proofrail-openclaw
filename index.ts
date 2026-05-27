import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { registerProofrailHooks } from "./lib/register-hooks";
import type { ProofrailApi } from "./lib/types";

export default definePluginEntry({
  id: "claude-compat",
  name: "Proofrail for OpenClaw",
  description: "Execution harness and runtime guardrails for OpenClaw agents with evidence-first changes and verification gates.",

  register(api: ProofrailApi) {
    registerProofrailHooks(api);
  },
});
