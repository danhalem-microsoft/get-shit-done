---
critique_type: strategy
phase: "gsd-slim-and-integrate Phase 2 (critic-refactor-with-commit-0-spike)"
reviewed_at: "2026-05-04"
status: warn
critics: [strategy-critic]

severity_counts:
  critical: 0
  warning: 4
  info: 4
  total: 8

reviewed_artifacts:
  - .planning/users/dan-halem/gsd-slim-and-integrate/ROADMAP.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/REQUIREMENTS.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/STATE.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-CONTEXT.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-RESEARCH.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-VALIDATION.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-01-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-02-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-03-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-06-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-08-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-10-PLAN.md
  - .planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-13-PLAN.md
---

## Executive Summary

No critical findings. Four warnings require attention before execution begins. The most consequential is the **architectural single-point-of-failure**: the @-reference spike is a blocking human gate with no milestone-level contingency plan — if the spike fails and install-time inlining is required, 1-2 days of unplanned work has no allocated plan slot, no ROADMAP amendment, and Phase 3 dependency is in jeopardy. The second most consequential is **Phase 1's 44% plan overrun (9 estimated → 13 actual)**, which establishes a milestone-level precedent that gap-closure work regularly exceeds ROADMAP estimates and Phase 2's own 8-plan estimate may be similarly optimistic. Two additional warnings cover **critic-refactor recursion risk** (the critics being rebuilt cannot review their own rebuild) and **stale-assumption risk** in the parity delta function's heuristic category-backfill.

## Findings

### [WARNING] strategy-W-001 — Spike failure has no allocated plan slot or ROADMAP contingency

**Files:** `ROADMAP.md` lines 51-73 (Phase 2 definition); `02-02-PLAN.md` Task 2 (the blocking checkpoint)

ROADMAP Phase 2 describes a single path: "Verify `@`-reference resolution in agent context (commit-0 spike) before extracting the shared base + 6 lens addendums." The ROADMAP has no Phase 2.5, no rollback phase, and no plan-count contingency for the fallback path. The fallback (install-time inlining via `bin/install.js`) is documented in RESEARCH §Alternatives Considered as "adds 1-2 days of work and changes the file shape Plans 04/05 produce" — but there is no allocated plan slot for that work.

If the spike fails, Plans 03-08 are all partially or fully invalidated (they assume the `@`-reference architecture). The executor would need to retrofit install-time inlining into 6 plans mid-phase while ROADMAP, REQUIREMENTS, and exit gate (XCUT-01 tag) remain unchanged.

The strong prior evidence (16+ existing `@`-refs in production, documented Claude Code behavior) makes spike failure genuinely unlikely — but "unlikely" and "no contingency plan" are separate concerns. The ROADMAP's decimal-phase mechanism exists precisely for this use case but is not pre-authorized for a spike-failure scenario.

**Fix:** Add a single sentence to ROADMAP.md Phase 2: "If the spike fails, a Phase 2.1 (INSERTED) plan covers install-time inlining via `bin/install.js` before Plans 04-07 proceed; this adds an estimated 1 plan and 1-2 days." Pre-authorizes the decimal-phase insertion mechanism without modifying any plans.

---

### [WARNING] strategy-W-002 — Phase 1 ran 44% over its ROADMAP plan estimate; pattern not reflected in Phase 2 risk model

**Files:** `ROADMAP.md` line 36 ("Plans: 9 plans across 2 waves") vs actual Phase 1 directory (13 plans: 01-01 through 01-13)

ROADMAP Phase 1 estimated 9 plans. Phase 1 executed 13 plans: original 9 plus 4 gap-closure plans (01-10..01-13, all `gap_closure: true`) addressing CR-01 (help.md orphan drift), CR-02, CR-03 (dispatcher dead routes), and one additional blocker discovered during verification.

Phase 1 was a primarily structural cull with well-defined deletion lists. Phase 2 is more architecturally complex: new file (`agents/_shared/critic-base.md`), new CLI subcommand, new orchestrator workflow, multi-step live spike with human gate, and N=5 LLM parity test. If Phase 1 at 44% overrun was driven by verification-discovered gaps in structural work, Phase 2 is at equal or higher risk — yet its 8-plan estimate treats verification-discovered gap-closure as zero-probability.

**Fix:** Update ROADMAP.md Phase 2 "Plans: 8 plans across 2 waves" to "Plans: 8 plans across 5 waves; estimated 1-2 gap-closure plans may follow verification."

---

### [WARNING] strategy-W-003 — The critics being refactored cannot review their own refactor

**Files:** `ROADMAP.md` lines 51-73 (Phase 2 goal); `ROADMAP.md` lines 75-84 (Phase 3 depends on `gsd-slim-phase-2-critic` git tag)

Phase 2's plans are reviewed by the CURRENT (pre-refactor) critics, but Phase 3's plans will be reviewed by the POST-refactor critics. If Phase 2 ships a critic whose lens content was over-trimmed (passing the CRIT-10 ≥85% parity threshold on Phase 1 fixtures but degraded on novel Phase 3 content), Phase 3 plans receive systematically weaker critic scrutiny.

The 85% parity threshold was calibrated against Phase 1 fixtures. Phase 3's plan content (synthesizer merge, parallel orchestration, token-headroom gates) is structurally different from Phase 1 fixtures, and the parity threshold was not validated against out-of-distribution plan shapes.

**Fix:** Add to ROADMAP.md Phase 3 "Depends on" section: "Phase 3 plans should be reviewed by the Phase 2 critics AND optionally cross-checked against a pre-refactor critic run on at least one Phase 3 plan." Optional one-time pre-vs-post critic comparison costs ~$0.60.

---

### [WARNING] strategy-W-004 — Heuristic category-backfill is LOW-confidence and could mis-calibrate CRIT-10 in both directions

**Files:** `REQUIREMENTS.md` line 50 (CRIT-10: "≥85% finding overlap by severity-bucketed key"); `02-03-PLAN.md` (`computeCriticFindingsDeltas` stub fill)

The `category` field was not captured in Phase 1 baselines. Phase 2 backfills via `extractCategoryFromTitle` heuristic ("first 2 words of title, kebab-cased" — RESEARCH §Code-Examples Example 4, line 679). RESEARCH §Pitfall-4 acknowledges LOW confidence.

Two systematic failure modes:
1. **False fail:** Phase 1 baseline titles use different phrasing than Phase 2's trimmed-critic titles for the same conceptual finding → buckets differ → overlap drops below 85% even though findings are substantively identical.
2. **False pass:** Two different findings share the same first-two-words → same bucket key → counted as a single match even though they're different findings.

Asymmetric consequence: false-fail stalls phase exit (high friction, fixable). False-pass ships critics with silently degraded coverage, undermining Phase 3-6 critic quality.

**Fix:** During Plan 02-04 (pilot trim), run a single pre-trim vs post-trim parity comparison on the one critic being trimmed. Inspect `missingCritical` and `extraFindings` by hand. If the heuristic produces obviously wrong categories (`requirement-coverage` vs `requirement-gap` treated as different when same finding), backfill Phase 1 baseline category fields manually in the JSON files (~20 min one-time fix). Cost: ~$0.60 and prevents 5 wasted parity runs at $9 each.

---

### [INFO] strategy-I-001 — Phase 1 → Phase 2 handoff: clean inheritance

Phase 2 plans correctly inherit all Phase 1 deliverables without rebuilding: `runAgentParity`, `recordWalltime`, `runClaudeWithTools`, the dispatcher 4-space-indent case shape, the `phase-N-name` Bazel tag pattern, and 6 critic baselines. Plan 03 fills the `computeCriticFindingsDeltas` stub at line 192 — correct (stub deferred per Phase 1 CONTEXT.md line 135).

### [INFO] strategy-I-002 — XCUT cross-cutting ownership clean

Phase 2 plans correctly consume XCUT-01/02/05 patterns without re-implementing. XCUT-03 (walltime ledger) correctly owned by Phase 2; all live tests append `phase: 'phase-2-critic'` ledger entries.

### [INFO] strategy-I-003 — Stale line-number citations pose execute-time risk

Plans cite specific line numbers from research time (`agent-parity.cjs:192`, `bin/install.js:5313`, `gsd-tools.cjs:545`). Phase 1 ran 4 gap-closure plans (01-10..01-13) modifying `gsd-tools.cjs` (~4 case blocks deleted), `cull-no-orphan-references.test.cjs`, `integration/BUILD.bazel`. Line numbers likely shifted.

**Fix:** Add a `read_first` step to Plan 03 to run `grep -n "computeCriticFindingsDeltas" integration/helpers/agent-parity.cjs` and `grep -n "case 'state'" get-shit-done/bin/gsd-tools.cjs` at execute-time. 30-second re-anchor.

### [INFO] strategy-I-004 — Wave decomposition expanded from ROADMAP's "2 waves" to 5 waves

ROADMAP Phase 2 describes 2 waves. VALIDATION.md and plan frontmatter show 5 waves (Wave 0 + Waves 1-4 + exit). Cosmetic — same 8-plan count, same deliverables, same requirements coverage. Just decomposition-level labeling difference.

**Fix:** Update ROADMAP.md Phase 2 wave description to match the 5-wave reality.

---

## Verdict: CONDITIONAL ACCEPT

**Top 3 must-address before execution begins:**

1. **strategy-W-001 (spike fallback):** Add one sentence to ROADMAP pre-authorizing Phase 2.1 as the install-time-inlining fallback if the spike fails. 5 minutes.
2. **strategy-W-004 (heuristic category-backfill):** Run a single pre-trim vs post-trim parity comparison during Plan 02-04 pilot. ~$0.60, ~20 min. Catches systematic false-pass/false-fail before 5 wasted $9 parity runs.
3. **strategy-W-002 (gap-closure planning horizon):** Update ROADMAP estimate to acknowledge 1-2 probable gap-closure plans based on Phase 1 pattern. Calibrates milestone velocity tracking.
