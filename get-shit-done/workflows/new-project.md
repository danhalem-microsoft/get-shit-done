<purpose>
Initialize a new project through unified flow: questioning, research (optional), requirements, roadmap. This is the most leveraged moment in any project — deep questioning here means better plans, better execution, better outcomes. One workflow takes you from idea to ready-for-planning.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<auto_mode>
## Auto Mode Detection

Check if `--auto` flag is present in $ARGUMENTS.

**If auto mode:**
- Skip brownfield mapping offer (assume greenfield)
- Skip deep questioning (extract context from provided document)
- Config: YOLO mode is implicit (skip that question), but ask granularity/git/agents FIRST (Step 2a)
- After config: run Steps 6-9 automatically with smart defaults:
  - Research: Always yes
  - Requirements: Include all table stakes + features from provided document
  - Requirements approval: Auto-approve
  - Roadmap approval: Auto-approve

**Document requirement:**
Auto mode requires an idea document — either:
- File reference: `/gsd:new-project --auto @prd.md`
- Pasted/written text in the prompt

If no document content provided, error:

```
Error: --auto requires an idea document.

Usage:
  /gsd:new-project --auto @your-idea.md
  /gsd:new-project --auto [paste or write your idea here]

The document should describe what you want to build.
```
</auto_mode>

<process>

## 1. Setup (Two-Step Bootstrap)

**MANDATORY FIRST STEP — Execute pre-init bootstrap before ANY user interaction.**

The new-project workflow uses a two-step bootstrap to solve the chicken-and-egg problem: `init new-project` needs an active project, but the project doesn't exist yet.

### Step 1.0: Pre-init bootstrap (no active project needed)

```bash
SETUP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init project-setup)
if [[ "$SETUP" == @file:* ]]; then SETUP=$(cat "${SETUP#@file:}"); fi
```

Parse JSON for: `user`, `projects` (array), `global_config` (object), `planning_exists` (bool).

**If `has_git` is false:** Initialize git:
```bash
git init
```

### Step 1.1: Show existing projects and ask for project name

**If `projects` array is non-empty:** Display existing projects with status summary before creating a new one:

```
You have ${projects.length} project(s):

| Project | Phase | Progress |
|---------|-------|----------|
| ${project.name} | ${project.current_phase || 'Not started'} | ${project.progress || '-'} |
| ... | ... | ... |

Create a new project?
```

**Ask for project name — this is the FIRST question:**

Ask inline (freeform): "What should this project be called?"

Wait for response. This is the project's human-readable name (e.g., "My Auth Service", "E-Commerce Platform").

### Step 1.2: Slugify, confirm, and check duplicates

Slugify the name:
```bash
SLUG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" generate-slug "${USER_INPUT}")
```

**Show slug and confirm:** "Project will be created as: `${SLUG}`. Proceed?"

**Check for duplicates:** If `SLUG` exists in `projects` array (match against `project.name`):
```
Error: Project "${SLUG}" already exists. Use /gsd:switch ${SLUG} to work on it.
```
Stop execution.

### Step 1.3: Ask scope

Ask inline (freeform): "Which monorepo subdirectory or Bazel target is this project scoped to? (press Enter to skip)"

Store response as `SCOPE_PATH` (null/empty if skipped).

### Step 1.4: Create directory structure and set active context

```bash
USER_SLUG="${user}"  # from project-setup response
mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"
```

**Seed config from global defaults:** If `global_config` is non-empty, write it to the new project's config.json:
```bash
# Write global_config as the new project's config.json
# If SCOPE_PATH was provided, add scope_path field to the config
```

Write `${planning_root}/config.json` with contents of `global_config`. If `SCOPE_PATH` was provided, add `"scope_path": "${SCOPE_PATH}"` to the JSON.

**Set active context:**
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" switch "${SLUG}"
```

The new project is now the active context. `planning_root` = `.planning/users/${USER_SLUG}/${SLUG}`.

### Step 1.5: Normal init (now has active project)

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init new-project)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `researcher_model`, `synthesizer_model`, `roadmapper_model`, `commit_docs`, `project_exists`, `has_codebase_map`, `planning_exists`, `has_existing_code`, `has_package_file`, `is_brownfield`, `needs_codebase_map`, `has_git`, `project_path`, `project_name`, `scope_path`, `config_path`.

**Scan researcher registry:**
```bash
RESEARCHERS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" researcher scan --raw 2>/dev/null || echo '{"count":0,"researchers":[]}')
```

Parse `RESEARCHERS` JSON for: `count`, `researchers` (array of `{name, output_file, description, file_path}` objects).

**If `project_exists` is true:** Error — project already initialized. Use `/gsd:progress`.

<decision_logging>
**Initialize decision logging (silent failure — never breaks workflow):**

```bash
LOG_INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" log-decision-init --workflow new-project --phase "setup" 2>/dev/null) || true
LOG_FILE=$(echo "$LOG_INIT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{console.log(JSON.parse(d).log_file)}catch{}" 2>/dev/null) || true
```

After each user response during context gathering, log the decision:

```bash
if [ -n "$LOG_FILE" ]; then
  node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" log-decision --log-file "$LOG_FILE" --question "$QUESTION" --response "$RESPONSE" 2>/dev/null || true
fi
```

All logging calls use `2>/dev/null || true` — logging NEVER breaks the workflow.
</decision_logging>

## 2. Brownfield Offer

**If auto mode:** Skip to Step 4 (assume greenfield, synthesize PROJECT.md from provided document).

**If `needs_codebase_map` is true** (from init — existing code detected but no codebase map):

Use AskUserQuestion:
- header: "Codebase"
- question: "I detected existing code in this directory. Would you like to map the codebase first?"
- options:
  - "Map codebase first" — Run /gsd:map-codebase to understand existing architecture (Recommended)
  - "Skip mapping" — Proceed with project initialization

**If "Map codebase first":**
```
Run `/gsd:map-codebase` first, then return to `/gsd:new-project`
```
Exit command.

**If "Skip mapping" OR `needs_codebase_map` is false:** Continue to Step 3.

## 2a. Auto Mode Config (auto mode only)

**If auto mode:** Collect config settings upfront before processing the idea document.

YOLO mode is implicit (auto = YOLO). Ask remaining config questions:

**Round 1 — Core settings (3 questions, no Mode question):**

```
AskUserQuestion([
  {
    header: "Granularity",
    question: "How finely should scope be sliced into phases?",
    multiSelect: false,
    options: [
      { label: "Coarse (Recommended)", description: "Fewer, broader phases (3-5 phases, 1-3 plans each)" },
      { label: "Standard", description: "Balanced phase size (5-8 phases, 3-5 plans each)" },
      { label: "Fine", description: "Many focused phases (8-12 phases, 5-10 plans each)" }
    ]
  },
  {
    header: "Execution",
    question: "Run plans in parallel?",
    multiSelect: false,
    options: [
      { label: "Parallel (Recommended)", description: "Independent plans run simultaneously" },
      { label: "Sequential", description: "One plan at a time" }
    ]
  },
  {
    header: "Git Tracking",
    question: "Commit planning docs to git?",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Planning docs tracked in version control" },
      { label: "No", description: "Keep ${planning_root}/ local-only (add to .gitignore)" }
    ]
  }
])
```

**Round 2 — Workflow agents (same as Step 5):**

```
AskUserQuestion([
  {
    header: "Research",
    question: "Research before planning each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Investigate domain, find patterns, surface gotchas" },
      { label: "No", description: "Plan directly from requirements" }
    ]
  },
  {
    header: "Plan Check",
    question: "Verify plans will achieve their goals? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Catch gaps before execution starts" },
      { label: "No", description: "Execute plans without verification" }
    ]
  },
  {
    header: "Verifier",
    question: "Verify work satisfies requirements after each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Confirm deliverables match phase goals" },
      { label: "No", description: "Trust execution, skip verification" }
    ]
  },
  {
    header: "AI Models",
    question: "Which AI models for planning agents?",
    multiSelect: false,
    options: [
      { label: "Balanced (Recommended)", description: "Sonnet for most agents — good quality/cost ratio" },
      { label: "Quality", description: "Opus for research/roadmap — higher cost, deeper analysis" },
      { label: "Budget", description: "Haiku where possible — fastest, lowest cost" }
    ]
  }
])
```

Create `${planning_root}/config.json` with mode set to "yolo":

```json
{
  "mode": "yolo",
  "granularity": "[selected]",
  "parallelization": true|false,
  "commit_docs": true|false,
  "model_profile": "quality|balanced|budget",
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false,
    "nyquist_validation": depth !== "quick",
    "auto_advance": true
  }
}
```

**If commit_docs = No:** Add `${planning_root}/` to `.gitignore`.

**Commit config.json:**

```bash
mkdir -p .planning
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "chore: add project config" --files ${planning_root}/config.json
```

**Persist auto-advance chain flag to config (survives context compaction):**

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active true
```

Proceed to Step 4 (skip Steps 3 and 5).

## 3. Deep Questioning

**If auto mode:** Skip (already handled in Step 2a). Extract project context from provided document instead and proceed to Step 4.

**Display stage banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Open the conversation:**

Ask inline (freeform, NOT AskUserQuestion):

"What do you want to build?"

Wait for their response. This gives you the context needed to ask intelligent follow-up questions.

**Follow the thread:**

Based on what they said, ask follow-up questions that dig into their response. Use AskUserQuestion with options that probe what they mentioned — interpretations, clarifications, concrete examples.

Keep following threads. Each answer opens new threads to explore. Ask about:
- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

Consult `questioning.md` for techniques:
- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Check context (background, not out loud):**

As you go, mentally check the context checklist from `questioning.md`. If gaps remain, weave questions naturally. Don't suddenly switch to checklist mode.

**Decision gate:**

When you could write a clear PROJECT.md, use AskUserQuestion:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to create PROJECT.md?"
- options:
  - "Create PROJECT.md" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

If "Keep exploring" — ask what they want to add, or identify gaps and probe naturally.

Loop until "Create PROJECT.md" selected.

## 4. Write PROJECT.md

**If auto mode:** Synthesize from provided document. No "Ready?" gate was shown — proceed directly to commit.

Synthesize all context into `${planning_root}/PROJECT.md` using the template from `templates/project.md`.

**For greenfield projects:**

Initialize requirements as hypotheses:

```markdown
## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope

- [Exclusion 1] — [why]
- [Exclusion 2] — [why]
```

All Active requirements are hypotheses until shipped and validated.

**For brownfield projects (codebase map exists):**

Infer Validated requirements from existing code:

1. Read `${planning_root}/codebase/ARCHITECTURE.md` and `STACK.md`
2. Identify what the codebase already does
3. These become the initial Validated set

```markdown
## Requirements

### Validated

- ✓ [Existing capability 1] — existing
- ✓ [Existing capability 2] — existing
- ✓ [Existing capability 3] — existing

### Active

- [ ] [New requirement 1]
- [ ] [New requirement 2]

### Out of Scope

- [Exclusion 1] — [why]
```

**Key Decisions:**

Initialize with any decisions made during questioning:

```markdown
## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice from questioning] | [Why] | — Pending |
```

**Last updated footer:**

```markdown
---
*Last updated: [date] after initialization*
```

Do not compress. Capture everything gathered.

**Commit PROJECT.md:**

```bash
mkdir -p .planning
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: initialize project" --files ${planning_root}/PROJECT.md
```

## 5. Workflow Preferences

**If auto mode:** Skip — config was collected in Step 2a. Proceed to Step 5.5.

**Check for global defaults** at `~/.gsd/defaults.json`. If the file exists, offer to use saved defaults:

```
AskUserQuestion([
  {
    question: "Use your saved default settings? (from ~/.gsd/defaults.json)",
    header: "Defaults",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Use saved defaults, skip settings questions" },
      { label: "No", description: "Configure settings manually" }
    ]
  }
])
```

If "Yes": read `~/.gsd/defaults.json`, use those values for config.json, and skip directly to **Commit config.json** below.

If "No" or `~/.gsd/defaults.json` doesn't exist: proceed with the questions below.

**Round 1 — Core workflow settings (4 questions):**

```
questions: [
  {
    header: "Mode",
    question: "How do you want to work?",
    multiSelect: false,
    options: [
      { label: "YOLO (Recommended)", description: "Auto-approve, just execute" },
      { label: "Interactive", description: "Confirm at each step" }
    ]
  },
  {
    header: "Granularity",
    question: "How finely should scope be sliced into phases?",
    multiSelect: false,
    options: [
      { label: "Coarse", description: "Fewer, broader phases (3-5 phases, 1-3 plans each)" },
      { label: "Standard", description: "Balanced phase size (5-8 phases, 3-5 plans each)" },
      { label: "Fine", description: "Many focused phases (8-12 phases, 5-10 plans each)" }
    ]
  },
  {
    header: "Execution",
    question: "Run plans in parallel?",
    multiSelect: false,
    options: [
      { label: "Parallel (Recommended)", description: "Independent plans run simultaneously" },
      { label: "Sequential", description: "One plan at a time" }
    ]
  },
  {
    header: "Git Tracking",
    question: "Commit planning docs to git?",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Planning docs tracked in version control" },
      { label: "No", description: "Keep ${planning_root}/ local-only (add to .gitignore)" }
    ]
  }
]
```

**Round 2 — Workflow agents:**

These spawn additional agents during planning/execution. They add tokens and time but improve quality.

| Agent | When it runs | What it does |
|-------|--------------|--------------|
| **Researcher** | Before planning each phase | Investigates domain, finds patterns, surfaces gotchas |
| **Plan Checker** | After plan is created | Verifies plan actually achieves the phase goal |
| **Verifier** | After phase execution | Confirms must-haves were delivered |

All recommended for important projects. Skip for quick experiments.

```
questions: [
  {
    header: "Research",
    question: "Research before planning each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Investigate domain, find patterns, surface gotchas" },
      { label: "No", description: "Plan directly from requirements" }
    ]
  },
  {
    header: "Plan Check",
    question: "Verify plans will achieve their goals? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Catch gaps before execution starts" },
      { label: "No", description: "Execute plans without verification" }
    ]
  },
  {
    header: "Verifier",
    question: "Verify work satisfies requirements after each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Confirm deliverables match phase goals" },
      { label: "No", description: "Trust execution, skip verification" }
    ]
  },
  {
    header: "AI Models",
    question: "Which AI models for planning agents?",
    multiSelect: false,
    options: [
      { label: "Balanced (Recommended)", description: "Sonnet for most agents — good quality/cost ratio" },
      { label: "Quality", description: "Opus for research/roadmap — higher cost, deeper analysis" },
      { label: "Budget", description: "Haiku where possible — fastest, lowest cost" }
    ]
  }
]
```

Create `${planning_root}/config.json` with all settings:

```json
{
  "mode": "yolo|interactive",
  "granularity": "coarse|standard|fine",
  "parallelization": true|false,
  "commit_docs": true|false,
  "model_profile": "quality|balanced|budget",
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false,
    "nyquist_validation": depth !== "quick"
  }
}
```

**If commit_docs = No:**
- Set `commit_docs: false` in config.json
- Add `${planning_root}/` to `.gitignore` (create if needed)

**If commit_docs = Yes:**
- No additional gitignore entries needed

**Commit config.json:**

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "chore: add project config" --files ${planning_root}/config.json
```

**Note:** Run `/gsd:settings` anytime to update these preferences.

## 5.5. Resolve Model Profile

Use models from init: `researcher_model`, `synthesizer_model`, `roadmapper_model`.

## 6. Research Decision

**If auto mode:** Default to "Research first" without asking.

Use AskUserQuestion:
- header: "Research"
- question: "Research the domain ecosystem before defining requirements?"
- options:
  - "Research first (Recommended)" — Discover standard stacks, expected features, architecture patterns
  - "Skip research" — I know this domain well, go straight to requirements

**If "Research first":**

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Researching [domain] ecosystem...
```

Create research directory:
```bash
mkdir -p ${planning_root}/research
```

**Determine milestone context:**

Check if this is greenfield or subsequent milestone:
- If no "Validated" requirements in PROJECT.md → Greenfield (building from scratch)
- If "Validated" requirements exist → Subsequent milestone (adding to existing app)

### Step 6.1: Check Registry Availability

Check `researchers` from the researcher scan result.

**If `researchers` is empty** (directory doesn't exist OR no valid types found):

Display fallback notice:
```
○ Registry not found — using standard researchers.
  Tip: The researchers/ directory enables dynamic selection.
```

→ Go to **Step 6.5 (Legacy Fallback)**

**If `researchers` has entries:**

→ Continue to **Step 6.2 (AI Selection)**

### Step 6.2: AI-Powered Researcher Recommendation

Read config for `research.always_include` and `research.max_researchers`:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get research.always_include 2>/dev/null || echo "[]"
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get research.max_researchers 2>/dev/null || echo "12"
```

Filter `always_include` against actual `researchers` names — silently drop any names that don't match a discovered type (config may reference types not yet installed).

**Build AI selection context from:**
- PROJECT.md summary (core value, constraints)
- Codebase signals from init (`is_brownfield`, `has_codebase_map`, `has_existing_code`, `has_package_file`)
- If brownfield: read `${planning_root}/codebase/ARCHITECTURE.md` and `STACK.md` for existing patterns
- Available researcher types from `researchers` (name + description for each)
- `always_include` list from config (these get "high" relevance by default)

**Try AI recommendation.** Analyze the project context and available researcher types. Score each researcher's relevance (high/medium/low) and generate a 1-sentence rationale. Always-include types automatically receive "high" relevance.

**If the AI recommendation step fails** (LLM timeout, unparseable response), **immediately fall back to manual catalog selection within this same step** (do NOT proceed to Step 6.3 or fall through to Step 6.5):

```
⚠ AI recommendation unavailable ({error reason}). Select manually:

Available researchers:
| # | Researcher | Description |
|---|------------|-------------|
| 1 | {name} | {description} |
| 2 | {name} | {description} |
| ... | ... | ... |
```

```
AskUserQuestion([
  {
    header: "Researchers",
    question: "Which researchers would you like to run? (e.g., 'stack, features, architecture')",
    multiSelect: false,
    options: [
      { label: "Core 4 (stack, features, architecture, pitfalls)", description: "Standard research set" },
      { label: "All available", description: "Run all {N} researchers" },
      { label: "Other", description: "Type researcher names (e.g., 'stack, features, security')" }
    ]
  }
])
```

If "Core 4": select stack, features, architecture, pitfalls (filter to only those that exist in `researchers`).
If "All available": select all discovered types (up to max cap).
If "Other" (free-text): parse names, apply the same parse-and-confirm pattern as Step 6.3.

After manual selection, skip to Step 6.3 validation checks then Step 6.4 (spawning).

**If AI recommendation succeeds**, present recommendation as a table:

```
## Recommended Researchers

Based on your project context, I recommend:

| # | Researcher | Relevance | Rationale |
|---|------------|-----------|-----------|
| 1 | {name} | High | [1-sentence rationale] |
| 2 | {name} | High | [1-sentence rationale] |
| 3 | {name} | Medium | [1-sentence rationale] |
| 4 | {name} | Medium | [1-sentence rationale] |

### Full Catalog

Also available (not recommended for this project):
- **{type-name}** — {description}
- **{type-name}** — {description}
```

→ Continue to Step 6.3

### Step 6.3: User Confirmation (with parse-and-confirm loop)

**If auto mode:** Skip user confirmation — use AI recommendations directly. If AI failed in auto mode, use `always_include` list or fall back to core 4 (stack, features, architecture, pitfalls). → Go to validation checks below.

Ask "Add or remove any?" using AskUserQuestion with single-select (NOT multiSelect):

```
AskUserQuestion([
  {
    header: "Researchers",
    question: "Add or remove any researchers? (e.g., 'add security, remove pitfalls')",
    multiSelect: false,
    options: [
      { label: "Looks good", description: "Use the recommended set" },
      { label: "Other", description: "Type your changes (e.g., 'add security, remove pitfalls')" }
    ]
  }
])
```

**If "Looks good":** Use recommended set as-is. → Go to validation checks below.

**If "Other" (free-text):** Enter parse-and-confirm loop:

```
LOOP:
  1. Parse additions and removals from free-text

  2. **Unknown researcher name detection (REG-04):**
     If a name doesn't match any type in researchers:

     I don't see a "{name}" researcher type yet. Would you like to:

     AskUserQuestion([
       {
         header: "New Type",
         question: "Create a custom '{name}' researcher?",
         multiSelect: false,
         options: [
           { label: "Create it now", description: "I'll guide you through a 4-question setup (takes ~2 minutes)" },
           { label: "Skip it", description: "Continue without {name} research" }
         ]
       }
     ])

     If "Create it now": Run guided creation flow:
       Q1: "What should this researcher's output file be named? (e.g., SECURITY.md)"
           Default: uppercased name + .md
       Q2: "What should this researcher investigate?"
           Show examples relevant to the name
       Q3: "How will this research be used? (downstream consumer)"
           Show examples
       Q4: "What makes this research high-quality? (List 3 checkboxes)"
           Show examples

       Write type file to: ~/.claude/get-shit-done/researchers/custom/{name}.md
       (Use _template.md format: frontmatter with name, output_file, description + <prompt_template> + <output_template>)

       Display: ✓ Created: ~/.claude/get-shit-done/researchers/custom/{name}.md
       Add to current selection and researchers.

     If "Skip it": Remove that name from the additions.

  3. Show interpretation:
     "I understood: add {X}, remove {Y}. Updated set: [{list}]"
     "Correct?"

  4. AskUserQuestion([
       {
         header: "Confirm",
         question: "Is this correct?",
         multiSelect: false,
         options: [
           { label: "Yes", description: "Proceed with this set" },
           { label: "No, let me clarify", description: "I'll re-enter my changes" }
         ]
       }
     ])

  5. If "Yes": exit loop with confirmed set
  6. If "No, let me clarify": return to top of loop — show current set again
     and re-prompt with same AskUserQuestion ("Looks good" / "Other")
```

**Validation checks (after confirmation):**

- If count > `config.research.max_researchers` (default 12): "Error: {N} researchers selected (max: {max}). Remove at least {N - max}." Loop back to "Add or remove?" prompt.
- If count == 1: "Warning: Only 1 researcher selected — synthesis will be limited." Show AskUserQuestion: "Continue with 1?" / "Select more". If "Select more": loop back.
- If count == 0: "Warning: No researchers selected." Show AskUserQuestion: "Skip research entirely?" / "Select researchers". If "Select researchers": loop back.
- Validate each selected type file: check frontmatter has name, output_file, description and prompt_template exists. If invalid: "Error: Type file {name} has invalid format: {errors}. Fix or remove it." Hard error — don't continue until fixed or removed.

### Step 6.4: Dynamic Spawning in Waves of 4

For each selected researcher, load the full type file to get its prompt_template:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" researcher load {name}
```

Build Task() prompt from the type file's prompt_template:
- Replace `{DOMAIN}` with project domain (from PROJECT.md)
- Replace `{MILESTONE_CONTEXT}` with greenfield/subsequent context
- Replace `{RESEARCH_QUESTION}` with dimension-appropriate question (from prompt_template)
- Replace `{PROJECT_CONTEXT}` with PROJECT.md summary
- Set output path: `${planning_root}/research/{output_file}`
- Use template: `~/.claude/get-shit-done/templates/research-project/{output_file}` (if it exists, otherwise let researcher create from output_template in type file)

Batch into waves of 4:

```
wave_size = 4
waves = chunk(selected_researchers, wave_size)
total_waves = len(waves)

for i, wave in enumerate(waves):
  Display:
  ◆ Spawning wave {i+1} of {total_waves}...
    → {researcher.name} research
    → {researcher.name} research
    → {researcher.name} research
    → {researcher.name} research

  Spawn all researchers in this wave as parallel Task() calls:

  Task(prompt="First, read $HOME/.claude/agents/gsd-project-researcher.md for your role and instructions.

  <research_type>
  Project Research — {researcher.name} dimension for [domain].
  </research_type>

  <milestone_context>
  {greenfield_or_subsequent_context}
  </milestone_context>

  {researcher.prompt_template with variables substituted}

  <output>
  Write to: ${planning_root}/research/{researcher.output_file}
  Use template (if exists): ~/.claude/get-shit-done/templates/research-project/{researcher.output_file}
  </output>
  ", subagent_type="gsd-project-researcher", model="{researcher_model}", description="{researcher.name} research")

  Wait for all tasks in wave to complete.

  Display wave report:
  ✓ Wave {i+1} complete: {researcher1.name} ✓, {researcher2.name} ✓, ...

  **Error handling per wave:**

  If 1 researcher fails:
    Display:
    ⚠ Researcher Failed: {name}
    Error: {error_message}

    AskUserQuestion([
      {
        header: "Failed",
        question: "Researcher '{name}' failed. What would you like to do?",
        multiSelect: false,
        options: [
          { label: "Retry", description: "Re-spawn the failed researcher" },
          { label: "Skip", description: "Continue without this researcher's output" },
          { label: "Abort", description: "Stop research entirely" }
        ]
      }
    ])

  If ALL researchers in wave fail:
    Display:
    ❌ Wave {i+1} Failed — all {wave_size} researchers failed.

    AskUserQuestion([
      {
        header: "Wave Failed",
        question: "All researchers in this wave failed. What would you like to do?",
        multiSelect: false,
        options: [
          { label: "Retry wave", description: "Wait and retry all researchers in this wave" },
          { label: "Select different", description: "Return to researcher selection" },
          { label: "Continue without research", description: "Skip remaining research, proceed to requirements" }
        ]
      }
    ])

    If "Select different": return to Step 6.3 user confirmation with current selection displayed.
```

**After all waves complete:** Continue to the synthesizer step below.

### Step 6.5: Legacy Fallback

**This path is only reached when `researchers` is empty (Step 6.1).**

Display spawning indicator:
```
◆ Spawning 4 researchers in parallel...
  → Stack research
  → Features research
  → Architecture research
  → Pitfalls research
```

Spawn 4 parallel gsd-project-researcher agents with path references:

```
Task(prompt="<research_type>
Project Research — Stack dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: Research the standard stack for building [domain] from scratch.
Subsequent: Research what's needed to add [target features] to an existing [domain] app. Don't re-research the existing system.
</milestone_context>

<question>
What's the standard 2025 stack for [domain]?
</question>

<files_to_read>
- {project_path} (Project context and goals)
</files_to_read>

<downstream_consumer>
Your STACK.md feeds into roadmap creation. Be prescriptive:
- Specific libraries with versions
- Clear rationale for each choice
- What NOT to use and why
</downstream_consumer>

<quality_gate>
- [ ] Versions are current (verify with Context7/official docs, not training data)
- [ ] Rationale explains WHY, not just WHAT
- [ ] Confidence levels assigned to each recommendation
</quality_gate>

<output>
Write to: ${planning_root}/research/STACK.md
Use template: ~/.claude/get-shit-done/templates/research-project/STACK.md
</output>
", subagent_type="gsd-project-researcher", model="{researcher_model}", description="Stack research")

Task(prompt="<research_type>
Project Research — Features dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: What features do [domain] products have? What's table stakes vs differentiating?
Subsequent: How do [target features] typically work? What's expected behavior?
</milestone_context>

<question>
What features do [domain] products have? What's table stakes vs differentiating?
</question>

<files_to_read>
- {project_path} (Project context)
</files_to_read>

<downstream_consumer>
Your FEATURES.md feeds into requirements definition. Categorize clearly:
- Table stakes (must have or users leave)
- Differentiators (competitive advantage)
- Anti-features (things to deliberately NOT build)
</downstream_consumer>

<quality_gate>
- [ ] Categories are clear (table stakes vs differentiators vs anti-features)
- [ ] Complexity noted for each feature
- [ ] Dependencies between features identified
</quality_gate>

<output>
Write to: ${planning_root}/research/FEATURES.md
Use template: ~/.claude/get-shit-done/templates/research-project/FEATURES.md
</output>
", subagent_type="gsd-project-researcher", model="{researcher_model}", description="Features research")

Task(prompt="<research_type>
Project Research — Architecture dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: How are [domain] systems typically structured? What are major components?
Subsequent: How do [target features] integrate with existing [domain] architecture?
</milestone_context>

<question>
How are [domain] systems typically structured? What are major components?
</question>

<files_to_read>
- {project_path} (Project context)
</files_to_read>

<downstream_consumer>
Your ARCHITECTURE.md informs phase structure in roadmap. Include:
- Component boundaries (what talks to what)
- Data flow (how information moves)
- Suggested build order (dependencies between components)
</downstream_consumer>

<quality_gate>
- [ ] Components clearly defined with boundaries
- [ ] Data flow direction explicit
- [ ] Build order implications noted
</quality_gate>

<output>
Write to: ${planning_root}/research/ARCHITECTURE.md
Use template: ~/.claude/get-shit-done/templates/research-project/ARCHITECTURE.md
</output>
", subagent_type="gsd-project-researcher", model="{researcher_model}", description="Architecture research")

Task(prompt="<research_type>
Project Research — Pitfalls dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: What do [domain] projects commonly get wrong? Critical mistakes?
Subsequent: What are common mistakes when adding [target features] to [domain]?
</milestone_context>

<question>
What do [domain] projects commonly get wrong? Critical mistakes?
</question>

<files_to_read>
- {project_path} (Project context)
</files_to_read>

<downstream_consumer>
Your PITFALLS.md prevents mistakes in roadmap/planning. For each pitfall:
- Warning signs (how to detect early)
- Prevention strategy (how to avoid)
- Which phase should address it
</downstream_consumer>

<quality_gate>
- [ ] Pitfalls are specific to this domain (not generic advice)
- [ ] Prevention strategies are actionable
- [ ] Phase mapping included where relevant
</quality_gate>

<output>
Write to: ${planning_root}/research/PITFALLS.md
Use template: ~/.claude/get-shit-done/templates/research-project/PITFALLS.md
</output>
", subagent_type="gsd-project-researcher", model="{researcher_model}", description="Pitfalls research")
```

### Step 6.6: Synthesize Research

**This step runs after either Step 6.4 (dynamic) or Step 6.5 (legacy fallback).**

After all researchers complete, read and validate research files, then spawn synthesizer with inlined content:

**Pre-flight validation:** Before building the synthesizer prompt, read each research output file and verify it exists and is non-empty. For the dynamic path, the files are determined by the selected researchers' `output_file` fields. For the legacy path, the files are STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

```
For each selected researcher:
  Read ${planning_root}/research/{researcher.output_file} → ${FILE_CONTENT}
```

If any file is missing or empty, fail with clear error:
```
Error: Research file missing or empty: ${planning_root}/research/{FILE}.md
All research files must exist before synthesis. Check researcher agent output.
```

**Build synthesizer prompt with inlined content:**
```
Task(prompt="First, read the gsd-research-synthesizer agent file for your role and instructions.

<research_files>

<research_file name="{output_file_1}">
{content of ${planning_root}/research/{output_file_1}}
</research_file>

<research_file name="{output_file_2}">
{content of ${planning_root}/research/{output_file_2}}
</research_file>

...repeat for each research file...

</research_files>

<output>
Write to: ${planning_root}/research/SUMMARY.md
Commit all research files in ${planning_root}/research/ after writing.
</output>
", subagent_type="gsd-research-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

**Handle contradiction return from synthesizer:**

After synthesizer returns, check for `<contradictions>` block in the return:

- **If no contradictions:** Proceed normally to research complete banner.
- **If contradictions detected:** Show each contradiction to user via AskUserQuestion:
  ```
  Warning: Research Contradiction Detected

  Topic: {topic}
  - {file_a} recommends: {position_a}
  - {file_b} recommends: {position_b}
  Impact: {impact}

  Options:
  1. Pick: {position_a}
  2. Pick: {position_b}
  3. Re-run {file_a} and/or {file_b} research to resolve
  ```
  - If user picks a position: pass resolution as additional context and re-spawn synthesizer (max 1 re-synthesis, 2 total)
  - If user requests more research: re-run affected researcher(s), then re-synthesize
  - If contradictions persist after re-synthesis: force user to pick positions, apply as edits to existing SUMMARY.md (no additional synthesis run)
  - Track synthesis count — max 2 total (initial + 1 re-synthesis)

Display research complete banner and key findings:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCH COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Key Findings

**Stack:** [from SUMMARY.md]
**Table Stakes:** [from SUMMARY.md]
**Watch Out For:** [from SUMMARY.md]

Files: `${planning_root}/research/`
```

**If "Skip research":** Continue to Step 7.

## 7. Define Requirements

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Load context:**

Read PROJECT.md and extract:
- Core value (the ONE thing that must work)
- Stated constraints (budget, timeline, tech limitations)
- Any explicit scope boundaries

**If research exists:** Read research/FEATURES.md and extract feature categories.

**If auto mode:**
- Auto-include all table stakes features (users expect these)
- Include features explicitly mentioned in provided document
- Auto-defer differentiators not mentioned in document
- Skip per-category AskUserQuestion loops
- Skip "Any additions?" question
- Skip requirements approval gate
- Generate REQUIREMENTS.md and commit directly

**Present features by category (interactive mode only):**

```
Here are the features for [domain]:

## Authentication
**Table stakes:**
- Sign up with email/password
- Email verification
- Password reset
- Session management

**Differentiators:**
- Magic link login
- OAuth (Google, GitHub)
- 2FA

**Research notes:** [any relevant notes]

---

## [Next Category]
...
```

**If no research:** Gather requirements through conversation instead.

Ask: "What are the main things users need to be able to do?"

For each capability mentioned:
- Ask clarifying questions to make it specific
- Probe for related capabilities
- Group into categories

**Scope each category:**

For each category, use AskUserQuestion:

- header: "[Category]" (max 12 chars)
- question: "Which [category] features are in v1?"
- multiSelect: true
- options:
  - "[Feature 1]" — [brief description]
  - "[Feature 2]" — [brief description]
  - "[Feature 3]" — [brief description]
  - "None for v1" — Defer entire category

Track responses:
- Selected features → v1 requirements
- Unselected table stakes → v2 (users expect these)
- Unselected differentiators → out of scope

**Identify gaps:**

Use AskUserQuestion:
- header: "Additions"
- question: "Any requirements research missed? (Features specific to your vision)"
- options:
  - "No, research covered it" — Proceed
  - "Yes, let me add some" — Capture additions

**Validate core value:**

Cross-check requirements against Core Value from PROJECT.md. If gaps detected, surface them.

**Generate REQUIREMENTS.md:**

Create `${planning_root}/REQUIREMENTS.md` with:
- v1 Requirements grouped by category (checkboxes, REQ-IDs)
- v2 Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, CONTENT-02)

**Requirement quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

Reject vague requirements. Push for specificity:
- "Handle authentication" → "User can log in with email/password and stay logged in across sessions"
- "Support sharing" → "User can share post via link that opens in recipient's browser"

**Present full requirements list (interactive mode only):**

Show every requirement (not counts) for user confirmation:

```
## v1 Requirements

### Authentication
- [ ] **AUTH-01**: User can create account with email/password
- [ ] **AUTH-02**: User can log in and stay logged in across sessions
- [ ] **AUTH-03**: User can log out from any page

### Content
- [ ] **CONT-01**: User can create posts with text
- [ ] **CONT-02**: User can edit their own posts

[... full list ...]

---

Does this capture what you're building? (yes / adjust)
```

If "adjust": Return to scoping.

**Commit requirements:**

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: define v1 requirements" --files ${planning_root}/REQUIREMENTS.md
```

## 8. Create Roadmap

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...
```

Spawn gsd-roadmapper agent with path references:

```
Task(prompt="
<planning_context>

<files_to_read>
- ${planning_root}/PROJECT.md (Project context)
- ${planning_root}/REQUIREMENTS.md (v1 Requirements)
- ${planning_root}/research/SUMMARY.md (Research findings - if exists)
- ${planning_root}/config.json (Granularity and mode settings)
</files_to_read>

</planning_context>

<instructions>
Create roadmap:
1. Derive phases from requirements (don't impose structure)
2. Map every v1 requirement to exactly one phase
3. Derive 2-5 success criteria per phase (observable user behaviors)
4. Validate 100% coverage
5. Write files immediately (ROADMAP.md, STATE.md, update REQUIREMENTS.md traceability)
6. Return ROADMAP CREATED with summary

Write files first, then return. This ensures artifacts persist even if context is lost.
</instructions>
", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Create roadmap")
```

**Handle roadmapper return:**

**If `## ROADMAP BLOCKED`:**
- Present blocker information
- Work with user to resolve
- Re-spawn when resolved

**If `## ROADMAP CREATED`:**

Read the created ROADMAP.md and present it nicely inline:

```
---

## Proposed Roadmap

**[N] phases** | **[X] requirements mapped** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 2 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 3 | [Name] | [Goal] | [REQ-IDs] | [count] |
...

### Phase Details

**Phase 1: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]
3. [criterion]

**Phase 2: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]

[... continue for all phases ...]

---
```

**If auto mode:** Skip approval gate — auto-approve and commit directly.

**CRITICAL: Ask for approval before committing (interactive mode only):**

Use AskUserQuestion:
- header: "Roadmap"
- question: "Does this roadmap structure work for you?"
- options:
  - "Approve" — Commit and continue
  - "Adjust phases" — Tell me what to change
  - "Review full file" — Show raw ROADMAP.md

**If "Approve":** Continue to commit.

**If "Adjust phases":**
- Get user's adjustment notes
- Re-spawn roadmapper with revision context:
  ```
  Task(prompt="
  <revision>
  User feedback on roadmap:
  [user's notes]

  <files_to_read>
  - ${planning_root}/ROADMAP.md (Current roadmap to revise)
  </files_to_read>

  Update the roadmap based on feedback. Edit files in place.
  Return ROADMAP REVISED with changes made.
  </revision>
  ", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Revise roadmap")
  ```
- Present revised roadmap
- Loop until user approves

**If "Review full file":** Display raw `cat ${planning_root}/ROADMAP.md`, then re-ask.

**Commit roadmap (after approval or auto mode):**

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: create roadmap ([N] phases)" --files ${planning_root}/ROADMAP.md ${planning_root}/STATE.md ${planning_root}/REQUIREMENTS.md
```

## 9. Done

Present completion summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**[Project Name]**

| Artifact       | Location                    |
|----------------|-----------------------------|
| Project        | `${planning_root}/PROJECT.md`      |
| Config         | `${planning_root}/config.json`     |
| Research       | `${planning_root}/research/`       |
| Requirements   | `${planning_root}/REQUIREMENTS.md` |
| Roadmap        | `${planning_root}/ROADMAP.md`      |

**[N] phases** | **[X] requirements** | Ready to build ✓
```

**If auto mode:**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → DISCUSS PHASE 1        ║
╚══════════════════════════════════════════╝
```

Exit skill and invoke SlashCommand("/gsd:discuss-phase 1 --auto")

**If interactive mode:**

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase 1: [Phase Name]** — [Goal from ROADMAP.md]

/gsd:discuss-phase 1 — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

---

**Also available:**
- /gsd:plan-phase 1 — skip discussion, plan directly

───────────────────────────────────────────────────────────────
```

</process>

<output>

- `${planning_root}/PROJECT.md`
- `${planning_root}/config.json`
- `${planning_root}/research/` (if research selected)
  - `STACK.md`
  - `FEATURES.md`
  - `ARCHITECTURE.md`
  - `PITFALLS.md`
  - `SUMMARY.md`
- `${planning_root}/REQUIREMENTS.md`
- `${planning_root}/ROADMAP.md`
- `${planning_root}/STATE.md`

</output>

<success_criteria>

- [ ] Project name asked FIRST (before any context gathering)
- [ ] Name slugified and confirmed with user
- [ ] Duplicate names blocked with clear error directing to /gsd:switch
- [ ] ${planning_root}/ directory created under `.planning/users/<user>/<project>/`
- [ ] Active context set to new project via /gsd:switch
- [ ] config.json seeded from global config defaults
- [ ] Scope path asked and stored in config.json (if provided)
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Deep questioning completed (threads followed, not rushed)
- [ ] PROJECT.md captures full context → **committed**
- [ ] config.json has workflow mode, granularity, parallelization → **committed**
- [ ] Research completed (if selected) — dynamic researcher selection with registry, or legacy 4-researcher fallback → **committed**
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category (v1/v2/out of scope)
- [ ] REQUIREMENTS.md created with REQ-IDs → **committed**
- [ ] gsd-roadmapper spawned with context
- [ ] Roadmap files written immediately (not draft)
- [ ] User feedback incorporated (if any)
- [ ] ROADMAP.md created with phases, requirement mappings, success criteria
- [ ] STATE.md initialized
- [ ] REQUIREMENTS.md traceability updated
- [ ] User knows next step is `/gsd:discuss-phase 1`

**Atomic commits:** Each phase commits its artifacts immediately. If context is lost, artifacts persist.

</success_criteria>
