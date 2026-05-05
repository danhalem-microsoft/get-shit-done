# Research Summary — GSD Slim + SP Integration + TDD Hardening

**Project:** gsd-slim-and-integrate
**Domain:** AI agent orchestration / meta-prompting refactor (brownfield)
**Researched:** 2026-04-29
**Confidence:** MEDIUM-HIGH overall (HIGH on documented Claude Code platform behaviors and existing-repo-pattern alignment; MEDIUM on novel cross-system patterns and parity-threshold calibration)

## Executive Summary

The 2026 AI dev-tool ecosystem has converged on patterns that validate the project's design choices. **GSD's existing 93-command surface is an outlier in both directions** — neither single-verb-catalog (Aider, SpecKit) nor mode-collapsed (Cline, Roo Code). The cull to ~37 commands lands GSD in the well-designed Aider band; the rest of the design (three-layer TDD enforcement, parallel critic batches, `--from-spec` handoff with gap-skipping discuss-phase) is on-pattern with where the field is going, with one or two genuinely novel pieces.

**Three findings reshape the roadmap before Phase 1 work begins:**

1. **Phase 1 needs a Wave 0** that builds parity infrastructure (`runAgentParity` helper + baseline corpus + orphan-reference grep test) **before any cull or refactor commits**. Without a recorded baseline, post-cull behavior is unrecoverable for parity comparison; without the orphan-reference test, the cull's reference rot becomes a runtime bug instead of a static one. This is the single biggest course-correction the research surfaced.

2. **A Phase 2 spike must come first** to verify Claude Code's `@$HOME/...` import syntax works inside agent prompts (not just CLAUDE.md and command files). The shared-base-prompt design depends on it. A 5-line fixture test in Phase 2 commit 0 settles this; if `@` doesn't resolve in agent context, the architecture changes (likely to install-time inlining via `bin/install.js`).

3. **Parallel-Task fan-out has a documented platform bug** ([anthropics/claude-code#29181, #7406](https://github.com/anthropics/claude-code/issues/29181)) where the parent context can hallucinate parallel results. **Mitigation must be designed in:** every critic writes its `CRITIQUE.md` to disk; the orchestrator reads from disk and aggregates via `gsd-tools.cjs critic-aggregate`, **not** from the parent's text summary of "what the critics said." Walltime tests must verify timestamp-delta of Task spawns < 2s, not just total elapsed.

The recommended approach is the design as written, with these three additions, and the phase ordering (1 → 2 → 3 → 4 → 5 → 6) reinforced by both architectural-dependency analysis (Phase 2 establishes the parallel pattern Phase 3 reuses; Phase 3's planner change must precede Phase 4's planner-touching TDD additions) and risk-staging concerns (TDD higher-risk; ship while attention is high).

## Key Findings

### What the field tells you

**Surface area.** Peer tools cluster at two ends: terminal-native single-verb catalogs (Aider ~30 slash commands) or mode-driven UIs (Cline 5 modes, Roo Code 5 modes, Goose recipes). Tools shipping 50+ commands are universally regarded as overweight — users default to a small subset and ignore the rest. The cull target of ~37 with subcommand consolidation (`/gsd-review --code|--security|...`, `/gsd-phase add|insert|remove`) gives Aider-level discoverability at half the catalog size — a clean differentiator. Source: [GitHub spec-kit](https://github.com/github/spec-kit), [Aider docs](https://aider.chat/), [Roo Code modes](https://docs.roocode.com/basic-usage/using-modes), [cognitive load research — Verbat](https://www.verbat.com/blog/cognitive-load-in-developer-experience-the-hidden-kpi/).

**Brainstorm-to-execution handoff.** File-artifact handoff dominates: SpecKit's `spec.md`, OpenSpec's `proposal/` folder, SP's design docs, and now GSD's `--from-spec`. Strict-required-headings + loose-content-shape is the convergent contract (OpenSpec uses `#### Scenario:` discipline; SpecKit templates `spec.md`). Where GSD genuinely innovates: **gap-skipping discuss-phase** — no peer tool reads a spec and skips already-answered questions. SpecKit's `/clarify` re-asks; OpenSpec's `apply` doesn't dialogue at all. Source: [OpenSpec workflows](https://openspec.dev/), [SpecKit reference](https://github.github.io/spec-kit/reference/workflows.html).

**TDD enforcement.** The 2026 trend is unambiguously toward **multi-layer enforcement** ([Simon Willison's red/green pattern](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/), [alexop.dev's skills+hooks workflow](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/), [coding-is-like-cooking 2026 state](https://coding-is-like-cooking.info/2026/03/test-driven-development-with-agentic-ai/), [Beyond Prompts: Git Hooks for AI agents](https://dev.to/98lenvi/beyond-prompts-how-git-hooks-steer-ai-coding-agents-in-production-4pf9)). Anthropic's Agentic Coding Trends 2026 (cited in Beyond Prompts): *"Instructions alone aren't enough — AI agents follow them most of the time, but not always."* Hooks convert "soft compliance" into "hard rejection." But **no peer tool ships all three layers** (prompt + structural plan-checker + pre-commit hook). Layered enforcement with explicit anti-mock/anti-skip rules is GSD's strongest competitive differentiator.

**Critics.** Production multi-agent systems mostly ship 2-agent Builder/Critic loops ([asdlc adversarial-review](https://asdlc.io/patterns/adversarial-code-review/), [alecnielsen/adversarial-review](https://github.com/alecnielsen/adversarial-review)). 6 lens-specialized critics is at the high end of the field but justifiable in a parallel batch. The risk is finding-overlap: if `critic-plan` and `critic-strategy` flag the same issue 70% of the time, the 6th critic is wasteful. **Phase 7 measurement must explicitly check finding-overlap empirically** before committing to "keep all 6" long-term. Source: [Multi-Agent in Production 2026 — Medium](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1).

**Speed.** Three optimizations dominate slim-tool design: (1) parallel sub-agents on orthogonal work, (2) prompt caching of shared base prompts (Anthropic auto-caches the prefix; cache reads cost 0.1× base input tokens), (3) lean per-agent prompts. The shared critic-base + lens-addendum architecture isn't just smaller — it's **cacheable**. The cache TTL changed from 60min to 5min in 2026, so the win is biggest for interactive use; for batch/CI the gain is neutral or slight. Source: [Anthropic prompt caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching), [Plandex caching pattern](https://github.com/plandex-ai/plandex).

### Recommended architectural patterns

The architecture research locked in eight specific recommendations the planner needs to honor. Confidence ranges from HIGH (verified against Anthropic docs and existing GSD patterns) to MEDIUM (judgment calls aligned with project goals).

**Shared base prompts** — use Claude Code's `@$HOME/.claude/get-shit-done/agents/_shared/critic-base.md` reference syntax (already used elsewhere in GSD). Each critic shrinks to a 50–80-line lens addendum loading the ~200-line shared base. Subject to the **Phase 2 commit 0 spike** verifying `@` resolves inside agent prompts (the documentation only covers CLAUDE.md and command files). Confidence: HIGH on the pattern; the spike resolves the open question.

**Parallel critic fan-out** — single-message multi-`Task` from the orchestrator with explicit JSON-aggregating gather step before routing to next stage. **Mitigation for known platform bug:** read each critic's CRITIQUE.md from disk after the batch returns; aggregate via `gsd-tools.cjs critic-aggregate`, not parent context. **Error policy:** skip-and-continue on 1-of-N failure; abort only if all critics fail. **Walltime test:** verify timestamp delta of Task spawns < 2s and total wall-clock ≈ max(critics), not sum. Confidence: HIGH on pattern, MEDIUM on platform-bug mitigation specifics.

**Spec-reader contract** — single `get-shit-done/bin/lib/spec-reader.cjs` module (matches existing `lib/*.cjs` pattern), strict required-section names + loose content-shape, hybrid prompt injection (orchestrator passes parsed summary AND raw file ref to agents). Required sections: `## Scope summary`, `## Success criteria`, `## Must-haves`, `## Recommended next step`. Optional: `## Phase breakdown`, `## Technical risks`, `## Dependencies`. Confidence: HIGH on module placement, MEDIUM-HIGH on hybrid injection.

**SP brainstorming addendum** — project-root `CLAUDE.md` `@`-imports `.planning/SP-BRAINSTORM-ADDENDUM.md`. Not a fork, not a sibling skill. CLAUDE.md is Anthropic's documented extension point, auto-loads at session start. The addendum's mere presence (only in repos with `.planning/`) is the conditional activation; no detection logic needed. Mitigation for CLAUDE.md weight: import the addendum file rather than inline. Confidence: HIGH.

**Pre-commit hook config** — `.planning/settings.json` `tdd_gate: { mode, source_roots, test_globs, ignore_globs, internal_module_patterns }`. Hook reads JSON every invocation (no caching — single source of truth). Three modes: `strict`, `warn`, `off`. Default `strict` for fresh installs, `warn` for retrofits (detected by `.planning/` existing without `tdd_gate` key). `ignore_globs` lives in the same JSON, not in `.gitignore` — gate-specific concerns shouldn't pollute git config. Confidence: HIGH.

**Agent merge** — inline merge: copy `gsd-research-synthesizer.md` content into `gsd-planner.md` with a `<synthesis-step>` anchor, delete synthesizer file. Compositional doesn't separate cognitive jobs and doesn't reduce file count, defeating the cull. Risk: planner growth past context budget — mitigated by Phase 6 Posture A trim, with Posture B for the planner specifically pre-authorized in the design's risk section. Confidence: MEDIUM-HIGH (judgment call aligned with cull goal).

**Phased rollout** — per-phase commit ranges with a tag at the end of each phase, gated by parity tests. Tag naming: `gsd-slim-phase-N-<name>`. Within-phase failures revert per task; phase-exit failures keep the phase un-tagged. Matches existing `/gsd:complete-milestone` tag pattern. Confidence: MEDIUM (standard release engineering on top of GSD's per-task atomic commits).

**`--from-spec` consumer boundaries** — orchestrators (workflows) parse the spec via `spec-reader.cjs` and inject parsed summary + raw file ref into agent prompts. **Agents do not call spec-reader directly** — keeps GSD's strict orchestrator-agent layering intact. Three orchestrators (`new-milestone.md`, `phase.md add`, `discuss-phase.md`) all consume the same module. Confidence: HIGH.

### Recommended testing strategy

The testing research prescribes **five test layers, one purpose each**: static structural (`tests/`), static hook fixtures, integration fast (no API), integration parity/single-command (real API), integration enormous (lifecycle).

**Parity infrastructure must land in Phase 1 wave 0** — `runAgentParity` helper in `integration/helpers/agent-parity.cjs` + baseline corpus in `integration/test-fixtures/baselines/<agent>/<fixture-id>.json`. Without recorded baselines, refactor work runs against fresh re-runs (post-refactor vs post-refactor) and misses drift entirely. The discipline: baselines are recorded **once** before any refactor, committed in their own commit titled `chore: capture pre-refactor agent baselines for parity testing`, and become the contract.

**Three parity-measure schemas, one per refactor pattern**:

| Refactor pattern | Phase | Parity measure |
|---|---|---|
| Critic shared-base extraction | 2 | `kind: 'critic-findings'`, threshold ≥85% finding overlap by severity-bucketed key (`severity:category:lane`), `noMissingCritical: true` (hard fail if any critical baseline finding absent) |
| Planner with merged synthesis | 3 | `kind: 'plan-structural'`, task-count tolerance ±10%, `requireMustHaveCoverage: 'set-equality'`, `dependencyGraphCheck: 'isomorphic-by-content'`, `redStepRequired: true` |
| Light-trim spine agents | 6 | `kind: 'schema-conformance'`, expected sections + frontmatter keys + smoke LLM-as-judge backstop with `maxBudget: 0.5` |

**Anti-pattern to avoid:** trying to use one parity measure for all three. Critics emit findings (a list); planner emits structured docs; trimmed agents emit varied artifacts. A single measure is either too loose or too tight.

**Hook tests use synthetic staged-diff fixtures, not real `git commit`**. The `hooks/tdd-gate.sh` accepts a test-mode `--staged-diff <file>` flag; tests pass fixture files containing the exact output of `git diff --cached --name-status`. This makes hook tests deterministic, fast (~100ms each), and matches the existing `tests/hook-validation.test.cjs` philosophy.

**Three TDD layers tested in isolation, then once composed.** Each layer has its own static + live tests; one composed test exercises all three. **Anti-pattern call-out:** layers re-checking each other's invariants causes over-blocking; delete duplication rather than coordinate. If a layer's test reveals it's checking something another layer also checks, that's a sign to remove the duplication, not to write more coordination logic.

**Walltime ledger** at `integration/test-fixtures/walltime-ledger.jsonl` records `duration_ms` (already returned by `runClaudeWithTools`) per live test, per phase. Trend regression test (`tests/walltime-trend.test.cjs`) flags any test that's gotten >50% slower over the last 5 entries (soft alert, not a hard fail — variance in API latency makes strict thresholds flake).

**Lifecycle test step-decomposition.** `gsd-lifecycle.test.cjs` (currently 460 lines, runs the full pipeline) gets refactored into per-step files at `integration/lifecycle-steps/step-N-<name>.cjs` with a thin composer in the original. Plus `integration/test-fixtures/lifecycle-shapes/*.json` capturing pipeline shape (not outputs). Per-phase updates become JSON edits + per-step file changes, not 460-line diffs. **This refactor itself should land early in Phase 1**, not deferred to Phase 5 alongside SP integration changes.

**Test-tag taxonomy** extends existing `integration/BUILD.bazel` cleanly. Six new phase tags (`phase-1-cull` through `phase-6-trim`) plus role tags (`parity`, `tdd-layer-1` through `tdd-layer-3`, `tdd-composition`, `sp-integration`) enable per-phase CI scoping. Per-phase exit criteria run only that phase's tagged tests; full suite at PR merge and nightly.

**Coverage targets per phase exit:** all static tests in `tests/` pass (existing `npm test`), all Bazel tests with `phase-N` tag pass, lifecycle test passes when its current shape matches the post-phase pipeline, walltime ledger entries recorded for all live tests run in that phase.

### Critical Pitfalls

The pitfalls research surfaced 33 named pitfalls across 10 categories. The five that most directly reshape the roadmap:

1. **Reference rot during the cull (Phase 1)** is the dominant Phase-1 risk. A simple grep is insufficient: scan **6 syntactic contexts** (`@-references`, slash-command mentions, `install-manifest.json`, workflow markdown, test fixtures, frontmatter) across **3 directory roots** (`agents/`, `commands/`, `tests/integration/fixtures/`). **Build the orphan-reference test before deleting anything** — Wave 0 of Phase 1. Pre-commit hook performance budget depends on commit size; cull commits will be 50+ files. *Confidence: HIGH.*

2. **Three-layer TDD has a temporal-sequence gap.** No single layer catches the case where an agent writes test+implementation simultaneously and passes all three layers (test exists; plan structure had a RED step; hook sees both source and test in the same commit). **Layer 1 must require evidence-of-RED — a captured failure message in the task log.** Plan-checker validates the evidence is in the plan; hook checks final state. Build a layer × rationalization-pattern matrix in Phase 4 design, not just test. Reference: [obra/superpowers#384](https://github.com/obra/superpowers/issues/384) documents specific rationalization patterns. *Confidence: HIGH.*

3. **Parity tests at 85% threshold are at the noise floor of LLM nondeterminism.** Single-shot pass at 85% is meaningless. Required mitigations: **N=5 median per parity run** (run each parity test 5 times, take the median), **severity-stratified** thresholds (≥100% on critical, ≥85% on medium, looser on minor), **shape-aware comparison** (schema conformance separate from content overlap). Source: [Defeating Nondeterminism in LLM Inference — Thinking Machines](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/). *Confidence: HIGH.*

4. **Pre-commit hook false-positive risk is high during the cull phase** (50+ file refactor commits). Required mitigations: **diff-only scan** (not full file scan); perf budget < 2s; explicit carve-outs for refactors / tests-only / generated-code; **30-day auto-sunset for warn mode** (warn mode that becomes permanent technical debt is the canonical pre-commit anti-pattern, [pre-commit#1690](https://github.com/pre-commit/pre-commit/issues/1690)). Without sunset, retrofitted repos sit in `warn` indefinitely and TDD discipline never actually lands. *Confidence: HIGH.*

5. **Planner cognitive-load risk after Phase 3 merge.** ~1,250-line planner + ~200 lines from synthesizer = ~1,450 lines. [Chroma's context-rot research](https://www.trychroma.com/research/context-rot) shows the degradation knee at 147–152K tokens of input; a 1,450-line planner approaches the band where plan quality drops measurably. **Token-headroom calculation must be a Phase 3 exit criterion.** If merged planner crosses 100K input total in realistic runs, escalate to Posture B for the planner specifically (pre-authorized in the design's risk section) — don't wait for Phase 6. *Confidence: HIGH.*

**Six more high-confidence pitfalls** that the roadmap must address:

- **SP integration introduces three asymmetries**: spec format drift (SP plugin auto-updates), `.planning/` detection brittleness (single-signal too coarse — recommend multi-signal: `.planning/` + `config.json` present + at least one user dir), and spec provenance loss (no SHA recorded at consumption — `.planning/SPEC-CONSUMED.json` should record the git SHA of each `--from-spec` invocation).
- **Walltime "claims parallel, executes serial" bug** ([anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406)) — Phase 2 walltime test must verify timestamp delta of Task spawns < 2s, not just total elapsed.
- **Base becomes a "god prompt" that everyone keeps adding to** — bake a hard line budget into `tests/critic-line-budget.test.cjs`: base ≤ 250 lines, each addendum ≤ 100 lines, sum ≤ 700.
- **Hidden duplication between base and lens addendums** — generate a side-by-side diff of all 6 critic prompts BEFORE extraction; resolve "structurally similar with different wording" cases consciously, not by accident.
- **Catastrophic vs graceful degradation when an agent is missing** — add positive log assertions to lifecycle test (each orchestrator step records spawned agent's name + output fingerprint). Silent fallback can pass exit-0 while producing wrong artifacts.
- **Consolidation hides functionality the user actually used** — keep deprecation **stub commands** for at least one milestone after Phase 1 (`/gsd-secure-phase` exists and prints "consolidated into `/gsd-review --security`. Running for you now..." then dispatches). Cost: near-zero. Benefit: preserves user-facing contract.

## Implications for Roadmap

The research reinforces the design spec's six-phase ordering with three **mandatory additions** before Phase 1 work begins:

### Phase 1 — Cull, with Wave 0 additions

**Rationale:** The cull is foundational; everything else edits files that may not exist post-cull. But the cull cannot proceed safely without parity infrastructure and orphan-reference enforcement *first*.

**Delivers:** ~37 surviving commands, ~22 surviving agents (synthesizer alive), consolidated `/gsd-review` and `/gsd-phase`, post-cull spine smoke test passing.

**Wave 0 additions (research-mandated):**
- **Build orphan-reference grep test BEFORE any deletion.** Pattern: `grep -rE '\b(<every-deleted-name>)\b' commands/ agents/ get-shit-done/workflows/ get-shit-done/templates/ tests/ integration/ docs/` excluding deletion-list entries. Test fails loudly while deletions are still local.
- **Build `runAgentParity(agentName, fixtureInput, schema, opts)` helper in `integration/helpers/agent-parity.cjs`.** Mirrors `runClaudeWithTools` signature; supports three schema kinds (`critic-findings`, `plan-structural`, `schema-conformance`).
- **Capture pre-refactor agent baselines** for every agent that will be refactored (6 critics, planner, every spine agent that Phase 6 will trim) against fixture inputs. Commit titled `chore: capture pre-refactor agent baselines for parity testing`.
- **Decompose `gsd-lifecycle.test.cjs` into `integration/lifecycle-steps/step-N-*.cjs` with thin composer.** Don't defer this to Phase 5; do it once, here, while updating the lifecycle for post-cull anyway.
- **Add deprecation stub commands** for the 6 consolidated commands (e.g., `/gsd-secure-phase` dispatches to `/gsd-review --security`). At least one milestone of stub lifetime.

**Avoids:** Reference rot (Pitfall 1.1, 1.2), silent agent-not-found degradation (Pitfall 1.3), consolidation hides functionality (Pitfall 1.4), parity-baseline unrecoverability (testing research Section 1).

**Exit criteria additions beyond design spec:**
- Orphan-reference test passes with deletion-list as data fixture
- Baseline corpus committed and `runAgentParity` helper in place
- Lifecycle test step-decomposed and passing under new structure
- Stub commands respond + dispatch correctly

### Phase 2 — Critic refactor, with commit-0 spike

**Rationale:** Independent quick win; establishes the parallel-Task pattern Phase 3 reuses.

**Delivers:** `agents/_shared/critic-base.md` (~200 lines) + 6 critic lens addendums (50–80 lines each) + parallel critic batch invocation in `/gsd-review --critique`. Critic line-count drops 1,731 → ~600.

**Commit-0 spike (research-mandated):**
- **5-line fixture critic + fixture base file** to verify Claude Code's `@$HOME/...` reference resolves inside agent prompts (not just CLAUDE.md and command files). Block Phase 2 progress on result. If `@` doesn't resolve in agent context, fall back to install-time inlining via `bin/install.js` template-marker expansion (used elsewhere in GSD per INTEGRATIONS.md).

**Pre-extraction step (research-mandated):**
- **Generate side-by-side diff of all 6 critic prompts** before any extraction. Three-category resolution: identical → base verbatim; structurally-similar-with-different-wording → resolve consciously (annotate in base with `<!-- standardized 2026-04 from N variants -->`); lens-specific → stays in addendum.
- **Static test `tests/critic-no-base-shadowing.test.cjs`** — addendums cannot re-state base headings/keywords. Forces conscious override.
- **Hard line budget:** `tests/critic-line-budget.test.cjs` asserts base ≤ 250 lines, each addendum ≤ 100 lines, sum ≤ 700.

**Walltime test additions:**
- Verify **timestamp delta of Task spawns < 2s** (not just total wall-clock < threshold). Catches the [#7406 "claims parallel, executes serial" bug](https://github.com/anthropics/claude-code/issues/7406).
- Inject 1-of-N failure to verify skip-and-continue policy works (one critic deliberately misconfigured; aggregate completes with 5/6).

**Avoids:** Hidden duplication after extraction (Pitfall 2.1), god-prompt growth (Pitfall 2.2), parallel-claim hallucination bug ([#29181](https://github.com/anthropics/claude-code/issues/29181)).

### Phase 3 — Plan-phase chain merge, with token-headroom gate

**Rationale:** Establishes parallel pattern-mapper + phase-researcher; merges synthesizer into planner. Must precede Phase 4 because TDD layer 1 also modifies the planner — doing TDD first means re-merging.

**Delivers:** Synthesizer file deleted, planner contains merged synthesis section under `<synthesis-step>` anchor, plan-phase has 1 fewer agent and 1 fewer hop.

**Exit criteria addition (research-mandated):**
- **Token-headroom calculation** of the merged planner under realistic input. If total prompt + research files + CONTEXT.md exceeds 100K tokens in the test corpus, **escalate to Posture B for the planner specifically** in the same phase rather than waiting for Phase 6. The design's risk section already pre-authorizes this.

**Avoids:** Planner cognitive-load knee (Pitfall 3.1, [Chroma context-rot](https://www.trychroma.com/research/context-rot)).

### Phase 4 — TDD hardening, with three-additions

**Rationale:** Three independent layers; modifies executor + planner + plan-checker + new hook script. Higher-risk than Phase 5 — ship while attention is high.

**Delivers:** Layer 1 (executor invokes SP TDD skill + `<gsd-tdd-rules>` anti-mock/anti-skip section; planner emits "RED test first" sub-step), Layer 2 (plan-checker `TDD-STRUCTURE` rule), Layer 3 (`hooks/tdd-gate.sh` + `.planning/settings.json` config).

**Research-mandated additions:**
- **Layer × rationalization-pattern matrix** as part of Phase 4 design (not just test). Identifies cases each layer catches and the temporal-sequence gap (test+impl simultaneous) that requires Layer 1 to capture evidence-of-RED in the task log.
- **30-day auto-sunset for warn mode**, per [pre-commit#1690](https://github.com/pre-commit/pre-commit/issues/1690). Hook prints "warn mode expires in N days" reminder after each commit; on day 30, hook switches to strict (or to off if user explicitly chose). Prevents warn-mode-becomes-permanent anti-pattern.
- **CI-mirror of the hook** to cover edge cases (`git commit --amend`, web-UI commits via GitHub) where local pre-commit hooks don't fire. Lightweight: GitHub Actions step that runs the hook against PR diffs.
- Diff-only scan (not full-file scan); perf budget < 2s; explicit carve-outs for refactors, tests-only, generated-code globs.

**Avoids:** Three-layer temporal-sequence gap (Pitfall 4.X), warn-mode-becomes-permanent (Pitfall 6.X), false positives during cull (Pitfall 6.Y).

### Phase 5 — SP integration, with multi-signal detection

**Rationale:** Largely independent of Phase 4; touches `discuss-phase`, `roadmapper`, planner orchestration but not the test harness.

**Delivers:** `lib/spec-reader.cjs` module + `--from-spec` flag on three commands + project-local SP brainstorming addendum + spec-driven gap-skipping in discuss-phase.

**Research-mandated additions:**
- **Multi-signal `.planning/` detection** for addendum activation: `.planning/` exists AND `config.json` present AND at least one user directory. Prevents false-positives in repos that happen to have a `.planning/` directory for unrelated reasons.
- **Spec git-SHA recording at consumption** (`.planning/SPEC-CONSUMED.json` with `{ path, sha, consumed_at, command }`). Enables provenance audit and detects spec drift.
- **Lenient section-name reader with alias map** (`Scope summary` / `Scope` / `Summary` map to same field) so brainstorm-side wording variation doesn't break ingestion.
- **Nightly contract test against live SP brainstorming skill** to detect spec format drift in the upstream skill before users hit it.

**Avoids:** SP integration's three asymmetries (spec format drift, detection brittleness, provenance loss) per pitfalls research.

### Phase 6 — Light agent prompt trim (Posture A)

**Rationale:** Polish on agents in their final structural form. Trim before merges = wasted work.

**Delivers:** Each surviving spine agent ≥10% smaller; `agents/_shared/agent-conventions.md` extracted; behavior parity verified per agent.

**Research-mandated additions:**
- **Parity tests use N=5 median, severity-stratified thresholds, shape-aware comparison** (per testing research Section 1). Single-shot pass at 85% is meaningless.
- **Per-agent baseline comparison against the Phase 1 wave 0 captures.** Trim is verified against the *original* baseline, not against post-Phase-2/3/4/5 baselines (those have already drifted intentionally for non-trim reasons).

### Phase 7 (deferred per design) — Measure & decide

The research reinforces the deferred items already in the design:

- **Critic finding-overlap empirical measurement** is the key Phase 7 question. If `critic-plan` and `critic-strategy` overlap >50%, consider consolidating. Both the features research and the pitfalls research flag this as the central assumption justifying "keep all 6."
- **Hook false-positive rate on real workflows** — the carve-outs address known cases, but real-world false-positive rate is untested. Phase 4 should instrument this; Phase 7 reviews the data.
- **Posture A trim per-agent reduction ceiling** — actual yield may vary by agent. Dependence between trim and prompt-caching benefits should be measured together.

## Open Questions Carried Forward

These four questions are flagged as roadmap-time decisions that research could not fully resolve:

1. **Does `@$HOME/...` reference work inside agent prompts?** *Resolution: Phase 2 commit 0 spike. Block Phase 2 progress on result.*
2. **6-parallel `Task` rate-limit profile.** *Resolution: Phase 2 walltime test measures actual; if it's >max(critic) by significant margin, investigate.*
3. **What runtime(s) does GSD deploy to in user repos?** Cross-runtime agent-not-found behavior varies (Claude Code, OpenCode, Gemini CLI, Codex). If only Claude Code is in scope, simpler; if multi-runtime, each needs smoke testing. *Resolution: planner-time decision based on actual deployment surface.*
4. **Severity-bucketed parity key formula** — `(file, line, severity)` vs `(file, finding-text-hash, severity)` matters for noise floor. *Resolution: Phase 2 wave 0 calibration with actual baseline data.*

## Confidence Summary

| Area | Confidence | Reason |
|---|---|---|
| Cull / reference rot mitigation | HIGH | Documented monorepo dead-code-removal problem; existing tooling and patterns well-understood |
| Critic shared-base architecture | MEDIUM-HIGH | `@` reference syntax verified for CLAUDE.md and commands; agent-context resolution requires Phase 2 spike to confirm |
| Parallel critic invocation pattern | HIGH | Anthropic-documented split-and-merge; GSD already 4-way parallel; known bug mitigation specified |
| Planner merge cognitive-load risk | HIGH | Direct LLM research (Chroma context-rot, arXiv 2509.19517) on degradation curves |
| TDD enforcement layered design | HIGH | Multiple independent 2026 sources converge on multi-layer enforcement; obra/superpowers documents specific rationalization patterns |
| Pre-commit hook patterns | HIGH | Mature ecosystem with extensive issue history; standard configurable-severity pattern |
| SP integration / addendum via CLAUDE.md | MEDIUM-HIGH | Anthropic-documented extension point; SP ecosystem newer; nightly contract test needed |
| Behavior-parity testing methodology | HIGH (mechanism) / MEDIUM (thresholds) | LLM nondeterminism research is extensive; thresholds are project policy |
| Phased rollout backwards-compat | HIGH | Standard CLI deprecation patterns; per-task atomic commits already match |
| File-artifact handoff dominance | HIGH | SpecKit, OpenSpec, SP, GSD all use this pattern; verified in primary docs |

**Overall confidence: MEDIUM-HIGH.** The design as written is well-aligned with field best practices. The three Wave-0 additions to Phase 1 (orphan-reference test, parity infrastructure, lifecycle step decomposition) plus the Phase 2 commit-0 spike (`@`-reference resolution in agent context) are mandatory before refactor work begins. With those, the project ships a uniquely-positioned tool: subcommand consolidation + multi-layer TDD enforcement + parallel lens-critics + brainstorm-to-execution conditional bridge + multi-user monorepo, in a single combination no peer tool ships today.

---

**Research date:** 2026-04-29
**Source files:** `research/PITFALLS.md`, `research/TESTING.md`, `research/ARCHITECTURE.md`, `research/FEATURES.md`
**Sources cited above** are listed in full in each individual research file.
