# Roadmap: GSD Multi-User Monorepo Support

## Milestones

- ✅ **v1.0 Multi-User Monorepo Support** — Phases 1-4 (shipped 2026-04-08)

## Phases

<details>
<summary>✅ v1.0 Multi-User Monorepo Support (Phases 1-4) — SHIPPED 2026-04-08</summary>

- [x] Phase 1: Identity and Path Resolution Core (3/3 plans) — completed 2026-03-24
- [x] Phase 2: Module Path Migration (5/5 plans) — completed 2026-03-31
- [x] Phase 3: Project Lifecycle Commands (5/5 plans) — completed 2026-04-07
- [x] Phase 4: Team Visibility and Hardening (3/3 plans) — completed 2026-04-08

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1. Identity & Path Resolution Core | v1.0 | 3/3 | Complete | 2026-03-24 |
| 2. Module Path Migration | v1.0 | 5/5 | Complete | 2026-03-31 |
| 3. Project Lifecycle Commands | v1.0 | 5/5 | Complete | 2026-04-07 |
| 4. Team Visibility & Hardening | v1.0 | 3/3 | Complete | 2026-04-08 |

---

**36 v1 requirements delivered. 16 plans executed. 694 tests passing.**

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

### Phase 1: update this repo from upstream, preserving ALL of our patches

**Goal:** Synchronize fork with upstream (714 commits), resolving 250 conflict markers across 61 files while preserving all 102 local patches across 6+ feature areas (multi-user, fork infrastructure, taste/critics, dynamic researcher, code search, completion gates, adaptive synthesizer)
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06, MERGE-07, MERGE-08, MERGE-09, MERGE-10, MERGE-11
**Depends on:** Phase 0
**Plans:** 5 plans

Plans:
- [ ] 01-01-PLAN.md — Pre-merge setup + core.cjs path resolution foundation
- [ ] 01-02-PLAN.md — Resolve init.cjs, state.cjs, phase.cjs (54 conflict markers)
- [ ] 01-03-PLAN.md — Resolve remaining core libs + infrastructure + modify/delete conflicts
- [ ] 01-04-PLAN.md — Resolve all workflow/template/agent markdown files (37 files)
- [ ] 01-05-PLAN.md — Resolve test files + full validation gate + merge commit + fast-forward main

### Phase 7: Bazel-invoked Claude Code integration test suite

**Goal:** Deliver a Bazel-orchestrated integration test suite that invokes the real Claude Code CLI with GSD commands and validates end-to-end behavior across workflows, multi-user isolation, and fork feature preservation.
**Requirements**: D-01 through D-12
**Depends on:** Phase 6
**Plans:** 4 plans

Plans:
- [x] 07-01-PLAN.md — Bazel infrastructure bootstrap (MODULE.bazel, .bazelversion, .bazelrc, BUILD.bazel, .gitignore)
- [ ] 07-02-PLAN.md — Test helpers and integration BUILD targets (claude-runner.cjs, BUILD files)
- [ ] 07-03-PLAN.md — Integration test files (workflow, multi-user, fork-features)
- [ ] 07-04-PLAN.md — CI pipeline — Bazel integration test job in GitHub Actions

---
*Roadmap created: 2026-03-17*
*v1.0 shipped: 2026-04-08*
