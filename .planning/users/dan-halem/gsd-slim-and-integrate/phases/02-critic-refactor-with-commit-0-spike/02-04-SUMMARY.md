---
phase: 02-critic-refactor-with-commit-0-spike
plan: 04
subsystem: agents/critics
tags: [pilot-trim, lens-addendum, CRIT-03, CRIT-05]

requires:
  - agents/_shared/critic-base.md (Plan 02-02 — CRIT-02 base prompt)
  - tests/critic-line-budget.test.cjs (Plan 02-01 — CRIT-03 cap, CRIT-04 reachability)
  - tests/critic-no-base-shadowing.test.cjs (Plan 02-01 — CRIT-05 tag scan + H9 Jaccard)
provides:
  - agents/gsd-critic-strategy.md (54-line lens-addendum reference shape)
  - "<strategy_specific_checklist>" tag name (consumed by Plan 02-06 workflows/critique.md)
  - keep/drop categorization template for Plan 02-05 bulk trim
affects:
  - Plan 02-05 (bulk trim 5 remaining critics — same shape, same checklist categorization)
  - Plan 02-06 (workflows/critique.md authors Task prompts referencing the tag name finalized here)
  - Plan 02-07 (CRIT-10 parity test will validate behavioral preservation)

tech-stack:
  added: []
  patterns:
    - "first non-frontmatter line = @-import to agents/_shared/critic-base.md"
    - "addendum body = exactly <lens> + <{lens}_specific_checklist> + <{lens}_calibration_examples>"
    - "calibration examples in lens-specific prose (avoids H9 Jaccard ≥0.80 vs base)"

key-files:
  created: []
  modified:
    - agents/gsd-critic-strategy.md (256 → 54 lines, -202)

decisions:
  - "Line target landed at 54 (below the 60–90 target band). The strategy lens has fewer truly milestone-unique items than the larger lenses (plan/code/scope), so a lower count is honest, not under-trimmed. Plan 05 should expect 60–90 for the bigger lenses but accept 50–60 if the lens is naturally narrow."
  - "Skipped optional S4 pilot parity (Step E). Rationale: parity infra (`integration/test-fixtures/baselines/_capture.cjs`) is owned by Plan 07; running it standalone in this worktree would require setting up Phase 1 baselines and an API key path that Plan 07 owns. Behavioral preservation will be validated under Plan 07's N=5 parity gate (CRIT-10). If Plan 07 surfaces a strategy-critic regression, restore the dropped checklist item then."

metrics:
  duration: ~12 minutes
  completed: 2026-05-04T00:00:00Z
  tasks_completed: 1
  files_changed: 1
  lines_removed: 202
  lines_added: 31
---

# Phase 02 Plan 04: Pilot trim of gsd-critic-strategy to lens-addendum shape — Summary

Validated the post-trim lens-addendum shape on a single critic (gsd-critic-strategy.md, 256 → 54 lines) before Plan 05 applies the same shape across the remaining 5 critics. Both Wave-0 static guards (`tests/critic-line-budget.test.cjs` and `tests/critic-no-base-shadowing.test.cjs`) report ZERO violations for `gsd-critic-strategy.md` specifically; the other 5 critics still violate as expected.

## Final Line Count

| File | Before | After | Δ |
|------|--------|-------|---|
| `agents/gsd-critic-strategy.md` | 256 | 54 | −202 |

54 lines is below the 60–90 target band specified in 02-RESEARCH.md §Code-Example-1. Driver: the strategy lens carries fewer milestone-unique items than the larger lenses (plan/code/scope/verify) because most of its prior bulk was duplication of base material (severity rubric, finding format, anti-patterns, success criteria). Plan 05 should treat the band as a soft target — the larger lenses will likely land in 60–90, but a naturally-narrow lens hitting 50–60 is fine.

## Surviving `<strategy_specific_checklist>` items (Plan 05 reference)

These are the items Plan 05's executor should expect to find as the "milestone-unique" surface for each lens — strategy is the smallest sample, but the keep/drop categorization rule is the same.

### Critical-tier (kept — milestone-unique)

1. **Requirement IDs absent from ROADMAP that materially redefine the milestone** (gap-closure exempt with cited finding ID).
2. **Phases whose realized plan count exceeds the ROADMAP estimate by >50%** (cumulative across the milestone, not per-phase).
3. **Anti-goal items actually implemented in any phase** (per-phase ROADMAP "Anti-Goals" cross-checked against PLAN.md tasks and SUMMARY.md accomplishments).

### Warning-tier (kept — milestone-unique)

4. **1–2 plan growth that compounds across the milestone and displaces a later phase.**
5. **Phase emphasis drifted from ROADMAP goal text** (work focus diverged even when plan count held).
6. **Early CONTEXT.md decision contradicted by a later SUMMARY.md learning, never formally revised.**
7. **Tech / pattern flagged problematic in late phases but never propagated upstream.**
8. **"Deferred to v2.1+" items partially implemented in any phase.**
9. **Deferred-item accumulation hollowing out the milestone** (deferred set vs completed requirements).

### Info-tier (kept — milestone-unique)

10. **Early decisions still in force but never re-validated against later phases.**
11. **Deferred items with clear rationale and a tracked target milestone.**

### Dropped (now owned by base)

- `<role>` framing — adversarial-critic stance, primary-vs-cross-flag tone (lives in base `<role>`)
- `<context_loading>` 3-tier loading strategy — replaced by base's `<context_loading>` + lens-specific "Primary input" line in `<lens>`
- `<finding_format>` — finding card schema, REJECT criteria (base `<finding_format>` + `<evidence_requirements>`)
- `<output>` (CRITIQUE generation procedure) — base `<output_contract>` covers it
- `<anti_patterns>` — duplicate-of-scope-critic guidance, "vague commentary", severity miscalibration. The lens-relevant anti-patterns (cumulative-drift recognition, gap-closure exemption) survived as `<lens>` rules instead of a separate section.
- `<success_criteria>` — base owns the universal success contract; the strategy-unique success items reduced to "every finding cites ROADMAP.md", which is implicit in the calibration examples.

### Transformed

- The original "Good example" / "Bad examples" mini-list inside `<role>` was promoted to `<strategy_calibration_examples>` and rewritten in lens-specific phrasing (one drift example, one cumulative-drift example, one BAD example) to avoid H9 Jaccard match against base prose.

## Base-shadowing test outcomes (CRIT-05)

Both sub-tests of `tests/critic-no-base-shadowing.test.cjs` are CLEAN for `gsd-critic-strategy.md`:

| Sub-test | Behavior | Strategy result |
|----------|----------|-----------------|
| 1 — tag-name scan | Reject any addendum XML tag that also appears in critic-base.md, except `<lens>` and `<*_specific_checklist>` / `<*_calibration_examples>`. | Zero violations referencing `gsd-critic-strategy.md`. |
| 2 — H9 Jaccard 5-line window scan | Reject any 5-line non-blank window with ≥0.80 Jaccard token overlap with any base 5-line window. | Zero violations referencing `gsd-critic-strategy.md`. |

The other 5 critics still violate sub-test 2 at L3-L7 of the base (the boilerplate `<role>` opening "You are an adversarial GSD critic. Your job is to find problems BEFORE they're acted on..."). Plan 05's executor should drop that exact `<role>` paragraph from each addendum during the bulk trim — that is precisely the duplication this scan was designed to catch.

### How violations were avoided in this trim

- The pre-trim file had the duplicate window at lines 178–182. Step A (audit) flagged the entire `<role>` block as "now owned by base" → DROP. Removing it eliminated the violation without further work.
- For the new `<lens>` and calibration-example prose, written from scratch using strategy-specific vocabulary (milestone, ROADMAP, cumulative drift, gap-closure exemption) — none of which is base prose. The Jaccard scan saw no near-match.

## Base-prompt adjustments needed: NONE

Important load-bearing finding for Plan 05: the base prompt at `agents/_shared/critic-base.md` (committed in Plan 02-02) supports the strategy lens cleanly without any tweaks. Specifically:

- `<context_loading>` references `<{lens}_specific_checklist>` generically — strategy's narrower 3-tier loading hierarchy is communicated entirely through the `<lens>` "Primary input" line.
- `<severity_rubric>` works for strategy as-written (anti-goal violations → critical, stale assumptions → warning, deferred-tracking observations → info).
- `<finding_format>` `{lens_prefix}` wildcard accepts `strategy-` cleanly; example IDs `plan-c-01` etc. were not strategy-specific but the schema generalizes.
- `<output_contract>` post-write verify check works for `CRITIQUE-strategy.md`.

If Plan 05's executor encounters a base prompt gap on a different lens (most likely on code or verify), they should pause and amend base — but this pilot found nothing to fix.

## Threat Flags

None. The trim only restructured an existing critic prompt; no new network endpoints, auth paths, or trust-boundary surfaces.

## Optional Pilot Parity (S4): Skipped

The plan offers an optional ~$0.60 single-run parity comparison via `integration/test-fixtures/baselines/_capture.cjs` (Step E). I skipped it for two reasons:

1. The capture script and Phase 1 baselines are owned by Plan 02-07 (CRIT-10), and standing them up here would either duplicate Plan 07 setup or rely on infrastructure not yet in place in this worktree.
2. Plan 02-07 will run N=5 medians across all 6 critics with full statistical envelopes — much stronger evidence than a single hand-inspected run.

If Plan 07 surfaces a regression in strategy-lens findings (missing critical or extra noise), the dropped checklist items above should be the first place to look for restoration candidates.

## Self-Check: PASSED

- [x] `agents/gsd-critic-strategy.md` exists at 54 lines (≤100).
- [x] First non-frontmatter line is exactly `@~/.claude/get-shit-done/agents/_shared/critic-base.md`.
- [x] Body contains exactly `<lens>`, `<strategy_specific_checklist>`, `<strategy_calibration_examples>` — no other XML tags.
- [x] No forbidden base-shadowing tags (`<role>`, `<severity_rubric>`, `<finding_format>`, `<cross_flag_rules>`, `<evidence_requirements>`, `<output_contract>`, `<success_criteria>`, `<context_loading>`) — `grep -cE` returns 0.
- [x] CRIT-05 sub-test 1 (tag-name): no `gsd-critic-strategy.md re-defines` line in failure output.
- [x] CRIT-05 sub-test 2 (H9 Jaccard): no `gsd-critic-strategy.md window L.*Jaccard` line in failure output.
- [x] CRIT-03 reachability regex matches strategy file's first non-blank post-frontmatter line (verified by direct `node -e` regex test).
- [x] Trim commit `027b1b32` exists in `git log`.
