---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 02
subsystem: testing
tags: [test-infrastructure, lifecycle-decomposition, post-cull, composer, fixture, node-test]

# Dependency graph
requires:
  - phase: 01-cull-with-wave-0-test-infrastructure
    provides: "(self-contained — Wave 0 second plan; runs in parallel with Plan 01-01)"
provides:
  - "integration/helpers/lifecycle-utils.cjs — 7 shared helpers (findFiles, readFrontmatter, walkForDir, findPhaseDir, findPlans, findSummaries, findRoadmap) extracted verbatim from monolith with closures converted to explicit args"
  - "integration/lifecycle-steps/step-{1..9}-*.cjs — 9 per-step modules each exporting {name, produces, may_produce, requires, run, assertArtifacts}; post-cull spine (step-4=review-critique, no step-10 stats)"
  - "integration/test-fixtures/lifecycle-shapes/post-cull.json — pipeline shape descriptor (9 expected_steps, no step_num=10)"
  - "integration/gsd-lifecycle.test.cjs — rewritten as 78-line thin composer (was 460-line monolith); preserves 5 fork-integrity pre-checks + iterates STEPS array"
  - "tests/lifecycle-decomposed.test.cjs — TEST-04 static gate; 13 subtests verifying decomposition structure"
affects:
  - "01-01 (orphan-reference scan) — independent but co-located in Wave 0"
  - "01-04/05 (consolidated review command + chain) — step-4-review-critique.cjs binds the post-cull entry point"
  - "01-06/07/08 (cull commits) — live lifecycle test stays RED through these waves; static decomposition test stays GREEN"
  - "01-09 (final lifecycle wiring) — may switch composer from direct require() to JSON-driven loading"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-step file pattern: {name, produces, may_produce, requires, run, assertArtifacts} — mirrors the orchestrator agent contract idiom"
    - "Direct-require composer (not JSON-driven) — RESEARCH.md §1.4.5 simpler-path: keeps Wave 0 transition simple, defers JSON-driven loading to Plan 09"
    - "Static structural test pattern (tests/lifecycle-decomposed.test.cjs) — file iteration + require() shape check, mirrors tests/agent-frontmatter.test.cjs"
    - "Skip-on-flake guards preserved verbatim in step files (e.g., 'if no artifacts, return') — pattern survives decomposition unchanged"

key-files:
  created:
    - "integration/helpers/lifecycle-utils.cjs (114 lines, 7 named exports)"
    - "integration/lifecycle-steps/step-1-new-project.cjs"
    - "integration/lifecycle-steps/step-2-discuss-phase.cjs"
    - "integration/lifecycle-steps/step-3-plan-phase.cjs"
    - "integration/lifecycle-steps/step-4-review-critique.cjs"
    - "integration/lifecycle-steps/step-5-execute-phase.cjs"
    - "integration/lifecycle-steps/step-6-add-mistake.cjs"
    - "integration/lifecycle-steps/step-7-add-taste.cjs"
    - "integration/lifecycle-steps/step-8-verify-work.cjs"
    - "integration/lifecycle-steps/step-9-progress.cjs"
    - "integration/test-fixtures/lifecycle-shapes/post-cull.json (9 expected_steps)"
    - "tests/lifecycle-decomposed.test.cjs (76 lines, 13 subtests)"
  modified:
    - "integration/gsd-lifecycle.test.cjs (460 → 78 lines; thin composer that requires step files)"

key-decisions:
  - "Composer attaches result.userSlug after run() so step files can call findPhaseDir(sandbox, userSlug) without further closures. This is the minimal addition needed to convert closure-captured userSlug into an explicit arg-flow without requiring a separate ctx argument to assertArtifacts. (Step files default userSlug to 'test-user' if not supplied, enabling stand-alone testing.)"
  - "5 fork-integrity pre-checks kept inline in the composer (not moved to a step-0 file). They were 'simple and short' as the plan permits, and consolidating them in step-0 would have inflated the file count without simplifying the logic. Composer ended at 78 lines (within the 80-line cap)."
  - "step-4 file is named step-4-review-critique.cjs and invokes /gsd-review --critique 1 — the post-cull command form. Live invocation expected RED until Plan 07 lands the consolidated /gsd-review entry point. Static test (tests/lifecycle-decomposed.test.cjs) is the GREEN gate for Wave 0."
  - "Direct require() composer (not JSON-driven loading) per RESEARCH.md §1.4.5. The shape JSON is shipped for documentation and consumed by tests/lifecycle-decomposed.test.cjs (alignment check), but the composer hardcodes 9 require() calls. Plan 09 may revisit."
  - "No Bazel target added for tests/lifecycle-decomposed.test.cjs — tests/*.test.cjs auto-discover per scripts/run-tests.cjs (RESEARCH.md §4.1, confirmed in Plan 01-01)."

patterns-established:
  - "Lifecycle decomposition pattern: thin composer + per-step files + shape JSON + static structural test. Future plans can repeat this for other monolith integration tests."
  - "Closure-to-arg refactor pattern: when extracting helpers, walk the original closure-captured set and convert each to an explicit parameter at the helper call site. This pattern was used for findPhaseDir/findPlans (sandbox+userSlug) and findSummaries/findRoadmap (sandbox)."

requirements-completed: [TEST-04]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 2: Wave 0 lifecycle decomposition Summary

**Decomposed the 460-line `integration/gsd-lifecycle.test.cjs` monolith into a 78-line thin composer + 9 per-step modules + 7 shared utility helpers + a post-cull shape JSON; added a static structural test (`tests/lifecycle-decomposed.test.cjs`, 13 subtests, GREEN) that hard-fails if step-10 reappears or step files drift from the post-cull spine.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-29T21:22:02Z
- **Completed:** 2026-04-29T21:27:48Z
- **Tasks:** 4
- **Files created:** 12
- **Files modified:** 1 (gsd-lifecycle.test.cjs rewritten 460 → 78 lines)

## Accomplishments
- Extracted 7 helpers (findFiles, readFrontmatter, walkForDir, findPhaseDir, findPlans, findSummaries, findRoadmap) verbatim from the monolith into `integration/helpers/lifecycle-utils.cjs`, with closures over `sandbox`/`userSlug` converted to explicit parameters so each step file can require these helpers directly.
- Created 9 per-step files at `integration/lifecycle-steps/step-N-<name>.cjs`, each exporting `{name, produces, may_produce, requires, run, assertArtifacts}`. Slash commands and assertion logic copied verbatim from the original `test('step N: ...')` blocks; timeout + maxBudget values preserved unchanged; skip-on-flake guards (e.g., `if no artifacts, return`) preserved verbatim.
- Honored the post-cull spine: step-4 is `step-4-review-critique.cjs` invoking `/gsd-review --critique 1` (the post-cull consolidated entry point); step-10 (gsd-stats) is intentionally absent. The static test will hard-fail if either invariant is broken in future commits.
- Shipped the shape JSON at `integration/test-fixtures/lifecycle-shapes/post-cull.json` with EXACTLY 9 `expected_steps` (step-4 named `review-critique`, no `step_num: 10`).
- Rewrote `integration/gsd-lifecycle.test.cjs` from 460 lines to 78 lines: 5 inline fork-integrity pre-checks + a STEPS array that iterates over the 9 required step modules. The composer attaches `result.userSlug` after each step's `run()` so step files can resolve phase dir without additional closures.
- Added `tests/lifecycle-decomposed.test.cjs` (76 lines, 13 subtests, all GREEN). Mitigates T-01-02-04 (step-10 reappearance) via the "exactly 9 step files" assertion and verifies shape-JSON ↔ step-file alignment.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared lifecycle utilities** — `82dbb3a6` (test)
2. **Task 2: Create the 9 per-step files** — `61d6f8ea` (test)
3. **Task 3: Create lifecycle-shape JSON + rewrite composer** — `b60eda5e` (refactor)
4. **Task 4: Create static decomposition test** — `c8d03738` (test)

## Files Created/Modified
- `integration/helpers/lifecycle-utils.cjs` (NEW) — 114 lines, 7 named exports.
- `integration/lifecycle-steps/step-1-new-project.cjs` … `step-9-progress.cjs` (NEW, 9 files) — each `{name, produces, [may_produce], requires, run, assertArtifacts}`.
- `integration/test-fixtures/lifecycle-shapes/post-cull.json` (NEW) — 9 expected_steps, step-4=review-critique, no step-10.
- `integration/gsd-lifecycle.test.cjs` (MODIFIED) — 460 → 78 lines; thin composer.
- `tests/lifecycle-decomposed.test.cjs` (NEW) — 76 lines, 13 subtests, GREEN.

## Decisions Made
- **Composer attaches `result.userSlug` after `step.run()`.** This is the minimal change needed because `findPhaseDir` was converted to take an explicit `userSlug` param. Step files default the slug to `'test-user'` when calling `findPhaseDir(sandbox, userSlug)`, so step modules can be required and exercised in isolation (e.g., from the static test) without needing the composer's closure.
- **5 fork-integrity pre-checks kept inline in the composer.** The plan permitted "keep them at the top of the composer" if simple and short. Consolidating to a `step-0-pre-checks.cjs` would have inflated file count without simplifying logic; final composer is 78 lines (within the 80-line cap).
- **Direct require() composer, not JSON-driven loading.** Per RESEARCH.md §1.4.5 simpler-path. The shape JSON is consumed by the static decomposition test (alignment check), but the composer hardcodes 9 `require()` calls. Plan 09 may revisit if needed.
- **Step-4 file name is `step-4-review-critique.cjs` and uses `/gsd-review --critique 1`.** This is the post-cull form. Live invocation will be RED until Plan 07 lands the consolidated review command — that is expected and documented in the JSDoc header of step-4-review-critique.cjs.
- **No Bazel target added.** Per RESEARCH.md §4.1 (re-confirmed in Plan 01-01): `tests/*.test.cjs` auto-discover via `scripts/run-tests.cjs`. The shape JSON under `integration/test-fixtures/` is consumed by the static test, not built.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan said composer cap is 80 lines but the literal template + 5 pre-checks exceeded that**
- **Found during:** Task 3 (verification command)
- **Issue:** The plan provided a ~50-line composer template AND directed me to "preserve [pre-checks] OR move to step-0", but the literal template + 5 pre-checks copied verbatim from the monolith totaled 86 lines — failing the verify command's `wc -l ... > 80 → FAIL` assertion.
- **Fix:** Trimmed the JSDoc header from a 14-line block to a 7-line line-comment block, preserving all the same content (RESEARCH.md §1.4.5 reference, file path convention, cost estimate, run command). Final composer is 78 lines.
- **Files modified:** `integration/gsd-lifecycle.test.cjs`
- **Committed in:** `b60eda5e` (Task 3 commit)
- **Why this is Rule 3 not Rule 4:** No architectural change — the structure (composer + 5 pre-checks + iteration over STEPS array) is exactly as the plan prescribed; only the comment density was reduced to fit the line cap.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Cosmetic — comment density reduction. All structural acceptance criteria met (78 lines ≤ 80, 9 step requires, contains createSandbox('lifecycle'), no inline runClaudeWithTools).

## Acceptance Criteria

| Criterion | Status |
|----|----|
| `integration/helpers/lifecycle-utils.cjs` exports 7 helpers verbatim | PASS — 7 named exports, 7 `^function ` declarations |
| 9 step files at `integration/lifecycle-steps/step-N-<name>.cjs` | PASS — `ls integration/lifecycle-steps/step-*.cjs \| wc -l` = 9 |
| Each step file exports `{name, run, assertArtifacts}` | PASS — verified for all 9 |
| No `step-10-*.cjs` file | PASS — does not exist |
| `step-4-review-critique.cjs` (NOT `step-4-critique.cjs`) | PASS — exists; references `/gsd-review --critique` |
| Composer ≤ 80 lines | PASS — 78 lines |
| Composer requires all 9 step files | PASS — 9 `require('./lifecycle-steps/step-...')` lines |
| `post-cull.json` has 9 expected_steps | PASS — `len == 9`, step[3].name == "review-critique", no step_num=10 |
| `tests/lifecycle-decomposed.test.cjs` is GREEN | PASS — 13/13 subtests pass; 0 failures |
| Live `bazel test //integration:gsd-lifecycle` expected RED | DOCUMENTED — turns GREEN after Plan 07 (consolidated review) and Plan 09 |

All 10 plan-level acceptance criteria pass.

## Issues Encountered
- **Composer line cap.** The plan's verify command (`wc -l ... > 80 → FAIL`) is stricter than the prose ("target 50, hard cap 80") suggested. The literal template + 5 pre-checks exceeded 80 lines until the JSDoc header was trimmed. Documented above as a Rule 3 deviation. No design change.

## User Setup Required
None. Tests run via `npm test` and `node --test`. Live lifecycle test continues to be cost-gated (~$50-80/run) and is not run in this verification — only the static decomposition test is exercised.

## Next Phase Readiness

- **Static decomposition test is GREEN.** Future plans (06-09) can land cull commits without breaking the structural gate; `tests/lifecycle-decomposed.test.cjs` will catch regressions where step files reorder, drop, or step-10 reappears.
- **Step-4 binds to `/gsd-review --critique`.** When Plan 07 lands the consolidated review command, step-4's live invocation will go GREEN automatically — no edits to step files are required by Plan 07.
- **Live lifecycle test expected RED through Wave 1.** This is documented and expected; live test goes GREEN after Plan 09 (final lifecycle wiring). Devs running `bazel test //integration:gsd-lifecycle` between now and then will see expected RED.
- **No blockers.** Plan 02 is the parity-helper / lifecycle-decomposition track and runs independently of Plan 01-01 (cull-deletion-list fixture + orphan-reference test). Both Wave 0 plans are now complete.
- **Worktree mirror established.** SUMMARY.md mirrored into worktree `.planning/` with `git add -f` (per orchestrator instructions) — survives the worktree force-removal that occurs after this agent returns.

## Self-Check: PASSED

- FOUND: integration/helpers/lifecycle-utils.cjs
- FOUND: integration/lifecycle-steps/step-1-new-project.cjs
- FOUND: integration/lifecycle-steps/step-2-discuss-phase.cjs
- FOUND: integration/lifecycle-steps/step-3-plan-phase.cjs
- FOUND: integration/lifecycle-steps/step-4-review-critique.cjs
- FOUND: integration/lifecycle-steps/step-5-execute-phase.cjs
- FOUND: integration/lifecycle-steps/step-6-add-mistake.cjs
- FOUND: integration/lifecycle-steps/step-7-add-taste.cjs
- FOUND: integration/lifecycle-steps/step-8-verify-work.cjs
- FOUND: integration/lifecycle-steps/step-9-progress.cjs
- FOUND: integration/test-fixtures/lifecycle-shapes/post-cull.json
- FOUND: integration/gsd-lifecycle.test.cjs (modified, 78 lines)
- FOUND: tests/lifecycle-decomposed.test.cjs
- FOUND: commit `82dbb3a6` (Task 1)
- FOUND: commit `61d6f8ea` (Task 2)
- FOUND: commit `b60eda5e` (Task 3)
- FOUND: commit `c8d03738` (Task 4)

---
*Phase: 01-cull-with-wave-0-test-infrastructure*
*Completed: 2026-04-29*
