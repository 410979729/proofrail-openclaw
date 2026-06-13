# Changelog

## v0.0.6

- Add compiled `dist/` runtime output and point OpenClaw package metadata at
  `./dist/index.js` so ClawHub can publish and verify the plugin bundle.
- Includes the v0.0.5 issue #1 fixes for compaction-state restore,
  read-only validation command recognition, unknown-target mutation advisories,
  ignored-advisory audit rows, and strict batch validation semantics.

## v0.0.5

- Persist and restore pending-verification state across compaction snapshots, including
  the last mutation label, touched targets, validation suggestions, and advisory state.
- Treat read-only validation commands such as `pip show`, `npm ls`, `python -m
  json.tool`, `python -m py_compile`, `Test-Path`, and `Get-Command` as valid
  post-mutation checks.
- Add an advisory for mutating exec commands whose concrete target cannot be
  identified, and audit when agents continue after an advisory.
- Keep strict batch validation usable by allowing mutations below
  `mutationBatchMax`, while `after_each_mutation` strict mode still blocks
  immediately until validation runs.

## v0.0.4

- Port Hermes v0.0.4-v0.0.8 advisory-first behavior to OpenClaw:
  default workflow risks now record advisories and continue instead of hard-blocking.
- Add `enforcementMode`, `advisoryInjection`, `validationPolicy`, and
  `mutationBatchMax` config controls; `strict` preserves the previous hard-block
  behavior.
- Add compact advisory prompt injection and expose advisory state through
  runtime diagnostics.
- Harden validation target extraction so shell assignments, `/dev/null`
  redirections, Windows command switches, and `python -c` inline code do not
  become phantom pending-verification targets.

## v0.0.3

- Add gray-area classifier (RuleBasedGrayAreaClassifier) — blocks writes when
  evidence is still broad (web search / search_files results rather than direct
  file inspection)
- Extend DangerousCommandAction with \`warn\` and \`allow\` autonomous modes
  (Hermes parity)
- Add classifier state tracking and session context injection
- Extend config schema: \`llmClassifierEnabled\`, \`llmClassifierProvider\`,
  \`llmClassifierModel\`
- Align default dangerous-command policy to \`warn\` (matches Hermes v0.0.3)

## v0.0.2

- broaden read-result success detection so plain-text and text-bearing object outputs count as successful observations
- clear pending verification when the agent reads back the same touched target after a mutation
- reinforce blocked-turn anti-bypass guidance and same-target evidence gating
- expand `tests/runtime-smoke.cjs` to cover readback validation and blocked-turn regression paths
- refresh README/package metadata for the public `proofrail-openclaw` release
