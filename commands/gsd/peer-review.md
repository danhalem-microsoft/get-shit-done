---
name: gsd:peer-review
description: Cross-AI peer review of phase plans — invoke external AI CLIs (Copilot, Gemini, Codex, OpenCode, Qwen, Cursor, Claude) for independent adversarial review
argument-hint: "<phase> [--copilot] [--gemini] [--claude] [--codex] [--opencode] [--qwen] [--cursor] [--coderabbit] [--all]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

<objective>
Invoke external AI CLIs to independently review phase plans. Each CLI receives the same prompt (PROJECT.md context, plans, requirements) and produces structured feedback. Results are combined into REVIEWS.md, which the planner can incorporate via `/gsd-plan-phase --reviews`.

This implements adversarial peer review: different AI models catch different blind spots. A plan that survives review from 2-3 independent AI systems is more robust than a plan reviewed by a single system.

**Distinct from `/gsd-review`:** `/gsd-review` is the consolidated quality-gate dispatcher (`--code`, `--security`, `--coverage`, `--critique`, `--converge`) using GSD's internal critic agents. `/gsd-peer-review` invokes EXTERNAL AI CLIs as independent reviewers. Both can be used; they answer different questions.

**Flow:** Detect CLIs → Build review prompt → Invoke each CLI → Collect responses → Write REVIEWS.md
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/peer-review.md
</execution_context>

<context>
Phase number: extracted from $ARGUMENTS (required, first positional arg)

**Flags:**
- `--copilot` — Include GitHub Copilot CLI review (preferred default; supports `--model` for multiple model selection)
- `--gemini` — Include Gemini CLI review
- `--claude` — Include Claude CLI review (separate session — invocation skipped automatically when running inside Claude Code)
- `--codex` — Include Codex CLI review
- `--opencode` — Include OpenCode review (leverages GitHub Copilot subscription models)
- `--qwen` — Include Qwen Code review (Alibaba Qwen models)
- `--cursor` — Include Cursor agent review
- `--coderabbit` — Include CodeRabbit (reviews working tree, not the prompt)
- `--all` — Include all available CLIs
- No flags → invoke default reviewers (copilot + opencode); skip the runtime's own CLI for independence
</context>

<process>
Execute the peer-review workflow from @~/.claude/get-shit-done/workflows/peer-review.md end-to-end.
</process>
