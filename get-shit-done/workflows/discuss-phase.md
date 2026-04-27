<purpose>
Extract implementation decisions that downstream agents need. Analyze the phase to identify gray areas, let the user choose what to discuss, then deep-dive each selected area until satisfied.

You are a thinking partner, not an interviewer. The user is the visionary — you are the builder. Your job is to capture decisions that will guide research and planning, not to figure out implementation yourself.
</purpose>

<downstream_awareness>
**CONTEXT.md feeds into:**

1. **gsd-phase-researcher** — Reads CONTEXT.md to know WHAT to research
   - "User wants card-based layout" → researcher investigates card component patterns
   - "Infinite scroll decided" → researcher looks into virtualization libraries

2. **gsd-planner** — Reads CONTEXT.md to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" → planner includes that in task specs
   - "Claude's Discretion: loading skeleton" → planner can decide approach

**Your job:** Capture decisions clearly enough that downstream agents can act on them without asking the user again.

**Not your job:** Figure out HOW to implement. That's what research and planning do with the decisions you capture.
</downstream_awareness>

<available_agent_types>
- gsd-critic-discuss: Adversarial discussion critic
</available_agent_types>

<philosophy>
**User = founder/visionary. Claude = builder.**

The user knows:
- How they imagine it working
- What it should look/feel like
- What's essential vs nice-to-have
- Specific behaviors or references they have in mind

The user doesn't know (and shouldn't be asked):
- Codebase patterns (researcher reads the code)
- Technical risks (researcher identifies these)
- Implementation approach (planner figures this out)
- Success metrics (inferred from the work)

Ask about vision and implementation choices. Capture decisions for downstream agents.
</philosophy>

<scope_guardrail>
**CRITICAL: No scope creep.**

The phase boundary comes from ROADMAP.md and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

**Allowed (clarifying ambiguity):**
- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)

**Not allowed (scope creep):**
- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)

**The heuristic:** Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

**When user suggests scope creep:**
```
"[Feature X] would be a new capability — that's its own phase.
Want me to note it for the roadmap backlog?

For now, let's focus on [phase domain]."
```

Capture the idea in a "Deferred Ideas" section. Don't lose it, don't act on it.
</scope_guardrail>

<gray_area_identification>
Gray areas are **implementation decisions the user cares about** — things that could go multiple ways and would change the result.

**How to identify gray areas:**

1. **Read the phase goal** from ROADMAP.md
2. **Understand the domain** — What kind of thing is being built?
   - Something users SEE → visual presentation, interactions, states matter
   - Something users CALL → interface contracts, responses, errors matter
   - Something users RUN → invocation, output, behavior modes matter
   - Something users READ → structure, tone, depth, flow matter
   - Something being ORGANIZED → criteria, grouping, handling exceptions matter
3. **Generate phase-specific gray areas** — Not generic categories, but concrete decisions for THIS phase

**Don't use generic category labels** (UI, UX, Behavior). Generate specific gray areas:

```
Phase: "User authentication"
→ Session handling, Error responses, Multi-device policy, Recovery flow

Phase: "Organize photo library"
→ Grouping criteria, Duplicate handling, Naming convention, Folder structure

Phase: "CLI for database backups"
→ Output format, Flag design, Progress reporting, Error recovery

Phase: "API documentation"
→ Structure/navigation, Code examples depth, Versioning approach, Interactive elements
```

**The key question:** What decisions would change the outcome that the user should weigh in on?

**Claude handles these (don't ask):**
- Technical implementation details
- Architecture patterns
- Performance optimization
- Scope (roadmap defines this)
</gray_area_identification>

<process>

**Express path available:** If you already have a PRD or acceptance criteria document, use `/gsd-plan-phase {phase} --prd path/to/prd.md` to skip this discussion and go straight to planning.

**Process flow:** initialize → check_existing → load_prior_context → load_taste_entries → scout_codebase → analyze_phase → present_gray_areas → discuss_areas → write_context → persist_taste_counters → **discuss_critic** → confirm_creation → git_commit → update_state → auto_advance

**TEXT_MODE fallback:** If `--text` is present in $ARGUMENTS OR `text_mode` from init JSON is true, set TEXT_MODE=true. When TEXT_MODE is active, replace every AskUserQuestion call with a plain-text numbered list and ask the user to type their choice number.

<step name="check_blocking_antipatterns" priority="first">
**MANDATORY: Check for .continue-here.md with blocking anti-patterns before proceeding.**

```bash
CONTINUE_HERE=$(ls ${planning_root}/phases/*/.continue-here.md ${planning_root}/.continue-here.md 2>/dev/null | head -1)
```

If a .continue-here.md file exists and contains anti-patterns with severity "blocking":

1. Parse the `<anti_patterns>` section for any entries marked as `blocking`
2. For each blocking anti-pattern, the agent MUST demonstrate understanding by answering three questions. This check is MANDATORY and cannot be skipped — it is required before any other work proceeds:
   - What is this anti-pattern? (describe it in your own words)
   - How did it manifest in the previous session? (specific evidence)
   - What structural mechanism or prevention approach will you use to avoid it?
3. Only after all blocking anti-patterns have been addressed may the workflow continue

This understanding check ensures that lessons from previous sessions are not lost across context boundaries.
</step>

<step name="initialize" priority="first">
Phase number from argument (required).

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_research`, `has_context`, `has_plans`, `has_verification`, `plan_count`, `roadmap_exists`, `planning_exists`.

**If `phase_found` is false:**
```
Phase [X] not found in roadmap.

Use /gsd-progress to see available phases.
```
Exit workflow.

**If `phase_found` is true:** Continue to check_existing.

<decision_logging>
**Initialize decision logging (silent failure — never breaks workflow):**

```bash
LOG_INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" log-decision-init --workflow discuss-phase --phase "$PHASE" 2>/dev/null) || true
LOG_FILE=$(echo "$LOG_INIT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{console.log(JSON.parse(d).log_file)}catch{}" 2>/dev/null) || true
```

After each user response in the discussion flow (discuss_areas step), log the decision:

```bash
if [ -n "$LOG_FILE" ]; then
  node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" log-decision --log-file "$LOG_FILE" --question "$QUESTION" --response "$RESPONSE" 2>/dev/null || true
fi
```

All logging calls use `2>/dev/null || true` — logging NEVER breaks the workflow.
</decision_logging>
</step>

<step name="check_existing">
Check if CONTEXT.md already exists using `has_context` from init.

```bash
ls ${phase_dir}/*-CONTEXT.md 2>/dev/null
```

**If exists:**
Use AskUserQuestion:
- header: "Context"
- question: "Phase [X] already has context. What do you want to do?"
- options:
  - "Update it" — Review and revise existing context
  - "View it" — Show me what's there
  - "Skip" — Use existing context as-is

If "Update": Load existing, continue to analyze_phase.
  **IMPORTANT:** The "Update" path MUST follow the SAME full step sequence as new context:
  `analyze_phase → present_gray_areas → discuss_areas → write_context → persist_taste_counters → discuss_critic → confirm_creation`
  Do NOT shortcut from write_context directly to confirm_creation — the discuss_critic step is mandatory on ALL paths.
If "View": Display CONTEXT.md, then offer update/skip
If "Skip": Exit workflow

**If doesn't exist:**

Check `has_plans` and `plan_count` from init. **If `has_plans` is true:**

Use AskUserQuestion:
- header: "Plans exist"
- question: "Phase [X] already has {plan_count} plan(s) created without user context. Your decisions here won't affect existing plans unless you replan."
- options:
  - "Continue and replan after" — Capture context, then run /gsd-plan-phase {X} to replan
  - "View existing plans" — Show plans before deciding
  - "Cancel" — Skip discuss-phase

If "Continue and replan after": Continue to analyze_phase.
If "View existing plans": Display plan files, then offer "Continue" / "Cancel".
If "Cancel": Exit workflow.

**If `has_plans` is false:** Continue to load_prior_context.
</step>

<step name="load_prior_context">
Read project-level and prior phase context to avoid re-asking decided questions and maintain consistency.

**Step 1: Read project-level files**
```bash
# Core project files
cat ${planning_root}/PROJECT.md 2>/dev/null
cat ${planning_root}/REQUIREMENTS.md 2>/dev/null
cat ${planning_root}/STATE.md 2>/dev/null
```

Extract from these:
- **PROJECT.md** — Vision, principles, non-negotiables, user preferences
- **REQUIREMENTS.md** — Acceptance criteria, constraints, must-haves vs nice-to-haves
- **STATE.md** — Current progress, any flags or session notes

**Step 2: Read all prior CONTEXT.md files**
```bash
# Find all CONTEXT.md files from phases before current
find ${planning_root}/phases -name "*-CONTEXT.md" 2>/dev/null | sort
```

For each CONTEXT.md where phase number < current phase:
- Read the `<decisions>` section — these are locked preferences
- Read `<specifics>` — particular references or "I want it like X" moments
- Note any patterns (e.g., "user consistently prefers minimal UI", "user rejected single-key shortcuts")

**Step 3: Build internal `<prior_decisions>` context**

Structure the extracted information:
```
<prior_decisions>
## Project-Level
- [Key principle or constraint from PROJECT.md]
- [Requirement that affects this phase from REQUIREMENTS.md]

## From Prior Phases
### Phase N: [Name]
- [Decision that may be relevant to current phase]
- [Preference that establishes a pattern]

### Phase M: [Name]
- [Another relevant decision]
</prior_decisions>
```

**Usage in subsequent steps:**
- `analyze_phase`: Skip gray areas already decided in prior phases
- `present_gray_areas`: Annotate options with prior decisions ("You chose X in Phase 5")
- `discuss_areas`: Pre-fill answers or flag conflicts ("This contradicts Phase 3 — same here or different?")

**If no prior context exists:** Continue without — this is expected for early phases.
</step>

<step name="load_taste_entries">
Load active taste entries for consultation during discussion.

```bash
TASTES=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" load-active-tastes --raw)
```

**If no taste directory or no active entries:** Silent skip — continue to scout_codebase with no taste context. Zero behavior change for projects without taste entries (backward compatible).

**If active entries exist:**

1. Parse the JSON array of taste entries
2. Store internally as `<active_tastes>` for use in subsequent steps
3. Each entry has: id, domain, title, confidence, pattern, tags, times_applied, times_overridden

**Usage in subsequent steps:**
- `analyze_phase`: Use taste entries to pre-answer gray areas where a taste matches
- `present_gray_areas`: Annotate gray areas with matching taste entries ("Your taste preference: {title}")
- `discuss_areas`: Use taste patterns as default recommendations, probe whether user's position has changed
- `write_context`: Queue counter updates for applied/overridden tastes

**Semantic matching approach:**
- Use Claude's contextual understanding to match taste entries to gray areas
- Prefer over-matching to under-matching — user can reject false positives
- Partial matches valid: "error messages" taste can match "user feedback" gray area

**Counter tracking preparation:**
Initialize empty counter queues:
```
taste_counters = { applied: [], overridden: [] }
```
These will be populated during discuss_areas based on user responses.
</step>

<step name="scout_codebase">
Lightweight scan of existing code to inform gray area identification and discussion. Uses ~10% context — acceptable for an interactive session.

**Step 1: Check for existing codebase maps**
```bash
ls ${planning_root}/codebase/*.md 2>/dev/null
```

**If codebase maps exist:** Read the most relevant ones (CONVENTIONS.md, STRUCTURE.md, STACK.md based on phase type). Extract:
- Reusable components/hooks/utilities
- Established patterns (state management, styling, data fetching)
- Integration points (where new code would connect)

Skip to Step 3 below.

**Step 2: If no codebase maps, do targeted grep**

Extract key terms from the phase goal (e.g., "feed" → "post", "card", "list"; "auth" → "login", "session", "token").

```bash
# Find files related to phase goal terms
grep -rl "{term1}\|{term2}" src/ app/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | head -10

# Find existing components/hooks
ls src/components/ 2>/dev/null
ls src/hooks/ 2>/dev/null
ls src/lib/ src/utils/ 2>/dev/null
```

Read the 3-5 most relevant files to understand existing patterns.

**Step 3: Build internal codebase_context**

From the scan, identify:
- **Reusable assets** — existing components, hooks, utilities that could be used in this phase
- **Established patterns** — how the codebase does state management, styling, data fetching
- **Integration points** — where new code would connect (routes, nav, providers)
- **Creative options** — approaches the existing architecture enables or constrains

Store as internal `<codebase_context>` for use in analyze_phase and present_gray_areas. This is NOT written to a file — it's used within this session only.
</step>

<step name="analyze_phase">
Analyze the phase to identify gray areas worth discussing. **Use both `prior_decisions` and `codebase_context` to ground the analysis.**

**Read the phase description from ROADMAP.md and determine:**

1. **Domain boundary** — What capability is this phase delivering? State it clearly.

2. **Check prior decisions** — Before generating gray areas, check if any were already decided:
   - Scan `<prior_decisions>` for relevant choices (e.g., "Ctrl+C only, no single-key shortcuts")
   - These are **pre-answered** — don't re-ask unless this phase has conflicting needs
   - Note applicable prior decisions for use in presentation

3. **Gray areas by category** — For each relevant category (UI, UX, Behavior, Empty States, Content), identify 1-2 specific ambiguities that would change implementation. **Annotate with code context where relevant** (e.g., "You already have a Card component" or "No existing pattern for this").

4. **Skip assessment** — If no meaningful gray areas exist (pure infrastructure, clear-cut implementation, or all already decided in prior phases), the phase may not need discussion.

**Output your analysis internally, then present to user.**

Example analysis for "Post Feed" phase (with code and prior context):
```
Domain: Displaying posts from followed users
Existing: Card component (src/components/ui/Card.tsx), useInfiniteQuery hook, Tailwind CSS
Prior decisions: "Minimal UI preferred" (Phase 2), "No pagination — always infinite scroll" (Phase 4)
Gray areas:
- UI: Layout style (cards vs timeline vs grid) — Card component exists with shadow/rounded variants
- UI: Information density (full posts vs previews) — no existing density patterns
- Behavior: Loading pattern — ALREADY DECIDED: infinite scroll (Phase 4)
- Empty State: What shows when no posts exist — EmptyState component exists in ui/
- Content: What metadata displays (time, author, reactions count)
```
</step>

<step name="present_gray_areas">
Present the domain boundary, prior decisions, and gray areas to user.

**First, state the boundary and any prior decisions that apply:**
```
Phase [X]: [Name]
Domain: [What this phase delivers — from your analysis]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)

[If prior decisions apply:]
**Carrying forward from earlier phases:**
- [Decision from Phase N that applies here]
- [Decision from Phase M that applies here]
```

**Then use AskUserQuestion (multiSelect: true):**
- header: "Discuss"
- question: "Which areas do you want to discuss for [phase name]?"
- options: Generate 3-4 phase-specific gray areas, each with:
  - "[Specific area]" (label) — concrete, not generic
  - [1-2 questions this covers + code context annotation] (description)
  - **Highlight the recommended choice with brief explanation why**

**Prior decision annotations:** When a gray area was already decided in a prior phase, annotate it:
```
☐ Exit shortcuts — How should users quit?
  (You decided "Ctrl+C only, no single-key shortcuts" in Phase 5 — revisit or keep?)
```

**Code context annotations:** When the scout found relevant existing code, annotate the gray area description:
```
☐ Layout style — Cards vs list vs timeline?
  (You already have a Card component with shadow/rounded variants. Reusing it keeps the app consistent.)
```

**Combining both:** When both prior decisions and code context apply:
```
☐ Loading behavior — Infinite scroll or pagination?
  (You chose infinite scroll in Phase 4. useInfiniteQuery hook already set up.)
```

**Do NOT include a "skip" or "you decide" option.** User ran this command to discuss — give them real choices.

**Examples by domain (with code context):**

For "Post Feed" (visual feature):
```
☐ Layout style — Cards vs list vs timeline? (Card component exists with variants)
☐ Loading behavior — Infinite scroll or pagination? (useInfiniteQuery hook available)
☐ Content ordering — Chronological, algorithmic, or user choice?
☐ Post metadata — What info per post? Timestamps, reactions, author?
```

For "Database backup CLI" (command-line tool):
```
☐ Output format — JSON, table, or plain text? Verbosity levels?
☐ Flag design — Short flags, long flags, or both? Required vs optional?
☐ Progress reporting — Silent, progress bar, or verbose logging?
☐ Error recovery — Fail fast, retry, or prompt for action?
```

For "Organize photo library" (organization task):
```
☐ Grouping criteria — By date, location, faces, or events?
☐ Duplicate handling — Keep best, keep all, or prompt each time?
☐ Naming convention — Original names, dates, or descriptive?
☐ Folder structure — Flat, nested by year, or by category?
```

Continue to discuss_areas with selected areas.
</step>

<step name="discuss_areas">
For each selected area, conduct a focused discussion loop.

**Philosophy: 4 questions, then check.**

Ask 4 questions per area before offering to continue or move on. Each answer often reveals the next question.

**For each area:**

1. **Announce the area:**
   ```
   Let's talk about [Area].
   ```

2. **Ask 4 questions using AskUserQuestion:**
   - header: "[Area]" (max 12 chars — abbreviate if needed)
   - question: Specific decision for this area
   - options: 2-3 concrete choices (AskUserQuestion adds "Other" automatically), with the recommended choice highlighted and brief explanation why
   - **Annotate options with code context** when relevant:
     ```
     "How should posts be displayed?"
     - Cards (reuses existing Card component — consistent with Messages)
     - List (simpler, would be a new pattern)
     - Timeline (needs new Timeline component — none exists yet)
     ```
   - Include "You decide" as an option when reasonable — captures Claude discretion
   - **Context7 for library choices:** When a gray area involves library selection (e.g., "magic links" → query next-auth docs) or API approach decisions, use `mcp__context7__*` tools to fetch current documentation and inform the options. Don't use Context7 for every question — only when library-specific knowledge improves the options.

3. **After 4 questions, check:**
   - header: "[Area]" (max 12 chars)
   - question: "More questions about [area], or move to next?"
   - options: "More questions" / "Next area"

   If "More questions" → ask 4 more, then check again
   If "Next area" → proceed to next selected area
   If "Other" (free text) → interpret intent: continuation phrases ("chat more", "keep going", "yes", "more") map to "More questions"; advancement phrases ("done", "move on", "next", "skip") map to "Next area". If ambiguous, ask: "Continue with more questions about [area], or move to the next area?"

4. **After all initially-selected areas complete:**
   - Summarize what was captured from the discussion so far
   - AskUserQuestion:
     - header: "Done"
     - question: "We've discussed [list areas]. Which gray areas remain unclear?"
     - options: "Explore more gray areas" / "I'm ready for context"
   - If "Explore more gray areas":
     - Identify 2-4 additional gray areas based on what was learned
     - Return to present_gray_areas logic with these new areas
     - Loop: discuss new areas, then prompt again
   - If "I'm ready for context": Proceed to write_context

**Question design:**
- Options should be concrete, not abstract ("Cards" not "Option A")
- Each answer should inform the next question
- If user picks "Other" to provide freeform input (e.g., "let me describe it", "something else", or an open-ended reply), ask your follow-up as plain text — NOT another AskUserQuestion. Wait for them to type at the normal prompt, then reflect their input back and confirm before resuming AskUserQuestion for the next question.

**Taste-informed questions:**
When a taste entry matches the current area being discussed:
- Present the taste pattern as the recommended default with conversational phrasing
- Example: "You've previously preferred explicit error messages over codes. Same here, or different approach?"
- If user agrees (>80% semantic similarity to taste pattern): queue counter update `{ tasteId, increment: 1 }` to `taste_counters.applied`
- If user disagrees (<50% similarity): queue counter update to `taste_counters.overridden`
- Middle ground (50-80%): prompt user for explicit confirmation before queueing

**Batch presentation:** When multiple tastes match the current discussion area, show all matching taste patterns together before discussing unmatched areas. User can accept all defaults or flag specific items for discussion.

**Scope creep handling:**
If user mentions something outside the phase domain:
```
"[Feature] sounds like a new capability — that belongs in its own phase.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas internally.
</step>

<step name="write_context">
Create CONTEXT.md capturing decisions made.

**Find or create phase directory:**

Use values from init: `phase_dir`, `phase_slug`, `padded_phase`.

If `phase_dir` is null (phase exists in roadmap but no directory):
```bash
mkdir -p "${planning_root}/phases/${padded_phase}-${phase_slug}"
```

**File location:** `${phase_dir}/${padded_phase}-CONTEXT.md`

**Structure the content by what was discussed:**

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers — the scope anchor]

</domain>

<decisions>
## Implementation Decisions

### [Category 1 that was discussed]
- [Decision or preference captured]
- [Another decision if applicable]

### [Category 2 that was discussed]
- [Decision or preference captured]

### Claude's Discretion
[Areas where user said "you decide" — note that Claude has flexibility here]

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [Component/hook/utility]: [How it could be used in this phase]

### Established Patterns
- [Pattern]: [How it constrains/enables this phase]

### Integration Points
- [Where new code connects to existing system]

</code_context>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion]

[If none: "No specific requirements — open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up but belong in other phases. Don't lose them.]

[If none: "None — discussion stayed within phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date]*
```

Write file.
</step>

<step name="persist_taste_counters">
Persist queued taste counter updates (if any were accumulated during discussion).

**If `taste_counters` has any entries (applied or overridden):**

```bash
# Format counter updates as JSON and pass to gsd-tools
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" update-taste-counters '${JSON.stringify(taste_counters)}' --raw
```

**If no taste counters queued:** Silent skip — no output.

Counter updates are persisted at CONTEXT.md write time (per Phase 22 decision) to avoid partial updates if the workflow is interrupted before context is written.
</step>

<step name="discuss_critic">
Check if adversarial critics should auto-spawn:

```bash
AUTO_SPAWN=$(node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.critics.auto_spawn 2>/dev/null || echo "true")
```

**If AUTO_SPAWN is "false":** Skip to confirm_creation step.

**If AUTO_SPAWN is "true":**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► REVIEWING DISCUSSION COMPLETENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning discuss-critic...
```

Spawn discuss-critic agent via Task():

```
Task(
  subagent_type="gsd-critic-discuss",
  model="{critic_model}",
  prompt="
    <objective>
    You are being invoked after discuss-phase for Phase {phase_number}: {phase_name}.
    Review the CONTEXT.md just created for blind spots, ambiguous decisions, and missing discussion areas.
    Produce CRITIQUE-discuss.md following ${planning_root}/critique-template.md format.
    </objective>

    <files_to_read>
    Read these files at start using the Read tool:
    - CONTEXT.md just written: {phase_dir}/{padded_phase}-CONTEXT.md
    - Roadmap: ${planning_root}/ROADMAP.md
    - Requirements: ${planning_root}/REQUIREMENTS.md
    - Severity ref: ${planning_root}/severity-reference.md
    - Critique template: ${planning_root}/critique-template.md
    - Project context: ${planning_root}/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
    </files_to_read>

    <output>
    Write your critique report to: {phase_dir}/CRITIQUE-discuss.md
    Follow ${planning_root}/critique-template.md format EXACTLY.
    Use critique_type: discuss in frontmatter.
    Use finding ID prefix: discuss-
    </output>

    <success_criteria>
    - CRITIQUE-discuss.md exists with valid YAML frontmatter
    - severity_counts matches actual finding count
    - Every finding has ID, file:line, evidence, severity justification
    - Findings organized: Critical > Warning > Info
    </success_criteria>
  ",
  description="Review Phase {phase} discussion completeness"
)
```

### Handle Discuss-Critic Results

Check for output:
```bash
ls "{phase_dir}/CRITIQUE-discuss.md" 2>/dev/null
```

If file doesn't exist: log warning "Discuss-critic did not produce output" and continue to confirm_creation.

If file exists, parse findings:
```bash
DISCUSS_PARSED=$(node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs critique parse "{phase_dir}/CRITIQUE-discuss.md")
```

**If NO findings (all counts are 0):**
Display: `✓ Discussion completeness check passed — no blind spots detected`
Continue to confirm_creation.

**If findings exist:**

Display inline findings summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DISCUSSION REVIEW RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{If critical findings:}
### Blind Spots (Critical)
| ID | Finding | Relates To |
|----|---------|------------|
| discuss-C-001 | {title} | {file:line reference} |

{If warning findings:}
### Areas for Consideration (Warning)
| ID | Finding | Relates To |
|----|---------|------------|
| discuss-W-001 | {title} | {file:line reference} |

{If info findings:}
### Info: {count} additional observations — see CRITIQUE-discuss.md
```

Use AskUserQuestion — NO circuit breaker for discuss-phase (user-driven):
- header: "Blind Spots"
- question: "The discuss-critic found {N} area(s) to consider. Want to revisit any topics, or proceed to planning?"
- options:
  - "Revisit topics" — Re-enter discussion for flagged areas (goes back to discuss_areas step with critic-identified areas as the gray areas)
  - "Proceed to planning" — Accept current context as-is and continue

**If "Revisit topics":**
- Extract the specific areas from critic findings (group findings by topic)
- Return to the `discuss_areas` step with these areas pre-loaded as the selected gray areas
- After discussion completes, re-write CONTEXT.md (write_context step)
- Re-spawn discuss-critic (this step again)
- NO counter limit — this loop is entirely user-controlled

**If "Proceed to planning":**
- Continue to confirm_creation step
</step>

<completion_gate priority="before confirm_creation">
**MANDATORY CHECK — Do NOT proceed past this point without verifying:**
- [ ] write_context completed (CONTEXT.md written/updated)
- [ ] persist_taste_counters completed (or skipped — no entries)
- [ ] discuss_critic step executed:
  - If auto_spawn=true: critic was spawned via `Task()`, results parsed and presented, user chose "Revisit topics" or "Proceed to planning"
  - If auto_spawn=false: step was explicitly skipped with log message "○ Discuss-critic skipped (auto_spawn disabled)"

This gate applies to ALL paths: new context, "Update existing context", and post-critic revisit loops.
Failure to execute these steps is a workflow violation.
</completion_gate>

<step name="confirm_creation">
Present summary and next steps:

```
Created: ${planning_root}/phases/${PADDED_PHASE}-${SLUG}/${PADDED_PHASE}-CONTEXT.md

## Decisions Captured

### [Category]
- [Key decision]

### [Category]
- [Key decision]

[If deferred ideas exist:]
## Noted for Later
- [Deferred idea] — future phase

---

## ▶ Next Up

**Phase ${PHASE}: [Name]** — [Goal from ROADMAP.md]

`/gsd-plan-phase ${PHASE}`

`/clear` then:

---

**Also available:**
- `/gsd-plan-phase ${PHASE} --skip-research` — plan without research
- Review/edit CONTEXT.md before continuing

---
```
</step>

<step name="git_commit">
Commit phase context (uses `commit_docs` from init internally):

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(${padded_phase}): capture phase context" --files "${phase_dir}/${padded_phase}-CONTEXT.md"
```

Confirm: "Committed: docs(${padded_phase}): capture phase context"
</step>

<step name="update_state">
Update STATE.md with session info:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state record-session \
  --stopped-at "Phase ${PHASE} context gathered" \
  --resume-file "${phase_dir}/${padded_phase}-CONTEXT.md"
```

Commit STATE.md:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(state): record phase ${PHASE} context session" --files ${planning_root}/STATE.md
```
</step>

<step name="auto_advance">
Check for auto-advance trigger:

1. Parse `--auto` flag from $ARGUMENTS
2. **Sync chain flag with intent** — if user invoked manually (no `--auto` and no `--chain`), clear the ephemeral chain flag from any previous interrupted `--auto` chain. This does NOT touch `workflow.auto_advance` (the user's persistent settings preference):
   ```bash
   if [[ ! "$ARGUMENTS" =~ --auto ]] && [[ ! "$ARGUMENTS" =~ --chain ]]; then
     node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active false 2>/dev/null
   fi
   ```
3. Read both the chain flag and user preference:
   ```bash
   AUTO_CHAIN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
   AUTO_CFG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present AND `AUTO_CHAIN` is not true:** Persist chain flag to config (handles direct `--auto` usage without new-project):
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active true
```

**If `--auto` flag present OR `AUTO_CHAIN` is true OR `AUTO_CFG` is true:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTO-ADVANCING TO PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context captured. Launching plan-phase...
```

Launch plan-phase using the Skill tool to avoid nested Task sessions (which cause runtime freezes due to deep agent nesting — see #686):
```
Skill(skill="gsd:plan-phase", args="${PHASE} --auto")
```

This keeps the auto-advance chain flat — discuss, plan, and execute all run at the same nesting level rather than spawning increasingly deep Task agents.

**Handle plan-phase return:**
- **PHASE COMPLETE** → Full chain succeeded. Display:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GSD ► PHASE ${PHASE} COMPLETE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Auto-advance pipeline finished: discuss → plan → execute

  Next: /gsd-discuss-phase ${NEXT_PHASE} --auto
  `/clear` then:
  ```
- **PLANNING COMPLETE** → Planning done, execution didn't complete:
  ```
  Auto-advance partial: Planning complete, execution did not finish.
  Continue: /gsd-execute-phase ${PHASE}
  ```
- **PLANNING INCONCLUSIVE / CHECKPOINT** → Stop chain:
  ```
  Auto-advance stopped: Planning needs input.
  Continue: /gsd-plan-phase ${PHASE}
  ```
- **GAPS FOUND** → Stop chain:
  ```
  Auto-advance stopped: Gaps found during execution.
  Continue: /gsd-plan-phase ${PHASE} --gaps
  ```

**If neither `--auto` nor config enabled:**
Route to `confirm_creation` step (existing behavior — show manual next steps).
</step>

</process>

<success_criteria>
- Phase validated against roadmap
- Prior context loaded (PROJECT.md, REQUIREMENTS.md, STATE.md, prior CONTEXT.md files)
- Active taste entries loaded (silent skip if none exist — zero behavior change)
- Already-decided questions not re-asked (carried forward from prior phases)
- Taste-matched gray areas use taste patterns as recommended defaults
- Codebase scouted for reusable assets, patterns, and integration points
- Gray areas identified through intelligent analysis with code and prior decision annotations
- User selected which areas to discuss
- Each selected area explored until user satisfied (with code-informed and prior-decision-informed options)
- Scope creep redirected to deferred ideas
- CONTEXT.md captures actual decisions, not vague vision
- CONTEXT.md includes code_context section with reusable assets and patterns
- Deferred ideas preserved for future phases
- Taste counters persisted at CONTEXT.md write time
- Discuss-critic spawned after CONTEXT.md written (when auto_spawn enabled)
- Blind spots presented inline with revisit offer
- STATE.md updated with session info
- User knows next steps
- DISCUSSION-LOG.md written alongside CONTEXT.md. Audit trail only — not consumed by downstream agents
</success_criteria>
