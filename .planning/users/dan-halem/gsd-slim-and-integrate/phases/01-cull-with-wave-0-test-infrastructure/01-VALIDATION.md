---
phase: 1
slug: cull-with-wave-0-test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js native test runner (`node --test`), v22 (per `MODULE.bazel` line 9) |
| **Config file** | None — `scripts/run-tests.cjs` globs `tests/*.test.cjs` directly. Test concurrency `--test-concurrency=4`. |
| **Quick run command** | `node --test tests/<single-test>.test.cjs` (per-task) or `npm test` (full static suite, ~2 min) |
| **Full suite command** | `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull` |
| **Estimated runtime** | npm test ~2 min; bazel phase-1-cull suite ~variable based on live tests (no fixed budget per user instruction) |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (full static suite — per-task scoping not yet supported; floor is 2 min). Wave 0 commits before any cull may run only the new test files (e.g., `node --test tests/cull-no-orphan-references.test.cjs`) for fast iteration.
- **After every plan wave:** Run `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull`. Wave 0 merge MAY defer the live phase-1-cull suite until baselines are captured (live tests depend on baselines).
- **Before `/gsd-verify-work`:** Full suite must be green: `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull && bazel test //integration:gsd-lifecycle`.
- **Max feedback latency:** 120 seconds for static; live tests are not latency-bounded by design.

---

## Per-Task Verification Map

(Filled by planner during PLAN.md authoring. The mapping below is the authoritative req-to-test contract that planner-emitted task-level `<automated>` blocks MUST honor.)

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| TEST-01 | Static scan finds zero orphan references across 6 syntactic contexts in all surviving content | static | `node --test tests/cull-no-orphan-references.test.cjs` | ❌ W0 | ⬜ pending |
| TEST-02 | `runAgentParity` helper exports `runAgentParity(agentName, fixtureInput, schema, opts)` with three schema kinds | static + integration | `node --test tests/agent-parity-helper-shape.test.cjs` (verifies the helper exports) + indirect via integration tests using it | ❌ W0 | ⬜ pending |
| TEST-03 | Baseline corpus exists with `_meta.captured_at`, `_meta.agent`, `_meta.schema_kind` per file | static | `node --test tests/parity-baselines-shape.test.cjs` | ❌ W0 | ⬜ pending |
| TEST-04 | Lifecycle decomposed; composer references step files; shape JSON exists for post-cull (9 steps) | static + live | static: `node --test tests/lifecycle-decomposed.test.cjs`; live: `bazel test //integration:gsd-lifecycle` | ❌ W0 | ⬜ pending |
| TEST-05 | Baseline staleness guard fires on >90-day-old baselines without `staleness_acknowledged` field | static | `node --test tests/parity-baselines-stale.test.cjs` | ❌ W0 | ⬜ pending |
| CULL-01 | 37 surviving commands on filesystem and in `docs/INVENTORY.md` | static | `node --test tests/install-manifest-matches-surviving.test.cjs` (also covered by existing `tests/inventory-counts.test.cjs`) | ❌ W1 | ⬜ pending |
| CULL-02 | 22 surviving agents on filesystem and in `docs/INVENTORY.md` | static | `node --test tests/install-manifest-matches-surviving.test.cjs` (also covered by existing `tests/agents-doc-parity.test.cjs`) | ❌ W1 | ⬜ pending |
| CULL-03 | `/gsd-review` accepts `--code`, `--code-fix`, `--security`, `--coverage`, `--critique`, `--converge` and dispatches | static | `node --test tests/consolidated-review-flags.test.cjs` | ❌ W1 | ⬜ pending |
| CULL-04 | `/gsd-phase` accepts subcommands `add`, `insert`, `remove` and dispatches | static | `node --test tests/consolidated-phase-subcommands.test.cjs` | ❌ W1 | ⬜ pending |
| CULL-05 | 6 deprecation stubs exist with deprecation marker line and dispatch line; no recursive dispatch | static | (combined with `tests/consolidated-review-flags.test.cjs`) | ❌ W1 | ⬜ pending |
| CULL-06 | Full GSD spine completes end-to-end on fixture | live | `bazel test //integration:gsd-lifecycle` | ✅ existing (updated for post-cull spine in W1) | ⬜ pending |
| CULL-07 | Migration table present in both `commands/gsd/help.md` AND `CHANGELOG.md` mapping every deleted/consolidated command to replacement | static | `node --test tests/migration-table-present.test.cjs` | ❌ W1 | ⬜ pending |
| CULL-08 | Filesystem command/agent count matches `docs/INVENTORY.md` (per §2.5 reinterpretation — `install-manifest.json` is a copy-rule manifest, not an inventory) | static | `node --test tests/install-manifest-matches-surviving.test.cjs` (covered by existing `tests/inventory-counts.test.cjs`, `tests/agents-doc-parity.test.cjs`) | ❌ W1 | ⬜ pending |
| XCUT-01 | Git tag `gsd-slim-phase-1-cull` exists post-pass | manual | `git tag -l 'gsd-slim-phase-1-cull'` | n/a (applied after exit-gate) | ⬜ pending |
| XCUT-02 | Phase-tag-filtered Bazel run passes | live | `bazel test //integration/... --test_tag_filters=phase-1-cull` | n/a (existing harness; tag added in `integration/BUILD.bazel`) | ⬜ pending |
| XCUT-05 | PLAN.md(s) for this phase contain a Test Inventory section mapping new test files to REQ-IDs | static (manual review) | manual review of PLAN.md | n/a (planner self-audit) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These files MUST be created before Wave 1 begins. The orphan-reference test, parity helper, baselines, and lifecycle decomposition are the contract every subsequent wave (and every subsequent phase) compares against.

**Static test files:**

- [ ] `tests/cull-no-orphan-references.test.cjs` — covers TEST-01
- [ ] `tests/fixtures/cull-deletion-list.cjs` — data fixture for the orphan-reference test (the static deletion list of 49 commands + 17 agents)
- [ ] `tests/parity-baselines-stale.test.cjs` — covers TEST-05
- [ ] `tests/agent-parity-helper-shape.test.cjs` — verifies `agent-parity.cjs` exports the right API; covers TEST-02 (structural part)
- [ ] `tests/parity-baselines-shape.test.cjs` — verifies every baseline file has the `_meta` block; covers TEST-03 (structural part)
- [ ] `tests/lifecycle-decomposed.test.cjs` — verifies composer references step files in `integration/lifecycle-steps/`; covers TEST-04 (structural part)

**Integration helpers and fixtures:**

- [ ] `integration/helpers/agent-parity.cjs` — the helper itself (TEST-02)
- [ ] `integration/helpers/lifecycle-utils.cjs` — shared utils for per-step files (extracted from current inline helpers in `gsd-lifecycle.test.cjs`)
- [ ] `integration/helpers/walltime-recorder.cjs` (recommended) — opt-in walltime ledger writer (XCUT-03 setup)
- [ ] `integration/lifecycle-steps/step-N-<name>.cjs` × 9 — extracted from current inline lifecycle test (post-cull has 9 steps; step-4 is `/gsd-review --critique`, step-10 is removed because `/gsd-stats` is in the deletion list)
- [ ] `integration/test-fixtures/lifecycle-shapes/post-cull.json` — pipeline shape definition (9 steps)
- [ ] `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json` × ~24 — baseline fixture inputs (one per fixture)
- [ ] `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` × ~24 — baseline outputs (committed in single named commit `chore: capture pre-refactor agent baselines for parity testing`)
- [ ] `integration/test-fixtures/walltime-ledger.jsonl` — empty file, ready for first append

**Bazel wiring:**

- [ ] `integration/BUILD.bazel` — `phase-1-cull` tag added to lifecycle test and any new live tests; `js_library` targets for `lifecycle_steps` and `test_fixtures`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Git tag `gsd-slim-phase-1-cull` applied at phase exit | XCUT-01 | Tag is the exit gate itself; applied by user/release process after both static and live test suites pass | `git tag gsd-slim-phase-1-cull` after `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull && bazel test //integration:gsd-lifecycle` all pass |
| PLAN.md test inventory section completeness review | XCUT-05 | Cross-reference of test files → REQ-IDs is structurally enforced by the planner self-audit; final review is human eyeball before phase commit | Open each PLAN.md; verify the Test Inventory section lists every new test file and every REQ-ID owned by this phase has at least one row |
| Baseline-capture commit reviewer eyeball | TEST-03 | A 24-file baseline commit cannot be line-by-line reviewed; reviewer focuses on the `_meta` blocks (date, agent name, schema kind) for sanity | PR review checklist: each baseline's `_meta.captured_at` is today; `_meta.agent` matches the path; `_meta.schema_kind` is one of `critic-findings` / `plan-structural` / `schema-conformance` |
| Reference-rot scrub completeness | TEST-01 | After the scrub commit, the orphan-reference test passes — but the scrub commit itself touches surviving agent prompts; reviewer should confirm changes are mechanical (string replacement / line removal) and don't alter semantics | PR review: every diff line either deletes a deleted-name reference or replaces with the new name; no rewording of surviving content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (static)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
