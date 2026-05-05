# Architecture Research — GSD Slim + SP Integration + TDD Hardening

**Domain:** AI agent orchestration / meta-prompting refactor
**Researched:** 2026-04-28
**Confidence:** MEDIUM-HIGH (mix of verified Claude Code platform behaviors, established prompt-engineering patterns, and project-internal patterns; novel cross-system patterns flagged LOW where they are GSD-specific inventions)
**Project context:** Brownfield refactor of existing GSD orchestrator-agent system. See `.planning/codebase/ARCHITECTURE.md` (existing pattern), `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` (full design spec), and `.planning/users/dan-halem/gsd-slim-and-integrate/PROJECT.md` (project goal).

---

## Executive summary

The six refactor concerns sort into **three architectural problems** the planner needs to solve in order:

1. **Composition** — How to share prompt fragments across agents without forking, and how to merge an agent into another without losing addressability. (Phases 2, 3, 6)
2. **Coordination** — How to fan out parallel critic invocations from a single orchestrator message, and how to fan in their findings safely. (Phase 2 batch invocation, Phase 3 parallel research)
3. **Integration boundary** — How to ingest an external artifact (SP brainstorm spec) and how to extend a global skill conditionally without forking. (Phase 5)

**Plus two infrastructure concerns:**

4. **Enforcement gate** — Pre-commit hook that reads project config every invocation, with three modes. (Phase 4)
5. **Phased rollout** — Each refactor phase ships as an independently revertible commit set with parity guardrails. (Cross-cutting)

**Primary recommendation:** Adopt **`@$HOME/.claude/...` reference syntax for shared base prompts** (already used elsewhere in GSD — see `mandatory-initial-read.md` references), use **single-message Task fan-out for parallel critics** (Anthropic-documented pattern), build **a single `spec-reader.cjs` library module** for `--from-spec` consumers (matches existing `lib/*.cjs` pattern), and treat the **brainstorming addendum as a project-level CLAUDE.md instruction** rather than a sibling skill or fork.

---

## Architectural responsibility map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Shared base prompt content (`critic-base.md`, `agent-conventions.md`) | Filesystem (installed under `~/.claude/get-shit-done/agents/_shared/`) | Agent prompt loader (Claude Code's `@` resolution) | Already where `references/*.md` lives; Claude Code natively expands `@path` references at load time [VERIFIED via Claude Code @ syntax docs] |
| Critic lens prompts | Agent layer (`agents/gsd-critic-*.md`) | Shared base via `@` reference | Each critic stays a discoverable agent; lens-only addendum keeps the file small |
| Parallel agent fan-out | Orchestrator workflow (`workflows/critique.md`, `workflows/plan-phase.md`) | Claude Task tool | Single-message multi-`Task` is the documented Claude Code pattern for parallel subagents |
| Spec parsing | Library module (`get-shit-done/bin/lib/spec-reader.cjs`) | CLI dispatcher (`gsd-tools.cjs`) | Matches existing `lib/*.cjs` boundary — ALL state mutations and structured parsing already go through gsd-tools |
| Spec consumption | Three orchestrator workflows (`new-milestone.md`, `phase.md add`, `discuss-phase.md`) | Their respective agents (roadmapper, planner, assumptions-analyzer) | Workflows already own agent context assembly; they are the natural injection point |
| Project-local SP addendum | Project-root CLAUDE.md or `.planning/SP-ADDENDUM.md` (referenced from CLAUDE.md) | SP brainstorming skill (unmodified, in plugin cache) | CLAUDE.md is auto-loaded by Claude Code at session start [VERIFIED]; this is the Anthropic-documented extension point |
| Hook config | `.planning/settings.json` (read every invocation) | `gsd-tools.cjs config` reader | One source of truth, no caching issues |
| Hook enforcement | `hooks/tdd-gate.sh` (executed by git) | Project-installed `.git/hooks/pre-commit` | Standard git hook layering; per-project opt-in via existing GSD installer |
| Phased rollout | Git (per-phase commit ranges + tags) | Parity test fixtures in `integration/test-fixtures/` | Already how GSD ships changes |

---

## Per-question recommendations

### 1. Shared base prompts — loading mechanism, failure modes, versioning

**Recommendation: Use Claude Code's `@path` reference syntax with absolute `$HOME/.claude/...` paths, exactly as GSD already does for shared references.** [HIGH confidence]

**Why this and not alternatives:**

- GSD agents already use this pattern. `gsd-critic-plan.md` line 1 of `<role>` already references `{planning_root}/severity-reference.md` and `{planning_root}/critique-template.md` from `<context_loading>`. Other GSD agents inline `@$HOME/.claude/get-shit-done/references/mandatory-initial-read.md` — verified by grep against the agent files.
- Claude Code natively expands `@path` references at prompt-load time [VERIFIED: claude.com/blog/using-claude-md-files, code.claude.com/docs]. Content gets injected; no custom loader needed.
- Alternative ("inline duplicate the base text into each critic") is what the project is moving AWAY from — the cull is the whole point.
- Alternative ("preprocessor/installer expands `{{include critic-base.md}}` markers") adds tooling and an installer-coupling concern. Not needed when Claude Code already resolves `@`.

**Concrete shape:**

```
~/.claude/get-shit-done/agents/_shared/
├── critic-base.md           # ~200 lines: severity rubric, CRITIQUE.md schema, cross-flag rules, evidence requirements
├── agent-conventions.md     # cross-agent shared patterns extracted in Phase 6
└── README.md                # what these are, why they exist, versioning policy

~/.claude/agents/gsd-critic-plan.md (~80 lines)
  ├── frontmatter (name, description, tools, color)
  ├── @$HOME/.claude/get-shit-done/agents/_shared/critic-base.md  ← injection point
  └── <plan-lens> ... lens-specific addendum ... </plan-lens>
```

**Failure modes of "prompt include" patterns** [MEDIUM confidence — synthesized from GSD's own experience and search results]:

| Failure mode | Why it happens | Mitigation |
|---|---|---|
| **Silent semantic drift** — base changes the meaning of a directive but lens still phrases it as if the old behavior holds | Base authors don't realize a lens depended on a specific phrasing | Parity test per critic per release: feed fixture artifact, compare findings against baseline at ≥85% severity-bucketed overlap (already in Phase 2 exit criteria) |
| **Path drift on install** — `@$HOME/.claude/...` works on Linux/macOS but Windows installs may resolve differently | Cross-platform path handling | GSD already normalizes via `toPosixPath()` in `lib/core.cjs` [VERIFIED in INTEGRATIONS.md]; install manifest must explicitly map shared assets |
| **Stale base on retrofit** — user pulls new GSD but doesn't reinstall, so `~/.claude/get-shit-done/agents/_shared/` is missing or stale | GSD ships via clone+install, not npm | Add `agents/_shared/critic-base.md` to `install-manifest.json`; `gsd:health` should warn if shared assets missing |
| **Context bloat reappears** — the `_shared` directory grows unbounded, defeating the purpose of the cull | No discipline on what goes in `_shared` | Hard line budget per shared file (≤250 lines for `critic-base.md` per Phase 2 exit criteria); `tests/critic-line-budget.test.cjs` enforces |
| **Reference cycles** — base references lens-specific terms, lens references base terms in a way that creates conceptual circularity | Base and lens authored without strict layering discipline | Style rule: base never names a specific critic; lens always names its lens explicitly. Verifiable by grep |

**Versioning so a base change can't silently break a lens:**

- **No semver on the file.** GSD doesn't use it elsewhere; adding it here is local complexity for low return.
- **Use git history + parity tests.** Each critic has a fixture-driven parity test (Phase 2 exit). When `critic-base.md` changes, all six parity tests run. Failures block merge.
- **Co-locate change rationale.** When `critic-base.md` is edited, also update `agents/_shared/README.md` with a one-line "what changed and why" entry. Not a CHANGELOG — just a running log so a future debugger knows whether the base shifted recently.
- **Pin CRITIQUE.md schema in tests, not in code.** A test `critic-output-schema.test.cjs` parses critic fixture outputs and asserts the JSON-ish CRITIQUE.md sections exist. If a base edit drops a section, the test fails before any critic runs in production.

**Build order implication:** The `_shared/` directory and the shared file land in **Phase 2 commit 1** (before any critic is rewritten). All six critics are then rewritten in subsequent commits in Phase 2. This is critical: the base must exist as a stable reference target before lenses point at it.

---

### 2. Parallel agent invocation — orchestration, error handling, rate limits

**Recommendation: Single-message multi-`Task` fan-out from the orchestrator, with explicit JSON-aggregating gather step before routing to next stage.** [HIGH confidence — Claude Code documented pattern]

**Pattern:**

```markdown
## Critic batch (in workflows/critique.md)

# Single message: 6 parallel Task calls
Task spawn gsd-critic-plan      "$PROMPT_PLAN"      → TASK_ID_1
Task spawn gsd-critic-code      "$PROMPT_CODE"      → TASK_ID_2
Task spawn gsd-critic-scope     "$PROMPT_SCOPE"     → TASK_ID_3
Task spawn gsd-critic-verify    "$PROMPT_VERIFY"    → TASK_ID_4
Task spawn gsd-critic-discuss   "$PROMPT_DISCUSS"   → TASK_ID_5
Task spawn gsd-critic-strategy  "$PROMPT_STRAT"     → TASK_ID_6

# After Claude returns from all 6 (single Task tool block in single message)
# Each task wrote its CRITIQUE.md to a known path
# Orchestrator now reads all 6 files and aggregates
gsd-tools.cjs critic-aggregate <phase> <plan-id>
```

**Why single-message multi-Task and not sequential / not background-job:**

- Claude Code documents this as the parallel-subagent pattern [VERIFIED: amux.io guide, mindstudio.ai patterns post]. Multiple Task calls in one message run concurrently; sequential calls are sequential.
- Anthropic's published "split-and-merge" pattern is exactly this: orchestrator emits N Task calls in one tool block, awaits all, gathers results, routes next.
- GSD already uses this for parallel project research (4 researchers) — see `workflows/new-project.md` data flow in `.planning/codebase/ARCHITECTURE.md`. The pattern is project-validated.

**Known platform issue to plan around** [MEDIUM confidence — GitHub issue still open as of search date]:

- `anthropics/claude-code#29181`: model sometimes emits 1 Task call per message even when intending 3 parallel calls; remaining "results" can be hallucinated. **Mitigation:** orchestrator reads each critic's actual `CRITIQUE.md` file from disk after the batch returns; if a file is missing, that's a true execution failure, not a hallucinated success. Don't trust the parent-context summary of what happened — trust the artifacts on disk.

**Error handling shape — 1-of-N failure:**

| Failure | Detection | Default policy | Override |
|---|---|---|---|
| Critic produces no CRITIQUE.md | Aggregate step finds missing file | **Skip and warn**: aggregate other 5, log the missing one as `info`-severity finding | `--strict-critics` flag (future) forces abort |
| Critic produces malformed CRITIQUE.md | Parse fails in aggregate step | Log raw output as `warning`-severity finding under "critic-failed-to-emit-schema"; continue with remaining 5 | None — CRITIQUE.md schema is enforced in `_shared/critic-base.md` |
| All 6 critics fail | Aggregate step finds 0 valid files | **Abort** plan-checker pipeline; surface to user as orchestrator error | Not overrideable — total failure is signal of upstream problem |
| Critic times out | Claude Task tool errors | Treated as failure of that one critic; same as missing CRITIQUE.md | None |
| Rate limit on parallel batch | Claude API returns 429 on one or more calls | Claude Code surfaces as Task error → orchestrator falls back to **sequential retry** of the failed critics with backoff | Not user-overrideable; protocol baked into orchestrator |

**Rationale: "skip and continue" beats "abort":** A critic batch isn't atomic — each critic produces an independent finding stream. Losing one critic loses one lens of feedback; losing all loses the gate. The user can re-run `/gsd-review --critique` if the missing critic mattered. Aborting on 1-of-N failure is more user-hostile than reporting "5 of 6 critics ran; critic-strategy failed, see logs."

**Parent context window pressure:**

- Critic batch is in `/gsd-review` and in `/gsd-plan-phase`, both of which are orchestrators with thin context [VERIFIED: existing GSD pattern, ARCHITECTURE.md "Orchestrators stay thin"].
- Each critic gets a fresh 200k window via Task spawning [VERIFIED: ARCHITECTURE.md pattern].
- **The risk is the gather step**: orchestrator reading 6 CRITIQUE.md files (each potentially 5–15KB) and synthesizing. **Mitigation:** synthesize via `gsd-tools.cjs critic-aggregate` (a CLI step that produces a single combined `CRITIQUE-AGGREGATE.md`), not via parent context. Parent context only holds the aggregate, not the 6 raw files.

**Rate limits:**

- Anthropic's API has tier-based concurrent request limits. 6 parallel Task calls is well under any documented tier limit for normal users [LOW confidence — depends on user's plan; doesn't block design].
- If hit, Claude Code's Task tool surfaces the rate-limit error per call. Orchestrator's "skip and continue" policy already handles this.

**Build order implication:** Workflow updates for parallel batch land **after** the lens addendums are stable. The order within Phase 2: `_shared/critic-base.md` first → 6 critic lenses next → `workflows/critique.md` parallel-batch update last. Same for Phase 3: parallelize `pattern-mapper` + `phase-researcher` only after both agents are confirmed working in the new structure.

---

### 3. Cross-system integration via artifact handoff — schema rigidity vs flexibility

**Recommendation: Strict required-section names + loose content-shape, parsed by a single `lib/spec-reader.cjs` module that returns a structured object. Required sections missing → reader returns `null` for that field; consumer asks user interactively.** [HIGH confidence — pattern matches OpenSpec/SpecKit ingestion approach + GSD's existing conventions]

**Why this and not alternatives:**

- **Strict schema (rigid YAML/JSON)** — robust but creates a brittle SP-side change requirement: every brainstorm must produce valid YAML. The brainstorm conversation is fluid; forcing it into a strict schema fights its strength. OpenSpec uses YAML+templates [VERIFIED: github.com/Fission-AI/OpenSpec docs] but explicitly because OpenSpec IS a spec tool. SP is a brainstorming tool; its output is a design doc, not a machine artifact.
- **Loose required-sections (markdown headings)** — more forgiving. Headers must match exactly (whitespace-insensitive), but content under each header is free-form markdown. This is exactly OpenSpec's delta-spec format [VERIFIED: OpenSpec docs say requirement headers must match exactly, scenarios in `#### Scenario:` format].
- **Pure free-form** — too brittle on the GSD side; planner doesn't know where to find "must-haves" if they could be anywhere.

**Required sections per spec doc** (already in the design):

```
## Scope summary       — one paragraph
## Success criteria    — bulleted list, falsifiable
## Must-haves          — bulleted list of required functionality
## Recommended next step  — one of three GSD commands + rationale
```

**Optional sections** (consumer reads if present):

```
## Phase breakdown
## Technical risks
## Dependencies
## Out of scope
## Testing strategy
```

**Parser shape (`get-shit-done/bin/lib/spec-reader.cjs`):**

```javascript
// Public API
module.exports = {
  /**
   * Parse a brainstorm spec markdown file into a structured object.
   * @param {string} filePath - absolute path to .md file
   * @returns {SpecDoc | { error: string }}
   *
   * SpecDoc shape:
   *   {
   *     scopeSummary: string,           // required, null if missing
   *     successCriteria: string[],      // required, [] if missing
   *     mustHaves: string[],            // required, [] if missing
   *     recommendedNextStep: {
   *       command: 'new-milestone' | 'phase-add' | 'discuss-phase',
   *       rationale: string,
   *       fullText: string
   *     } | null,
   *     phaseBreakdown: PhaseSpec[] | null,   // optional
   *     technicalRisks: string[] | null,
   *     dependencies: string[] | null,
   *     outOfScope: string[] | null,
   *     rawSections: { [heading: string]: string },  // escape hatch for full markdown
   *     filePath: string,
   *     missingRequired: string[]       // names of required sections that were absent
   *   }
   */
  parseSpec(filePath),

  /**
   * Render a SpecDoc back to a structured prompt fragment for an agent.
   * Used by orchestrators to inject spec content into agent prompts.
   * @param {SpecDoc} spec
   * @returns {string} markdown fragment for prompt injection
   */
  toPromptFragment(spec, options = { sections: ['scopeSummary', 'mustHaves'] })
};
```

**Why one module, not three:** All three consumers (`/gsd-new-milestone`, `/gsd-phase add`, `/gsd-discuss-phase`) read the same file format. Three parsers would drift. This matches GSD's existing `lib/frontmatter.cjs`, `lib/state.cjs` pattern: one parser per artifact type.

**Integration point with each agent — three options, recommendation third:**

| Option | Description | Trade-off |
|---|---|---|
| **(a) Pass parsed object via prompt** | Orchestrator parses spec, formats as JSON, injects into agent prompt as `<spec-input>` | Tight schema contract; agent sees structured data, less interpretation overhead |
| **(b) Pass raw markdown** | Orchestrator passes `--from-spec` path as a `<files_to_read>` entry; agent reads file directly | Simplest; uses existing GSD pattern; but each agent re-parses, risking drift |
| **(c) Hybrid: pass parsed summary + raw file ref** ✅ | Orchestrator injects parsed `<spec-summary>` (just headings + first sentence per section) AND lists the spec file in `<files_to_read>` for full-fidelity reading | Agent gets quick orientation from summary + can drill into raw markdown if needed; matches GSD's existing `<files_to_read>` + `<context>` orchestrator pattern |

**Recommendation: option (c) — hybrid.** [MEDIUM confidence — synthesized from GSD's existing prompt assembly pattern; not directly verified against an external system]

- Matches the existing GSD orchestrator pattern: orchestrator builds `<files_to_read>` block + injects pre-parsed structured summaries.
- Single parser still owns extraction; agents don't reimplement.
- Agents that need deep content (planner needs full `## Phase breakdown`) can read the file fully; agents that need a sniff (assumptions-analyzer just needs to know what was decided) can rely on the summary.

**How tools like OpenSpec handle ingestion of external specs** [HIGH confidence on OpenSpec specifics, MEDIUM on generalization]:

- OpenSpec uses **delta specs** marked ADDED/MODIFIED/REMOVED to communicate changes [VERIFIED]. Equivalent in our context: the brainstorm spec is the input; downstream GSD artifacts (ROADMAP.md, PLAN.md) are the "deltas" that are written. We're not doing delta tracking; brainstorm spec is read-once.
- OpenSpec/SpecKit both rely on **strict heading conventions** for ingestion. We're adopting the same posture.
- OpenSpec custom schemas allow project-specific section requirements via `schema.yaml` [VERIFIED]. Our equivalent is the addendum CLAUDE.md instruction telling brainstorm what sections to write. Same idea, lighter-weight.

**Build order implication:** `lib/spec-reader.cjs` must land **before** any of the three `--from-spec` flag implementations. Concrete order in Phase 5:

1. Add `lib/spec-reader.cjs` + unit tests (`tests/spec-reader-unit.test.cjs`).
2. Wire `/gsd-new-milestone --from-spec` (lowest-risk consumer; roadmapper just reads).
3. Wire `/gsd-phase add --from-spec` (medium-risk; auto-chains into discuss-phase).
4. Wire `/gsd-discuss-phase --from-spec` (highest-risk; gap-skipping logic is novel).
5. Author project-local brainstorm addendum (depends on having tested at least one consumer).

---

### 4. Project-local addendum to a global skill — without forking

**Recommendation: Project-root `CLAUDE.md` (or a referenced `.planning/SP-INTEGRATION.md`) that contains conditional brainstorming instructions activated by detection of `.planning/`. Not a sibling skill, not a fork.** [HIGH confidence — matches Anthropic-documented CLAUDE.md extension pattern]

**Why this and not alternatives:**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Fork SP brainstorming** | Full control | Diverges from upstream; updates require manual merge; user explicitly chose against this in PROJECT.md "Out of Scope" | Rejected (out of scope) |
| **Sibling skill that wraps SP** | Decoupled from SP plugin updates | Two skills doing one job; user has to remember to invoke the wrapper, not the original; failure mode: wrapper goes stale and SP runs unwrapped | Rejected — requires user discipline |
| **Conditional logic via skill discovery** (e.g., GSD ships a `gsd-brainstorm-addendum` skill that auto-attaches when `.planning/` exists) | Activation is automatic | Claude Code skills don't have a documented "auto-attach when path exists" mechanism [VERIFIED: no such mechanism in skill docs]; would require novel infrastructure | Rejected — depends on infrastructure that doesn't exist |
| **Project-root CLAUDE.md instructions** ✅ | Auto-loaded on every session [VERIFIED: claude.com/blog/using-claude-md-files]; the documented Anthropic extension point; conditional behavior is just a directive ("if `.planning/` exists, when running brainstorming, also write these sections...") | CLAUDE.md is not infinite — adding a 100-line addendum to every project's CLAUDE.md is heavy | Recommended with mitigation |

**Mitigation for CLAUDE.md weight:** Use the documented `@path` import pattern [VERIFIED: claude.com/blog/using-claude-md-files: "CLAUDE.md files can directly import additional Markdown files using @path/to/import syntax"]. Project's `CLAUDE.md` contains a single line:

```markdown
<!-- GSD-aware brainstorming addendum: activates when .planning/ is detected -->
@.planning/SP-BRAINSTORM-ADDENDUM.md
```

The actual addendum lives in `.planning/SP-BRAINSTORM-ADDENDUM.md` (~50 lines):

```markdown
# SP Brainstorming Addendum (GSD-aware mode)

When the SP brainstorming skill runs in this repo (auto-detected by .planning/ presence),
it must produce a spec doc with these sections in addition to whatever else the design needs:

## Scope summary       — one paragraph: what we're building, what we're not
## Success criteria    — bulleted, falsifiable
## Must-haves          — bulleted, required functionality
## Recommended next step — one of:
  - `/gsd-new-milestone --from-spec <path>` (multi-phase scope)
  - `/gsd-phase add --from-spec <path>` (single phase)
  - `/gsd-discuss-phase <id> --from-spec <path>` (filling existing phase context)
  ...with rationale
```

**Activation logic (fully natural-language, no code path):**

The addendum just says "when SP brainstorming runs in this repo, also do X." Claude Code reads CLAUDE.md (and its imports) at session start. The brainstorming skill, when invoked, sees the addendum already in context. No conditional code path needed — the `.planning/` detection is implicit (the addendum only exists in repos that have `.planning/`).

**Failure modes:**

- **CLAUDE.md not loaded** — User has explicitly disabled CLAUDE.md auto-load (rare). Mitigation: out of scope; if user has disabled the platform's primary extension mechanism, GSD-SP integration won't work.
- **SP brainstorming skill ignores addendum** — The skill might not honor the project-level instruction. Mitigation: addendum should be phrased as an instruction the skill is highly likely to follow (matches its existing "write design doc to docs/superpowers/specs/" pattern). Phase 5 exit criteria includes a live test verifying the addendum activates.
- **Brainstorming runs in a project without `.planning/`** — addendum file doesn't exist; brainstorming runs unmodified. ✅ This is the desired behavior.
- **User runs brainstorming on a different project that uses GSD** — that project also has its own addendum file. ✅ Works naturally.

**Build order implication:** Phase 5 — write the addendum AFTER `--from-spec` consumers exist (otherwise the addendum's recommendation produces commands that can't be run, contradicting the recommendation). Order:
1. `lib/spec-reader.cjs`
2. Three `--from-spec` consumers
3. `templates/SP-BRAINSTORM-ADDENDUM.md` (template, gets installed into each project's `.planning/`)
4. Update `bin/install.js` to write `.planning/SP-BRAINSTORM-ADDENDUM.md` and append the `@.planning/SP-BRAINSTORM-ADDENDUM.md` line to project CLAUDE.md (or create one)

---

### 5. Pre-commit hook with opt-in/out config

**Recommendation: Hook reads `.planning/settings.json` on every invocation (no caching). Three modes: `strict` (block bad commits), `warn` (print warnings, allow commit), `off` (skip entirely). Default: `strict` for fresh installs, `warn` for retrofits. Generated-code globs configured in same JSON.** [HIGH confidence — matches standard git hook + project-config patterns; design already specifies this]

**Why "read every invocation" and not "cache":**

- Pre-commit hook runs in <100ms typical; reading a small JSON file is negligible.
- Caching introduces a stale-config bug class (hook caches `strict`, user flips to `warn`, cache wins, commit blocked despite user explicitly opting out).
- Single source of truth: `.planning/settings.json`. No cache invalidation problem.

**Config schema (`.planning/settings.json` extension):**

```json
{
  "tdd_gate": {
    "mode": "strict | warn | off",
    "source_roots": ["src/", "lib/", "agents/"],
    "test_globs": ["tests/**/*.test.cjs", "**/__tests__/**", "*.test.*"],
    "ignore_globs": ["**/*.generated.*", "**/dist/**", "**/build/**"],
    "internal_module_patterns": ["^src/", "^lib/"]
  }
}
```

**Why these fields:**

- `mode` — opt-in/out (strict/warn/off)
- `source_roots` — what counts as "source" requiring a paired test (per design Must-have 4)
- `test_globs` — what counts as a paired test
- `ignore_globs` — `.gitignore`-style escape hatch for generated code (per design)
- `internal_module_patterns` — distinguishes "mocking own `src/`" (requires annotation) from "mocking `node_modules/external-pkg`" (allowed)

**Layering vs `.gitignore`-style escape hatches:**

- `.gitignore` itself is **not** the right place — it controls git, not the hook. Conflating "don't track this file" with "don't TDD-check this file" creates wrong incentives.
- Dedicated `ignore_globs` in `tdd_gate` config is correct — it's gate-specific.
- Globs use minimatch syntax (standard) and are matched against staged-diff paths.

**Hook invocation flow:**

```bash
# .git/hooks/pre-commit (installed by gsd installer)
#!/bin/sh
exec "$(git rev-parse --show-toplevel)/hooks/tdd-gate.sh" "$@"

# hooks/tdd-gate.sh (lives in repo)
#!/bin/sh
SETTINGS="$(git rev-parse --show-toplevel)/.planning/settings.json"

# Read mode (default strict if file missing)
MODE=$(node -e "...read settings.tdd_gate.mode..." 2>/dev/null || echo "strict")

case "$MODE" in
  off)   exit 0 ;;
  warn)  WARN_ONLY=1 ;;
  strict) WARN_ONLY=0 ;;
esac

# Run checks against `git diff --cached`:
#  - new source under source_roots without paired test
#  - it.skip / xit / .only patterns in staged tests
#  - vi.mock/jest.mock importing from internal patterns without // MOCK: annotation
#  - catch-all assertions (toBeTruthy, not.toThrow, bare toBeDefined)

if [ -n "$VIOLATIONS" ]; then
  echo "$VIOLATIONS" >&2
  if [ "$WARN_ONLY" = "1" ]; then
    echo "WARNING: TDD gate would block in strict mode. Commit allowed." >&2
    exit 0
  else
    echo "BLOCKED: set tdd_gate.mode = 'warn' or 'off' in .planning/settings.json to bypass" >&2
    exit 1
  fi
fi

exit 0
```

**Default policy (strict for fresh, warn for retrofit):**

- **How "fresh vs retrofit" is detected:** When `bin/install.js` runs in a repo:
  - If `.planning/` does not exist → fresh install → write `tdd_gate.mode: "strict"`
  - If `.planning/` exists and `tdd_gate` key not in `settings.json` → retrofit → write `tdd_gate.mode: "warn"` and append a banner to the install summary explaining how to upgrade to strict
  - If `.planning/settings.json` already has `tdd_gate.mode` → user has chosen; don't overwrite

- **Rationale:** Existing repos may have legitimate test debt; defaulting to strict on retrofit breaks working repos and erodes trust in the tool. Warn mode educates without blocking. Fresh installs have no debt; strict is fine.

**Bypass mechanism:** Standard `git commit --no-verify` works. The design notes (and global CLAUDE.md instructions in this user's environment) discourage `--no-verify` use — that's a policy concern, not a technical one. The hook doesn't need to fight `--no-verify`.

**Failure modes:**

| Mode | Failure | Consequence |
|---|---|---|
| `strict` | Hook crashes (e.g., node not on PATH) | Commit fails. **Mitigation:** Hook script has a `set -e` + final fallback `echo "tdd-gate.sh internal error; allowing commit. Report this." && exit 0` to prevent broken hooks from bricking commits |
| `strict` | False positive (legit refactor, no new test needed) | User sees blocked commit, edits `.planning/settings.json` to `warn` for that session, re-commits. **Mitigation:** Refactor commits (no new source files added) are explicitly carved out by the hook — design Must-have 4 already specifies |
| `warn` | User trains themselves to ignore warnings | Slow erosion. **Mitigation:** Warn mode is only the **default for retrofits**; the install banner explicitly recommends upgrading to strict once the existing test debt is addressed |
| `off` | User disables and forgets | TDD discipline drifts in that repo. **Mitigation:** This is a user choice; GSD's job is to make the right path the default, not enforce against opt-out |

**Build order implication:** Phase 4 — hook lands AFTER planner/executor/plan-checker changes. Otherwise, the hook can block legitimate plan-checker work (planner trying to commit a plan structure update). Order within Phase 4:
1. Layer 1 (executor + planner prompt updates) — no hook yet, manual TDD discipline
2. Layer 2 (plan-checker TDD-STRUCTURE rule) — verified in plan-check pipeline, before any commit
3. Layer 3 (`hooks/tdd-gate.sh`) — landed last, with `tdd_gate.mode: "warn"` defaulted in this repo's settings.json so we don't block our own dogfooding

---

### 6. Agent merge architecture — inline vs compositional

**Recommendation: Inline merge. Copy `gsd-research-synthesizer.md` content into `gsd-planner.md`, delete the synthesizer file. Add a single section anchor inside planner (`<synthesis-step>`) to keep the merged content findable.** [MEDIUM-HIGH confidence — opinionated; supports the cull goal]

**Why inline and not compositional:**

| Dimension | Inline | Compositional (planner references extracted synth subdoc) |
|---|---|---|
| **Cull goal alignment** | ✅ Reduces file count (-1 agent) | ❌ Same file count (one is a subdoc instead of an agent) |
| **Discoverability** | ✅ Everything related to "planning" is in one file; new contributor finds it via planner | ⚠️ Two files; reader must follow the include |
| **Single cognitive job?** | ❌ No — planner does (a) synthesize research, (b) create plan structure, (c) emit RED-step sub-tasks | ⚠️ Same — compositional doesn't separate cognitive jobs, just file boundaries |
| **Reusability of synth** | ⚠️ Synth logic is locked to planner | ✅ Synth could be reused elsewhere (e.g., debugger could synth research) |
| **Long-term shape** | Single agent with internal sections delineated by XML tags | Agent + cross-referenced subdoc |
| **Failure mode** | Planner gets too big (1252 lines + ~300 from synth = ~1550) | Subdoc drift if planner's expectations evolve and subdoc isn't updated |

**The "single cognitive job" question** asked in the prompt is the key: synth and plan-creation aren't separable cognitive jobs — they're the same job with two sub-steps. Synth is "read research, decide what matters" → plan creation is "given what matters, decompose into tasks." A planner that doesn't synthesize first plans badly; a synthesizer without planning context doesn't know what to filter for. They're coupled.

**Mitigation for "planner getting too big":** Phase 6 (Posture A trim) targets planner directly — design risks section already calls out "Planner growth (Phase 3)" as a known risk and proposes Posture A offset + escalate to Posture B if needed. Inline merge is risky only if Phase 6 doesn't execute; it does.

**Concrete merge structure:**

```markdown
# gsd-planner.md (after merge)

<role>...</role>

<synthesis-step>
  <!-- Imported from former gsd-research-synthesizer.md -->
  <!-- Step 1: read all research files, extract decisions, filter for relevance -->
  ...
</synthesis-step>

<planning-step>
  <!-- Original planner content -->
  <!-- Step 2: given synthesized findings + CONTEXT.md + REQUIREMENTS.md, emit PLAN.md files -->
  ...
</planning-step>

<red-step-emission>
  <!-- Phase 4 addition (TDD layer 1, planner side) -->
  <!-- For every implementation task, emit a RED test sub-step -->
  ...
</red-step-emission>
```

**Build order implication:**

- **Phase 3 commit 1:** Append synth content into planner with `<synthesis-step>` wrapper.
- **Phase 3 commit 2:** Update `workflows/plan-phase.md` to stop spawning `gsd-research-synthesizer`.
- **Phase 3 commit 3:** Delete `agents/gsd-research-synthesizer.md`.
- **Phase 3 commit 4:** Update `install-manifest.json` to drop the synth agent.
- This sequence allows revert at any commit boundary: commit 1 alone is harmless (planner has unused section); commits 1+2 leave the synth file as orphan; commits 1+2+3 is the full state.

---

### 7. Phased rollout with parity guardrails — clean rollback

**Recommendation: Per-phase commit ranges with a tag at the end of each phase. Parity tests gate the tag, not individual commits. If parity fails, revert range = `git revert <tag-prev>..<tag-this>`.** [MEDIUM confidence — synthesized from GSD's existing atomic-commit-per-task pattern + standard release-engineering practice]

**Why this and not alternatives:**

| Approach | Trade-off |
|---|---|
| **Per-task atomic commits, no per-phase tag** | Already GSD's pattern. Easy revert per task. Downside: hard to roll back "Phase 2 critic refactor" as one logical unit if commits 5–17 are entangled. |
| **Per-phase branch + merge** | Full rollback by reverting the merge commit. Downside: GSD doesn't do feature branches typically; forces a workflow shift. |
| **Per-phase tag + commit range** ✅ | Tag at phase exit (after parity tests pass). Revert range is `git revert phase-N-1..phase-N`. Each task is still atomic; tag is cheap; matches GSD's `complete-milestone` tag pattern [VERIFIED: existing `/gsd:complete-milestone` creates tags]. |

**Tag naming:** `gsd-slim-phase-1-cull`, `gsd-slim-phase-2-critics`, etc. (project-scoped to avoid colliding with the user's other milestones).

**Test-gate cadence:**

| Cadence | Tests |
|---|---|
| **Per task commit** | Bazel quick run: `npm test -- --grep '<changed-file-pattern>'`. Fast feedback, blocks broken commits within phase. |
| **Per phase exit** | Full static + live suite. Blocks tag (and therefore phase completion). |
| **Per phase parity** | Phase-specific parity test (critic-parity for Phase 2, plan-parity for Phase 3, agent-trim-parity for Phase 6). Run as part of phase exit. Failure → no tag → no merge to main. |

**Failure handling:**

- **Within-phase task fails parity:** revert that task only (single commit). No phase-level rollback needed.
- **Phase exit fails (full suite or parity):** options:
  - (a) Fix forward: more commits in the phase to address findings; re-run exit.
  - (b) Revert phase entirely: `git revert -m 1 <merge-commit>` if branch-based, or `git revert <tag-prev>..HEAD` if linear. Tag is not created. Phase is "in progress" until fixed or abandoned.
- **Post-tag regression discovered later:** Treat as a new phase or hotfix; don't try to retroactively edit a tagged phase. Matches GSD's milestone-archive pattern.

**Manual cleanup risk and mitigation:**

The question explicitly asks "without manual cleanup." The hardest case: critic-base.md was edited and broke critic-strategy parity. To roll back:

1. `git revert <critic-base-edit-commit>` reverts the file.
2. But the 6 critic lenses were also rewritten to depend on the new base. They now point at base content that doesn't exist in their referenced form.
3. **This is the parity-test purpose.** Parity test runs BEFORE the phase tag. If it fails, the phase doesn't ship; no rollback is needed. Fix forward.
4. If a parity issue is missed and discovered post-tag, the rollback IS manual: revert is a multi-commit range, and the agent files will need re-resolution. This is acceptable — same risk as any release with bugs.

**Build order implication:** Each phase's exit criteria (already specified in the design) include both static and live test passes. The parity-test-gates-the-tag rule is an addition: tagging only happens after the live parity test runs. The orchestrator running the phase commits the tag explicitly as the last step.

---

### 8. Component boundaries for `--from-spec` consumers

**Recommendation: Single `lib/spec-reader.cjs` module owns all parsing. Three orchestrator workflows each consume the parsed object via the hybrid prompt-injection pattern (Q3 option c). Agents (roadmapper, planner, assumptions-analyzer) DO NOT call spec-reader directly — they receive the parsed result from their orchestrator.** [HIGH confidence — matches GSD's strict orchestrator-agent layering]

**Why orchestrators consume, not agents:**

- GSD's architectural rule: orchestrators initialize context, agents do work [VERIFIED: existing pattern, ARCHITECTURE.md "Orchestrators stay thin" + "All state mutations through gsd-tools.cjs"].
- If agents called spec-reader directly: each agent loads/parses; three places to keep in sync; spec parsing happens 3x for one user invocation. Wrong.
- Orchestrators already initialize context via `gsd-tools.cjs init <workflow>`. Adding spec parsing to this step is the natural fit.

**Concrete component graph:**

```
User: /gsd-new-milestone --from-spec docs/superpowers/specs/2026-04-28-design.md
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ commands/gsd/new-milestone.md  (entry; @-references workflow)│
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ workflows/new-milestone.md  (orchestrator; thin)             │
│  Step 1: gsd-tools.cjs init new-milestone <args>             │
│  Step 2: gsd-tools.cjs spec-reader read <path>  ──────┐      │
│  Step 3: spawn gsd-roadmapper with:                   │      │
│           <spec-summary>{from step 2}</spec-summary>  │      │
│           <files_to_read>{spec path}</files_to_read>  │      │
└─────────────────────────────────────────────────────┬─┘      │
                                                     │        │
                                                     ▼        │
                                       ┌──────────────────────┴┐
                                       │ lib/spec-reader.cjs    │
                                       │  parseSpec(path)       │
                                       │  → SpecDoc | error     │
                                       └────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ agents/gsd-roadmapper.md  (fresh context window)             │
│  Receives parsed SpecDoc summary + raw path                  │
│  Reads raw file from <files_to_read> for full content        │
│  Emits ROADMAP.md seeded from spec phase breakdown           │
└──────────────────────────────────────────────────────────────┘
```

**Module placement:**

| Concern | Lives in | Reason |
|---|---|---|
| Spec markdown parsing | `get-shit-done/bin/lib/spec-reader.cjs` | Matches existing `lib/frontmatter.cjs` pattern: one parser per artifact type |
| CLI dispatch | `gsd-tools.cjs spec-reader read <path>` (subcommand of dispatcher) | Matches existing dispatcher pattern (e.g., `gsd-tools.cjs phase add`) |
| Prompt fragment rendering | `lib/spec-reader.cjs` `toPromptFragment()` exported function | Co-located with parser; orchestrator pipes parser output through it |
| Spec-aware agent logic | NONE — agents stay generic | Agents receive parsed input; they don't know about specs as a category |
| `--from-spec` CLI flag handling | Each consumer workflow's init step | Workflows already own arg parsing |

**Why agents stay generic:** roadmapper today already accepts a roadmap-shaped input. With `--from-spec`, it receives the same shape, just pre-populated from the spec. No new code path in roadmapper — the orchestrator does the seeding before spawn. This keeps agents idempotent regardless of input source.

**Integration point for each command:**

| Command | Orchestrator step | Agent receives |
|---|---|---|
| `/gsd-new-milestone --from-spec X` | Workflow parses X → seeds proposed milestone phases from `## Phase breakdown` and `## Must-haves` → injects into roadmapper prompt | roadmapper sees pre-populated phase list as `<seed-phases>`; user confirms or edits |
| `/gsd-phase add --from-spec X` | Workflow parses X → builds new phase row from `## Scope summary` + `## Must-haves` → auto-chains into `/gsd-discuss-phase --from-spec X` for the new phase id | discuss-phase gets the same spec; spec answers seed CONTEXT.md gaps |
| `/gsd-discuss-phase <id> --from-spec X` | Workflow parses X → assumptions-analyzer + advisor-researcher receive `<spec-prior-decisions>` block listing what's already answered | Analyzers skip questions whose answers exist in spec; surface only gaps to user; final CONTEXT.md merges spec answers + new answers |

**Build order implication:** Same as Q3.

1. `lib/spec-reader.cjs` + unit tests.
2. `gsd-tools.cjs` dispatcher integration (`spec-reader read`).
3. `/gsd-new-milestone --from-spec` (simplest consumer).
4. `/gsd-phase add --from-spec` (next; auto-chains).
5. `/gsd-discuss-phase --from-spec` (most complex; gap-skipping logic).
6. `templates/SP-BRAINSTORM-ADDENDUM.md` + installer wiring.
7. Live integration tests (`brainstorm-to-gsd-handoff.test.cjs`, `discuss-phase-gap-skipping.test.cjs`).

---

## System data flow (full project)

```
┌──────────────────────────┐
│ User idea (fuzzy)        │
└──────────┬───────────────┘
           │ /sp brainstorm
           ▼
┌──────────────────────────┐         ┌──────────────────────────────────┐
│ SP brainstorming skill   │ reads → │ project CLAUDE.md → @SP-ADDENDUM │
│ (unmodified, in plugin)  │         └──────────────────────────────────┘
│ writes: docs/superpowers/specs/<date>-<topic>-design.md │
└──────────┬───────────────┘
           │ recommends:
           │  /gsd-new-milestone OR /gsd-phase add OR /gsd-discuss-phase
           ▼
┌──────────────────────────────────────────────────────────────┐
│ GSD orchestrator (thin)                                      │
│  ├─ gsd-tools.cjs spec-reader read <path>                    │
│  ├─ spec-reader.cjs parseSpec → SpecDoc                      │
│  └─ inject into agent prompt (hybrid: summary + file ref)    │
└──────────┬───────────────────────────────────────────────────┘
           │ Task spawn
           ▼
┌──────────────────────────────────────────────────────────────┐
│ Specialized agent (fresh 200k context)                       │
│  ├─ Reads <files_to_read>                                    │
│  ├─ Uses <spec-summary> for orientation                      │
│  └─ Emits artifact (ROADMAP.md / phase row / CONTEXT.md)     │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│ Per-phase pipeline (existing GSD spine, post-cull)           │
│  /gsd-discuss-phase → CONTEXT.md                             │
│  /gsd-plan-phase     → 2 parallel: pattern-mapper + researcher│
│                      → planner (with merged synth) → PLAN.md │
│                      → plan-checker (TDD-STRUCTURE rule)     │
│                      → 6 parallel critics (shared base)      │
│  /gsd-execute-phase  → executor (invokes SP TDD skill)       │
│                      → pre-commit hook (tdd-gate.sh)         │
│                      → SUMMARY.md                            │
│  /gsd-verify-work    → verifier → UAT.md                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Cross-cutting build order (suggested phase ordering)

The design spec already orders phases 1→6 by dependency. This research reinforces that ordering with these architectural-build-order observations:

1. **Phase 1 (Cull) MUST land first.** All subsequent phases edit files that may not exist post-cull (deleted commands/agents). A reference-rot test gates phase exit. ✅ Already in the design.

2. **Phase 2 (Critics) and Phase 3 (Plan-phase merge) are mutually independent.** Either can land first. The design orders 2 → 3 for cull-then-merge cohesion. Architecturally, the parallel-Task batch update for critics in Phase 2 establishes the pattern that Phase 3 also uses (parallelize pattern-mapper + researcher). Doing 2 first means Phase 3 has a working parallel-batch reference. **Concur with the design's order.**

3. **Phase 4 (TDD) depends on Phase 3.** TDD layer 1 modifies the planner prompt (to emit RED sub-steps); the planner is also being modified in Phase 3 (to absorb synth). Doing TDD first means Phase 3 has to re-merge into a planner that already has TDD additions. **Concur with the design's order: 3 before 4.**

4. **Phase 5 (SP integration) is largely independent of Phase 4.** The `--from-spec` path doesn't interact with the TDD gate (specs aren't source files). The two could land in parallel branches. Design orders 4 → 5 for risk staging (TDD is higher-risk, ship it first while attention is high). **Concur.**

5. **Phase 6 (Trim) MUST land last.** It edits agents in their final structural form. Trimming an agent that will then have content appended (e.g., synth into planner) wastes work. **Concur with the design.**

**Architectural piece dependency graph:**

```
Phase 1: cull               ─┐
Phase 2: critic-base.md      │ → critic lenses → workflow parallel batch
Phase 3: planner+synth       │ → workflow parallel batch
Phase 4: tdd layer 1         │ → tdd layer 2 → tdd layer 3 (hook)
                             │   (executor)    (plan-checker)  (.planning/settings.json)
Phase 5: spec-reader.cjs     │ → 3x --from-spec consumers → SP addendum
Phase 6: agent trim          │ → agent-conventions.md (after Phase 2-5 finalize agent shapes)
                             │
                             └─ all gated by per-phase parity tests
```

---

## Anti-patterns to avoid

### Anti-pattern 1: "Inline copy" instead of `@` reference for shared base
**What:** Copy `critic-base.md` content into all 6 critic files.
**Why bad:** Defeats the cull's purpose; recreates the duplication problem the project is solving; future base edits must touch 6 files.
**Instead:** Use `@$HOME/.claude/get-shit-done/agents/_shared/critic-base.md` reference.

### Anti-pattern 2: Sequential critic invocation with `Task` calls in separate messages
**What:** Spawn critics one at a time, await each, then spawn next.
**Why bad:** Wall-clock = sum of critics, not max. Defeats Phase 2's speed goal.
**Instead:** Single message with 6 `Task` calls in one tool block.

### Anti-pattern 3: Cache pre-commit hook config
**What:** Hook reads `.planning/settings.json` once, caches `mode`, reads cache on subsequent invocations.
**Why bad:** Stale-cache bug class; user changes mode and cache wins.
**Instead:** Read JSON every invocation; cost is <1ms.

### Anti-pattern 4: Spec-reader called from multiple agents
**What:** Each of roadmapper / planner / assumptions-analyzer calls `spec-reader.cjs` directly.
**Why bad:** Three call sites to keep in sync; agents become coupled to spec format; agents do work that orchestrators are designed to do.
**Instead:** Orchestrator parses, passes parsed object + raw file ref to agent.

### Anti-pattern 5: Brainstorming skill modification or sibling-skill wrapper
**What:** Either fork the SP brainstorming skill or build a `gsd-brainstorm-wrapper` skill that invokes the original.
**Why bad:** Fork diverges from upstream (PROJECT.md explicit out-of-scope); wrapper requires user discipline to invoke the wrapper.
**Instead:** Project-root CLAUDE.md (or `@`-imported addendum file) provides conditional instructions to the original skill.

### Anti-pattern 6: Phased rollout without parity gates
**What:** Land each phase's commits, ship, fix bugs reactively.
**Why bad:** Critic refactor or planner merge could silently shift behavior; user discovers post-merge.
**Instead:** Per-phase parity test gates the phase-exit tag. No tag, no phase-complete.

---

## Sources

### Primary (HIGH confidence)
- [Claude Code: subagents docs](https://code.claude.com/docs/en/sub-agents) — subagent invocation pattern
- [Claude Code: subagents in SDK](https://platform.claude.com/docs/en/agent-sdk/subagents) — Task tool semantics
- [Claude.com: Using CLAUDE.md files](https://claude.com/blog/using-claude-md-files) — `@path/to/import` syntax for shared markdown content; auto-load behavior
- [stevekinney.com: Referencing files in Claude Code](https://stevekinney.com/courses/ai-development/referencing-files-in-claude-code) — `@` reference resolution including parent CLAUDE.md auto-include
- GSD codebase itself — verified via direct read:
  - `agents/gsd-critic-plan.md` lines 30–60 (existing context-loading pattern)
  - `.planning/codebase/ARCHITECTURE.md` (orchestrator-agent layering, "Orchestrators stay thin")
  - `.planning/codebase/STRUCTURE.md` (existing `lib/*.cjs` boundary)
  - `.planning/codebase/INTEGRATIONS.md` (cross-platform path normalization)
  - `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` (full design spec)
- [pre-commit.com](https://pre-commit.com/) — standard pre-commit framework
- [git-scm.com: Git Hooks docs](https://git-scm.com/docs/githooks) — hook invocation semantics, `--no-verify` bypass
- [github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — schema + delta spec patterns; ADDED/MODIFIED/REMOVED markers; `#### Scenario:` heading discipline
- [intent-driven.dev: OpenSpec custom schemas](https://intent-driven.dev/blog/2026/02/12/openspec-custom-schemas/) — config-driven section requirements

### Secondary (MEDIUM confidence — single-source or web-only)
- [amux.io: Claude Code Subagents Complete Guide 2026](https://amux.io/guides/claude-code-subagents/) — parallel subagent ergonomics
- [mindstudio.ai: Claude Code Workflow Patterns](https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns) — split-and-merge pattern
- [hashrocket: OpenSpec vs Spec Kit](https://hashrocket.com/blog/posts/openspec-vs-spec-kit-choosing-the-right-ai-driven-development-workflow-for-your-team) — comparative analysis of spec-driven workflows
- [dev.to: Spec Kit vs BMAD vs OpenSpec](https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j) — SDD framework comparison
- [github.com/Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) — Claude Code system prompt structure as of v2.1.122 (April 28, 2026)

### Tertiary (LOW confidence — flagged for validation during implementation)
- [github.com/anthropics/claude-code/issues/29181](https://github.com/anthropics/claude-code/issues/29181) — known parallel-Task hallucination bug; mitigation guidance (read artifact files, don't trust parent-context summary) is inferred, not verified against a fix
- Specific rate-limit numbers for parallel `Task` calls — not verified, depends on user's plan tier; design assumes 6-parallel is well within tier limits

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `@$HOME/.claude/...` absolute path references resolve correctly cross-platform in agent prompts (not just CLAUDE.md). | Q1 | If `@` reference syntax is CLAUDE.md-only and doesn't apply inside agent files, all critics break on shared-base load. **Mitigation: spike test in Phase 2 commit 0 — load a trivial `@` reference from a critic and confirm content is injected.** |
| A2 | Anthropic-published "split-and-merge" pattern is the recommended pattern for parallel critics; rate limits accommodate 6-way parallel. | Q2 | If parallel batch consistently rate-limits, critics serialize and Phase 2's wall-clock improvement is lost. Mitigation: existing GSD already does 4-way parallel research; 6 is incremental. |
| A3 | Project-root CLAUDE.md auto-loads in all SP brainstorming sessions, including the `.planning/SP-BRAINSTORM-ADDENDUM.md` import. | Q4 | If brainstorming runs in a context where CLAUDE.md isn't loaded, addendum is invisible and brainstorm doesn't write the required sections. Mitigation: Phase 5 live test verifies activation. |
| A4 | Pre-commit hook reading `.planning/settings.json` has acceptable latency (<10ms typical). | Q5 | If JSON read is slow on Windows or with large config files, commits feel sluggish. Mitigation: file is small; node startup is the dominant cost; consider a shell-only fallback for `mode` lookup. |
| A5 | Parity tests can be authored deterministically — same input fixture produces same output set ≥85% across runs. | Q7 | LLMs are nondeterministic; parity may fail spuriously. Mitigation: severity-bucketed key matching (not exact-string) is more robust than string equality; design already specifies this. |
| A6 | The merged planner (synth + planning + RED-step emission) stays under context-budget. | Q6 | If merged planner exceeds typical context budgets (especially when also reading large research files), runs fail. Mitigation: Phase 6 Posture A trim explicitly targets this; design risk section calls out planner growth. |
| A7 | All three `--from-spec` consumers can share one parsed object structure without per-consumer divergence in field requirements. | Q8 | If discuss-phase needs fields the other two don't (or vice versa), single-module parsing creates a fat structure. Mitigation: SpecDoc is a superset; consumers ignore fields they don't need. |
| A8 | The `_shared/` directory naming and placement under `~/.claude/get-shit-done/agents/_shared/` is consistent with installer conventions. | Q1 | If installer doesn't copy `_shared/` correctly, all critics fail to load base. Mitigation: explicit `install-manifest.json` entry. |

---

## Open questions

1. **Does the `@` reference work inside agent prompts (not just CLAUDE.md)?**
   - What we know: Documented for CLAUDE.md and command files. GSD already uses `@$HOME/.claude/.../mandatory-initial-read.md` pattern in command files.
   - What's unclear: Whether agents (which run in fresh contexts spawned via Task) honor `@` references at prompt-load time, or whether they treat `@filepath` as literal text.
   - Recommendation: Phase 2 commit 0 spike — write a 5-line test critic that just `@`-references a fixture file and reports whether content was injected. Block Phase 2 progress on result.

2. **What's the actual rate-limit profile for 6-parallel `Task` calls?**
   - What we know: Anthropic publishes tier-based limits; GSD already does 4-parallel research without observed issues.
   - What's unclear: Whether 6-way is fine on the user's tier; whether the model itself decides to serialize when it perceives load.
   - Recommendation: Phase 2 live test (`critic-batch-walltime.test.cjs`) measures actual wall-clock; if it's >max(critic) by significant margin, investigate.

3. **Does plan-checker need access to the spec doc (Q8) for `--from-spec` flows, or is the planner-emitted PLAN.md sufficient?**
   - What we know: Plan-checker today reads PLAN.md + CONTEXT.md + REQUIREMENTS.md.
   - What's unclear: Whether plan-checker should also see the spec to validate that `## Must-haves` are reflected in tasks.
   - Recommendation: Initially, no — plan-checker validates against requirements which are already seeded from spec. If parity tests show plan-checker missing spec-driven requirements, escalate.

4. **Should the SP brainstorming addendum recommend specific GSD commands by name in its template, or describe the recommendation logic for the assistant to render at runtime?**
   - What we know: Design spec gives the recommendation logic table.
   - What's unclear: Whether the addendum should show the table to the brainstorming skill or trust the skill to derive recommendations from the situation.
   - Recommendation: Embed the table in the addendum verbatim. Reduces interpretation overhead.

---

## Confidence breakdown

| Area | Confidence | Reason |
|---|---|---|
| Shared base prompt mechanism (Q1) | HIGH | Multiple sources verify `@` syntax; GSD already uses it; Anthropic documents it |
| Parallel critic invocation (Q2) | HIGH | Anthropic-documented split-and-merge; GSD already does 4-way; pattern is established |
| Spec-reader contract (Q3) | MEDIUM-HIGH | OpenSpec/SpecKit precedent for strict-headings approach; module placement matches GSD `lib/*.cjs` pattern |
| SP addendum via CLAUDE.md (Q4) | HIGH | Anthropic-documented; project explicitly rejects forking; CLAUDE.md is the platform extension point |
| Pre-commit hook config (Q5) | HIGH | Standard git hook pattern; design already specifies the modes; per-invocation read is the defensive default |
| Agent merge (Q6) | MEDIUM | Inline-vs-compositional is a judgment call; recommendation aligns with cull goal; risk (planner growth) acknowledged |
| Phased rollout (Q7) | MEDIUM | Tag-per-phase pattern is standard release engineering; mapping onto GSD's per-task atomic commits is novel |
| `--from-spec` boundaries (Q8) | HIGH | Strict orchestrator-agent layering already established; spec-reader-as-lib matches existing pattern |

---

*Architecture research: 2026-04-28*
*Update if upstream Claude Code platform behaviors (Task parallelism, `@` resolution) change materially.*
