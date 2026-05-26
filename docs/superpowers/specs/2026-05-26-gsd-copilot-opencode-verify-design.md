# GSD Copilot CLI + OpenCode — Verify and Fix

**Date:** 2026-05-26
**Owner:** dan-halem
**Status:** Design — awaiting user review before plan-writing

---

## TL;DR

Verify the existing `--copilot` and `--opencode` install flows against this fork end-to-end, fix the gaps that surface, and prove a representative GSD lifecycle (`/gsd-new-project` → `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-phase`) runs cleanly on each runtime. Scope is verify-and-fix; not net-new feature work.

Delivered as one phase with 8 plans, parallelized between the two runtimes wherever they are independent, gated by env flags so live API calls only happen on explicit opt-in.

---

## Context

### What this fork is
This repository is a fork of [glittercowboy/get-shit-done](https://github.com/glittercowboy/get-shit-done). The fork (see `FORK.md`) adds six features on top of upstream GSD:

1. Six critic **agents** in `agents/` (`gsd-critic-{plan,code,scope,verify,discuss,strategy}`) — converted to runtime-native agent files at install time
2. Eleven dynamic **researcher type definitions** in `get-shit-done/researchers/` — data files (`architecture.md`, `build-system.md`, `conventions.md`, `data-model.md`, `deployment.md`, `features.md`, `phase-research.md`, `pitfalls.md`, `stack.md`, `testing.md`, plus `_template.md`) consumed by the `gsd-phase-researcher` agent; copied verbatim to the install destination, not converted into agent files
3. Adaptive synthesizer — modifications to the `gsd-research-synthesizer` agent to adapt output format
4. Mistake registry — `gsd-tools.cjs` + `add-mistake` / `list-mistakes` workflows and command stubs
5. Taste library — `taste.cjs` + `add-taste` / `extract-taste` workflows and command stubs
6. Code-search MCP integration via template markers `<!-- code-search-tools -->` and `<!-- code-search-guidance -->` in 7 agent files

`bin/install.js` (~7,000 LOC) is the canonical converter: it reads the source agent/command/workflow tree and writes runtime-native formats for Claude Code, OpenCode, Gemini, Codex, Copilot CLI, Kilo, Cursor, Windsurf, Augment, Trae, Qwen, Codebuddy, Cline, and Antigravity.

### What's verified today
On the developer's primary machine:
- `~/.claude/` has a full GSD install; Claude Code is the daily-driver runtime
- `~/.copilot/` has no GSD install
- `~/.config/opencode/` has no GSD install (only `node_modules`)

`tests/copilot-install.test.cjs` (1,492 LOC) and `tests/opencode-permissions.test.cjs` exist but are unit-level: they exercise individual conversion functions (`convertCopilotToolName`, `mergeCopilotInstructions`, `configureOpencodePermissions`, etc.). No test invokes the runtime CLI to confirm the converted output actually runs.

### What "working" means here
A representative GSD lifecycle slice runs cleanly on each runtime, against a disposable scratch repo, with sentinel assertions that distinguish real workflow execution from LLM improvisation. The 6 fork-specific features are asserted structurally present after install — but their runtime behavior is not exercised by this scope.

---

## Goals

- One representative end-to-end slice — `/gsd-new-project` → `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-phase` — green on both Copilot CLI and OpenCode against an ephemeral scratch repo.
- A committable, repeatable harness so this can be re-run on every fork merge from upstream.
- Structural parity assertions for the 6 fork features after `--local --copilot` / `--local --opencode` installs.
- A classified, bounded fix set (`install-blocking`, `lifecycle-critical`, `parity-deferred`, `harness-bug`) so the work has a defined finish line.

## Non-goals

- Exercising fork-specific feature behavior at runtime (critics firing during plan-phase, researchers running, code-search MCP integration). Structural presence only.
- Achieving 100% runtime parity between Copilot CLI / OpenCode and Claude Code. The bar is *the chosen lifecycle slice runs cleanly* + structural fork-feature presence.
- Net-new GSD features.
- Changes to the source tree's canonical agent/command/workflow files unless required to unblock the lifecycle slice on a specific runtime.
- CI integration. The E2E tests are env-gated and `manual`-tagged; running them in CI would require API credentials we don't manage here.

---

## Success criteria

1. `bazel test //tests/e2e:e2e_copilot_invocation_smoke --test_env=GSD_E2E_COPILOT=1` passes against a fresh checkout.
2. `bazel test //tests/e2e:e2e_opencode_invocation_smoke --test_env=GSD_E2E_OPENCODE=1` passes against a fresh checkout.
3. `bazel test //tests/e2e:e2e_copilot_install_structural --test_env=GSD_E2E_COPILOT=1` passes, asserting all 6 fork features present in the installed Copilot tree.
4. `bazel test //tests/e2e:e2e_opencode_install_structural --test_env=GSD_E2E_OPENCODE=1` passes, asserting all 6 fork features present in the installed OpenCode tree.
5. `bazel test //tests/e2e:e2e_copilot_lifecycle --test_env=GSD_E2E_COPILOT=1` passes, asserting all 4 lifecycle-slice sentinels.
6. `bazel test //tests/e2e:e2e_opencode_lifecycle --test_env=GSD_E2E_OPENCODE=1` passes, asserting all 4 lifecycle-slice sentinels.
7. `bazel test //...` (no env flags) continues to pass; the new E2E targets are silently skipped.
8. `FORK.md` "Installation" section updated to reflect the verified runtimes and the exact invocation incantation.

---

## Approach

Single phase, 8 plans, parallelized wherever the two runtimes are independent.

### Plan dependency graph

```
                    01 (harness foundation)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
02 (invocation        03 (copilot         04 (opencode
   smoke)              install +              install +
        │              structural)            structural)
        │                   │                   │
        │                   ▼                   ▼
        │              05 (fix copilot)    06 (fix opencode)
        │                   │                   │
        └─────────┬─────────┴───────────────────┘
                  ▼
            07 (lifecycle E2E, both runtimes)
                  │
                  ▼
            08 (verification output + docs)
```

Plans 02, 03, 04 are all independent of each other and run in parallel after Plan 01. Plan 05 depends only on Plan 03; Plan 06 depends only on Plan 04 — 05 and 06 run in parallel. Plan 07 depends on Plans 02, 05, and 06 (it needs the invocation contract from 02 and a fixed install from each runtime).

### Plan-by-plan deliverables and completion criteria

#### Plan 01 — Shared E2E harness foundation
- Deliverables: `tests/e2e/lib/{test-repo,runtime-driver,preflight,install-probe,fork-structural,gap-taxonomy}.cjs` plus skeleton Bazel targets in `tests/BUILD.bazel`.
- No live runtime invocations yet — pure module construction with unit-level tests of harness internals (e.g., `test-repo.cjs` produces a valid git repo with the correct fixture markers).
- Completion: harness modules exist; their internal unit tests are green under `bazel test //tests/e2e/lib:lib_unit`; Bazel targets for 02–07 are declared but `manual`-tagged.

#### Plan 02 — Invocation smoke test
- Deliverable: `tests/e2e/00-invocation-smoke.test.cjs`, producing `tests/e2e/lib/invocation-contract.json` (committed).
- Mechanism: install a sentinel skill `gsd-e2e-echo` into the scratch repo's runtime root, then try a small ordered list of invocation forms per runtime until one produces the sentinel file with the correct random token.
- Completion: contract file exists for both runtimes, recording the working invocation form.

#### Plan 03 — Copilot install + structural characterization
- Deliverable: `tests/e2e/01-copilot-install-structural.test.cjs`.
- Mechanism: scratch repo + `node <abs>/bin/install.js --local --copilot` + `fork-structural.cjs` assertions over the resulting `<scratch>/<copilot-root>/`.
- Completion: test runs without harness errors; every failure has a `GAP-NNN` code and a classification in `{install-blocking, lifecycle-critical, parity-deferred, harness-bug}`. Uncategorized failures count as harness bugs and block completion. The plan completes *whether the test is green or red structurally* — its job is to characterize, not to fix.

#### Plan 04 — OpenCode install + structural characterization
- Same shape as Plan 03 for OpenCode. Independent of Plan 03 — runs in parallel.

#### Plan 05 — Fix Copilot structural gaps (budget cap: 8 surgical fixes)
- Deliverable: edits to `bin/install.js` and adjacent conversion paths.
- Completion: `01-copilot-install-structural.test.cjs` GREEN, OR the 8-fix budget is hit with the remainder explicitly classified `parity-deferred` and tracked in `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md` (a sibling doc this plan creates if needed).
- Rationale for cap: open-ended runtime parity work doesn't belong in this scope. If gaps explode, surface the long tail and replan, don't grind.

#### Plan 06 — Fix OpenCode structural gaps (budget cap: 8 surgical fixes)
- Same shape as Plan 05 for OpenCode. Independent of Plan 05 — runs in parallel.

#### Plan 07 — Lifecycle slice E2E
- Deliverables: `tests/e2e/03-copilot-lifecycle.test.cjs`, `tests/e2e/04-opencode-lifecycle.test.cjs`.
- Mechanism: scratch repo with `lifecycle` fixture, install, then 4 sequential headless invocations using the contract from Plan 02, with sentinel assertions after each step.
- Completion: both tests green on a single invocation. Any flakes investigated and resolved (or documented as known transient).

#### Plan 08 — Verification output + docs
- Deliverables: `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify/VERIFICATION.md` recording the green runs (timestamps, model used, token usage if available, commit SHA); updates to `FORK.md` "Installation" section.
- Completion: docs committed; commit-ready summary produced. User decides whether to push.

---

## Harness module specs

All modules live under `tests/e2e/lib/`.

### `test-repo.cjs`
Builds an ephemeral scratch repo in `mktemp -d`.

```js
createScratchRepo({ fixture: 'smoke' | 'lifecycle' }) -> { root, fixtureMarkers, cleanup }
```

- `fixture: 'smoke'` — git-initialized; `package.json`, `README.md` with one project-goal paragraph and a unique marker string.
- `fixture: 'lifecycle'` — git-initialized with deterministic identity (`GSD E2E <e2e@gsd.invalid>`); `package.json` with `"scripts": { "test": "node --test" }`; `src/calc.js` exporting a broken `add()` that does `String(a) + String(b)`; `tests/calc.test.js` asserting `add(2,3) === 5` (currently fails); `README.md` stating the project goal and embedding a unique fixture marker.
- `cleanup()` is idempotent. Respects `GSD_E2E_KEEP_TMP=1` to preserve scratch dirs for post-mortem.
- Records the scratch path to stderr at creation time so post-mortem is possible even if the test crashes.

### `runtime-driver.cjs`
```js
invoke(runtime, { prompt, cwd, timeoutMs, modelOverride }) ->
  { exitCode, stdout, stderr, durationMs, killedByTimeout, command }
```

- Spawns `copilot --allow-all --prompt "..."` or `opencode run "..."` in **its own process group** (`{ detached: true }` on POSIX).
- On timeout: SIGTERM the process group, then SIGKILL after 5s grace. Always reaps.
- Always logs the resolved command, cwd, timeout, exit code, and tail of stderr (last 50 lines) on completion or timeout.
- Default `timeoutMs` is 600,000 (10 min). Per-test caller can override.
- Does *not* sandbox `HOME` for runtime invocations — the user's real auth state is required. The scratch repo is the cwd, but `HOME` and provider env vars are inherited.

### `preflight.cjs`
```js
preflight(runtime) -> Promise<PreflightReport>
PreflightReport = {
  ok: boolean,
  checks: Array<{ name, ok, code, message, fix }>
}
```

Discrete checks, in order, with classified error codes:
1. `checkBinary` — binary on PATH? (`code: 'BINARY_NOT_FOUND'`)
2. `checkVersion` — `<cli> --version` returns parseable output? (`code: 'VERSION_UNREADABLE'`)
3. `checkNonInteractiveSyntax` — minimal `<cli> --help` mentions the non-interactive flag we plan to use? (`code: 'INVOCATION_MODE_UNSUPPORTED'`)
4. `checkAuth` — a tiny "say ok" probe with a short timeout (~30s); failure classified as `AUTH_REQUIRED` vs `RATE_LIMITED` vs `PROVIDER_UNAVAILABLE` vs `MODEL_UNAVAILABLE` based on stderr patterns.

Each check returns a `fix` string with a concrete remediation (e.g., `"run gh auth login"`, `"opencode auth login github-copilot"`).

### `install-probe.cjs`
```js
runInstall(runtime, scratchRoot) -> Promise<InstallReport>
InstallReport = {
  installRoot,        // discovered, not hardcoded
  filesCreated,       // tree relative to scratchRoot
  sourceRepoChanged,  // boolean — must be false
  exitCode,
  durationMs,
}
```

- Always invokes via `node /<abs>/bin/install.js --local --<runtime>` with `cwd = scratchRoot`.
- Before invocation: snapshots `git status` of the source repo. After invocation: re-snapshots. `sourceRepoChanged = true` is a harness-level failure regardless of runtime structural results.
- Discovers `installRoot` by diffing the scratch repo's top-level tree before and after install — does not hardcode `.github/` or `.opencode/`. The discovered root is recorded.

### `fork-structural.cjs`
```js
assertForkStructure(installReport) -> GapReport
GapReport = { gaps: Array<Gap> }
Gap = { code: 'GAP-NNN', feature, file, expected, actual }
```

Six feature checks (detail in §"Structural assertion catalog" below). **Security-invariant style**:
- Required tool families present (read/search) rather than exact equality on tool arrays.
- Forbidden tools absent (Bash/Write on critics whose policy is `read-only`).
- Markers fully absent when no MCP detected (not just the literal HTML comment — also bare `code-search-tools`, `code-search-guidance`, `<!-- code-search-` prefix).

### `gap-taxonomy.cjs`
```js
classifyGaps(gapReport) -> ClassifiedGaps
ClassifiedGaps = {
  installBlocking: Gap[],
  lifecycleCritical: Gap[],
  parityDeferred: Gap[],
  harnessBug: Gap[],
}
```

Classification rules:
- `install-blocking`: install crashed or didn't write expected runtime-native dir
- `lifecycle-critical`: a feature required by the lifecycle slice is missing or broken (e.g., new-project workflow file absent)
- `parity-deferred`: cosmetic or non-load-bearing (e.g., a researcher's tool-list is slightly off but the researcher loads)
- `harness-bug`: gap doesn't fit any other category — the test logic is wrong

---

## Invocation smoke test (Plan 02) detail

The sentinel skill `gsd-e2e-echo` is defined under `tests/e2e/fixtures/gsd-e2e-echo/` and copied into the runtime root **by the test, not by the installer**. It is never added to the canonical source tree.

The sentinel's body is one instruction: "Write the line `SENTINEL_OK <token>` (with the exact token I gave you) into `./e2e-sentinel.txt` in the current working directory, then stop."

Invocation candidates (tried in order, first success wins):

**Copilot CLI:**
1. `copilot --allow-all --prompt "/gsd-e2e-echo token=<token>"`
2. `copilot --allow-all --prompt "Run the gsd-e2e-echo skill with token=<token>"`
3. `copilot --allow-all --prompt "<inline instructions verbatim>"`

**OpenCode:**
1. `opencode run --command gsd-e2e-echo --prompt-args 'token=<token>'`
2. `opencode run "/gsd-e2e-echo token=<token>"`
3. `opencode run "Run the gsd-e2e-echo command with token=<token>"`

The winning form is recorded in `tests/e2e/lib/invocation-contract.json`:
```json
{
  "copilot": { "argv": ["--allow-all", "--prompt", "/{COMMAND} {ARGS}"] },
  "opencode": { "argv": ["run", "--command", "{COMMAND}", "--prompt-args", "{ARGS}"] }
}
```

Plans 03/04/07 read this contract; if it's missing, they fail loudly with "run Plan 02 first."

---

## Structural assertion catalog

For each installed runtime tree:

| # | Feature | Assertion |
|---|---------|-----------|
| 1 | Critics × 6 | Each of `gsd-critic-{plan,code,scope,verify,discuss,strategy}` exists in runtime-native agent form; frontmatter parseable; no `Bash`/`Write` (or runtime-native equivalents) in tool list; `read-only` access policy preserved if the runtime supports it. |
| 2 | Researcher type defs × 11 | Each `.md` file under `get-shit-done/researchers/` in source — `architecture`, `build-system`, `conventions`, `data-model`, `deployment`, `features`, `phase-research`, `pitfalls`, `stack`, `testing`, `_template` — is present at the install destination (path determined by the install-manifest's `researchers` entry). Frontmatter parseable; no transformation to runtime-native agent format expected. |
| 3 | Adaptive synthesizer | `gsd-research-synthesizer` exists in runtime-native agent form; content contains the adaptive-output sentinel string from the source. |
| 4 | Mistake registry | `gsd-tools.cjs` present + executable in the install destination; `add-mistake` and `list-mistakes` runtime-native command/skill files exist. |
| 5 | Taste library | `taste.cjs` present in the install destination; `add-taste` and `extract-taste` runtime-native command/skill files exist. |
| 6 | Code-search markers | When the sandboxed install detects no `code-search` MCP server: zero occurrences of `<!-- code-search-`, `code-search-tools`, `code-search-guidance` anywhere under the installed tree. Affects 7 known agent files per `FORK.md`. |

Each violation produces a `Gap` with `code: 'GAP-NNN'`, `feature`, `file`, `expected`, `actual`.

---

## Lifecycle slice (Plan 07) detail

Fixture: `lifecycle`.
Per-step timeout: 600,000 ms (10 min).
Whole-test timeout: 2,400,000 ms (40 min) per runtime.
Model override: optional via `GSD_E2E_MODEL=<provider/model>`.
No automatic retries.

| Step | Prompt | Sentinel assertion |
|------|--------|--------------------|
| 1. new-project | Workflow command only — *no path hints in prompt* | `.planning/` exists under scratch root; `PROJECT.md` exists and contains the fixture marker string from the README; `.planning/.active` set; `.planning/users/gsd-e2e/` exists |
| 2. plan-phase | Workflow command + brief one-sentence intent ("the failing test in tests/calc.test.js") | At least one `phases/01-*/PHASE.md` exists; at least one plan file references `src/calc.js` *or* `tests/calc.test.js` |
| 3. execute-phase | Workflow command, no path hints | `node --test` in scratch repo exits 0; `src/calc.js` no longer contains the substring `String(a) + String(b)` |
| 4. verify-phase | Workflow command | Verification ledger entry exists; phase status flips to `verified` in `PHASE.md` frontmatter |

Why these sentinels are improvisation-proof:
- Step 1 requires reading a file the agent wasn't told about (the fixture marker).
- Step 2 requires referencing fixture-specific paths the prompt doesn't mention.
- Step 3 requires the test to actually pass — a hallucinated `.planning/` artifact won't fix the calculator.
- Step 4 requires structured state mutation, not free-form prose.

---

## Bazel integration

- Targets declared in `tests/BUILD.bazel`, one per E2E test file.
- Tags: `["manual", "local", "exclusive", "requires-network"]`.
  - `manual`: excluded from default `bazel test //...`.
  - `local`: disables Bazel sandbox (we need real HOME/network/PATH).
  - `exclusive`: serializes against other tests in the same target set (shared rate limits, subprocess spawning).
  - `requires-network`: documentation.
- Env-flag gating: tests internally check `process.env.GSD_E2E_COPILOT === '1'` (or `_OPENCODE`) and `t.skip()` if absent. Passing the flag via `--test_env=GSD_E2E_COPILOT=1` is the supported way to opt in.
- Each test is also runnable as `node tests/e2e/<file>.test.cjs` with identical semantics — Bazel is a thin wrapper, not a hard dependency, for dev-loop ergonomics.

Sandboxing asymmetry, intentional and documented:
- **Install probe**: HOME/XDG sandboxed to `<scratch>/.fakehome/` so installs don't touch the developer's real config.
- **Runtime invocations** (smoke + lifecycle): real HOME, real auth env — these need the developer's actual credentials.

---

## Process discipline

- **Preflight** runs once per test, before the first runtime invocation. Splits binary/version/syntax/auth checks. Each failure is classified and includes a concrete `fix` string.
- **Timeouts**: per-step (default 600s) and whole-test (default 2400s for lifecycle). On timeout: SIGTERM the process group, SIGKILL after 5s grace.
- **Cleanup**: scratch repos cleaned via `finally`. `GSD_E2E_KEEP_TMP=1` preserves them for post-mortem. Scratch path always logged to stderr at creation.
- **Cost controls**: model override via `GSD_E2E_MODEL`; no automatic retries; total invocations, model name, and approximate token usage (if surfaced in stderr) logged per test.
- **Fix budget cap**: 8 surgical fixes per runtime in Plans 05/06. Excess gaps classified `parity-deferred` and tracked in a follow-ups doc.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Slash-command dispatch in `--prompt`/`run` may not work as assumed | Plan 02 (invocation smoke) verifies the contract before Plans 03/04/07 depend on it |
| LLM improvisation could "pass" sentinels accidentally | Sentinels include fixture-specific marker strings + behavioral assertions (test passes) that improvisation cannot satisfy without reading the fixture |
| Bazel non-hermeticity (network, HOME, auth) surprises future maintainers | Tags + comments + the `node` fallback document the expected execution model |
| Live API costs | Env-flag gated; no retries; model override; cost-control checklist in test logs |
| Scratch repo too thin for `execute-phase` | `lifecycle` fixture has a concrete failing test the agent must fix; assertion proves the fix happened |
| Structural gap explosion | 8-fix budget cap; `parity-deferred` classification; explicit follow-ups doc |
| Auth state drift across machines | Preflight emits classified, actionable error with `fix` string |
| Orphaned processes from timed-out runs | Process-group spawn + SIGKILL after grace; always reap |

---

## Out of scope (explicit)

- Critic/researcher/synthesizer behavior at runtime (only structural presence)
- Code-search MCP runtime exercise (only marker-absence assertion when MCP not configured)
- CI integration with credentials
- Other runtimes beyond Copilot CLI and OpenCode (Gemini, Codex, Kilo, etc. are unchanged)
- The upstream-sync Phase 1 in `.planning/phases/01-update-this-repo-from-upstream-preserving-all-of-our-patches/` — that's a separate active workstream
- Performance / token-cost optimization of GSD workflows
- Changes to canonical source agents/commands/workflows unless required to unblock the lifecycle slice on a specific runtime

---

## Open questions deferred to plan-writing

- Exact location for the `gsd-e2e-echo` fixture skill — likely `tests/e2e/fixtures/gsd-e2e-echo/`
- Whether `runtime-driver.cjs` should stream stdout/stderr or buffer (probably buffer with a tail-of-stderr log dump on completion)
- Whether `gap-taxonomy.cjs` classification rules are a static table or a small policy module — likely a small policy module so it can grow as patterns emerge

These are tactical and will be resolved during plan-writing or implementation, not blocking design approval.
