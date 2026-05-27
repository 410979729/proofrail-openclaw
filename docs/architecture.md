# Architecture

## Scope

This plugin is a runtime guardrail layer for OpenClaw. It is not a model preset, not a provider shim, and not a UI wrapper.

The current engineering strategy is:

1. ship a clean OpenClaw plugin first
2. validate behavior on real workloads
3. extract shared core only after the stable seams are obvious
4. add other host integrations only after the core is stable

## Layers

### Entry Layer

`index.ts` must stay thin.

Responsibilities:

- register the plugin entry
- delegate all behavior wiring to `registerProofrailHooks`

Non-responsibilities:

- no policy logic
- no state transitions
- no file persistence details

### Host Integration Layer

`lib/register-hooks.ts` is the only module that should know about OpenClaw hook names and event shapes.

Responsibilities:

- normalize hook event input by merging `params` and `input`
- normalize raw tool identifiers into one canonical tool name before policy decisions
- resolve session identity from `ctx` first, then raw hook event fallback fields
- call pure helper modules for policy decisions
- maintain per-session lifecycle
- translate decisions into OpenClaw return shapes

This file is allowed to touch `api.on(...)`, `api.pluginConfig`, selected host-global `api.config` fields, runtime state helpers, and plugin/runtime path resolution helpers.

### Pure Core Layer

These modules should remain host-agnostic as long as possible:

- `lib/constants.ts`
- `lib/text.ts`
- `lib/path.ts`
- `lib/tooling.ts`
- `lib/tool-normalize.ts`
- `lib/command-risk.ts`
- `lib/evidence-policy.ts`
- `lib/result-status.ts`
- `lib/session-state.ts`
- `lib/compaction.ts`

Rules for this layer:

- no direct hook registration
- no hidden global state
- no dependency on OpenClaw event names
- persist runtime artifacts under state-owned ignored per-session paths
- prefer pure functions over imperative branching

### Contract Layer

`lib/types.ts` and `schemas/` define the local and forward-looking contracts.

Current purpose:

- keep hook-facing code typed and reviewable
- reserve stable shapes for upcoming workflow primitives

Planned future contracts:

- `SessionState`
- `TaskRecord`
- `PolicyDecision`
- `AskUserQuestion`

Current code home for those future workflow contracts:

- `lib/workflow/contracts.ts`

## Extension Seams

The next features must enter through explicit seams, not by growing `register-hooks.ts` into a second monolith.

### Planned seam: workflow tools

Expected future modules:

- `lib/workflow/tasks.ts`
- `lib/workflow/plan.ts`
- `lib/workflow/ask-user.ts`

These modules should own:

- durable records
- transitions
- tool input/output validation

They should not own:

- OpenClaw hook names
- raw event normalization

### Planned seam: policy profiles

Expected future modules:

- `lib/policy/default.ts`
- `lib/policy/categories.ts`

Goal:

- keep policy tables explicit
- avoid burying behavior in free-form strings

Future refinement:

- separate transport-level tool category from policy-level effect classification
- keep verification gates tied to concrete mutation effects, not broad host tool buckets
- prefer segment-aware command risk checks over whole-string allowlists for shell execs
- keep command-risk classification in `lib/command-risk.ts`, not in hook wiring

### Planned seam: evals

Expected coverage:

- mutation without evidence is blocked
- mutation before verification is blocked
- failed validation does not clear review state
- silent successful validation clears review state
- repeated low-signal probes are blocked
- dangerous command policy outranks generic evidence gates
- shell-chained dangerous commands still trigger policy
- HTTP status validation results do not get confused with process exit codes
- compaction anchors survive per session
- future task/plan/ask-user flows resume correctly

Current review stubs live in:

- `evals/safety.json`
- `evals/workflow.json`
- `evals/recovery.json`

## Review Rules

When reviewing changes to this plugin, reject patches that:

- re-expand `index.ts`
- mix host wiring and pure policy logic in the same helper
- write runtime artifacts into tracked source paths or plugin install roots when a state directory is available
- let dangerous-command policy be bypassed by generic evidence gates
- add new workflow features without a documented contract
- add policy branches without naming the underlying invariant