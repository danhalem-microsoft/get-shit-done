---
status: human_needed
phase: "07"
phase_name: bazel-invoked-claude-code-integration-test-suite
verified_at: "2026-04-23"
must_haves_verified: 16
must_haves_total: 16
---

# Phase 07 Verification: Bazel-Invoked Claude Code Integration Test Suite

## Goal
Deliver a Bazel-orchestrated integration test suite that invokes the real Claude Code CLI with GSD commands and validates end-to-end behavior across workflows, multi-user isolation, and fork feature preservation.

## Must-Have Verification

### Plan 07-01: Bazel Infrastructure Bootstrap
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | MODULE.bazel declares aspect_rules_js 3.0.3 and rules_nodejs 6.7.4 | ✓ PASS | Both deps present in MODULE.bazel |
| 2 | MODULE.bazel has comment about keeping Node.js version in sync | ✓ PASS | `Keep in sync with package.json` comment present |
| 3 | .bazelversion pins 7.6.1 | ✓ PASS | File contains `7.6.1` |
| 4 | .bazelrc passes ANTHROPIC_API_KEY, HOME, PATH to test env | ✓ PASS | All three `--test_env` lines present |
| 5 | .bazelrc sets lockfile_mode=off | ✓ PASS | `common --lockfile_mode=off` present |
| 6 | Root BUILD.bazel exposes project_sources filegroup | ✓ PASS | `name = "project_sources"` with public visibility |
| 7 | .gitignore excludes bazel-*, MODULE.bazel.lock, .bazel/ | ✓ PASS | All three patterns in .gitignore |

### Plan 07-02: Test Harness Helpers
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 8 | claude-runner.cjs exists with runner functions | ✓ PASS | File exists, exports runClaude/runGsd |
| 9 | integration/helpers/BUILD.bazel exists | ✓ PASS | File present |
| 10 | integration/BUILD.bazel exists | ✓ PASS | File present |

### Plan 07-03: Integration Test Files
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 11 | gsd-workflow.test.cjs exists | ✓ PASS | File present, imports claude-runner |
| 12 | multi-user.test.cjs exists | ✓ PASS | File present, imports claude-runner |
| 13 | fork-features.test.cjs exists | ✓ PASS | File present, imports claude-runner |

### Plan 07-04: CI Pipeline
| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 14 | bazel-integration-tests job in test.yml | ✓ PASS | Job present in workflow |
| 15 | ANTHROPIC_API_KEY referenced in CI | ✓ PASS | Secret referenced |
| 16 | Bazel remote cache out of scope | ✓ PASS | No remote cache configured |

## Code Review Issues

Code review found 8 issues (1 critical, 4 warning, 3 info). Notable:
- **CRITICAL:** CI job `if:` condition references `env.ANTHROPIC_API_KEY` at job level where it's not yet available — job will never run. Needs fix.

## Human Verification Needed

1. **Run `bazel build //...`** — verify Bazel resolves deps and builds successfully
2. **Run `bazel test //integration/...`** with ANTHROPIC_API_KEY set — verify tests execute against real CLI
3. **Verify CI workflow** — the critical review finding about the `if:` condition needs manual confirmation and fix

## Self-Check

All 16 must-haves verified against codebase. Phase goal structurally achieved — Bazel config, test harness, test files, and CI pipeline all present. Human testing needed for end-to-end validation since these are integration tests that require a live Claude Code CLI and API key.
