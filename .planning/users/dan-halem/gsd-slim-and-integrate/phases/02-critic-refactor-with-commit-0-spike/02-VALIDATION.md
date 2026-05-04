---
phase: 2
slug: critic-refactor-with-commit-0-spike
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-04
approved: 2026-05-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Test pyramid and rationale derived from `02-RESEARCH.md` Validation Architecture section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node `node:test` runner (`.test.cjs`) + Bazel for tagged test scoping |
| **Config file** | `tests/BUILD.bazel`, `integration/BUILD.bazel`, root `MODULE.bazel` |
| **Quick run command** | `node --test tests/critic-line-budget.test.cjs tests/critic-no-base-shadowing.test.cjs tests/critic-spike-passes.test.cjs` |
| **Full suite command** | `bazel test //tests/... //integration/... --test_tag_filters=phase-2-critic` |
| **Estimated runtime** | ~3s static; ~6–10min live (N=5 parity dominates) |

---

## Sampling Rate

The plan executes in 5 waves (Wave 0 + Waves 1–4). Per-wave sampling:

- **After every task commit (all waves):** Run static tests only — `node --test tests/critic-line-budget.test.cjs tests/critic-no-base-shadowing.test.cjs tests/critique-workflow-structure.test.cjs tests/critic-aggregate-shape.test.cjs tests/install-shared-dir.test.cjs tests/walltime-ledger-shape.test.cjs` (whichever exist at that point). Latency ≤3s.
- **After Wave 0 merge (Plan 02-01):** Static-only — Wave 0 produces RED test scaffolding; tests are expected to fail until later waves provide implementations. No live calls.
- **After Wave 1 merge (Plans 02-02 / 02-03 / 02-04):** Static suite + live spike (Plan 02-02 already ran the spike inline; no re-run needed). The spike is the only live call in Wave 1 — gates everything downstream. ~$0.30, ~30s.
- **After Wave 2 merge (Plans 02-05 / 02-06):** Full static suite (now includes the bulk-trim line-budget enforcement and the new `critique-workflow-structure` + `critic-aggregate-shape` tests). No live calls — bulk trims and orchestrator wiring are validated structurally. ~3s.
- **After Wave 3 merge (Plan 02-07):** First full live tier — `bazel test //integration:critic-batch-walltime //integration:critic-fault-injection //integration:critic-parity --test_tag_filters=phase-2-critic`. Walltime + fault-injection are cheap (~$2 total, ~3min). Parity N=5 is expensive (~$9, ~22min); planner may choose to defer parity to Wave 4 phase-exit if local cost is a concern.
- **After Wave 4 (Plan 02-08, phase-exit gate):** Full Bazel suite green — both static and live with `phase-2-critic` tag filter. walltime-ledger.jsonl must contain ≥1 `phase-2-critic` entry per live test that ran. This is the gate for the `gsd-slim-phase-2-critic` git tag.
- **Max feedback latency:** ~3s on commit (static tier); ~30s after Wave 1 (spike); ~22–30min after Wave 3 (parity dominates).

**Sampling rationale (Nyquist):** Three distinct failure modes drive the tiering — (1) format/structural regressions caught by static tests run every commit; (2) orchestration regressions caught by walltime + fault-injection tests run per-wave-merge from Wave 3; (3) behavior regressions caught by parity test (N=5 median for LLM nondeterminism) run at phase-exit. Per-commit live tests would cost ~$9 every push and add 22min latency — cost-prohibitive and unnecessary because critic prompts only change in coordinated edits across plans, not within a single task commit.

---

## Per-Task Verification Map

Final plan numbering set by gsd-planner — 8 plans across waves 0–4.

| Plan | Wave | Reqs covered | Test Type | Automated Command | File Exists |
|------|------|--------------|-----------|-------------------|-------------|
| 02-01 | 0 | CRIT-01 (spike test scaffold), CRIT-04 (line-budget), CRIT-05 (no-base-shadowing) | unit (RED at Wave 0; flips GREEN as Waves 1–2 land) | `node --test tests/critic-spike-passes.test.cjs tests/critic-line-budget.test.cjs tests/critic-no-base-shadowing.test.cjs` | ❌ W0 |
| 02-02 | 1 | CRIT-01 (live spike), CRIT-02 (`agents/_shared/critic-base.md`) | live spike + structural | live spike (~$0.30) + `wc -l agents/_shared/critic-base.md && grep -c '^## ' agents/_shared/critic-base.md` | ❌ W1 |
| 02-03 | 1 | CRIT-10 (parity stub fill at `agent-parity.cjs:192` + install-shape test) | unit (static) | `node --test tests/install-shared-dir.test.cjs` + parity stub regression check | ❌ W1 |
| 02-04 | 1 | CRIT-03, CRIT-05 (pilot trim of `gsd-critic-strategy.md` 256→≤100) | structural | `node --test tests/critic-line-budget.test.cjs tests/critic-no-base-shadowing.test.cjs` | ❌ W1 |
| 02-05 | 2 | CRIT-03, CRIT-04, CRIT-05 (bulk trim 5 critics) | structural | line-budget + no-shadowing tests now expect total ≤700 across all 6 trimmed | ❌ W2 |
| 02-06 | 2 | CRIT-06, CRIT-07 (`workflows/critique.md` body + `gsd-tools.cjs critic-aggregate` + structural tests) | unit (static) | `node --test tests/critique-workflow-structure.test.cjs tests/critic-aggregate-shape.test.cjs` | ❌ W2 |
| 02-07 | 3 | CRIT-08 (walltime), CRIT-09 (fault-injection), CRIT-10 (parity N=5), XCUT-03 (ledger schema) | live (expensive) + unit | `bazel test //integration:critic-batch-walltime //integration:critic-fault-injection //integration:critic-parity --test_tag_filters=phase-2-critic` + `node --test tests/walltime-ledger-shape.test.cjs` | ❌ W3 |
| 02-08 | 4 | XCUT-03 (full ledger verification via end-of-phase suite) | full suite | `bazel test //tests/... //integration/... --test_tag_filters=phase-2-critic` (gates `gsd-slim-phase-2-critic` tag) | ❌ W4 |

**Cross-cutting threats:**
- T-02-A (input trust — aggregator trusts Task summary): mitigated in Plan 02-06 (disk-based aggregation via `gsd-tools.cjs critic-aggregate`)
- T-02-B (skip-and-continue mask): mitigated in Plan 02-07 (info-severity finding logged for every missing critic)
- T-02-C (`@`-ref traversal misconfiguration): mitigated by Wave-0 spike (Plan 02-01/02-02) + line-budget test asserting line 1 of every addendum starts with the exact `@` ref

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 = Plan 02-01. Wave 1 = Plans 02-02, 02-03, 02-04.

- [ ] `tests/critic-spike-passes.test.cjs` — spike test scaffold (Wave 0, Plan 02-01); verifies spawn-time `@`-resolution by canary string injection
- [ ] `tests/critic-line-budget.test.cjs` — RED at Wave 0; flips GREEN once Plan 02-05 bulk-trim lands (Wave 0, Plan 02-01)
- [ ] `tests/critic-no-base-shadowing.test.cjs` — RED at Wave 0; flips GREEN as critics get trimmed (Wave 0, Plan 02-01)
- [ ] Bazel `phase-2-critic` tag wired into `tests/BUILD.bazel` for the 3 Wave 0 tests (Wave 0, Plan 02-01)
- [ ] `agents/_shared/critic-base.md` — author the shared base prompt ≤250 lines (Wave 1, Plan 02-02 Task 1)
- [ ] Live spike GO/NO-GO checkpoint with `result.raw` capture to `integration/test-fixtures/spawn-timestamp-shape.txt` (Wave 1, Plan 02-02 Task 2)
- [ ] Fill `computeCriticFindingsDeltas` stub at `integration/helpers/agent-parity.cjs:192` (Wave 1, Plan 02-03 Task 1)
- [ ] `tests/install-shared-dir.test.cjs` — Claude-runtime install-shape gate for `agents/_shared/critic-base.md` (Wave 1, Plan 02-03 Task 2)
- [ ] Pilot trim `gsd-critic-strategy.md` (256→≤100 lines) to validate the addendum shape before bulk trim (Wave 1, Plan 02-04)

*Wave 0 + Wave 1 collectively unblock Wave 2 (bulk trim + workflow body) and Wave 3 (live tests). Spike GO/NO-GO is the load-bearing gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Skip-and-continue surface (info-severity log) is human-readable | CRIT-09 | Aggregator UX is observational | After fault injection, view `CRITIQUE.md` aggregate and confirm missing critic is listed as info-severity finding with clear reason |
| Spike fallback decision (if `@`-refs fail) | CRIT-01 | Decision branch | If spike fails: developer chooses fallback path (install-time inlining via `bin/install.js` extension); test re-runs after install |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verified by plan-checker against all 8 PLAN.md files)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (verified by plan-checker)
- [x] Wave 0 covers all MISSING references (spike test scaffold, line-budget, no-base-shadowing — Plan 02-01)
- [x] No watch-mode flags (no `--watch` invocations in any plan; verified by inspection of plan `<verify>` blocks)
- [x] Feedback latency: ~3s static tier (per-commit), ~30s after Wave 1 (spike), ~22–30min after Wave 3 (parity)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-04 (plan-time sign-off; `wave_0_complete` flips after Plan 02-01 lands)
