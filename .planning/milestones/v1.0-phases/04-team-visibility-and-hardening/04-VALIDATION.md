---
phase: 04
slug: team-visibility-and-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (native Node.js test runner) |
| **Config file** | none — uses scripts/run-tests.cjs |
| **Quick run command** | `node --test tests/core.test.cjs tests/context.test.cjs tests/init.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/core.test.cjs tests/context.test.cjs tests/init.test.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | TEAM-04 | unit | `node --test tests/core.test.cjs` | TBD | pending |
| 04-01-02 | 01 | 1 | TEAM-05 | unit | `node --test tests/core.test.cjs` | TBD | pending |
| 04-02-01 | 02 | 2 | TEAM-01, TEAM-02, TEAM-03 | unit+integration | `node --test tests/context.test.cjs tests/init.test.cjs` | TBD | pending |
| 04-03-01 | 03 | 3 | TEAM-06 | unit | `node --test tests/core.test.cjs` | TBD | pending |
| 04-04-01 | 04 | 4 | PATH-13, migration | unit+integration | `node --test tests/core.test.cjs tests/context.test.cjs` | TBD | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration from old .planning/ | Migration | Requires manual setup of legacy directory structure | Create flat .planning/ with PROJECT.md, run any GSD command, verify migration flow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
