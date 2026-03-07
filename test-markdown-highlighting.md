# Test: Markdown Code Block Highlighting

This file reproduces a light-mode rendering bug where highlight.js markdown grammar
causes text in code blocks to appear "washed out." Open this file with
`/plannotator-annotate test-markdown-highlighting.md` and switch to light mode to verify.

## Repro: code block with underscores, bold markers, and backtick code

```markdown
# ADR-007: Data-Presence Gate Classification Doctrine

**Status:** Accepted
**Date:** 2026-03-06
**Milestone:** M27

## Context

The CIO's field classification framework (Rule Set 1) classifies all SyntheticOI-derived
enum fields as SUBJ. This is appropriate for rules that interpret the field's semantic
content (e.g., "terrain_regime must not be VOID_FAST_TRANSIT").

However, a subset of rules check only whether the field has a readable value — they gate
on `neq "UNKNOWN"` without caring what the actual value is. These are data-presence checks,
functionally equivalent to the existing QUANT data quality gates (totaloi_data_quality_good,
iv_velocity_data_quality_good).

The upstream computation (gamma_gate.py) returns UNKNOWN only when:
- No SyntheticOI data rows exist on that side of spot (empty list → sum = 0.0)
- Gamma bars exist but net to zero and none exceeds the 60% threshold

Both conditions are deterministic, threshold-based, and reproducible. No model uncertainty
or practitioner judgment is involved in the UNKNOWN classification.

## Decision: Data-Presence Checks Are QUANT Regardless of Data Source

### Question
Should `neq "UNKNOWN"` gates on SyntheticOI fields be classified as SUBJ (per Rule Set 1)
or QUANT (matching the data_quality gate pattern)?

### Resolution
**QUANT.** A rule that checks only whether a value exists — without interpreting what the
value means — is a data-presence gate. Data-presence gates are QUANT regardless of the
field's data source.

This overrides Rule Set 1 for the specific case of `op: neq, value: "UNKNOWN"` on
SyntheticOI fields. It does NOT reclassify rules that check specific field values
(e.g., `not_in ["NEAR", "UNKNOWN"]`, `in_set ["MED", "HIGH"]`) — those remain SUBJ
because the primary gate logic interprets the field's semantic content.

### Scope
- `directional_gamma_profile.upside_gamma` — `neq "UNKNOWN"` gates
- `directional_gamma_profile.downside_gamma` — `neq "UNKNOWN"` gates
- `gamma_void_proximity` — `neq "UNKNOWN"` gates

Does NOT affect:
- `not_in ["NEAR", "UNKNOWN"]` rules (primary purpose is semantic NEAR check)
- `not_in ["HIGH", "UNKNOWN"]` rules (primary purpose is semantic HIGH check)
- Any preference rules (gate_type: P)

## Consequences

1. 8 vetoes move from Phase 2 (PM review) to Phase 1 (auto-veto). If a ticker has
   UNKNOWN gamma data, these modes are now automatically killed instead of flagged
   for PM review. This is appropriate — "is the data present?" is not a judgment call.
2. `data_source: SyntheticOI` is removed from these rules (QUANT rules don't carry
   data_source metadata).
3. Phase 2 SUBJ pending lists for affected modes will have one fewer item.
4. Future `neq "UNKNOWN"` gates on any field should be classified as QUANT.
```
