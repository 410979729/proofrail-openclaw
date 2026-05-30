# Changelog

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
