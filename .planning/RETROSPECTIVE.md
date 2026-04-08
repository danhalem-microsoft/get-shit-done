# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Multi-User Monorepo Support

**Shipped:** 2026-04-08
**Phases:** 4 | **Plans:** 16 | **Sessions:** ~16

### What Was Built
- Identity resolution chain (git → slug → user-map → .active → getPlanningRoot)
- Full module migration to user-qualified paths (8 core modules, 83 workflow/agent files)
- Project lifecycle commands (new-project, switch, archive, restore, auto-select)
- Team visibility (/gsd:team-status), config layering (4-tier + env vars), commit attribution
- Legacy migration flow replacing hard error with graceful upgrade path
- 694 tests covering all 36 requirements

### What Worked
- **TDD across all plans** — caught real bugs (LIFE-05 auto-select gap in Plan 03-05, tryGetPlanningContext missing logic)
- **Wave-based parallel execution** — Plans 04-01 and 04-02 ran in parallel without conflicts
- **Code-critic per wave** — caught env var placement bug (plan-C01) before execution
- **Phase 3 `_sources` tracking in loadConfig** — enabled Phase 4's config resolve command with zero rework
- **Discuss-critic** — identified 3 blind spots in Phase 3 and 3 in Phase 4 context before planning

### What Was Inefficient
- **Traceability table staleness** — Phase 1 requirements show "Pending" in traceability table despite being complete. `phase complete` CLI should update traceability.
- **PATH-13 regression in Phase 3** — the new-project bootstrap introduced a PATH-13 violation that wasn't caught until Phase 4. Earlier audit enforcement could have prevented this.
- **SUMMARY.md missed in parallel execution** — Plan 04-04 SUMMARY.md wasn't committed during Wave 4 parallel execution (race condition in state file writes). Required manual commit.
- **Migration scope change friction** — moving migration from "Out of Scope" to delivered required multiple critic cycles to acknowledge the intentional override.

### Patterns Established
- **cwd-first function signatures** — all module functions take `cwd` as first parameter
- **`tryGetPlanningContext` vs `getPlanningRoot`** — soft (null return) vs hard (process.exit) resolution
- **Two-step bootstrap** — for new-project: identity+listing first, then init after directory exists
- **ENV_KEY_MAP explicit mapping** — config keys to env var names, no auto-derivation
- **Planning commits vs code commits** — only planning artifacts get user/project attribution prefix

### Key Lessons
1. **Design for forward compatibility** — Phase 3's `_sources` tracking in loadConfig was a 30-minute addition that saved a full loadConfig redesign in Phase 4
2. **Chicken-and-egg problems need design, not grep fixes** — PATH-13 bootstrap violation required architectural thinking (bootstrap_path in init output), not simple text replacement
3. **Parallel agent execution needs state isolation** — STATE.md and ROADMAP.md writes from parallel agents can race. Last-writer-wins is acceptable but SUMMARY.md commits can be lost

### Cost Observations
- Model mix: ~60% opus (orchestrator + executor), ~35% sonnet (critics + verifiers), ~5% inherit
- Sessions: ~16 across 22 calendar days
- Notable: Phase 4 completed in a single session (discuss → plan → execute → verify → audit)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~16 | 4 | Established multi-user foundation with TDD and wave execution |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 694 | ~36 requirements | 0 (pure Node.js) |

### Top Lessons (Verified Across Milestones)

1. Forward-compatible design pays off in later phases
2. Parallel execution requires state isolation awareness
3. Critics catch real bugs — don't skip them
