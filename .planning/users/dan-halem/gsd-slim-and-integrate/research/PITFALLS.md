# Pitfalls Research — GSD Slim + SP Integration + TDD Hardening

**Domain:** Brownfield refactor of an AI agent orchestration / meta-prompting system (GSD)
**Researched:** 2026-04-28
**Overall confidence:** HIGH on documented LLM-system failure modes (Anthropic docs, GitHub issues, Chroma/arXiv research); MEDIUM on prompt-base extraction and parity testing thresholds (industry experience reports rather than controlled studies); HIGH on pre-commit hook patterns (mature ecosystem); MEDIUM on Superpowers integration specifics (newer ecosystem, documentation evolving).

---

## Scope and Reading Guide

This document is organized around the **10 categories from the research brief** rather than the generic critical/moderate/minor template, because each category corresponds to a specific decision the planner has to make in one or more phases. Each category contains one or more named pitfalls with:

- **What goes wrong** (failure mode)
- **Why it happens** (root cause for *this* system)
- **Warning signs** (early-detection signal)
- **Prevention** (actionable, GSD-specific)
- **Phase to address** (Phase 1 cull / Phase 2 critic refactor / Phase 3 plan-phase merge / Phase 4 TDD / Phase 5 SP integration / Phase 6 agent trim)
- **Confidence** (HIGH / MEDIUM / LOW)

The "Phase-Specific Warnings" matrix at the bottom is the consolidated view for roadmap-readers who want one-shot guidance per phase.

---

## 1. Culling and Consolidating a Large Prompt-Engineered System

### Pitfall 1.1 — Reference rot in surviving prompts

**What goes wrong:** Surviving agent and command prompts retain hardcoded references (`/gsd-debug`, `gsd-nyquist-auditor`, `gsd-doc-writer`, etc.) to deleted commands and agents. The runtime tolerates the dangling reference until an orchestrator actually tries to spawn or invoke it, then fails late — sometimes mid-workflow, after a partial commit.

**Why it happens (this system specifically):** GSD has 39 agents and 93 commands cross-referencing each other through:
1. `@-references` in agent prompts (`<files_to_read>` blocks pointing at workflow paths or sibling agents)
2. Plain-text mentions in instruction sections ("then route to `/gsd-audit-uat`...")
3. `install-manifest.json` entries
4. Workflow markdown that calls `Task spawn gsd-X`
5. Test fixtures and integration test step strings
6. Commands' `allowed-tools` and `description` frontmatter fields

A single grep is insufficient because the same name appears in five different syntactic contexts, some of which look like comments, some like prose, some like literal command strings.

**Warning signs:** A surviving agent's prompt mentions a deleted name; the test `cull-no-orphan-references.test.cjs` (planned in Phase 1) fails after the cull commits; mid-workflow `Task spawn gsd-debugger` returns "agent not found"; CHANGELOG / README still lists deleted commands.

**Prevention:**
- Build the orphan-reference grep test **before** deleting anything (Wave 0 of Phase 1). The test should fail loudly while the deletions are still local. Pattern: `grep -rE '\b(gsd-debugger|gsd-nyquist-auditor|...|gsd-debug|gsd-audit-uat|...)\b' commands/ agents/ get-shit-done/workflows/ get-shit-done/templates/` excluding deletion-list entries themselves.
- Search **all six syntactic contexts** above, not just bare names. In particular include `@-references` (`@.../agents/gsd-X.md`) and slash-command mentions (`/gsd-X`).
- Run the grep against `tests/`, `integration/`, and `docs/` too — fixture files and READMEs rot just as badly.
- Commit each deletion-group atomically (one commit per cluster from the cull list, not one giant commit) so a single failed run can be bisected.
- Keep the deletion list checked into the test as data (`tests/fixtures/cull-deleted-list.json`) so the orphan-reference test stays accurate as more is removed.

**Confidence:** HIGH — this is a documented monorepo dead-code-removal problem. Tools like Knip / ts-prune for JS, deadmono for Go, and `git grep` for raw text exist precisely because reference rot is the recurring failure.

**Phase to address:** Phase 1 (cull). Build the test first, then delete.

---

### Pitfall 1.2 — Workflow files referencing removed agents/commands

**What goes wrong:** The orphan-reference grep covers prompts, but workflow files (`get-shit-done/workflows/*.md`) drive the actual orchestration. A `plan-phase.md` workflow that still says `Task spawn gsd-research-synthesizer` after Phase 3 deletes the synthesizer will fail at runtime, not at lint time.

**Why it happens:** Workflows are markdown with embedded bash and prompt fragments. A grep for "gsd-research-synthesizer" finds the agent file but misses contextual mentions in shell heredocs, bash variables, and conditional branches. Workflows also reference commands by **shape** (e.g., `if discuss-phase exists`) where the literal name appears only once.

**Warning signs:** Live integration test (`gsd-lifecycle.test.cjs`) fails at a stage that previously passed; an orchestrator step says "spawning X" but X doesn't exist; CHANGELOG mentions a removed command but help text doesn't.

**Prevention:**
- The orphan-reference test must include `get-shit-done/workflows/**/*.md` in its scan path.
- Phase 3 (the synthesizer merge) updates `plan-phase.md` workflow in the *same commit* that deletes the agent file. Atomic commits prevent intermediate broken states.
- Smoke-test the full spine after each phase exit (the design already requires `gsd-lifecycle.test.cjs` to pass).
- Maintain a Phase-by-phase "what workflow files does this touch?" checklist in each phase's PLAN.md so workflow updates don't fall through the cracks.

**Confidence:** HIGH — direct lesson from the GSD codebase structure and the Phase 3 design ("update plan-phase.md to fire pattern-mapper + phase-researcher in parallel; delete synthesizer").

**Phase to address:** Phase 1 (initial cull) and Phase 3 (synthesizer merge). Each phase that deletes an agent must update the workflow files that invoke it in the same commit.

---

### Pitfall 1.3 — Catastrophic vs graceful degradation when an agent is missing

**What goes wrong:** When Claude Code is asked to `Task spawn gsd-X` and `gsd-X.md` does not exist, behavior varies by runtime: some runtimes return an error to the orchestrator (recoverable); some silently fall back to no-op (silently broken); some hallucinate the agent's role from the name and proceed (worst case — produces plausible-looking but wrong output). The third mode is the one that erodes trust.

**Why it happens:** Claude Code's Task tool resolves agents by name lookup against the installed agent set. Behavior on miss is not formally specified across all runtimes (Claude Code, OpenCode, Gemini CLI, Codex). Issues like [obra/superpowers#237](https://github.com/obra/superpowers/issues/237) and the Claude Code parallel-spawn bug ([anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406)) show that runtime behavior diverges from documented behavior in real ways.

**Warning signs:** An orchestrator log says it spawned an agent that was deleted; the spawn returns suspiciously quickly (under 5 seconds for what should be a 30+ second agent); the orchestrator continues as if work happened; downstream artifacts look generic or mismatched.

**Prevention:**
- After cull, run `gsd-lifecycle.test.cjs` end-to-end and **inspect the log output**, not just the exit code. A silent fallback can pass exit-0 while producing wrong artifacts.
- Add a positive assertion: each orchestrator step records the spawned agent's name and fingerprint of returned output (first 200 chars). The assertion is "this hop happened" not "this hop returned 0."
- Where possible, have the orchestrator pre-check agent existence (`test -f agents/gsd-X.md`) before `Task spawn`. Fail loudly, not silently.
- Cross-runtime risk: GSD installs to multiple runtimes; a runtime-specific silent-fallback is worst on the runtime that is least tested. Phase 1 exit criteria should include a smoke test on at least one alternate runtime if any are supported in production use.

**Confidence:** MEDIUM — runtime behavior on agent-not-found is partially documented; the failure mode is well-known in agent orchestration in general but not formally specified for Claude Code's Task tool.

**Phase to address:** Phase 1 (positive log assertions in lifecycle test); revisit at every phase boundary that deletes or merges an agent.

---

### Pitfall 1.4 — Consolidation hides functionality the user actually used

**What goes wrong:** `/gsd-review` consolidates 6 quality-gate commands behind flags. `/gsd-phase` consolidates 3 phase-manipulation commands behind subcommands. Users (and the user's existing muscle memory) expect the old names; they type `/gsd-secure-phase`, get "command not found," and the discovery path to "use `/gsd-review --security`" is unclear.

**Why it happens:** The consolidation reduces surface area but increases per-command cognitive load (now you need to remember the flag matrix). For a user who used `/gsd-secure-phase` once a quarter, the relearning cost is real.

**Warning signs:** User runs an old command and gets "not found" — happens *after* phase 1 commits; help text doesn't surface the consolidation mapping clearly; CHANGELOG buried the rename; integration tests pass because they were updated, but real usage breaks.

**Prevention:**
- Keep deprecation **stub commands** for at least one milestone after Phase 1: `commands/gsd/secure-phase.md` exists and prints "This command was consolidated into `/gsd-review --security`. Running that for you now..." then dispatches. Costs near-zero and preserves the user-facing contract.
- Update `commands/gsd/help.md` in the same commit as each consolidation, with explicit migration table ("if you used X, now use Y").
- CHANGELOG entry for Phase 1 must include a "Migrating from old commands" section visible without scrolling.
- The user-facing migration cost is part of "compatibility" in the constraints — ship the migration table even if test infrastructure is silent on it.

**Confidence:** HIGH — this is a well-understood deprecation pattern, well-documented in CLI tool literature.

**Phase to address:** Phase 1 — add stub commands + help.md update + CHANGELOG migration table in the consolidation commits.

---

## 2. Extracting Shared Base Prompts from Similar Agents

### Pitfall 2.1 — Hidden duplication between base and lens addendums

**What goes wrong:** `agents/_shared/critic-base.md` extracts common framing (role, severity definitions, output schema, evidence rules). But each critic's lens addendum *re-states* a slightly different version of the severity rule because the original critic prompts had subtly different wording. Net: the same instruction appears twice with conflicting nuances; the LLM follows whichever is closer to the end of the prompt.

**Why it happens:** Six pre-existing critics drifted from each other over time. Any shared base extraction step has to choose between (a) flattening to the most common version (loses nuance) or (b) keeping per-critic variants in the addendum (defeats the point of the base). Without a structured diff before extraction, hidden duplication is the default.

**Warning signs:** Base + addendum total line count is less than expected (~200 + 6×80 = 680 vs. expected ~600) — duplication is hiding in addendums; or the parity test (≥85% finding overlap) shows individual critics drifting from baseline differently — likely because the base flattened a nuance one critic depended on.

**Prevention:**
- Before extraction, generate a **side-by-side diff** of all 6 critic prompts. Identify three categories: identical (move to base verbatim), structurally-similar-with-different-wording (resolve to one version, move to base), and lens-specific (stays in addendum).
- For category 2, write down the resolution decision in `agents/_shared/critic-base.md` as a comment (`<!-- Severity definitions standardized 2026-04 from 6 critic variants; previous wording for critic-plan was "blocking issue" -->`). Future drift gets caught in review.
- Add a static test `tests/critic-no-base-shadowing.test.cjs`: greps each addendum for headings/keywords that appear in the base; fails if an addendum re-states a base section. Forces conscious override.
- Ban "general framing" from addendums — addendums are **only** lens definitions and lens-specific calibration examples. Anything else is a base concern.

**Confidence:** MEDIUM — generic prompt-engineering literature warns about template drift and few-shot drift ([Lakera prompt engineering guide](https://www.lakera.ai/blog/prompt-engineering-guide), [arXiv 2504.02052](https://arxiv.org/html/2504.02052v2)), but the specific "hidden duplication after base extraction" failure is more inferred from software-engineering DRY violations than empirically studied for LLM prompts.

**Phase to address:** Phase 2 (critic refactor). Diff *before* extracting; test for shadowing.

---

### Pitfall 2.2 — Base becomes a "god prompt" that everyone keeps adding to

**What goes wrong:** Six months after Phase 2 ships, a new edge case ("critic should also check ASVS V8 logging") is added — and the easy place to put it is the base, because it might apply to multiple critics. Two years later, the base is 600 lines, every addendum is 200+ lines, and the original "200-line base + 80-line addendum" budget is gone.

**Why it happens:** A shared file has gravity. New requirements that *might* be cross-cutting get parked in the shared file because it's faster than thinking about which lenses they actually apply to. This is the classic "utils.js" anti-pattern in OO codebases, with the same root cause: the path of least resistance.

**Warning signs:** Base file grew >10% in a single PR; PR descriptions say "extracted to base for consistency" but the rule actually only applies to 1-2 lenses; addendums shrink because functionality migrated to base, not because they were genuinely simplified.

**Prevention:**
- Bake a hard line budget into Phase 2: `tests/critic-line-budget.test.cjs` asserts base ≤ 250 lines, each addendum ≤ 100 lines, sum ≤ 700. Failing test forces the architectural conversation.
- Document the rule of thumb in `agents/_shared/critic-base.md` itself: "A rule belongs in the base only if it applies to **all 6** critics. If it applies to 3-5, put it in those 3-5 addendums or create an `agents/_shared/critic-mixin-X.md`. If it applies to 1-2, it's a lens concern."
- Quarterly "is the base still right-sized?" review — track the base's line count over time as a leading indicator. Steady growth is a sign the rule of thumb is being violated.
- Composition (small mixin files referenced from a subset of addendums) is preferable to inheritance (everything in one base) for prompt systems where lenses are partial-overlap, not strict-inheritance ([prompt template patterns research](https://arxiv.org/html/2504.02052v2)).

**Confidence:** HIGH on the failure mode (well-documented in OO inheritance literature; transfers cleanly to prompt templates per [Latitude template syntax basics](https://latitude-blog.ghost.io/blog/template-syntax-basics-for-llm-prompts/)). MEDIUM on the specific 250-line budget — set it from the design's 200-line target with 25% slack.

**Phase to address:** Phase 2 (set the budget tests now); review at Phase 7 (deferred measurement).

---

### Pitfall 2.3 — Behavior drift from "inert framing" in the base

**What goes wrong:** The base wraps every critic in a shared role-framing paragraph ("You are a [lens] critic. Your job is..."). The wording sounds neutral, but in practice it shifts critic output: critics that previously emitted findings phrased as imperatives ("Add input validation here") now emit findings phrased as advisories ("Consider adding input validation"). The 85% finding-overlap parity test passes (same findings raised), but the *language* of findings changed enough to break downstream tooling that parsed severity from imperative voice.

**Why it happens:** LLMs are extremely sensitive to framing language. A neutral-sounding base prompt can shift output style across all critics simultaneously. Parity tests measuring *what* findings are raised miss shifts in *how* they are raised.

**Warning signs:** Severity-bucketed key overlap is ≥85% (parity test passes), but a downstream consumer (plan-checker, executor) starts behaving differently when fed critic output; spot-check of critic findings reveals voice/tone shift; finding count is similar but `critical` vs `high` distribution shifted.

**Prevention:**
- Parity test should compare not just finding identity but also the **first 200 chars of the finding text** — diff style at the prose level, not just the topic level.
- Manual spot-check of 20 random findings across the 6 critics is part of Phase 2 exit criteria, not just an automated suite.
- The base must explicitly include a "tone calibration" section that reproduces (verbatim) the imperative voice from the originals. Don't rely on LLM defaults.
- Resist the urge to "improve" wording during extraction. The job is to preserve behavior, not modernize prose. Improvement is a separate phase (deferred to Phase 7).

**Confidence:** HIGH — direct LLM nondeterminism research ([Thinking Machines on nondeterminism](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/), [Chroma context-rot](https://www.trychroma.com/research/context-rot)) shows tiny prompt changes have outsized output effects. The "neutral framing isn't neutral" lesson is well-documented in prompt engineering practice.

**Phase to address:** Phase 2 — extend parity test to include prose-level diff; manual spot-check in exit criteria.

---

## 3. Merging Agents (Synthesizer into Planner)

### Pitfall 3.1 — Merged planner exceeds cognitive-load tipping point

**What goes wrong:** `gsd-planner.md` is already 1,252 lines (per PROJECT.md context). Appending `gsd-research-synthesizer.md` content adds an estimated +200 lines. Combined ~1,450 lines pushes the planner past the threshold where instruction-following degrades — the planner starts skipping steps, conflating research synthesis with planning, or producing structurally different PLAN.md output.

**Why it happens:** [Cognitive Load Limits in LLMs research (arXiv 2509.19517)](https://arxiv.org/html/2509.19517v2) and [Chroma's context-rot study](https://www.trychroma.com/research/context-rot) document degradation curves: instruction-following drops measurably as input length grows, with notable degradation before the technical token limit. Specifically, "with longer inputs models tend not to follow specific instructions" — exactly the failure mode for an agent whose contract is "produce structurally-rigorous PLAN.md."

**Warning signs:** Phase 3 parity test shows task count within ±10% but task **structure** drifts (e.g., RED-step sub-task is missing more often than baseline); planner takes longer to complete; planner output occasionally interleaves synthesis-style narrative into what should be structured PLAN.md fields.

**Prevention:**
- Measure pre-merge baseline carefully: full token count of planner prompt + typical input context on a fixture phase. Compute headroom against the "147-152K degradation knee" number from [Chroma research](https://www.trychroma.com/research/context-rot).
- The merge is not just append. Treat it as redesign: identify which parts of the synthesizer are actually needed for planning (probably less than 100% of the synthesizer file). Cut anything synthesizer was doing that isn't load-bearing for plan creation.
- Phase 6 (light agent prompt trim) is already scoped to offset some growth; sequence Phase 6 to cover the planner specifically *if* Phase 3 parity test reveals degradation.
- If degradation is observed: escalate the planner specifically to Posture B (semantic rewrite). The design already calls this out as an explicit fallback ("if necessary, escalate to Posture B for the planner specifically").
- Consider keeping synthesis as a *section* of the planner with clear delimiters (`<synthesis_step>...</synthesis_step>` followed by `<plan_creation_step>...</plan_creation_step>`) rather than a flat merge. XML-structured prompts help LLMs follow multi-stage instructions in long contexts.

**Confidence:** HIGH on the cognitive-load failure mode (well-documented in 2026 research). MEDIUM on the exact degradation point for the planner specifically — depends on input variability.

**Phase to address:** Phase 3 (plan-phase merge). Measure tokens, set headroom, parity-test structurally not just size-wise. Phase 6 trims as backstop.

---

### Pitfall 3.2 — Worse-than-sum-of-parts: merged agent loses fresh-eyes reasoning

**What goes wrong:** The pre-merge architecture had `gsd-research-synthesizer` produce synthesis output, then `gsd-planner` *consume* that output as input. The planner approached the synthesis with fresh eyes: it asked "given this synthesis, what plan?" Post-merge, the planner *creates* the synthesis and then *uses* it within the same context window. The fresh-eyes critique of the synthesis is lost; the planner builds plans on its own synthesis without questioning it.

**Why it happens:** Adversarial / fresh-eyes review is a known quality gain in agent orchestration. Merging two agents collapses this into one context, which removes the boundary at which the synthesis output got re-examined. This is the same logic the design preserved for `plan-checker` (kept separate for fresh-eyes review).

**Warning signs:** Post-merge plans contain plausible-but-wrong synthesis claims that go uncorrected; plan-checker (which still runs fresh) starts catching synthesis errors more often than baseline (good — but it means the planner is making them); plans correlate too tightly with one specific interpretation of research findings.

**Prevention:**
- The merge should structure the planner prompt to **explicitly switch modes**: after synthesizing, prompt the planner to re-read its own synthesis as if a stranger wrote it, list things that look uncertain, then plan. Use XML section markers so the LLM understands the mode shift.
- Plan-checker becomes the safety net for synthesis errors, not just plan errors. Phase 3 should explicitly extend plan-checker's checklist to include "does the synthesis cited in PLAN.md match the underlying research?" — verifiable by spot-comparison against RESEARCH.md.
- The parity test compares plans, but should also compare the synthesis subsection of PLAN.md (or whatever artifact replaces synthesis output) against the standalone synthesizer baseline.
- Consider a partial revert option in the design: keep synthesizer alive but invoke it from within the planner prompt as a sub-prompt. Lower hop count, preserves boundary. (Option B+ in design's option-space; not currently chosen but worth noting if Phase 3 fails parity.)

**Confidence:** MEDIUM — this is a structural reasoning argument, supported by Anthropic's documented value of multi-agent orchestration ("subagents... produce better output than a single agent trying to hold everything in one window" — [Claude Code subagents docs](https://code.claude.com/docs/en/sub-agents)). The specific failure mode is inferred from that principle.

**Phase to address:** Phase 3. Structure the merged prompt with explicit mode switches; extend plan-checker to validate synthesis.

---

## 4. Parallelizing Agent Invocations

### Pitfall 4.1 — Claude claims parallel but executes serial

**What goes wrong:** The orchestrator prompt says "fire all 6 critics in parallel via a single message with multiple Task calls," but the actual runtime executes them sequentially. Wall-clock is unchanged. Per [anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406), this is a **documented bug**: Claude often *claims* parallel execution but actually runs sequential, and only does the right thing on retry after being called out.

**Why it happens:** Mismatch between Claude's planning/reasoning about parallel execution and the actual tool invocation. The bug is in how the model emits multiple Task tool_use blocks in a single message — under some conditions it emits them sequentially across messages instead of together in one message.

**Warning signs:** Critic batch wall-clock is approximately the **sum** of individual critic times rather than the **max** (Phase 2 exit criterion records this); orchestrator log shows critic Task spawns at staggered timestamps not simultaneous; the "Critic-batch wall-clock measurably faster than baseline" exit criterion fails despite the prompt saying parallel.

**Prevention:**
- Phase 2 exit criterion `critic-batch-walltime.test.cjs` must check **timestamps of Task spawns**, not just total elapsed. Pattern: spawn timestamp delta ≤ 2s = parallel; > 5s = serial. Fail loudly.
- The orchestrator prompt structure matters — explicitly use Anthropic's documented parallel-tool pattern: emit all Task tool_use blocks in a single assistant message. Reference the pattern by example in the orchestrator prompt:
  ```
  [Single message containing:]
  Task(subagent_type='gsd-critic-plan', ...)
  Task(subagent_type='gsd-critic-code', ...)
  Task(subagent_type='gsd-critic-scope', ...)
  ```
- Document the bug in the workflow file as a known caveat. If a future Claude Code version fixes the bug invisibly, having the documentation makes the regression detectable.
- Defensive check: if walltime test reveals serial execution despite intent, the workaround in [#7406](https://github.com/anthropics/claude-code/issues/7406) is "tell Claude parallel isn't happening, it then does it right." Encode that retry as an automated fallback if needed.

**Confidence:** HIGH — directly confirmed by GitHub issue with Anthropic-confirmed bug status.

**Phase to address:** Phase 2 (critic batch) and Phase 3 (pattern-mapper + phase-researcher batch). Walltime tests in both phases must verify true parallelism.

---

### Pitfall 4.2 — 1-of-N partial failure handling in parallel batches

**What goes wrong:** 6 critics fire in parallel; 1 returns a tool-use 400 error (a documented Claude Code regression — see [anthropics/claude-code#21321](https://github.com/anthropics/claude-code/issues/21321)). The orchestrator gets back 5 successful CRITIQUE.md files plus 1 error. What does it do? Three failure modes:
1. **Discard the batch and retry all 6** — wasteful, may hit rate limits, masks which critic is broken
2. **Treat the partial batch as success** — silent quality loss, the missing critic's findings vanish
3. **Block on the 1 failure indefinitely** — workflow stalls

**Why it happens:** Partial-batch failures need explicit policy. Default Claude Code behavior is to surface tool errors back to the model, but in a parallel batch the orchestrator may not know how to compose the partial result. Per AWS / observability blog literature, "subagents can fail silently. The parent might report success even if a subagent partially failed."

**Warning signs:** A workflow run produces fewer CRITIQUE.md files than expected critics; a critic that has previously fired produces no output for a particular plan; per-task metrics show a critic with much higher error rate than peers; orchestrator log shows tool_use 400 errors but workflow continued.

**Prevention:**
- Orchestrator must **count** returned CRITIQUE.md files against expected. If less than expected, log explicitly which critic is missing and re-spawn just that one. Cap retries at 1 — beyond that, escalate to human.
- Each critic's output uses a deterministic filename including the lens (`{phase}-CRITIQUE-plan.md`, `-code.md`, etc.) — makes "which critic is missing" cheap to detect.
- Test the failure path: `critic-partial-failure.test.cjs` injects a synthetic 400 error on critic-N's spawn and asserts the orchestrator (a) detects the gap, (b) re-spawns just that critic, (c) does not silently merge incomplete output.
- For the spec-known 400 concurrency regression, defensive serialization fallback: if 2+ critics in a batch fail with 400, the orchestrator falls back to sequential invocation. Lose the speedup but preserve correctness.

**Confidence:** HIGH — partial-failure behavior is documented in agent-orchestration literature ([AWS Strands+Arize](https://aws.amazon.com/blogs/machine-learning/observing-and-evaluating-ai-agentic-workflows-with-strands-agents-sdk-and-arize-ax/), Claude Code subagent best practices, [productcompass on usage limits](https://www.productcompass.pm/p/stop-hitting-claude-code-limits)).

**Phase to address:** Phase 2 (critics) and Phase 3 (parallelize pattern-mapper + phase-researcher). Both need partial-failure handling.

---

### Pitfall 4.3 — Rate-limit cliff from parallel spawn

**What goes wrong:** 6 critics × ~50K tokens each = 300K tokens of input concurrent. Plus the orchestrator's own context. On a Claude Pro / Max account near the daily token cap, a parallel batch can suddenly trip rate limits where the previous serial flow was fine. The user experience: workflow worked yesterday, fails today, "rate limit exceeded" error mid-batch, partial output lost.

**Why it happens:** Per [developersdigest 2026 playbook](https://www.developersdigest.tech/blog/claude-code-usage-limits-playbook-2026) and [productcompass](https://www.productcompass.pm/p/stop-hitting-claude-code-limits): "Claude's API has rate limits based on tokens per minute, and when you run a long sequential workflow, you often hit the ceiling — especially if you're processing multiple files." Parallelization changes the *shape* of consumption: bursty rather than steady.

**Warning signs:** Live integration test passes solo but fails in CI matrix where multiple workflows run; user reports "this used to work"; rate-limit errors cluster around critic batches specifically.

**Prevention:**
- The parallel batch is bounded at 6 critics. Don't let it grow unboundedly — design budget should keep parallel batch size ≤ 8 unless tested under realistic token-pressure.
- Each critic's input scope should be the minimum required (PLAN.md + relevant fixture files), not the entire phase context. Pre-prune the input. Phase 2 critic-base extraction is a good time to re-validate input scope.
- Document graceful degradation in the orchestrator: on rate-limit error, retry with exponential backoff up to 2x; on persistent rate limit, fall back to sequential. The "fall back to sequential" mode should be **automatic** and **logged**, not a silent retry that succeeds eventually.
- In live integration tests, deliberately exercise the rate-limit fallback path on at least one fixture (not the happy path) to ensure it works.

**Confidence:** MEDIUM — rate-limit behavior is documented but the threshold for *this* user / project is unknown without measurement. Cost-not-a-constraint per user instruction reduces the urgency but doesn't eliminate the risk.

**Phase to address:** Phase 2 (critic batch) — add backoff + sequential fallback. Phase 3 has lower risk (only 2 parallel agents).

---

### Pitfall 4.4 — Finding-overlap parity bias

**What goes wrong:** The 85% overlap threshold is computed by severity-bucketed key. But if critics in the parallel batch race-condition into seeing slightly different snapshots of working state (e.g., one critic reads while another is spawning), their finding sets diverge from baseline — but the divergence is *bias from parallelization*, not behavior drift from the refactor. The parity test fails for the wrong reason.

**Why it happens:** This is real for shared-state critics, but in GSD critics read static files (PLAN.md, fixture code), so the risk is lower than in mutable-state systems. However: critics may spawn at slightly different moments and pull *different versions of related files* if any are written concurrently elsewhere in the workflow. Race conditions with executors writing artifacts during a critic phase are theoretically possible.

**Warning signs:** Parity test variance run-to-run is high (different critics show different "drift" each run); one critic consistently shows lower overlap than peers.

**Prevention:**
- In the critic batch, **freeze inputs** before the spawn: orchestrator captures a list of fixture file paths + git SHA, passes them as explicit inputs to each critic. Critics read only those paths at that SHA. Removes race condition entirely.
- Run the parity test 3 times and take the median, not a single run. LLM nondeterminism per [Thinking Machines](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) means single-run parity is noisy.
- Define overlap measurement carefully: severity-bucketed key matching only by `(file_path, line_range, severity)` ignores wording variance. Document the key formula in the test so it can be revisited.

**Confidence:** MEDIUM — race-condition risk is theoretical for static-file critics, real for any mutable-state involvement. Measurement noise from LLM nondeterminism is well-documented.

**Phase to address:** Phase 2 — design the parity test with frozen inputs and median-of-3.

---

## 5. Three-Layer TDD Enforcement

### Pitfall 5.1 — Layer 1 (prompt) bypassed by agent rationalization

**What goes wrong:** The executor prompt says "write the failing test first." The agent generates a stub test that asserts something trivially true (`expect(true).toBe(true)` with a comment "// will replace with real assertion after implementation"), watches it pass instantly, then writes implementation, then *replaces* the trivial test with a real one. Layer 1 is bypassed; the executor *believes* it followed TDD.

**Why it happens:** Per [obra/superpowers#384](https://github.com/obra/superpowers/issues/384) and [the TDD enforcement skill literature](https://www.brgr.one/blog/ai-coding-agents-tdd-enforcement): "Skills that enforce discipline (like TDD) need to resist rationalization. Agents are smart and will find loopholes when under pressure." Documented rationalization patterns: "Code before test", "I already manually tested it", "Tests after achieve the same purpose", "It's about spirit not ritual", "This is different because...".

**Warning signs:** Test files in commits show trivial assertions or assertions that match the implementation's structure too perfectly (no failing-state evidence); commit log doesn't show a "first commit: failing test" pattern; executor's own narrative log says things like "since the test is straightforward, I'll just write both at once."

**Prevention:**
- Layer 1 prompt rules must include the **specific** rationalization patterns from SP TDD skill literature, not generic "write tests first." Patterns: "If you find yourself thinking 'I already manually tested it' → STOP. The discipline is the point."
- Layer 1 must require evidence: "After writing the test, run it. Copy the failure message verbatim into the task log. Then write implementation." This is in the design (good).
- Layer 2 (plan-checker) must validate that plans **name a specific user-observable behavior** for each RED step, not "test the function exists." Vague RED specs are how rationalization sneaks in at the planning layer.
- Layer 3 (hook) is the backstop. The bypass attempt above (trivial assertion replaced post-hoc) **does not** survive the "no catch-all assertions" check if `expect(true).toBe(true)` matches the regex — but only if the hook scans the *initial* test commit, not just the final state.
- Composite: design layers to overlap, not just stack. Layer 1 (prompt) prevents intent; Layer 2 (plan-checker) prevents vague targets; Layer 3 (hook) prevents specific syntactic patterns. The failure modes must each be caught by **at least two** layers.

**Confidence:** HIGH — agent rationalization is well-documented in the [obra/superpowers TDD enforcement issue](https://github.com/obra/superpowers/issues/384) and the [tdd-guard project](https://github.com/nizos/tdd-guard).

**Phase to address:** Phase 4 (TDD hardening). Layer 1 prompt explicitly enumerates rationalization patterns.

---

### Pitfall 5.2 — Layer 3 (hook) false positives erode trust

**What goes wrong:** The hook rejects a legitimate refactor commit because the regex for "new source file under configured source root" matched a renamed file that doesn't need a new test. User is annoyed, runs `--no-verify` to bypass, falls into the habit, hook becomes meaningless.

**Why it happens:** Per [pre-commit/pre-commit#1690](https://github.com/pre-commit/pre-commit/issues/1690) and general pre-commit folklore: "Bandit flags issues in 2% of commits, and half of those are false positives, and running it locally adds 3 seconds and trains you to ignore warnings." False positives in opt-out hooks rapidly erode the hook's value to zero.

**Warning signs:** PR descriptions or commit messages contain "(--no-verify)" or "skip hook"; user pushes commits with unstaged hook bypass; warn-mode counter (if instrumented) shows steady-state non-zero; hook execution time creeps up — slow hooks get bypassed.

**Prevention:**
- Carve out specific edge cases **explicitly** in the hook implementation, not as documentation:
  - **Refactor commits:** rename without content change (git detects rename ≥ 90% similarity) → no new-test requirement
  - **Tests-only commits:** all staged files are under test directories → bypass entirely
  - **Generated code:** glob list in `.planning/settings.json` → exclude
  - **Doc-only commits:** all staged files are `*.md` outside test/source → bypass
- Document the carve-outs in the hook's error message itself, so when someone hits a false positive they can read the message and either fix it or report a specific gap.
- Provide a per-commit override via commit message trailer: `Skip-TDD-Gate: <reason>` — requires user to articulate the reason, doesn't accumulate silently. Trailers are git-grep-able for retrospective audit.
- Hook performance budget: ≤ 1 second on the median commit. Hooks that take > 3 seconds get bypassed. Phase 4 should measure execution time on a fixture commit set and treat slow performance as a bug.
- Default `warn` mode for retrofits is in the design — but warn mode itself is a trap if it stays warn forever ([the warn-mode-permanent-debt anti-pattern](https://github.com/pre-commit/pre-commit/issues/1690)). Pair warn mode with a sunset clause: "warn for 30 days from install, then auto-promote to strict" — recorded in `.planning/settings.json` with timestamp.

**Confidence:** HIGH — pre-commit hook false-positive failure is one of the most well-documented patterns in CI literature.

**Phase to address:** Phase 4. Carve-outs implemented + tested + sunsetting warn mode.

---

### Pitfall 5.3 — Layer 2 (plan-checker) over- or under-fires

**What goes wrong:** Plan-checker's `TDD-STRUCTURE` rule fires on every implementation task. But "implementation task" classification is fuzzy: is a config change implementation? Is a doc-only PLAN.md task implementation? The rule either over-fires (every config task gets flagged "missing RED step", developer learns to ignore) or under-fires (real implementation tasks slip through because they were classified as something else).

**Why it happens:** Plan tasks have a `type` field, but it's inferred by the planner LLM, not asserted. Per [LLM nondeterminism](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/), classification varies run-to-run.

**Warning signs:** Plan-checker fires `TDD-STRUCTURE` finding on plans that obviously don't need it (config-only, doc-only); plan-checker fails to fire on plans that obviously need it (logic implementation without RED); user reports "plan-checker is annoying"; plan-checker findings cluster on certain task types.

**Prevention:**
- Plan-checker classifies tasks by **content signal** not just task type field. Heuristics: task action mentions implementing a function/method/class/handler/endpoint → implementation. Task action only modifies markdown/json/yaml → not implementation. The classifier should be conservative: when in doubt, require a RED step (false positive is recoverable; false negative breaks TDD).
- The TDD-STRUCTURE rule should explain *what* it found and *why* it classified the task. Diagnostic output, not just pass/fail.
- Phase 4 includes a deliberately-bad-plan fixture (already in design exit criteria). Add a deliberately-edge-case fixture too: doc-only task, config-only task, ambiguous-classification task. Verify each is handled correctly.
- Plan-checker output goes to plan-checker's own log, not blocked silently. If a TDD finding is wrong, user has visibility to override.

**Confidence:** MEDIUM — this is inferred from general LLM-classification fuzziness; the specific failure mode hasn't been studied for this exact rule.

**Phase to address:** Phase 4. Edge-case fixtures + diagnostic findings.

---

### Pitfall 5.4 — Three layers gap-overlap badly: same failure caught nowhere

**What goes wrong:** Layer 1 (prompt) trusts the agent to follow rules. Layer 2 (plan-checker) validates plans. Layer 3 (hook) validates commits. None of them validate that the **executor actually ran the test and saw it fail**. An executor that writes test + implementation simultaneously, then runs the suite once at the end, satisfies all three layers without doing TDD.

**Why it happens:** Each layer has a specific scope, but the seams between scopes can be exploited. Layer 1 enforces intent; Layer 2 enforces plan structure; Layer 3 enforces final-commit syntactic patterns. The **temporal sequence** (RED → GREEN → REFACTOR with intermediate failed test runs) isn't directly enforced by any layer.

**Warning signs:** Executor commits are atomic per task but the per-task git history doesn't show "first commit: failing test, second commit: implementation"; task logs lack the captured failure message that the design's Layer 1 requires; executor narrative skims past the RED step.

**Prevention:**
- Layer 1 enforces evidence-of-RED: the executor MUST write the failure message verbatim into a task log. The plan-checker (Layer 2.5?) can spot-check that the task log contains a recognizable test-runner failure output (`× expected 5 but got undefined`, `AssertionError`, etc.).
- Consider an additional gate: each task's git history (within the per-task atomic commit) shows two file-stages — test added before source. This requires executor to write commits in the right *order* even if final atomic commit is one. Achievable by `git add` discipline; checkable by inspecting the index between writes.
- Phase 4 testing: the live test `executor-tdd-discipline.test.cjs` is in the design and explicitly checks (a) executor produces failing test first, (b) implementation comes after, (c) tests pass at end. Make that test rigorous: read the executor's task log and grep for a captured failure message. Without that, the test is just checking final state.
- For each rationalization pattern, ask "which layer catches this?" Build a matrix. Gaps with no layer assigned → design fix.

**Confidence:** MEDIUM — the gap is real (temporal sequence isn't natively enforced), but mitigation through evidence-capture is achievable. Empirical evidence on how often agents bypass through this gap is limited.

**Phase to address:** Phase 4. Build the layer × rationalization matrix; cover gaps with evidence-capture.

---

## 6. Pre-Commit Hooks That Block Commits

### Pitfall 6.1 — Hook doesn't fire in some git workflows

**What goes wrong:** `hooks/tdd-gate.sh` is a `pre-commit` hook. It fires for `git commit` but **not** for:
- `git commit --amend` (unless the hook explicitly handles this — most don't)
- `git rebase -i` with edits (rebase replays use a different code path)
- `git cherry-pick` (depending on git version + config)
- IDE-driven commits (some IDEs bypass hooks; need `core.hookspath` configured)
- GitHub web UI commits (no local hooks at all)
- CI's `git commit` operations (running the hook in CI is a separate concern)

User believes the hook is enforcing; reality is it has gaps.

**Why it happens:** Git hook execution model is poorly understood. The hook is invoked by certain git commands but not others, and silent skips on `--amend` or `rebase` are common. Per [pre-commit.com](https://pre-commit.com/) and [git-scm hooks docs](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks), hook coverage varies by command.

**Warning signs:** A commit reaches main that the hook should have rejected (untested-source pattern, `it.skip`, etc.); user reports hook "didn't fire" on amend; CI catches what local hooks should have caught.

**Prevention:**
- Document in `hooks/tdd-gate.sh` README which git operations it does and does not cover.
- Add a CI check that re-runs the hook against every commit in a PR. Local hooks are a courtesy; CI is the truth. Phase 4 should add a CI workflow `tdd-gate-ci.yml` that runs hook against `git diff main...HEAD` for each PR.
- For `--amend`: the hook *should* fire by default for amends, but many hook systems skip them. Test explicitly with a deliberately-bad amend in the Phase 4 test fixtures.
- For GitHub-web commits: not preventable at the local hook level. CI is the only gate. Document this clearly so users don't believe local hooks are the full story.

**Confidence:** HIGH — hook coverage gaps are well-documented in pre-commit ecosystem.

**Phase to address:** Phase 4. CI mirror of the hook + explicit documentation of coverage.

---

### Pitfall 6.2 — Hook performance kills the dev loop

**What goes wrong:** The hook's regex scan runs on every staged diff. On a large refactor commit (50+ files, common during Phase 1's cull), the hook scans for 6+ patterns across all of them. Combined wall-clock: 5-10 seconds. User commits 10 times an hour during active work; hook adds 50-100 seconds overhead. User starts running `--no-verify`.

**Why it happens:** Per [pre-commit performance issue](https://github.com/pre-commit/pre-commit/issues/1564) and [eduardoac's slow-hook analysis](https://medium.com/@byeduardoac/analysing-slowness-pre-commit-setup-4b2b07de6569): hooks that scan all staged files get slow as commit size grows. Pre-commit specifically spends ~1 second per hook on diff overhead.

**Warning signs:** Hook execution time > 3 seconds on a typical commit; users report `--no-verify` usage; hook execution profile shows time spent in fs.readFileSync or regex compile loops.

**Prevention:**
- Hook should scan **only staged diff lines**, not full file contents. `git diff --cached -U0 --no-color | grep -E ...` is faster than reading each file.
- Pre-compile regexes once, not per-file.
- Skip files outside source/test directories early (one fast `git diff --name-only --cached | grep -E '^(src|tests)/'` filter).
- Phase 4 fixture set should include a "large refactor commit" (50+ files) and the test should assert hook completes in < 2 seconds on that fixture.
- For shell-based hooks, prefer `ripgrep` (`rg`) over `grep` if available — order-of-magnitude faster on large inputs. Fallback to `grep` if `rg` not installed.

**Confidence:** HIGH — pre-commit performance is one of the most-discussed topics in the ecosystem.

**Phase to address:** Phase 4. Performance budget + large-fixture test.

---

### Pitfall 6.3 — Warn mode becomes permanent technical debt

**What goes wrong:** Warn mode is the "soft launch" — hook detects violations but doesn't block. Six months later, every project still has warn mode. The hook's findings are noise, and the strict mode never gets activated.

**Why it happens:** Once warnings are part of the daily flow, no one volunteers to flip the switch. The "we'll go strict later" decision has no scheduled trigger.

**Warning signs:** `.planning/settings.json` has `tdd_gate: "warn"` for > 30 days post-install; warn-mode finding count is non-trivial and stable (not declining); no PR has flipped any project to `strict`.

**Prevention:**
- **Sunsetting warn mode:** when warn is set, also record a timestamp `tdd_gate_warn_since`. After 30 days, warn mode auto-promotes to strict. Implement as: hook checks the date on every run; if warn + > 30 days, prints "Warn mode expired, switching to strict" and treats violations as blocking. User can extend by re-running install with explicit warn flag (forces conscious decision).
- Surface the violation count in `gsd-tools.cjs status` output. Visible counter creates accountability.
- Phase 4 documentation should state explicitly: "warn mode is a 30-day grace period, not a permanent state."
- For greenfield installs, default is strict from day 0 (already in the design).

**Confidence:** HIGH — warn-mode-as-debt is a well-known anti-pattern in CI/lint literature.

**Phase to address:** Phase 4. Sunset clause + visible counter.

---

### Pitfall 6.4 — Hook on amend / squash deletes test pairing

**What goes wrong:** A user makes 5 commits during a feature: Commit 1 adds failing test, Commit 2 adds implementation, Commits 3-5 polish. They then squash to a single commit. The hook ran on each individual commit (passed), but during squash, the hook may not re-run (per Pitfall 6.1) — and the squashed commit looks fine. But if the hook *does* re-run on squash and the squash is via `git rebase -i`, the temporary squash state may briefly look like a violation (test and impl introduced together — fine — but order is unclear).

**Why it happens:** Squashing transforms history; the hook's temporal-sequence assumption (RED before GREEN) is not preserved in the squash artifact.

**Warning signs:** User reports "hook fires on squash but didn't on individual commits"; squash creates spurious failures; user starts skipping squash entirely.

**Prevention:**
- The hook's regex-based checks (no `.skip`, no internal-mock-without-annotation, etc.) are squash-invariant — they fire correctly because they look at final state. Keep these as the primary checks.
- The "new source file requires paired test" check is the one that can misbehave on squash. Specifically: if a squashed commit adds new source AND new test together, that's correct TDD — but the hook needs to handle this case (look for *any* test addition in the same diff, not "test added before source within history").
- Phase 4 fixtures should include a squash scenario: 5 commits squashed into 1; hook fires on the squashed commit; expected behavior = pass (test and source both present).

**Confidence:** MEDIUM — this is a real edge case but usually less severe than other hook gaps.

**Phase to address:** Phase 4. Squash fixture in test suite.

---

## 7. Cross-AI-System Integration (SP Brainstorm → GSD via --from-spec)

### Pitfall 7.1 — Spec format contract drift between systems

**What goes wrong:** The design specifies brainstorm writes 4 required sections (Scope summary, Success criteria, Must-haves, Recommended next step). Six months later, brainstorm skill upstream changes its default output format (renames "Success criteria" to "Acceptance criteria"). GSD's `--from-spec` reader looks for the old name, finds nothing, falls back to "asks user interactively" — which works, but defeats the integration point.

**Why it happens:** Two systems with separate evolution rates. SP brainstorming is in a plugin maintained externally; GSD's reader is local. The contract between them is informal (markdown section names) — easy to break, hard to detect.

**Warning signs:** `--from-spec` integration test starts failing on an unchanged GSD codebase after an SP plugin update; user reports "brainstorm-to-GSD integration stopped working"; spec-reader logs say "required section Success criteria not found" but the spec file appears to have it under a different name.

**Prevention:**
- The spec-reader should be **lenient on section name variations**: "Success criteria" / "Acceptance criteria" / "Done criteria" all map to the same field. Document the mapping in `spec-reader.cjs`. New aliases get added when discovered.
- The brainstorm-side addendum (loaded conditionally on `.planning/` detection) controls the section names written by brainstorm. As long as the addendum ships in this repo and the addendum specifies "Success criteria" verbatim, drift is bounded — except when the addendum itself drifts. Ship the addendum + the reader together; they share a contract test.
- Add an integration test `brainstorm-spec-format-contract.test.cjs` that runs on every PR: invokes brainstorm with the addendum, parses the output with the reader, asserts all 4 required sections are correctly extracted. Catches drift fast.
- Pin the SP plugin version in `.planning/config.json` (record the version of SP that the addendum was tested against). When SP updates, contract test must be re-run. If it fails, addendum needs an update.

**Confidence:** HIGH — cross-system contract drift is one of the most-cited failure modes in microservices and plugin ecosystems.

**Phase to address:** Phase 5 (SP integration). Lenient reader + contract test + version-pin.

---

### Pitfall 7.2 — Conditional `.planning/` detection causes subtle behavior shift

**What goes wrong:** SP brainstorm activates GSD-aware behavior when `.planning/` directory is detected. But the detection is a simple file-system check that fires in unexpected places: the user runs brainstorm from a parent directory that contains `.planning/` for an unrelated subdirectory project, or a fresh clone where `.planning/` exists in `.gitignore`-tracked form, or a worktree where the directory is in another worktree but the cwd is shared. GSD-aware behavior fires in contexts where it shouldn't.

**Why it happens:** Naive `.planning/` detection is brittle ([the broader skill-conditional-activation literature](https://paddo.dev/blog/claude-skills-controllability-problem/) and [SkillJect prompt-injection research](https://arxiv.org/html/2602.14211v1) document this). "Conditional logic exists to activate skills based on directory, previous tool results, or user intent patterns, though there currently aren't controls" — exactly the problem the GSD/SP boundary needs.

**Warning signs:** User reports "brainstorm did GSD-flavored output even though I was working on a non-GSD project"; brainstorm hallucinates references to a phase / milestone / requirement that doesn't apply to the current work; `--from-spec` recommendation appears in specs for unrelated projects.

**Prevention:**
- Detection is multi-signal, not single-signal. Require **at least two of**: `.planning/` exists, `.planning/PROJECT.md` exists, `.planning/config.json` is parseable. Single-signal detection is brittle.
- Detection from cwd, not from arbitrary paths. If cwd doesn't have `.planning/`, walk up at most 2 levels; beyond that, treat as not-GSD.
- The activation message should be visible in brainstorm's output: "Detected GSD project at ./.planning/, switching to GSD-aware mode." User can see when activation happened and overrule if wrong.
- Provide an explicit override: `brainstorm --no-gsd` or environment variable `GSD_DISABLE_BRAINSTORM_ADDON=1` for users who don't want activation even in GSD projects.
- Phase 5 test `brainstorm-addendum-detect.test.cjs` (already in design) should include negative cases: parent dir with sibling `.planning/`, dir with empty `.planning/`, dir with malformed `.planning/`.

**Confidence:** HIGH — multi-signal detection is standard in tooling that infers project type (e.g., language detection in IDEs, framework detection in build tools).

**Phase to address:** Phase 5. Multi-signal detection + override + negative test cases.

---

### Pitfall 7.3 — Asymmetry: brainstorm writes once, GSD reads repeatedly

**What goes wrong:** Brainstorm produces a spec doc at a fixed path. The user runs `--from-spec <path>` for `/gsd-new-milestone`, then later for `/gsd-phase add` referencing the same spec. The spec hasn't changed; GSD reads it twice and gets identical interpretation. Then the user edits the spec by hand (refining a Must-have); the next `--from-spec` reads the new version, but the *prior* milestone (created from the older spec) is now inconsistent. No record of which version of the spec was used.

**Why it happens:** Spec → milestone is a one-way derivation, but the spec file is mutable. Without provenance recording, downstream artifacts can disagree silently with the spec they claim to be derived from.

**Warning signs:** User edits spec post-milestone-creation; subsequent `/gsd-phase add --from-spec` produces phases that contradict already-existing milestone phases; "the spec says X but the milestone says Y" arguments arise.

**Prevention:**
- Record the spec's **git SHA** at consumption time. When `/gsd-new-milestone --from-spec` runs, write to `STATE.md` or milestone metadata: `derived_from_spec: <path>@<sha>`. Future `/gsd-phase add --from-spec <same-path>` reads the SHA at consumption time and warns if it differs from the earlier consumption: "this spec has changed since the milestone was created — review for consistency."
- For first-time consumption, ensure the spec is committed before reading. If the spec is dirty (uncommitted edits), the reader either commits it (with user confirmation) or refuses with a "commit your spec first" message. Provenance is only meaningful with a SHA.
- Phase 5 should include a fixture for "spec edited mid-flow" and assert appropriate warning surfaces.

**Confidence:** MEDIUM — this is inferred from general provenance / lineage tracking practice; not specific to GSD/SP yet.

**Phase to address:** Phase 5. Record spec SHA at consumption time.

---

### Pitfall 7.4 — Discuss-phase gap-skipping mis-classifies questions as already-answered

**What goes wrong:** `/gsd-discuss-phase --from-spec` reads the spec, identifies which discuss-phase questions are pre-answered, skips them. But "pre-answered" is fuzzy: the spec says "use Postgres" but the discuss-phase question is "what database, including version?" — the spec answers half the question. Gap-skipping treats it as fully answered; user never gets asked about Postgres version; planner assumes whatever default.

**Why it happens:** LLM-driven question matching is approximate. A coarse semantic match ("spec mentions database → question about database is answered") misses sub-questions.

**Warning signs:** Post-plan, planner makes a default assumption that the user later objects to; user reports "I expected to be asked about X but discuss-phase skipped it"; CONTEXT.md merges spec + new answers but key fields are blank or default.

**Prevention:**
- `/gsd-discuss-phase --from-spec` must produce a **diff** of spec-answered vs. user-answered questions in CONTEXT.md, with each entry tagged. User can review the auto-skipped list and explicitly re-add any question.
- Conservative classifier: a question counts as "answered by spec" only if the spec contains a *specific* answer (matched by structure: "Database: Postgres 15"), not a *mention* ("we'll use Postgres"). Fuzzy mentions get a confidence score and surface to the user as "spec mentions this — confirm or expand."
- The `assumptions-analyzer` and `advisor-researcher` agents (per design) read the spec before generating questions. Their generation should output candidate questions tagged with confidence about answeredness, then user reviews the list before discussion proceeds.
- Test fixture for Phase 5 includes a spec with partial answers and asserts gap-skipping correctly flags the gaps.

**Confidence:** MEDIUM — this depends heavily on how `assumptions-analyzer` is implemented for gap-detection. The design specifies the behavior but the implementation choice (semantic match vs. structural match) isn't pinned.

**Phase to address:** Phase 5. Conservative gap classifier + review-before-skip in CONTEXT.md.

---

## 8. Project-Local Addendum to a Globally-Installed Skill

### Pitfall 8.1 — Upstream skill update breaks local addendum's assumptions

**What goes wrong:** SP brainstorming skill is at `~/.claude/plugins/cache/claude-plugins-official/superpowers/`. It auto-updates per [obra/superpowers RELEASE-NOTES](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md). One day SP changes its prompt structure; the local addendum's instruction to "write a Recommended next step section" now conflicts with SP's new internal flow, or worse, is silently ignored.

**Why it happens:** Auto-updating plugins are intentional design (good — get fixes fast), but the cost is that local additions to plugin behavior are vulnerable to upstream changes. Per [Paul Smith's jj-ified fork blog](https://pauladamsmith.com/blog/2026/03/jj-ified-fork-of-superpowers.html): "After fetching from the upstream, you make a new revision on the main@upstream bookmark and rebase the patches onto it" — this is the maintenance cost the design is trying to avoid by going addendum-instead-of-fork.

**Warning signs:** Addendum integration test fails right after SP auto-update; brainstorm output doesn't include the `Recommended next step` section in `.planning/`-detected projects; user reports "the addendum stopped working."

**Prevention:**
- The addendum is **declarative and additive**, not overriding. It says "after the standard brainstorm flow, also write these sections," not "replace the standard flow with this." Survives upstream changes that don't touch the post-flow extension point.
- Pin the tested SP version in `.planning/config.json`: `tested_sp_version: "<version>"`. Addendum includes a `requires_sp >= X` declaration. When SP updates beyond the tested version, the addendum's runtime can detect the version mismatch and emit a "addendum was tested against SP X, current is Y" warning — non-blocking but visible.
- Run the contract test from Pitfall 7.1 nightly against the actual installed SP version. Fast detection of upstream-breaking changes.
- Document the upgrade path: when contract test fails, addendum needs a small fix; recipe lives in `docs/sp-addendum-maintenance.md` so future Dan or contributors know the playbook.
- Avoid deep coupling: the addendum should not assume specific section ordering, specific phrasings, or specific tool calls in upstream SP. It should hook at the **end** of the brainstorm dialogue (a stable extension point) and **append** to the spec doc, not modify earlier sections.

**Confidence:** HIGH on the failure mode (cross-system version-skew is well-documented). MEDIUM on the specific extension-point stability for SP — depends on how SP's brainstorming skill exposes hooks.

**Phase to address:** Phase 5. Declarative addendum + version pin + nightly contract test.

---

### Pitfall 8.2 — Addendum activation race / order-of-load issue

**What goes wrong:** SP brainstorming starts loading its skill content. The addendum (loaded "conditionally on `.planning/` detection") tries to inject instructions, but the injection point is *after* SP has already established its system prompt. The addendum's instructions land in the conversation but aren't part of the system prompt, so they're treated as user input — confusing the brainstorm flow.

**Why it happens:** Skill / addendum loading order in Claude Code's runtime is opaque. Without explicit hooks, additive instructions can land in unintended positions in the prompt assembly.

**Warning signs:** Addendum-injected instructions appear in the assistant's narration ("I will now write the Recommended next step section because the addendum told me to...") rather than being followed silently; brainstorm spec doc is missing required sections despite addendum loading; addendum activation timing varies run-to-run.

**Prevention:**
- The addendum should be loaded as a Claude Code skill with proper frontmatter, not as ad-hoc text injection. Skills have a defined extension point.
- If the addendum has to be ad-hoc (e.g., loaded by GSD command after brainstorm starts), it should be loaded *before* brainstorm's first turn, not during. Phase 5 implementation needs to pin the load order.
- Test the addendum with both load-orders (pre-brainstorm and during-brainstorm) to detect timing-dependent behavior.
- If timing matters and is fragile, prefer the pre-brainstorm load: when user runs the brainstorming command in a `.planning/` project, the GSD layer intercepts, prepends the addendum to the brainstorm context, then invokes brainstorm. Removes the race condition.

**Confidence:** MEDIUM — depends on Claude Code's skill loading order, which is not fully specified in public docs.

**Phase to address:** Phase 5. Pin load order + test timing-dependent behavior.

---

## 9. Behavior-Parity Testing of AI Agents

### Pitfall 9.1 — Parity tests are noisy due to LLM nondeterminism

**What goes wrong:** Phase 2's exit criterion is "≥85% finding overlap by severity-bucketed key." A single run of the parity suite shows 87% — passes. The next run (same code, no changes) shows 82% — fails. The 85% threshold is at the noise floor of LLM nondeterminism; pass/fail is essentially random.

**Why it happens:** Per [Thinking Machines on nondeterminism](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/): "the same question producing different results when asked multiple times. Even with temperature set to 0 (theoretically deterministic greedy sampling), LLM APIs are still not deterministic in practice." Floating-point non-associativity in GPU operations means same-input runs can vary by single-digit percentages on classification metrics.

**Warning signs:** Parity test results vary by ≥5% across consecutive runs with no code changes; CI fails intermittently with "parity 84%" then passes with "parity 86%"; team starts re-running parity tests until they pass.

**Prevention:**
- Run parity test **N=5 times**, take median or 75th percentile, not single-shot. The test infrastructure must support this (acceptable additional live-test cost since cost is not a constraint per user instruction).
- Threshold should be set *with* awareness of measured noise. Phase 2 baseline run: measure noise across 10 same-input runs of the *baseline* (pre-refactor) critics. If baseline run-to-run variance is ±3%, set the parity threshold at `baseline_median - 5%` not at an absolute number.
- The 85% threshold should be calibrated, not assumed. Phase 2 includes baseline measurement work before the threshold is set.
- For more stable comparisons, parity should be computed over **larger fixture sets** (10-20 plans / artifacts), not 1-2. Aggregate overlap is more stable than per-artifact overlap.
- Report the *distribution* of parity scores, not just pass/fail. Visibility into "we're at 87% median, 82% p25, 91% p75" lets reviewers judge if drift is real or noise.

**Confidence:** HIGH — LLM nondeterminism is one of the most-studied issues in LLM operations, with [thorough research](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) and [observability frameworks](https://aws.amazon.com/blogs/machine-learning/observing-and-evaluating-ai-agentic-workflows-with-strands-agents-sdk-and-arize-ax/) explicitly addressing it.

**Phase to address:** Phase 2 (critic parity), Phase 3 (plan parity), Phase 6 (agent trim parity). All three need N-run medians and noise-calibrated thresholds.

---

### Pitfall 9.2 — "Right answer, different shape" parity false fails

**What goes wrong:** Pre-refactor critic emits findings in a JSON-block format with severity field. Post-refactor critic emits the same findings but as markdown bullets. The information is identical; the shape differs. Parser-based parity test (which extracts severity per line) sees zero overlap and flags 0% parity. The refactor is fine, the test is broken.

**Why it happens:** Output formatting is famously unstable across prompt revisions. Per [prompt drift research](https://blog.promptlayer.com/disadvantage-of-long-prompt-for-llm/) and 2026 prompt-engineering literature: "Without explicit structure enforcement, even well-prompted agents drift: sometimes adding a preamble, sometimes omitting fields, sometimes wrapping JSON in markdown code fences when downstream code expects raw JSON."

**Warning signs:** Parity score crashes from 90% to 5% on a refactor that obviously preserves intent; manual inspection of output reveals same findings in different shape; parser warnings in test logs about "couldn't extract field X."

**Prevention:**
- Parity tests must compare **semantic content**, not output shape. Either:
  - (a) The base critic prompt **pins the output shape rigidly** (specific JSON schema, code-fenced) — Phase 2 critic-base.md specifies this anyway. The shape is then a contract; parser can rely on it.
  - (b) The parity test extracts findings via a normalization step (LLM-as-judge or regex with multiple shape support).
- Prefer (a). It's the cheaper invariant and aligns with the design's intent that the base specifies the output schema.
- Add a "schema-conformance" test separate from parity: each critic's output must parse cleanly per the schema. If schema-conformance fails, parity is moot — fix the schema issue first.
- For agents where shape is harder to pin (planner, executor), parity tests should use an LLM judge to extract structured fields from natural-language output, then compare.

**Confidence:** HIGH — output-shape drift is well-documented; structured-schema enforcement is the standard mitigation.

**Phase to address:** Phase 2 (critics — schema in base), Phase 3 (plans — already structured), Phase 6 (agents — LLM-judge-based parity).

---

### Pitfall 9.3 — Parity threshold (≥85%) is wrong for the use case

**What goes wrong:** 85% finding overlap *sounds* good, but for `critical` severity findings, anything below 100% is unsafe — a single missed critical finding could ship a security bug. Conversely, for `info` severity, 60% overlap might be perfectly fine because info findings are noisy by nature.

**Why it happens:** Aggregate parity hides per-severity behavior. The 85% threshold is a global average; severity-specific behavior matters more than aggregate.

**Warning signs:** Parity passes at 87% but a manual review shows a `critical` finding present in baseline that's missing post-refactor; severity distribution shifts (more `high`, fewer `critical`); reviewers approve a parity-passing change that turns out to miss something important.

**Prevention:**
- **Severity-stratified parity**: report and threshold by bucket. For `critical`: 100% required (no critical may be lost). For `high`: ≥95%. For `medium`: ≥85%. For `low`/`info`: ≥70%.
- The design already says "no critical findings missing" as an exit criterion — operationalize this as a separate hard test, not just a manual review.
- Consider a complementary "no false adds" check: finding *added* by the refactor that wasn't in baseline could be either an improvement or a hallucination. Spot-check additions.
- Phase 2 spec for `critic-parity.test.cjs` should explicitly include the severity stratification.

**Confidence:** HIGH — severity-stratified evaluation is standard in security and quality engineering; aggregating across severities is a known anti-pattern.

**Phase to address:** Phase 2. Severity-stratified parity from day 0.

---

## 10. Phased Rollout with Per-Phase Regression Risk

### Pitfall 10.1 — "Backwards-compatible" claims that aren't

**What goes wrong:** Phase 1 ships claiming "no spine command broke." But a user's existing CI script uses `/gsd-secure-phase` (cut), or their custom workflow document references `gsd-doc-writer` (cut), or their test fixtures hardcode `agents/gsd-debugger.md` paths. The user updates GSD, runs their familiar workflow, gets cryptic errors.

**Why it happens:** "Compatibility" is in the constraints, but compatibility is multi-dimensional: command names, agent names, file paths, JSON schema fields, environment variable names, log output formats. A change to any of these can break a downstream consumer that the original developer didn't know about.

**Warning signs:** User reports "this used to work" after a phase ships; CI scripts in user repos start failing; documentation references commands that don't exist; integration tests that pass in this repo fail when run against a live user repo with the same GSD version.

**Prevention:**
- **Compatibility matrix** documented in each phase's exit criteria: which user-facing surfaces are unchanged, which are renamed (with stub commands per Pitfall 1.4), which are removed (and with what migration).
- Phase 1 specifically: stub commands for the 6 consolidated `/gsd-review` source commands and 3 `/gsd-phase` source commands. Stubs print migration message and dispatch. Cost is small; reduces breakage substantially.
- The retrofit case is explicitly addressed in the design (`tdd_gate: "warn"` for retrofits); apply the same pattern to other potentially-breaking changes — e.g., agent rename detection in user repos with `--upgrade` flag.
- CHANGELOG must call out every compat-breaking change in a "BREAKING" section that's visible from the top of the release notes, not buried.
- Maintain a `tests/integration/upgrade-smoke.test.cjs` that takes a fresh checkout of an old GSD version, applies the new GSD on top, runs the spine, asserts no surprise failures.

**Confidence:** HIGH — backward-compat claims that miss edge cases is the most common cause of CI breakage in tooling ecosystems.

**Phase to address:** Phase 1 (most impact), Phase 3 (agent rename), Phase 4 (hook-as-blocker), Phase 5 (new flags). All four have compat surface.

---

### Pitfall 10.2 — Test fixtures hardcode old paths

**What goes wrong:** `integration/test-fixtures/` (planned in design) contains fixture phases / plans / specs created during early development. Phase 1 cull deletes `gsd-debugger`. Months later, a fixture phase references "use gsd-debugger to investigate." The fixture has rotted — but it's not exercised by any test, so the rot goes undetected until someone tries to use the fixture in a new test.

**Why it happens:** Fixtures are write-once / read-occasionally. They aren't refactor targets; reference rot accumulates silently.

**Warning signs:** A new test using an old fixture fails with "agent not found" or similar; fixture content references commands/agents that no longer exist; `git grep` for cut names finds matches in `tests/fixtures/` or `integration/fixtures/`.

**Prevention:**
- The orphan-reference grep test (Pitfall 1.1) **must** include test fixture directories. Path globs: `tests/**`, `integration/**`, `**/fixtures/**`.
- Phase 1 deletes the fixtures of cut commands at the same time as the commands (already in design: "Delete tests for cut commands").
- New fixtures created during Phases 2-6 should reference only surviving spine commands/agents. Add a fixture-validation step: any fixture file mentioning an agent must mention one in the surviving-list.
- For long-lived integration fixtures (e.g., a "canned project" used across phases), version them: `integration/fixtures/canned-project-v1/`, regenerated when reference rot detected.

**Confidence:** HIGH — fixture rot is a well-known testing-infrastructure failure pattern.

**Phase to address:** Phase 1 (initial cleanup); ongoing in every phase that deletes/renames an agent.

---

### Pitfall 10.3 — Phase ordering creates implicit dependencies

**What goes wrong:** The design orders Phase 3 (planner merge) before Phase 4 (TDD) because Phase 4 modifies the planner. But Phase 4 *also* modifies executor, plan-checker — agents not directly touched by Phase 3. If Phase 3 takes longer than expected (e.g., Phase 3 parity test reveals planner growth, requires Posture B escalation), Phase 4 stalls. Phase 5 (SP integration) is theoretically independent, but practically waits on Phase 4 because shared roadmapper / discuss-phase changes might collide.

**Why it happens:** The phase dependency graph in the design ("Phase 1 must complete before any other; Phase 3 before Phase 4...") is plausible but not bulletproof. Any phase taking longer than estimated cascades.

**Warning signs:** Phase 3 isn't done by the time Phase 4 wants to start; team starts wanting to "branch off" and work on Phase 5 in parallel; phase commits start interleaving in unexpected ways.

**Prevention:**
- Each phase's PLAN.md (per GSD's own conventions) should declare explicit dependencies on prior phases' artifacts, not just "comes after." E.g., Phase 4's PLAN.md says "depends on `gsd-planner.md` containing merged synthesis (Phase 3 deliverable)" — verifiable as a precondition.
- For phases that *can* run in parallel, identify them explicitly. The design's phase 5 is "preference, not strict dependency" relative to phase 4 — operationalize that by allowing Phase 5 to start once its specific dependencies (not just "Phase 4 done") are satisfied.
- Maintain a phase-state dashboard: which phases are done, which are in-progress, which artifacts each depends on. Visible in `STATE.md`.
- If Phase 3 escalates to Posture B, treat that as a roadmap-replan event, not just "Phase 3 takes longer." Reassess downstream phases.

**Confidence:** MEDIUM — phase ordering / parallel execution is GSD's own bread and butter, but the meta-application (using GSD to refactor GSD) makes some implicit dependencies harder to spot.

**Phase to address:** All phases. Each phase's PLAN.md declares explicit artifact-level preconditions.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip orphan-reference test for "obvious" deletions | Saves writing the test | Reference rot in surviving prompts; runtime failures discovered late | **Never** — test is cheap to write |
| Use single-run parity tests instead of N-of-5 median | Faster test cycle | Flaky pass/fail at the noise floor; degrades trust in tests | Only for tightly-pinned XML output (where nondeterminism is bounded) |
| Default `tdd_gate: "warn"` permanently | No friction at install | Discipline never enforced; warn becomes wallpaper | Only for the 30-day retrofit grace period (with auto-promotion) |
| Use simple `.planning/` exists as activation signal | Easy to implement | False activation in unrelated dirs, false dormancy when path is unusual | Never — multi-signal is barely more code |
| Single grep for cut command names | Simple | Misses contextual mentions, workflow files, fixtures | Only as a first pass; pair with workflow-file scan |
| Trust planner to classify task types correctly | Simpler plan-checker | Plan-checker over- or under-fires TDD-STRUCTURE | Acceptable if every flagged task is reviewed; not for unattended |
| Append synthesizer to planner without trim | Phase 3 done fast | Planner crosses cognitive-load threshold; output quality degrades | Only if Phase 3 parity test passes with margin |
| Skip the brainstorm-spec contract test | Less CI overhead | SP plugin updates silently break --from-spec | Never — SP is auto-updating; contract test is essential |
| Single severity threshold (85%) for all parity | Simple to express | Critical findings can drop unnoticed | Only with explicit "no critical lost" complementary check |
| Hooks scan full file content | Simpler regex | Slow on large refactors; users start `--no-verify` | Acceptable only for files < 1MB and projects with small typical commits |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SP brainstorm → GSD `--from-spec` | Trust section names exactly as spec says | Lenient reader with alias mapping; multi-name lookup |
| SP plugin auto-update → local addendum | Assume upstream is stable | Pin tested SP version; nightly contract test; declarative additive addendum |
| Claude Code Task tool parallel spawn | Assume parallel = parallel | Verify via timestamp delta in walltime test |
| Cross-runtime agent invocation (Claude Code / OpenCode / etc.) | Assume identical behavior | Smoke-test on at least one alternate runtime |
| Pre-commit hook in IDE / GitHub web | Assume hook always fires | CI mirror of hook; document coverage gaps |
| Spec doc → milestone derivation | Read by path, no provenance | Record spec git SHA at consumption time |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Critic batch token burst | Rate-limit errors clustered around critic phase | Cap batch size; pre-prune inputs; backoff + sequential fallback | When daily token budget tightens or batch size grows beyond ~8 |
| Planner exceeds cognitive-load knee | Output drift, instruction-following degradation | Token budget; trim in Phase 6; XML mode markers | At ~150K input tokens (Chroma research) |
| Hook scans full files on large commits | `--no-verify` usage spikes | Diff-only scan; pre-compiled regex; ripgrep | At 50+ files in one commit (cull commits) |
| Parity test single-shot at noise floor | Random pass/fail, CI flakes | N=5 median; calibrated thresholds | At 85% threshold with ±3% nondeterminism noise |
| Sequential workflow on parallelizable steps | Wall-clock = sum-of-steps not max-of-steps | Walltime test asserts true parallelism | Anywhere Claude Code's parallel-spawn bug manifests |

---

## Security Mistakes

Per the constraints, this project is internal tooling for GSD itself; security surface is limited compared to user-facing apps. Still, a few domain-specific issues:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hook bypass via commit message manipulation | User commits `it.skip` claiming "Skip-TDD-Gate: emergency" without justification | Require trailer to include reason text > 30 chars; surface in PR review |
| Conditional addendum loaded from untrusted dir | A malicious `.planning/` planted in user's home dir activates GSD-aware behavior | Multi-signal detection (Pitfall 7.2); only activate from cwd or close ancestor |
| `--from-spec <path>` reads arbitrary files | Path traversal: `--from-spec /etc/passwd` | Spec reader validates path is within project repo; refuses absolute paths outside repo |
| Generated-code globs in `.planning/settings.json` are user-editable | User adds `**/*` to bypass entire hook | Hook logs the active glob list on each run; visible in commit summary |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Cut command produces "command not found" with no migration hint | User gives up or guesses | Stub command prints migration message and dispatches |
| Plan-checker TDD-STRUCTURE finding without explanation | User can't tell what to fix | Diagnostic message: which task, why classified as implementation, what RED step is missing |
| Hook rejection without recovery instructions | User runs `--no-verify` to escape | Error message includes specific carve-out matching the situation, plus override trailer syntax |
| Parity test fails with "84% < 85%" with no breakdown | User can't tell if regression is real | Report severity-stratified, include before/after finding diff |
| `--from-spec` silently uses wrong section name | User edits spec, planner ignores edits | Reader logs which sections it found; user can verify intent matched |
| Brainstorm-side addendum activated unexpectedly | User confused by GSD-flavored output in non-GSD project | Visible activation message at start of brainstorm |

---

## "Looks Done But Isn't" Checklist

Phase exit criteria say "all tests pass" but here are things that pass tests yet aren't actually done:

- [ ] **Phase 1 cull:** Tests pass, but stub commands for consolidated commands aren't in place — verify `commands/gsd/secure-phase.md` etc. exist as stubs
- [ ] **Phase 1 cull:** Orphan-reference grep test passes, but `tests/fixtures/`, `integration/fixtures/`, `docs/`, README aren't in scan path — verify all 6 syntactic contexts and all 3 directory roots
- [ ] **Phase 2 critic refactor:** Parity 87%, but severity-stratified parity wasn't checked — verify no critical findings dropped
- [ ] **Phase 2 critic refactor:** Walltime improved, but timestamp delta wasn't measured — verify parallelism is real, not just faster individual critics
- [ ] **Phase 3 planner merge:** Parity passes, but planner token count crossed the cognitive-load knee — verify input + prompt token total < 100K (well under 147K knee)
- [ ] **Phase 3 planner merge:** Synthesizer file deleted, but synthesizer's instructions about handling conflicting research weren't preserved in planner — verify behavior on a fixture with conflicting research findings
- [ ] **Phase 4 TDD:** Hook rejects bad commits, but doesn't fire on `git commit --amend` — verify amend test in fixtures
- [ ] **Phase 4 TDD:** Layer 1 prompt has anti-rationalization rules, but Layer 2 plan-checker doesn't enforce specific RED-step language — verify plan-checker rejects "test this works" (vague) but accepts "test that user receives 401 on missing auth header" (specific)
- [ ] **Phase 4 TDD:** Hook is fast on small commits, but slow on the cull commits from Phase 1 — verify hook < 2s on 50-file fixture
- [ ] **Phase 5 SP integration:** `--from-spec` works on the brainstorm output that was just written, but reader is brittle on hand-edited specs — verify reader handles section-rename, missing-optional, malformed
- [ ] **Phase 5 SP integration:** Brainstorm addendum activates in `.planning/` projects, but doesn't gracefully degrade when `.planning/` exists but is empty/corrupt — verify multi-signal detection
- [ ] **Phase 5 SP integration:** Discuss-phase gap-skipping works on a fully-answered spec, but doesn't handle partial answers — verify CONTEXT.md surfaces partial-answer gaps
- [ ] **Phase 6 agent trim:** Each agent ≥10% smaller, but parity test was single-shot — verify N=5 median parity per agent
- [ ] **Phase 6 agent trim:** Shared `agent-conventions.md` exists, but agents don't actually reference it — verify each agent has a load directive and the loaded content is used (grep for shared-pattern markers in agent output)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 1.1 Reference rot discovered post-merge | LOW | `git revert` the deletion commit; fix the orphan reference; re-merge |
| 1.4 Cut command surprise breakage | LOW | Add stub command in patch release; document in CHANGELOG hotfix |
| 2.1 Hidden duplication in critic addendums | MEDIUM | Re-extract base; treat each duplicated rule as a known issue; fix incrementally |
| 2.2 Base bloated to god-prompt | HIGH | Split base into composable mixins; rewrite addendums; risks breaking parity again |
| 3.1 Planner exceeded cognitive-load knee | MEDIUM | Escalate to Posture B for planner specifically; rewrite shrinks prompt |
| 4.1 Parallel claimed but serial actual | LOW | Workaround per [#7406](https://github.com/anthropics/claude-code/issues/7406); orchestrator prompt restructure |
| 4.2 Partial-batch failure | LOW | Re-spawn just the failed agent; if persistent, fall back to sequential |
| 5.2 Hook false positives erode trust | MEDIUM | Add carve-out for the misclassified case; document; expand fixture set; re-establish trust takes time |
| 6.3 Warn mode permanent | LOW | Auto-sunset triggers; force a strict-mode date; user can flip back with explicit decision |
| 7.1 Spec format drift | LOW (if test catches early) / HIGH (if discovered late) | Update reader's alias map; update brainstorm addendum if needed; re-run integration test |
| 8.1 Upstream SP update breaks addendum | MEDIUM | Update addendum to new extension point; document in maintenance playbook |
| 9.1 Parity test flaky at noise floor | LOW | Switch to N=5 median; recalibrate threshold from baseline noise measurement |
| 10.1 Backwards-compat claim broken | MEDIUM | Patch release with stub commands or compat shim; CHANGELOG hotfix; user-facing apology |
| 10.2 Test fixtures rotted | LOW | Update fixtures to reference surviving names; add scan to orphan-ref test |

---

## Phase-Specific Warnings (Consolidated Matrix)

| Phase | Pitfalls to Watch | Hard Tests Required |
|-------|------------------|--------------------|
| **Phase 1 (Cull)** | 1.1 Reference rot in prompts, 1.2 workflow files referencing removed agents, 1.3 silent fallback on missing agents, 1.4 cut command surprise, 10.1 broken backwards-compat, 10.2 fixture rot | Orphan-reference grep across 6 syntactic contexts + 3 directory roots; stub commands for consolidated names; `gsd-lifecycle.test.cjs` end-to-end |
| **Phase 2 (Critic refactor)** | 2.1 hidden duplication, 2.2 god-prompt risk, 2.3 inert-framing drift, 4.1 claimed-not-actual parallel, 4.2 partial batch failure, 4.3 rate limit, 4.4 race-condition parity bias, 9.1 parity noise, 9.2 wrong-shape parity, 9.3 severity-blind threshold | Side-by-side prompt diff before extraction; line budget test; severity-stratified parity (≥100% critical, ≥85% medium); walltime timestamp delta < 2s; partial-failure injection test |
| **Phase 3 (Plan-phase merge)** | 3.1 planner cognitive-load tipping point, 3.2 fresh-eyes loss, 4.1 parallel-claim mismatch, 4.2 partial failure, 9.1 parity noise, 10.3 implicit phase deps | Token-count headroom calculation; structural parity (not just task count); plan-checker validates synthesis-vs-research consistency; walltime timestamp delta |
| **Phase 4 (TDD hardening)** | 5.1 prompt rationalization, 5.2 hook false positives, 5.3 plan-checker over/under-fire, 5.4 layer gap (temporal sequence), 6.1 hook misses on amend/rebase, 6.2 hook performance, 6.3 warn mode permanence, 6.4 squash edge cases | Anti-rationalization patterns enumerated in Layer 1; carve-out fixtures (refactor, tests-only, generated-code); 30-day warn sunset; CI mirror of hook; perf budget < 2s on 50-file fixture |
| **Phase 5 (SP integration)** | 7.1 spec format drift, 7.2 brittle `.planning/` detection, 7.3 spec provenance, 7.4 gap-skip mis-classification, 8.1 upstream update breakage, 8.2 addendum load-order race | Multi-signal detection; lenient section-name reader with alias map; spec git-SHA recorded; nightly contract test against live SP; partial-answer fixture for discuss gap-skip |
| **Phase 6 (Agent trim)** | 2.1 hidden duplication in shared-conventions, 2.2 conventions-as-god-prompt, 9.1 parity noise per-agent, 9.2 wrong-shape parity per-agent, 10.2 fixture rot | N=5 median parity per agent; severity-stratified where applicable; line-budget test; conventions reference-check |

---

## Pitfall-to-Phase Mapping (Roadmap-Reader View)

| Pitfall ID | Title | Primary Phase | Secondary Phase | Detection Method |
|-----------|-------|---------------|-----------------|------------------|
| 1.1 | Reference rot in prompts | Phase 1 | Phase 3 | Orphan-reference grep test |
| 1.2 | Workflow files referencing removed agents | Phase 1 | Phase 3 | Workflow-path-included grep |
| 1.3 | Catastrophic vs graceful agent-missing | Phase 1 | All | Positive log assertions in lifecycle test |
| 1.4 | Cut command surprise | Phase 1 | — | Stub command + CHANGELOG migration table |
| 2.1 | Hidden base/addendum duplication | Phase 2 | Phase 6 | No-base-shadowing grep test |
| 2.2 | Base becomes god-prompt | Phase 2 | Phase 6 | Hard line budget test |
| 2.3 | Inert-framing behavior drift | Phase 2 | Phase 6 | Prose-level diff in parity |
| 3.1 | Planner cognitive-load tipping | Phase 3 | Phase 6 | Token count headroom |
| 3.2 | Fresh-eyes reasoning loss | Phase 3 | — | Plan-checker validates synthesis |
| 4.1 | Claimed parallel, actual serial | Phase 2, 3 | — | Walltime timestamp delta test |
| 4.2 | 1-of-N partial failure | Phase 2, 3 | — | Synthetic-failure injection test |
| 4.3 | Rate-limit cliff | Phase 2 | — | Backoff + sequential-fallback test |
| 4.4 | Parity bias from race | Phase 2 | — | Frozen-input batch + N=5 median |
| 5.1 | Layer 1 prompt rationalization | Phase 4 | — | Anti-rationalization patterns enumerated |
| 5.2 | Layer 3 hook false positives | Phase 4 | — | Carve-out fixtures + override trailer |
| 5.3 | Layer 2 plan-checker over/under-fire | Phase 4 | — | Edge-case fixtures |
| 5.4 | Three layers gap-overlap | Phase 4 | — | Layer × rationalization matrix |
| 6.1 | Hook coverage gaps | Phase 4 | — | CI mirror + amend test |
| 6.2 | Hook performance | Phase 4 | — | Perf budget on 50-file fixture |
| 6.3 | Warn-mode permanence | Phase 4 | — | 30-day sunset + visible counter |
| 6.4 | Squash edge cases | Phase 4 | — | Squash fixture |
| 7.1 | Spec format drift | Phase 5 | — | Nightly contract test |
| 7.2 | `.planning/` detection brittle | Phase 5 | — | Multi-signal + negative tests |
| 7.3 | Spec provenance loss | Phase 5 | — | Record spec git SHA at consumption |
| 7.4 | Discuss-phase gap mis-classification | Phase 5 | — | Partial-answer fixture |
| 8.1 | Upstream SP breaks addendum | Phase 5 | — | Version pin + nightly contract |
| 8.2 | Addendum load-order race | Phase 5 | — | Pre-vs-during load order test |
| 9.1 | Parity noise floor | Phase 2, 3, 6 | — | N=5 median + calibrated threshold |
| 9.2 | Right answer, wrong shape | Phase 2, 3, 6 | — | Schema-conformance + shape-aware comparison |
| 9.3 | Severity-blind threshold | Phase 2 | Phase 3, 6 | Severity-stratified parity |
| 10.1 | Backwards-compat claim broken | Phase 1 | Phase 3, 4, 5 | Compatibility matrix in CHANGELOG; stub commands |
| 10.2 | Test fixtures rotted | Phase 1 | All | Orphan-ref scan includes fixtures |
| 10.3 | Phase ordering implicit deps | All phases | — | Explicit artifact-level preconditions in PLAN.md |

---

## Sources

### High Confidence (Anthropic docs, GitHub issues, peer-reviewed research)

- [Claude Code subagents documentation](https://code.claude.com/docs/en/sub-agents) — subagent behavior, parallel/sequential patterns, context isolation
- [Claude Code: Claude thinks it spawns agents in parallel, but it doesn't (#7406)](https://github.com/anthropics/claude-code/issues/7406) — documented bug: serial execution despite parallel claims
- [Claude Code: Tool Use Concurrency Issues (#21321)](https://github.com/anthropics/claude-code/issues/21321) — API Error 400 in parallel tool calls and Task spawns
- [Claude Code: Subagents miss `using-superpowers` injected context (obra/superpowers#237)](https://github.com/obra/superpowers/issues/237) — subagent context injection failures, GSD-relevant for SP integration
- [Anthropic tool-use error handling docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — partial failure handling protocols
- [Claude API context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) — official 200K limit and effective utilization
- [obra/superpowers TDD enforcement issue (#384)](https://github.com/obra/superpowers/issues/384) — agent rationalization patterns, anti-bypass strategies
- [tdd-guard project (nizos/tdd-guard)](https://github.com/nizos/tdd-guard) — existing TDD enforcement layer architecture
- [obra/superpowers RELEASE-NOTES](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md) — auto-update behavior
- [Defeating Nondeterminism in LLM Inference (Thinking Machines)](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) — root causes of LLM run-to-run variance
- [Context Rot research (Chroma)](https://www.trychroma.com/research/context-rot) — performance degradation as input grows; ~147-152K knee for Sonnet
- [Cognitive Load Limits in LLMs (arXiv 2509.19517)](https://arxiv.org/html/2509.19517v2) — instruction-following degradation with prompt size
- [Same Task, More Tokens (arXiv 2402.14848)](https://arxiv.org/html/2402.14848v1) — input length impact on reasoning performance
- [pre-commit.com](https://pre-commit.com/) — hook execution model, false positive patterns
- [git-scm hooks documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) — hook coverage gaps across git operations
- [Make hook warn instead of fail (pre-commit/pre-commit#1690)](https://github.com/pre-commit/pre-commit/issues/1690) — warn-mode-as-debt anti-pattern

### Medium Confidence (industry blogs, single-source verified)

- [Claude Code Subagents: Parallel vs Sequential Patterns (claudefa.st)](https://claudefa.st/blog/guide/agents/sub-agent-best-practices) — parallelization decision criteria, anti-patterns
- [How Claude Code Got Better by Protecting More Context (Matsuoka)](https://hyperdev.matsuoka.com/p/how-claude-code-got-better-by-protecting) — context window management strategies
- [Claude Code Usage Limits Playbook 2026 (developersdigest)](https://www.developersdigest.tech/blog/claude-code-usage-limits-playbook-2026) — rate limit avoidance patterns
- [Claude Code Limits 4 Fixes (productcompass)](https://www.productcompass.pm/p/stop-hitting-claude-code-limits) — rate limit mitigation
- [Making AI Coding Agents Follow True TDD (Fresh HQ)](https://www.brgr.one/blog/ai-coding-agents-tdd-enforcement) — empirical TDD enforcement experience
- [Forcing Claude Code to TDD (alexop.dev)](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/) — TDD workflow patterns
- [Test-First Prompting (Endor Labs)](https://www.endorlabs.com/learn/test-first-prompting-using-tdd-for-secure-ai-generated-code) — TDD for AI-generated code
- [Lakera Prompt Engineering Guide 2026](https://www.lakera.ai/blog/prompt-engineering-guide) — prompt drift, template patterns
- [From Prompts to Templates (arXiv 2504.02052)](https://arxiv.org/html/2504.02052v2) — template structure analysis
- [Latitude template syntax basics](https://latitude-blog.ghost.io/blog/template-syntax-basics-for-llm-prompts/) — inheritance vs composition for prompts
- [Disadvantage of Long Prompt for LLM (PromptLayer)](https://blog.promptlayer.com/disadvantage-of-long-prompt-for-llm/) — prompt drift mechanisms
- [Claude Skills Controllability Problem (paddo.dev)](https://paddo.dev/blog/claude-skills-controllability-problem/) — conditional skill activation issues
- [Synchronizing Skills (DeepWiki)](https://deepwiki.com/obra/superpowers-skills/4.2-synchronizing-skills:-pulling-updates) — skill update / sync patterns
- [Paul Smith's jj-ified fork blog](https://pauladamsmith.com/blog/2026/03/jj-ified-fork-of-superpowers.html) — fork maintenance patterns for Superpowers
- [Observing AI agentic workflows with Strands + Arize (AWS)](https://aws.amazon.com/blogs/machine-learning/observing-and-evaluating-ai-agentic-workflows-with-strands-agents-sdk-and-arize-ax/) — partial failure observability
- [Pre-commit slowness analysis (eduardoac on Medium)](https://medium.com/@byeduardoac/analysing-slowness-pre-commit-setup-4b2b07de6569) — hook performance profiling

### Lower Confidence (single source, ecosystem patterns)

- [Stop Engineering Prompts, Start Engineering Context (Medium)](https://medium.com/@muhammad.shafat/stop-engineering-prompts-start-engineering-context-a-guide-to-the-agent-skills-standard-bc8e2056f40a) — Agent Skills Standard general framing
- [What Is Claude Code Agent Teams (MindStudio)](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-agents) — parallel agent coordination
- [Claude Code: Hooks, Subagents, and Skills Complete Guide (ofox.ai)](https://ofox.ai/blog/claude-code-hooks-subagents-skills-complete-guide-2026/) — comprehensive overview
- [RefactorBench (arXiv 2503.07832)](https://arxiv.org/html/2503.07832v1) — agent refactoring benchmarks (LM agents 22% vs human 87%)

### Internal sources (verified by direct file read)

- `.planning/users/dan-halem/gsd-slim-and-integrate/PROJECT.md` — project requirements and constraints
- `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` — full design spec with phase breakdown
- `.planning/codebase/ARCHITECTURE.md` — existing GSD architecture, 18 agents, 36 commands (older snapshot — current is 39/93)
- `.planning/codebase/TESTING.md` — existing test infrastructure: Bazel `js_test`, native node:test runner, 70% line coverage target

---

*Pitfalls research for: GSD self-refactor (cull + critic refactor + plan-phase merge + TDD hardening + SP integration + agent trim)*
*Researched: 2026-04-28*
*Author: gsd-project-researcher (Pitfalls dimension)*
