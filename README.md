# Proofrail for OpenClaw

Why can the same model feel like a chat bot in one tool, but act like a disciplined engineering agent in another? Usually the difference is not only the model. It is the execution harness around the model: how it gathers evidence, when it is allowed to mutate files or state, how it verifies changes, and how it handles risky commands.

Proofrail for OpenClaw is that harness. People often search for this category as a `codex harness`, `Claude Code harness`, `agent harness`, or `execution harness`. Proofrail wraps tool use with evidence gates, post-change verification, and risk controls so OpenClaw agents work in a more disciplined, reviewable way.

It focuses on the runtime behaviors that matter in practice:

- evidence before mutation
- mutation before verification
- repeated low-signal probe blocking
- dangerous command approval or blocking
- large output summarization
- per-session compaction anchors
- session-scoped task ledger
- post-mutation validation suggestions
- JSONL audit trails for guardrail decisions

## Why Proofrail exists

Prompt quality matters, but workflow control matters just as much. Proofrail is not a prompt pack. It is a control-and-correction plugin that sits around tool use and enforces a tighter engineering loop:

- no evidence, no mutation
- after changes, validate before continuing
- risky actions are blocked or escalated for approval

This is what turns “just answer” behavior into “inspect, act, verify, recover” behavior. The goal is simple: less blind mutation, less state drift, and more verifiable work.

## Release Status

This tree is prepared for the initial public release: `v0.0.1`.

The current scope is intentionally OpenClaw-first:

- make the OpenClaw plugin production-grade first
- keep module boundaries clean enough to extract reusable core later
- keep host-specific integration narrow so future variants can land cleanly

## Naming

The public product name is **Proofrail**.

The OpenClaw variant is published as:

- package name: `proofrail-openclaw`
- release title: **Proofrail for OpenClaw**

The internal OpenClaw plugin id remains `claude-compat` so existing installs and config paths continue to work. In OpenClaw config, use `plugins.entries.claude-compat.config`; in docs and releases, refer to the project as Proofrail.

This naming keeps the Proofrail brand consistent while leaving room for host-specific variants.

## Configuration

Plugin-specific settings are read from `plugins.entries.claude-compat.config`.

Config surface exposed in `openclaw.plugin.json`:

- `dangerousCommandAction`: `approve` or `block`
- `summaryThresholdChars`: summarization threshold for oversized tool output
- `lowSignalBlockThreshold`: repeated low-signal probe threshold

Hook decisions prefer the live per-handler config injected by OpenClaw (`event.context.pluginConfig`) and fall back to `api.pluginConfig` when the hook payload does not carry context.

Host-global state such as `tools.exec.security` still comes from the runtime config snapshot.

## Installation

From a local working tree:

```bash
openclaw plugins install <path-to-proofrail-openclaw>
```

From a packed tarball:

```bash
npm pack
openclaw plugins install npm-pack:./proofrail-openclaw-0.0.1.tgz
```

After install, enable the plugin if needed and restart the serving Gateway before expecting hook behavior to change.

## Runtime Model

Current runtime state intentionally supports only `observe`, `execute`, and `review`.
`plan` and `wait_user` remain reserved contract states for future workflow tools.

## Design Goals

1. Keep deterministic guardrails in runtime hooks, not fragile prompt prose.
2. Keep the plugin modular so future `plan`, `task`, and `ask-user` features do not collapse into one file.
3. Keep host-specific code narrow so shared abstractions can be extracted later.
4. Keep runtime artifacts out of source control.
5. Keep the public release tree clean: typed, packable, and reviewer-friendly.

## Module Layout

- `index.ts`: plugin entry only
- `lib/register-hooks.ts`: host-facing hook wiring and orchestration
- `lib/constants.ts`: policy constants and appended behavior rules
- `lib/types.ts`: local contracts for hook-facing code
- `lib/text.ts`: pure text extraction and normalization helpers
- `lib/path.ts`: file/path hint helpers
- `lib/tooling.ts`: shared runtime configuration and normalization helpers
- `lib/tool-normalize.ts`: canonical tool-name and category normalization
- `lib/command-risk.ts`: shell command risk classification, mutating exec detection, and validation exec detection
- `lib/evidence-policy.ts`: evidence, low-signal, intent, and mutation labeling policies
- `lib/result-status.ts`: normalized tool result success/failure detection
- `lib/session-state.ts`: in-memory session state lifecycle
- `lib/validation.ts`: changed-path derivation and narrow validation suggestions
- `lib/task-ledger.ts`: session task context, close summaries, and final review checklist
- `lib/audit.ts`: best-effort JSONL audit trail
- `lib/compaction.ts`: compaction snapshot persistence
- `lib/workflow/contracts.ts`: forward-looking workflow interfaces for tasks, plans, ask-user, and policy decisions
- `schemas/`: forward-looking contracts for planned workflow primitives
- `evals/`: reviewer-facing evaluation stubs for safety, workflow, and recovery
- `docs/`: maintainer-facing architecture notes

## Runtime Artifacts

The plugin writes runtime artifacts under the OpenClaw state directory:

- compaction snapshots under `state/plugins/claude-compat/sessions/<session-key>/last-compaction-snapshot.json`
- JSONL audit entries under `state/plugins/claude-compat/audit.jsonl`

If the host runtime does not expose `api.runtime.state.resolveStateDir()`, Proofrail falls back to a local `.claude-compat/` directory under the plugin root for best-effort development smoke tests.

These paths are runtime artifacts and must stay out of version control.

## Planned Next Steps

Phase 1, still OpenClaw-only:

- add durable task records
- add plan mode primitives
- add structured ask-user state
- add worktree isolation policy
- add broader eval coverage for safety and recovery paths

Phase 2:

- extract shared runtime core from stable OpenClaw modules
- add additional host integrations on top of the stable core

## Non-Goals

- copying proprietary prompts or closed-system internals
- implying official affiliation with OpenClaw, any model vendor, or any provider
- mixing local instance identity, credentials, or private ops policy into the plugin

## Release Verification

Before publishing a release bundle, run from a clean checkout:

```bash
npm install
npm run typecheck
npm run smoke
npm pack --dry-run
```

## Review Bundle Expectations

A reviewable bundle should include:

- source files and maintainer docs
- a deterministic smoke test for hook behavior
- package metadata for OpenClaw plugin discovery
- no machine-specific absolute paths or private deployment notes
- no dead repository links before the public repo exists
- no mixed-language user-facing runtime text
