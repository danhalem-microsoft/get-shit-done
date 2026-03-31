---
phase: 02
slug: module-path-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (native Node.js test runner) |
| **Config file** | none — existing infrastructure |
| **Quick run command** | `node scripts/run-tests.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/run-tests.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-XX-01 | XX | X | PATH-02–09 | unit | `node scripts/run-tests.cjs` | ✅ | ⬜ pending |
| 02-XX-02 | XX | X | PATH-11 | grep audit | `node --test tests/audit-paths.test.cjs` | ❌ W0 | ⬜ pending |
| 02-XX-03 | XX | X | PATH-12 | grep audit | `node --test tests/audit-paths.test.cjs` | ❌ W0 | ⬜ pending |
| 02-XX-04 | XX | X | PATH-13 | grep audit | `node --test tests/audit-paths.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/audit-paths.test.cjs` — grep audit gate for PATH-13 compliance
- [ ] Existing `tests/helpers.cjs` already has `createTempMultiUserProject()` — no new fixtures needed

*Existing infrastructure covers most phase requirements. Only the grep audit gate test is new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Workflow markdown correctness | PATH-11 | Semantic path substitution in markdown | Review `${planning_root}/...` patterns in workflow files |
| Agent placeholder variables | PATH-12 | Template variable correctness | Verify `{planning_root}`, `{phase_dir}` placeholders in agent files |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
