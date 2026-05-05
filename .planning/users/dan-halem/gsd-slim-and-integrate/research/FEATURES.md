# Feature Research: Slim AI Agent Orchestration / Meta-Prompting Tool

**Domain:** Meta-prompting / spec-driven development orchestrator (CLI-driven, agent-based)
**Researched:** 2026-04-28
**Confidence:** MEDIUM-HIGH (peer tools well documented; gaps in academic data on cognitive-load thresholds for agent-command catalogs specifically)

---

## Executive Summary

The 2026 AI dev-tool ecosystem has converged on a small, repeating set of design choices: **3-phase workflows (specify → plan → implement)**, **mode-based context-switching (Plan vs Act)**, **parallel sub-agents for orthogonal work**, and **deterministic git-hook backstops layered under prompt-level discipline**. Tools that ship 30+ commands (Aider) succeed because each command is a single verb; tools that ship 6-8 modes (Cline, Roo Code, Goose) succeed because modes contain the surface area inside them. **GSD's existing 93-command surface is an outlier in both directions** — neither single-verb nor mode-collapsed.

For the slim-GSD project specifically, the field tells you:

- **~37 commands is in-band** with SpecKit-style verb counts (10) plus phase-management primitives plus utilities. Comparable to Aider's surface (~30 commands) which is widely considered well-designed.
- **The brainstorm-to-execution handoff via file artifact** is the dominant pattern (SpecKit's `spec.md`, OpenSpec's proposal folder, Plandex's plan branches). `--from-spec <path>` is on-ramp prior art, not novel; the differentiator is **gap-skipping discuss-phase**, which no peer tool ships.
- **Tool-enforced TDD via pre-commit hook is differentiating but not novel.** Multiple posts in 2026 describe Claude Code "Skills + Hooks" enforcing red-green-refactor (Simon Willison, alexop.dev). Layering prompt + plan-checker + hook is the genuine novelty.
- **6 critics is on the high end** but justifiable if they fire in parallel. Adversarial-review prior art (asdlc.io, alecnielsen/adversarial-review) typically uses 1-2 critic agents. The differentiator is having lens-specialized critics; the risk is finding-overlap so high that 6 is wasteful.
- **Anti-features the field has learned to avoid:** marketplace plugin systems (security risk per prompt.security), real-time collaboration features in CLI tools (no peer ships), heavy dashboard UIs (Cursor's Composer 2.0 is the only mainstream tool that drifted toward GUI), aggressive auto-execution without confirmation (Cursor YOLO mode is widely flagged as a footgun).

---

## 1. Surface Area / Command Count

### Peer Tool Inventory

| Tool | Command Surface | Pattern |
|------|-----------------|---------|
| **SpecKit** (GitHub) | ~10 verbs (`/specify`, `/plan`, `/tasks`, `/clarify`, `/analyze`, `/constitution`, `/implement`, plus utilities) | Phase-locked, sequential |
| **OpenSpec** | 3 core commands (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) + workflow phases | Action-based, fluid |
| **Aider** | ~25-30 slash commands (`/commit`, `/undo`, `/diff`, `/run`, `/test`, `/web`, `/architect`, `/ask`, `/add`, `/drop`, etc.) | Single-verb, terminal-native |
| **Cursor** | ~10 keyboard shortcuts (Cmd+K, Cmd+L, Cmd+I, Cmd+N, Cmd+. etc.) + Composer 2.0 modes | Shortcut + mode hybrid |
| **Cline** | ~5 entry points; behavior split via Plan/Act modes | Mode-driven (read-only Plan, write-enabled Act) |
| **Roo Code** | 5 built-in modes (Code, Architect, Ask, Debug, Custom template) + Mode Gallery | Mode-driven (custom modes per persona) |
| **Continue.dev** | Built-in slash commands (`/edit`, `/test`, `/review`, `/commit`) + custom commands via prompt files | Extensible via prompt templates |
| **Taskmaster** | ~6 CLI verbs (`parse-prd`, `list`, `next`, `show`, `set-status`, `add-task`) | Task-CRUD pattern |
| **Plandex** | REPL with fuzzy auto-complete; `tell`, `apply`, `changes`, `rewind`, branches | Plan-as-state-machine |
| **Goose** | CLI + Recipes (YAML workflows); `serve`, `doctor`, plus 70+ MCP extensions | Extension-marketplace pattern |
| **GSD (current)** | 93 commands (`/gsd-*`) | Per-operation dispatch — outlier |
| **GSD (target)** | ~37 commands | Aligns with Aider/SpecKit |

**Sources:**
- [GitHub: spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) — confirmed sequential 3-verb workflow
- [Aider docs](https://aider.chat/) — slash command listing
- [Roo Code docs](https://docs.roocode.com/basic-usage/using-modes) — 5 built-in modes
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 3 core commands
- [Cline docs](https://docs.cline.bot/home) — Plan/Act mode split

### Cognitive Load Research

Miller's Law (7±2 items in working memory) is the most-cited threshold but applies to **simultaneous selection**, not catalog browsing. Verbat Technologies (2026) reports cognitive load measured as "concepts in working memory to complete a task — when that number exceeds 7, errors spike and velocity drops." For command catalogs specifically:

- **Below 10 commands:** Each command can be remembered and selected without docs.
- **10-30 commands:** Users browse `/help` regularly but recall the 5-10 they use daily.
- **30-50 commands:** Group structure (subcommands, namespaces) becomes essential.
- **50+ commands:** Catalog feels overwhelming; users default to a small subset and ignore the rest.

GSD's current 93 commands sit firmly in the "users default to a small subset" zone. The target ~37 lands in the "browse help, use ~10 daily" band — the same place Aider lives, and Aider is widely praised for DX.

**Confidence:** MEDIUM. The 7±2 threshold is well-established in cognitive psychology but mapping it to slash-command DX is extrapolation from platform-engineering literature, not direct empirical research on AI-tool command counts.

**Sources:**
- [Cognitive Load in Developer Experience — Verbat](https://www.verbat.com/blog/cognitive-load-in-developer-experience-the-hidden-kpi/)
- [Whose cognitive load is it anyway? — Platform Engineering](https://platformengineering.org/blog/cognitive-load)
- [I Stopped Trying to Learn Every DevOps Tool — DEV](https://dev.to/maame-codes/i-stopped-trying-to-learn-every-devops-tool-and-started-building-a-platform-instead-33i6)

### Verdict for GSD

**TABLE STAKES:** Command count under 50, with logical grouping (Core Workflow / Phase Management / Utilities / Multi-User). 37 is appropriate.

**DIFFERENTIATOR:** Subcommand consolidation pattern (`/gsd-review --code|--security|--coverage|--critique`, `/gsd-phase add|insert|remove`). Aider's `/architect` and `/ask` aren't subcommanded; SpecKit's verbs are flat. Subcommands give you Aider-level discoverability at half the catalog size.

**ANTI-FEATURE:** Mode-based UI replacement (à la Cline/Roo) is a fork in the road GSD has already not-taken. Don't introduce now — it would require rewriting all command entry points and would break installed workflows.

---

## 2. Brainstorming-to-Execution Handoff

### Peer Tool Inventory

| Tool | Brainstorm Stage | Handoff Mechanism | Execution Stage |
|------|------------------|-------------------|------------------|
| **SpecKit** | `/specify` produces `spec.md` | File artifact | `/plan` reads `spec.md` → `plan.md` → `/tasks` → `tasks.md` → `/implement` |
| **OpenSpec** | `/opsx:propose` writes proposal folder (proposal.md, design.md, tasks.md) | Folder artifact | `/opsx:apply` reads folder, executes |
| **Aider** | None formal — `/architect` mode for chat-style brainstorm | In-session memory only | `/architect` outputs feed directly into next `/edit` or `/run` |
| **Cline** | Plan mode (read-only) | Internal mode transition | Act mode (write-enabled) |
| **Cursor Composer** | Composer chat with codebase context | Chat history within session | Agent mode iterates, runs commands |
| **Plandex** | `tell` builds plan in plan-state | Plan branches (git-like) | `apply` flushes plan to working tree |
| **Roo Code** | Architect mode | Mode handoff | Code mode (or custom mode for specific stage) |
| **Goose** | Recipes (YAML pre-defined workflows) | YAML config | Recipe execution invokes extensions |
| **Superpowers (SP)** | `brainstorming` skill writes `docs/.../specs/<date>-<topic>-design.md` | File artifact | `writing-plans` skill or other skills consume |
| **GSD (current)** | `/gsd-discuss-phase` → CONTEXT.md | File artifact | Plan/execute consume CONTEXT.md |
| **GSD (target)** | SP brainstorm produces spec → `--from-spec` flag on 3 commands | File artifact + structured sections | Three GSD entry points consume |

**Sources:**
- [Spec Kit workflows](https://github.github.io/spec-kit/reference/workflows.html) — file-artifact handoff
- [OpenSpec workflow](https://openspec.pro/workflow/) — folder-artifact handoff
- [Aider features](https://github.com/Aider-AI/aider) — `/architect` mode
- [Plandex README](https://github.com/plandex-ai/plandex) — plan branches as state
- [Cline Plan & Act modes](https://docs.cline.bot/) — internal mode transition

### Patterns Identified

1. **File artifact (SpecKit, OpenSpec, SP, GSD)** — dominant pattern. Spec lives on disk, version-controlled, multiple tools can consume.
2. **Folder artifact (OpenSpec)** — variation; spec is a directory with proposal + design + tasks.
3. **In-session memory (Aider, Cursor, Cline)** — fast, no file overhead, but lost across sessions.
4. **Plan-as-state-machine (Plandex)** — git-like plan branches; novel but repo-coupled.

### Verdict for GSD

**TABLE STAKES:** File-artifact handoff. SP already produces spec docs at `docs/superpowers/specs/<date>-<topic>-design.md`; reading them via `--from-spec <path>` is on-pattern.

**TABLE STAKES:** Required spec sections (`Scope summary`, `Success criteria`, `Must-haves`, `Recommended next step`). All file-artifact tools enforce a minimum schema (SpecKit's `spec.md` template, OpenSpec's three-file convention).

**DIFFERENTIATOR:** **Gap-skipping discuss-phase.** No peer tool does this. SpecKit's `/clarify` re-asks; OpenSpec's `apply` doesn't dialogue at all. GSD's design — read spec, identify which questions are already answered, skip those, ask only gaps — is genuinely new and high-value.

**DIFFERENTIATOR:** **Brainstorm offramp recommendation.** SP brainstorm assesses scope and recommends one of three GSD commands. No peer tool routes between tools based on scope assessment. This is the SP→GSD bridge.

**ANTI-FEATURE:** Auto-running the recommended GSD command from brainstorm. The design correctly excludes this (PROJECT.md "Out of Scope" line: "Auto-running the recommended GSD command from brainstorm — too fragile if scope is misjudged"). User-confirmation gate is the right call. Plandex's auto-apply is the cautionary tale — it requires constant rewinds when the plan misjudges scope.

**ANTI-FEATURE:** Bidirectional GSD↔SP integration. Already excluded from project scope. Two-way coupling explodes the integration surface; SP→GSD is sufficient.

---

## 3. TDD Enforcement Features

### Prior Art

| Approach | Implementation | Strength | Limitation |
|----------|----------------|----------|------------|
| **Manual / convention** | Aider, Continue.dev | Zero infrastructure | Agent reverts to "implementation-first" reliably |
| **Skill-based prompt** | Superpowers `test-driven-development` skill (iron-law red→green→refactor) | Articulate discipline; agent re-reads it on demand | Agent can ignore skill mid-task; no enforcement |
| **Custom workflow with skills + hooks** | alexop.dev "Forcing Claude Code to TDD" | Multi-agent enforcement of red phase before green | Fragile — depends on skill orchestration; not commit-time |
| **Pre-commit hook gate** | Git hooks running on staged diffs | Deterministic; can't be skipped without `--no-verify` | Only catches at commit time, not earlier; can produce false positives |
| **Layered (prompt + structural + hook)** | GSD target design | Three independent gates; redundant in the right way | More moving parts; install complexity |

**Sources:**
- [Red/green TDD — Simon Willison](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/) — pattern catalog
- [Forcing Claude Code to TDD — alexop.dev](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/) — skills + hooks enforcement
- [Beyond Prompts: How Git Hooks Steer AI Coding Agents — DEV](https://dev.to/98lenvi/beyond-prompts-how-git-hooks-steer-ai-coding-agents-in-production-4pf9) — git-hook AI control
- [Test-Driven Development with Agentic AI — coding-is-like-cooking.info](https://coding-is-like-cooking.info/2026/03/test-driven-development-with-agentic-ai/) — 2026 state of TDD-with-agents

### What 2026 Tools Actually Do

The 2026 trend per multiple sources (Simon Willison, dev.to, alexop.dev) is **multi-layer enforcement**:

- **Layer 1 (prompt):** Instructions in agent prompt to invoke TDD skill, write red test first, watch it fail.
- **Layer 2 (skill or workflow validation):** Plan-time check that tasks include red-step sub-tasks.
- **Layer 3 (hook):** Pre-commit deterministic gate.

The Anthropic Agentic Coding Trends Report 2026 highlights: "Instructions alone aren't enough — AI agents follow them most of the time, but not always." (Quoted from the dev.to "Beyond Prompts" article summarizing the report.) Hooks are the answer to "follows most of the time" — they convert "soft compliance" into "hard rejection."

**Key challenge per coding-is-like-cooking.info:** "Agentic AI has difficulty doing red and green separately in that order, with most people combining them into the same prompt." This validates GSD's structural plan-checker requiring an explicit RED sub-step — without that constraint, agents combine red+green by default.

### Verdict for GSD

**TABLE STAKES:** Layer 1 — invoke SP `test-driven-development` skill at task start. Skill exists, mature, no novel work needed.

**DIFFERENTIATOR:** **Three-layer enforcement** (Layer 1 prompt + Layer 2 plan-checker structural + Layer 3 pre-commit hook). The combination is genuinely novel — alexop.dev's workflow is two-layer; SpecKit/OpenSpec have zero TDD enforcement. Layered design is the project's strongest differentiator vs peer tools.

**DIFFERENTIATOR:** **Anti-mock and anti-skip rules in pre-commit hook.** The hook rejecting `it.skip`, internal-module mocks without annotations, and catch-all assertions (`expect(x).toBeTruthy()`) addresses concrete failure modes that appear consistently in agent-generated code (per multiple cited 2026 sources). This is novel — no peer tool ships hooks that police test-quality, only test-existence.

**TABLE STAKES (configuration):** `tdd_gate: "strict" | "warn" | "off"` setting. Per "Effortless Code Quality" guide, configurable severity is standard practice for pre-commit hooks. Strict for fresh installs, warn for retrofits avoids breaking working repos.

**ANTI-FEATURE:** **TDD coverage thresholds and mutation testing.** Already excluded from scope. Coverage is a downstream measurement; it doesn't enforce *behavior* (writing tests first). Mutation testing is enormously expensive in CI and rarely the bottleneck for early-stage work. The deferred Phase 7 measurement is the correct way to evaluate whether to add these later.

**ANTI-FEATURE:** **Pre-commit-time AI agent re-review.** The dev.to "Agent Hooks" article describes pre-commit-time AI agents that re-review code. This converges with the critic system — but doing it at commit time slows the flow significantly (3-10s per commit). GSD's critics fire at plan-time (synchronous with planning) and post-execution (asynchronous), not at commit time. This is the right call.

---

## 4. Critic / Quality-Gate Features

### Peer Tool Inventory

| Tool | Critic Pattern | Count | Mode |
|------|---------------|-------|------|
| **Aider** | `/architect` reviews; no formal critic | 0 dedicated | Same agent in different mode |
| **Cody** | Chat-style review on demand | 0 dedicated | Direct chat |
| **Cursor** | Background Agents (2026) provide async review | 1-N depending on use | Async |
| **adversarial-review (alecnielsen)** | Multi-agent code review with Claude + GPT Codex in adversarial debate loop | 2 (Builder + Critic) | Sequential debate |
| **Qodo (Codium AI)** | Multi-agent code review with specialized agents | Variable | Parallel |
| **GSD (current)** | 6 critics (plan, code, scope, verify, discuss, strategy) | 6 | Currently sequential per call site, target parallel |
| **GSD (target)** | Same 6 critics, shared base + lens addenda, fired in single parallel batch | 6 | Parallel (max(critics) wall-clock) |

**Sources:**
- [Adversarial Code Review — ASDLC](https://asdlc.io/patterns/adversarial-code-review/) — Builder vs Critic pattern (2 agents)
- [adversarial-review GitHub](https://github.com/alecnielsen/adversarial-review) — concrete 2-agent implementation
- [Single-Agent vs Multi-Agent Code Review — Qodo](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/) — multi-agent review benefits
- [Multi-Agent in Production in 2026 — Medium](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1) — 2026 state of multi-agent patterns

### Is 6 Too Many?

Field data:

- **2 critics is most common** in production. Builder + Critic adversarial loop. The dominant pattern.
- **3-4 critics** is the high end of what production multi-agent systems ship (Cursor Background Agents tend toward 1-2; Grok Build had 8 but that's all agents, not all critics).
- **Specialized lens critics (security, scope, code-quality)** appear in academic literature and are absent from major commercial tools.

The Medium article on "Multi-Agent in Production 2026" notes: "Centralized coordination improved Finance-Agent performance by 80.9% on parallelizable work, but on sequential planning tasks every multi-agent variant degraded performance by 39–70%." Translation: **parallel multi-critic only helps if the critic work is genuinely parallel.** 6 critics that all need the same input and produce orthogonal outputs are the well-shaped case.

The risk is **finding overlap.** If `critic-plan` and `critic-strategy` flag the same issue 70% of the time, the 6th critic is wasteful. The brainstorm decision in PROJECT.md ("Keep all 6 critics; optimize via parallelization + shared base prompt") is correct *only if* finding overlap is empirically below ~50%. **Phase 7 measurement should explicitly check this.**

### Verdict for GSD

**TABLE STAKES:** At least 1 critic agent (adversarial review pattern). Without it, GSD has no fresh-eyes review and is below the 2026 multi-agent baseline.

**DIFFERENTIATOR:** **6 lens-specialized critics** in parallel batch. Lens specialization (plan vs code vs scope vs verify vs discuss vs strategy) is differentiating because no major tool ships this. The critic-base + lens-addendum architecture (200-line shared base + 50-80 line lens) is also differentiating — most multi-critic systems duplicate framing across critics.

**DIFFERENTIATOR:** **Single parallel batch invocation.** Wall-clock = max(critics), not sum. Per the 2026 trends report cited above, parallel batches have been shipped by every major tool in early 2026 (Grok Build 8 agents, Windsurf 5 agents, Claude Code Agent Teams). This is converging on table stakes; doing it well differentiates.

**ANTI-FEATURE:** **More than 6 critics.** Don't expand. The field data suggests adding more critics gives diminishing returns and increases finding overlap.

**ANTI-FEATURE:** **Conditional critic-spawn based on artifact type.** Already deferred to Phase 7. Premature optimization — parallelization may eliminate the need entirely. The risk of conditional-spawn is that artifact classification is itself imperfect, and missing a critic on an artifact silently degrades quality.

**ANTI-FEATURE:** **Iterative critic-debate loops** (Builder → Critic → Builder → Critic). The alecnielsen adversarial-review repo does this. It's slow (multiple round trips) and rarely converges meaningfully past round 2. GSD's single-pass critic batch is the better tradeoff.

---

## 5. Cross-Tool Integration Patterns

### Peer Tool Inventory

| Pattern | Examples | Strength | Limitation |
|---------|----------|----------|------------|
| **MCP servers (tool-level integration)** | Claude Code, Goose (70+ MCP extensions), Cursor, Cline | Universal protocol; growing ecosystem | Per-server install; security surface (per prompt.security article) |
| **File-based handoff (one tool produces, another consumes)** | SP brainstorm → GSD `--from-spec`; SpecKit `/specify` → `/plan` | Decoupled; works across tools | Schema drift risk |
| **Skill plugins (multiple skills coexist in same agent)** | Claude Code skills, Goose recipes, Roo Code custom modes | Local to one runtime | Inter-skill coordination is ad-hoc |
| **Subprocess chaining** | Aider's `/run`, Plandex's commands | Simple; unix-philosophy | Output parsing fragile |
| **Agent-to-agent over MCP** | Emerging in 2026 per Medium article | Future-proof | Not yet standardized |

**Sources:**
- [Goose extensions](https://block-goose.mintlify.app/) — 70+ MCP extensions, recipe pattern
- [Claude Code skills marketplace concerns — prompt.security](https://prompt.security/blog/when-your-plugin-starts-picking-your-dependencies-marketplace-skills-and-dependency-hijack-in-claude-code) — security risk of marketplace plugins
- [GitHub Spec Kit](https://github.com/github/spec-kit) — file-based handoff between specify/plan/tasks
- [Continue.dev customization](https://docs.continue.dev/customize/overview) — prompt-template extension model

### What Works for SP→GSD

The design's choice — **file-based handoff with required sections + project-local addendum** — aligns with field-best practice:

- **File-based** because it's the only pattern that decouples cleanly across two distinct tools (SP plugin and GSD installer).
- **Required sections (Scope summary, Success criteria, Must-haves, Recommended next step)** because schemaless handoff fails as soon as either tool changes its output.
- **Project-local addendum (loaded on `.planning/` detection)** because forking SP would create a maintenance burden; conditional behavior keeps SP's default behavior unchanged for non-GSD users.

### Verdict for GSD

**TABLE STAKES:** File-based handoff (markdown + required sections). Already on dominant pattern.

**DIFFERENTIATOR:** **Conditional behavior based on `.planning/` detection.** The brainstorm addendum activates only when the repo has `.planning/`; otherwise standard SP behavior unchanged. This is a clean coexistence model that no peer tool has formalized.

**DIFFERENTIATOR:** **Recommendation logic at end of brainstorm.** Brainstorm assesses scope and writes one of three GSD commands into spec. Routing-by-scope is novel.

**ANTI-FEATURE:** **MCP server for SP→GSD bridge.** Tempting because it would be "modern" but adds a daemon, install complexity, and security surface (per prompt.security). File-based handoff is simpler, version-controllable, and observable.

**ANTI-FEATURE:** **Marketplace ecosystem for community brainstorm-to-GSD adapters.** Goose has 70+ extensions and is now dealing with the security implications. Don't go there.

**ANTI-FEATURE:** **Forking the SP brainstorming skill.** Already excluded. Project-local addendum is the right tradeoff.

---

## 6. Hook-Based Quality Gates

### Prior Art

| Tool | Ships Hooks? | Hook Purpose |
|------|--------------|--------------|
| **Most AI dev tools** | No | Hooks are user-installed (lint-staged, husky) |
| **Claude Code (skills)** | Yes (community-developed) | TDD enforcement (alexop.dev), policy gates |
| **Copilot Agent Hooks** | Yes (per dev.to "Beyond Prompts") | Tool-use-time interception |
| **partcad/pre-commit** | Yes | AI-generated commit messages |
| **GSD (target)** | Yes (`hooks/tdd-gate.sh`) | TDD enforcement at commit time |

### What 2026 Tools Are Doing

Per the dev.to "Beyond Prompts" article and "Agent Hooks" pieces, the trend is unambiguous: **AI-tool-shipped hooks are emerging as table stakes for production-grade tools.** The argument:

- Agent compliance with prompt-level rules is high but not 100%.
- Hooks provide deterministic enforcement.
- Local pre-commit hooks are fast (sub-second); CI hooks are heavier.
- The right architecture is **fast local + heavier CI** (per "Boost your commit game" guide).

Concrete implementations cited in 2026 sources:
- Branch naming enforcement
- Secret leak prevention
- One-app-per-branch validation
- Commit message format
- Repo structure checks
- **TDD violations** (red-step missing, skip patterns, internal mocks)

### Verdict for GSD

**TABLE STAKES (in 2026):** Ships at least one hook for some quality gate. Tools that don't ship hooks are increasingly seen as "incomplete" for production use.

**DIFFERENTIATOR:** **TDD-specific hook with anti-mock/anti-skip rules.** The specific patterns rejected (internal-module mocks without `// MOCK: <reason>` annotation, `it.skip` / `xit` / `.todo`, catch-all assertions like `expect(x).toBeTruthy()`) target concrete failure modes documented across multiple 2026 sources. No peer tool ships these patterns.

**DIFFERENTIATOR:** **Configurable severity (`strict` | `warn` | `off`).** Per "Effortless Code Quality" guide, this is standard for pre-commit hooks but absent from most AI-tool hooks.

**DIFFERENTIATOR:** **Edge-case carve-outs (refactor-only commits, generated-code globs).** False-positive prevention is critical. The design's explicit carve-outs (refactor commits with no new source require no new test; generated-code globs in `.planning/settings.json` skip the hook) directly addresses the chief failure mode of pre-commit hooks per the cited DevOps research.

**ANTI-FEATURE:** **More than one project-shipped hook in this milestone.** TDD hook is enough. Adding (e.g.) commit-message-quality hook, secret-scanner hook, etc. expands surface and conflicts with users' existing hook stacks. Stay focused.

**ANTI-FEATURE:** **Mandatory `strict` mode for retrofits.** Already addressed in design (`warn` for retrofits, `strict` for fresh installs). Forcing strict on existing repos breaks them and creates ill-will.

**ANTI-FEATURE:** **CI-level enforcement only, no local hook.** Some tools push enforcement entirely to CI. This loses the fast-feedback loop. Local + (eventually) CI is the right architecture.

---

## 7. Speed / Latency Features

### Peer Tool Inventory

| Optimization | Tools Using | Gain |
|--------------|-------------|------|
| **Streaming responses** | All major tools | Perceived speed; first-token latency masking |
| **Parallel agent invocation** | Grok Build (8 agents), Windsurf (5), Claude Code Agent Teams, Codex CLI, Devin | Wall-clock = max() not sum() |
| **Prompt caching (Anthropic)** | Plandex (uses caching across the board), Claude Code | Up to 85% latency reduction; 90% cost reduction on cached tokens |
| **Smaller agent prompts (lean prompts)** | Aider (terminal-native, lean), OpenSpec (3 verbs) | Less context = faster TTFT |
| **Mode switching to avoid full prompt reload** | Cursor (Cmd+/), Cline (Plan↔Act) | Avoids re-loading; hot-context |
| **Background agents** | Cursor 3.0 (Background Agents, Cloud Agents) | Async work doesn't block foreground |
| **GSD (current)** | Streaming only; sequential agent chains | — |
| **GSD (target)** | Streaming + parallel critic batch + parallel pattern-mapper/researcher + shared critic base + smaller agent prompts (Posture A trim) | Compounding |

**Sources:**
- [Anthropic prompt caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — 85% latency reduction figure
- [Plandex README](https://github.com/plandex-ai/plandex) — context caching across providers
- [Cursor 2.0 + Composer](https://cursor.com/blog/2-0) — Background Agents
- [Multi-Agent in Production 2026 — Medium](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1) — parallel agent norm

### What 2026 Slim Tools Do

Three optimizations dominate:

1. **Parallel sub-agents on orthogonal work.** Wall-clock = max(agent_time) not sum. Confirmed across all major tools shipping multi-agent in early 2026.
2. **Prompt caching for shared base prompts.** Anthropic caches in order tools → system → messages. A shared critic base (~200 lines) cached once benefits all 6 critic invocations. Per 2026 dev.to article: cache reads cost 0.1× base input tokens; massive win.
3. **Lean per-agent prompts.** Aider's terminal-native prompts are short (~1k tokens of system instructions). GSD's gsd-debugger at 1,453 lines is at the opposite end. Posture A trim (10-15% reduction) is a small step in the right direction.

**Caveat on caching:** The 2026 TTL change from 60min to 5min means cache misses cost 1.25× input tokens. For interactive use (under 5 min between calls), caching is still a win; for batch/CI it's neutral or slight loss. Per the "Cut Anthropic API Costs 90%" article, planning around the 5-min TTL matters.

### Verdict for GSD

**TABLE STAKES:** Streaming. Already shipped.

**TABLE STAKES (2026):** Parallel sub-agents on orthogonal work. Critic batch and pattern-mapper/researcher parallel are correctly scoped.

**DIFFERENTIATOR:** **Shared base prompt + lens addendum architecture for critics.** Beyond just speed, this enables prompt caching of the base — critic-base.md (~200 lines) lives at the start of each critic invocation and Anthropic auto-caches the prefix. Per the design: "Net: critic line-count goes from 1,731 to ~600." Not just smaller — *cacheable*.

**DIFFERENTIATOR:** **Posture A agent trim with behavior parity check.** 10-15% per-agent reduction with parity verification is conservative and well-instrumented. Most peer tools that trim aggressively (Posture B/C territory) don't verify parity and silently regress. The deferred-to-Phase-7 escalation path is correct.

**ANTI-FEATURE:** **Background/async agents (Cursor-style).** The current GSD spine is synchronous and that's fine for interactive use. Async background agents add coordination complexity (where did my work go? when does it complete? how do I cancel?) without proportional value for solo-dev workflows.

**ANTI-FEATURE:** **Aggressive agent rewrites (Posture B/C).** Already deferred. Premature; measurement-driven decision is correct.

**ANTI-FEATURE:** **Caching across user sessions / shared cache pools.** Workspace-level isolation in 2026 actively prevents this; trying to work around it would violate Anthropic ToS and create privacy issues.

---

## 8. Anti-Features (Comprehensive List)

This section consolidates anti-features identified across all 7 dimensions plus additional ones discovered in research.

### Already in Project Out-of-Scope (Correctly Excluded)

| Anti-Feature | Why Avoid | Source |
|--------------|-----------|--------|
| Aggressive agent rewrites (Posture B/C) | Premature; measurement-driven | PROJECT.md |
| Critic conditional-spawn | Parallelization may eliminate need | PROJECT.md |
| TDD coverage thresholds & mutation testing | Coverage doesn't enforce behavior; mutation expensive in CI | PROJECT.md |
| Bidirectional GSD↔SP | Two-way coupling explodes integration surface | PROJECT.md |
| Auto-running recommended GSD command | Fragile if scope misjudged | PROJECT.md |
| Forking SP brainstorming skill | Maintenance burden; project-local addendum sufficient | PROJECT.md |

### Additional Anti-Features Recommended

| Anti-Feature | Why Avoid | Reasoning |
|--------------|-----------|-----------|
| **Mode-based UI replacement** | Would require rewriting all command entry points | GSD has invested in commands; adding modes splits the model |
| **Real-time collaboration features** | No CLI-driven peer tool ships this | Enterprise theater (per README ethos); not what solo devs need |
| **Marketplace plugin/skill ecosystem (third-party)** | Security risk per prompt.security; install/audit burden | Goose has 70+ extensions and is now dealing with security implications |
| **Heavy dashboard/GUI (à la Cursor Composer 2.0)** | Drifts toward IDE-replacement, not CLI orchestrator | Stay focused on CLI excellence |
| **Iterative critic-debate loops** | Slow; rarely converges meaningfully past round 2 | Single-pass critic batch is better tradeoff |
| **MCP server for SP↔GSD** | Adds daemon, install complexity, security surface | File-based handoff simpler |
| **More than 6 critics** | Diminishing returns; finding overlap increases | 6 already at high end |
| **More than one project-shipped hook in this milestone** | Conflicts with users' existing hook stacks | TDD hook is enough |
| **CI-only enforcement (no local hook)** | Loses fast-feedback loop | Local + CI is the right architecture |
| **Mandatory `strict` mode for retrofits** | Breaks existing repos; ill-will | `warn` for retrofits is correct |
| **Background/async agent execution (Cursor-style)** | Coordination complexity without solo-dev value | Synchronous is fine for the GSD use case |
| **Pre-commit-time AI agent re-review** | Slows commits 3-10s | Critics fire at plan-time and post-execution, not commit-time |
| **Cross-session shared cache pools** | Workspace-level isolation prevents this in 2026 | Anthropic ToS / privacy issues |
| **Auto-generated AI commit messages** | Convergence with TDD hook would conflict on commit-message format | partcad/pre-commit does this; not GSD's lane |
| **In-tool bug tracker / issue management** | Out of scope per project ethos | Use GitHub Issues; don't reinvent |
| **Web-based admin / settings UI** | CLI-first design choice | `/gsd-settings` covers this |
| **Telemetry / usage analytics** | Privacy concerns; out of solo-dev ethos | If desired, opt-in only |

---

## Feature Categorization Summary

### TABLE STAKES (Must Have for Slim GSD to Work)

| # | Feature | Complexity | Phase |
|---|---------|------------|-------|
| TS-1 | Command count under 50, with logical grouping | LOW | 1 |
| TS-2 | Subcommand consolidation (`/gsd-review`, `/gsd-phase`) | MEDIUM | 1 |
| TS-3 | File-artifact handoff between SP and GSD | LOW | 5 |
| TS-4 | Required spec sections (Scope, Success criteria, Must-haves, Recommended next step) | LOW | 5 |
| TS-5 | TDD Layer 1: SP `test-driven-development` skill invocation in executor | LOW | 4 |
| TS-6 | At least one critic agent (already have 6) | — | (existing) |
| TS-7 | Streaming responses | — | (existing) |
| TS-8 | Parallel sub-agents on orthogonal work (critic batch, pattern-mapper + phase-researcher) | MEDIUM | 2, 3 |
| TS-9 | Configurable hook severity (`strict` / `warn` / `off`) | LOW | 4 |
| TS-10 | At least one shipped quality-gate hook (TDD gate) | MEDIUM | 4 |

### DIFFERENTIATORS (Competitive Advantage)

| # | Feature | Complexity | Phase |
|---|---------|------------|-------|
| D-1 | Gap-skipping discuss-phase (skip questions answered by spec) | MEDIUM | 5 |
| D-2 | Brainstorm offramp recommendation logic (route to one of three GSD commands by scope) | LOW-MEDIUM | 5 |
| D-3 | Three-layer TDD enforcement (prompt + plan-checker + hook) | HIGH | 4 |
| D-4 | Anti-mock and anti-skip rules in pre-commit hook (with refactor / generated-code carve-outs) | MEDIUM | 4 |
| D-5 | 6 lens-specialized critics in single parallel batch | MEDIUM | 2 |
| D-6 | Critic-base + lens-addendum architecture (cacheable shared base) | MEDIUM | 2 |
| D-7 | Conditional brainstorm behavior based on `.planning/` detection | LOW | 5 |
| D-8 | Posture A agent trim with behavior-parity verification | MEDIUM | 6 |
| D-9 | Plan-phase merged synthesizer (1 fewer agent, 1 fewer hop) | MEDIUM | 3 |
| D-10 | Spec-reader helper module (shared by 3 commands) | LOW | 5 |

### ANTI-FEATURES (Deliberately NOT Build)

See the full table in Section 8. Top 5 most important to lock in beyond the project's existing exclusions:

1. **Marketplace plugin/skill ecosystem** — security and install burden.
2. **More than one project-shipped hook this milestone** — stay focused; don't fragment with hooks for commit messages, secret scanning, etc.
3. **Background/async agent execution** — coordination complexity not justified for solo-dev workflow.
4. **More than 6 critics** — diminishing returns.
5. **Iterative critic-debate loops** — rarely converges past round 2.

---

## Feature Dependencies

```
[TS-1: Command count under 50]
    └──enables──> [TS-2: Subcommand consolidation]
                       └──enables──> [Phase 1 cull tests]

[TS-3: File-artifact handoff]
    └──requires──> [TS-4: Required spec sections]
                       └──requires──> [D-7: Conditional brainstorm behavior]

[D-1: Gap-skipping discuss-phase]
    └──requires──> [D-10: Spec-reader helper module]

[D-3: Three-layer TDD]
    └──contains──> [TS-5: Layer 1 prompt]
    └──contains──> [Layer 2 plan-checker structural rule]
    └──contains──> [TS-10: Layer 3 pre-commit hook]
                       └──depends-on──> [TS-9: Configurable hook severity]
                       └──depends-on──> [D-4: Anti-mock/anti-skip rules]

[D-5: 6 lens-specialized critics in parallel batch]
    └──requires──> [D-6: Critic-base + lens-addendum architecture]
    └──requires──> [TS-8: Parallel sub-agents]

[D-9: Plan-phase merged synthesizer]
    └──depends-on──> [TS-8: Parallel sub-agents]

[D-2: Brainstorm offramp recommendation]
    └──depends-on──> [D-7: Conditional brainstorm behavior]
    └──depends-on──> [TS-3: File-artifact handoff]

[D-8: Posture A agent trim]
    └──last in dependency chain] (polish on agents in final structural form)
```

### Critical Dependencies

- **D-1 → D-10:** Gap-skipping requires spec-reader. Build spec-reader first in Phase 5.
- **TS-5 → D-3:** TDD hardening Layer 1 must work before Layer 2 (plan-checker) and Layer 3 (hook) can be validated end-to-end.
- **D-9 (Phase 3) → TS-5 (Phase 4):** Plan-phase chain merge modifies the planner; TDD hardening also modifies the planner. Phase 3 must complete before Phase 4 to avoid merge conflicts and double-rewrite.
- **D-6 (Phase 2) → D-5 (Phase 2):** Critic-base must exist before critics can use it. Same phase, but ordered work.
- **D-8 (Phase 6) → all surviving agents in final form:** Trim is last because it operates on agents in their final structural state.

These dependencies match the project's phase ordering exactly — the design correctly puts cull (Phase 1) → critic refactor (Phase 2) → plan-phase merge (Phase 3) → TDD (Phase 4) → SP integration (Phase 5) → trim (Phase 6).

---

## MVP Definition (For This Milestone)

### Launch With (Required for Milestone Success)

- [ ] TS-1 through TS-10 (all table stakes)
- [ ] D-1, D-3, D-5, D-9 (the 4 differentiators that make the project worth doing — gap-skipping, three-layer TDD, parallel critics, plan-phase merge)
- [ ] D-2, D-4, D-7, D-10 (the supporting differentiators — brainstorm recommendation, anti-mock rules, conditional addendum, spec-reader helper)

### Add After Validation (Phase 7+)

- [ ] D-6 (critic-base architecture) — partially implemented in Phase 2; full caching benefit may need follow-up tuning
- [ ] D-8 (Posture A trim) — Phase 6 work; could be skipped/delayed if Phases 1-5 reveal more urgent issues

### Future Consideration (Post-Milestone, Phase 7 or Beyond)

- [ ] Critic conditional-spawn (deferred per PROJECT.md)
- [ ] Aggressive agent rewrites (Posture B/C, deferred)
- [ ] TDD coverage thresholds (deferred)
- [ ] Mutation testing (deferred)
- [ ] Empirical critic finding-overlap measurement (drives whether to consolidate critics)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-1: Command count under 50 | HIGH | LOW | P1 |
| TS-2: Subcommand consolidation | HIGH | MEDIUM | P1 |
| TS-3: File-artifact handoff | HIGH | LOW | P1 |
| TS-4: Required spec sections | HIGH | LOW | P1 |
| TS-5: TDD Layer 1 invocation | HIGH | LOW | P1 |
| TS-8: Parallel sub-agents | HIGH | MEDIUM | P1 |
| TS-9: Configurable hook severity | MEDIUM | LOW | P1 |
| TS-10: TDD pre-commit hook | HIGH | MEDIUM | P1 |
| D-1: Gap-skipping discuss-phase | HIGH | MEDIUM | P1 |
| D-3: Three-layer TDD | HIGH | HIGH | P1 |
| D-5: 6 critics in parallel batch | MEDIUM | MEDIUM | P1 |
| D-6: Critic-base architecture | MEDIUM | MEDIUM | P1 |
| D-9: Plan-phase merged synthesizer | MEDIUM | MEDIUM | P1 |
| D-2: Brainstorm offramp recommendation | MEDIUM | LOW | P1 |
| D-4: Anti-mock/anti-skip rules | HIGH | MEDIUM | P1 |
| D-7: Conditional brainstorm behavior | MEDIUM | LOW | P1 |
| D-10: Spec-reader helper module | HIGH | LOW | P1 |
| D-8: Posture A agent trim | LOW-MEDIUM | MEDIUM | P2 |

**All features in this project are P1 except D-8 (Posture A trim), which is P2.** The trim is polish — valuable for tokens/speed, but the project's core value is delivered by the other features. If Phase 6 needs to be deferred for any reason, the milestone still ships meaningful improvement.

---

## Competitor Feature Analysis

| Feature | SpecKit | OpenSpec | Aider | Cline | Roo Code | Plandex | Goose | GSD (target) |
|---------|---------|----------|-------|-------|----------|---------|-------|---------------|
| Command surface size | 10 | 3 | 25-30 | 5+modes | 5+modes | REPL | CLI+recipes | 37 |
| Spec → plan handoff | spec.md → plan.md | proposal/ folder | None (chat) | Mode transition | Mode transition | Plan branches | Recipes | `--from-spec` flag |
| Gap-skipping after spec | No | No | No | No | No | No | No | **YES** (D-1) |
| TDD enforcement | No | No | No | No | No | No | No | **YES, 3 layers** (D-3) |
| Pre-commit hook shipped | No | No | No | No | No | No | No | **YES** (TS-10) |
| Critic agents | No | No | No (review via /architect) | No | No | No | No | **YES, 6 specialized** (D-5) |
| Parallel sub-agents | No | No | No | No | No | No | No | **YES** (TS-8) |
| Multi-user monorepo | No | No | No | No | No | No | No | **YES** (existing) |
| Atomic per-task commits | No | No | Per-edit | No | No | Plan-level | No | **YES** (existing) |
| Brainstorm-to-execution conditional bridge | No | No | No | No | No | No | No | **YES** (D-7, D-2) |

GSD's competitive position post-milestone: the only tool in the field with **simultaneous** subcommand consolidation + multi-layer TDD enforcement + parallel lens-critics + brainstorm-to-execution conditional bridge + multi-user monorepo support. Several individual features exist elsewhere; the combination is unique.

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Peer tool inventories | HIGH | All claims verified against current docs (Aider, Cline, Roo Code, OpenSpec, SpecKit, Plandex, Goose, Cursor) within last 30 days; specific commands and counts cited |
| TDD enforcement field state | HIGH | Multiple independent 2026 sources (Simon Willison, alexop.dev, dev.to, coding-is-like-cooking.info) converge on multi-layer enforcement as the trend |
| Multi-agent / critic patterns | MEDIUM-HIGH | 2026 trend report cited; Qodo blog and Medium piece corroborate parallel agent norm; "6 critics" specifically is GSD's choice — no peer tool ships this many, so finding-overlap risk is empirically untested |
| Anti-features | MEDIUM-HIGH | Most are derived from peer-tool-trajectory observations (marketplace security from prompt.security; background-agent complexity from Cursor reviews); specific to GSD's domain rather than universal |
| Cognitive-load thresholds | MEDIUM | 7±2 is well-established; mapping to slash-command DX is extrapolation; no direct empirical study of "ideal command count for AI orchestrator tools" exists |
| File-artifact handoff dominance | HIGH | SpecKit, OpenSpec, SP, GSD all use this pattern; verified in primary docs |
| Anthropic prompt caching impact | HIGH | Direct Anthropic docs cited; 85% latency / 90% cost figures are from official source |
| Hook-based enforcement future | MEDIUM-HIGH | Trend strong but emergent; "table stakes by 2026" claim is based on trend trajectory, not yet universal adoption |

**Overall confidence: MEDIUM-HIGH.** The peer tool data is solid; the projections (e.g., "anti-mock pre-commit hook is differentiating") are well-supported but ultimately predictions about how the field will evolve.

---

## Sources

### Primary (HIGH confidence)

- [GitHub: spec-kit](https://github.com/github/spec-kit) — SpecKit workflows and commands
- [GitHub: spec-kit/spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md) — SDD methodology
- [Spec Kit workflows reference](https://github.github.io/spec-kit/reference/workflows.html) — official workflow docs
- [GitHub: Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — OpenSpec docs
- [OpenSpec workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md) — workflow phases
- [openspec.dev](https://openspec.dev/) — official site
- [Aider docs](https://aider.chat/) — slash commands, /architect mode
- [GitHub: Aider-AI/aider](https://github.com/Aider-AI/aider) — features
- [Cline docs](https://docs.cline.bot/home) — Plan/Act modes
- [Roo Code docs - using modes](https://docs.roocode.com/basic-usage/using-modes) — built-in modes
- [Cursor features](https://cursor.com/features) — Composer 2.0
- [Cursor 2.0 + Composer blog](https://cursor.com/blog/2-0) — Background Agents
- [Continue.dev slash commands](https://docs.continue.dev/customize/slash-commands) — custom slash commands
- [GitHub: plandex-ai/plandex](https://github.com/plandex-ai/plandex) — Plandex features
- [Goose docs](https://block-goose.mintlify.app/) — recipes, extensions
- [GitHub: eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) — Taskmaster commands
- [Anthropic prompt caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — caching mechanics
- [Claude API: prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — official reference

### Secondary (MEDIUM confidence — verified by multiple sources or aligned with primary)

- [Red/green TDD — Simon Willison](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/) — TDD pattern catalog
- [Forcing Claude Code to TDD — alexop.dev](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/) — concrete skills+hooks TDD
- [Beyond Prompts: How Git Hooks Steer AI Coding Agents — dev.to](https://dev.to/98lenvi/beyond-prompts-how-git-hooks-steer-ai-coding-agents-in-production-4pf9) — hook enforcement trend
- [Test-Driven Development with Agentic AI — coding-is-like-cooking.info](https://coding-is-like-cooking.info/2026/03/test-driven-development-with-agentic-ai/) — 2026 TDD-with-agents state
- [Adversarial Code Review — ASDLC](https://asdlc.io/patterns/adversarial-code-review/) — Builder/Critic pattern
- [GitHub: alecnielsen/adversarial-review](https://github.com/alecnielsen/adversarial-review) — concrete 2-agent review
- [Single-Agent vs Multi-Agent Code Review — Qodo](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/) — multi-agent review benefits
- [Multi-Agent in Production in 2026 — Medium](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1) — 2026 multi-agent state
- [How Marketplace Skills Hijack Dependencies — prompt.security](https://prompt.security/blog/when-your-plugin-starts-picking-your-dependencies-marketplace-skills-and-dependency-hijack-in-claude-code) — marketplace security
- [Effortless Code Quality: Pre-Commit Hooks Guide 2025](https://gatlenculp.medium.com/effortless-code-quality-the-ultimate-pre-commit-hooks-guide-for-2025-57ca501d9835) — hook configuration patterns

### Tertiary (LOW confidence — single source or general trend)

- [Cognitive Load in Developer Experience — Verbat](https://www.verbat.com/blog/cognitive-load-in-developer-experience-the-hidden-kpi-for-productivity/) — cognitive load research; reasonable but not specific to AI tools
- [Whose cognitive load is it anyway? — Platform Engineering](https://platformengineering.org/blog/cognitive-load) — platform engineering perspective
- [Agent Hooks: Controlling AI Agents in Your Codebase — DEV](https://dev.to/htekdev/agent-hooks-the-secret-to-controlling-ai-agents-in-your-codebase-6a8) — emerging concept
- [Cline AI Guide — DataCamp](https://www.datacamp.com/tutorial/cline-ai) — Plan/Act mode confirmation
- [Roo Custom Modes — This Dot Labs](https://www.thisdot.co/blog/roo-custom-modes) — Roo modes confirmation
- [Plandex — Altern](https://altern.ai/tool/github-com-plandex-ai-plandex) — Plandex features
- [Best Multi-Agent Coding Tools in 2026 — Nimbalyst](https://nimbalyst.com/blog/best-multi-agent-coding-tools-2026/) — comparative analysis

---

*Feature research for: slim AI agent orchestration / meta-prompting tool (GSD slim + SP integration + TDD hardening)*
*Researched: 2026-04-28*
