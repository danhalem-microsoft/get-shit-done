<purpose>
Orchestrate adversarial critique of a phase's artifacts. Spawn 1-5 critic agents in parallel via Task(), collect per-critic reports, merge with LLM-based root cause dedup, write merged CRITIQUE.md with diff tracking, and present inline summary.
</purpose>

<core_principle>
Orchestrator stays lean (~15-20% context). Critics get fresh 200k context each for deep analysis. Orchestrator only reads small per-critic temp files and performs structural merge/dedup -- never loads project source files directly.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
Read config.json for commit_docs setting.
</required_reading>

<process>

<step name="initialize" priority="first">
Parse $ARGUMENTS for phase number and --only flag.

**Phase resolution:**

```bash
# Extract phase number and flags from $ARGUMENTS
# Example inputs: "6", "6 --only=plan,code", "--only=plan", ""
```

If $ARGUMENTS contains a phase number: use it directly, no warning.

If NO phase number in $ARGUMENTS:
- Read STATE.md to get current phase number:
  ```bash
  INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state load)
  ```
- Extract current phase from JSON result
- Display warning: "Warning: Using Phase {N} from STATE.md -- specify phase number to override"

**Context initialization:**

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init critique "${PHASE_NUMBER}")
```

Extract from init JSON: `phase_dir`, `phase_number`, `phase_name`, `critic_model`, `commit_docs`, `has_previous_critique`, `previous_critique_path`.

**--only flag parsing:**

If --only flag present in $ARGUMENTS:
- Split comma-separated values
- Validate each against allowed set: [plan, code, scope, verify, discuss, strategy]
- Error on invalid values: "Invalid critic type: '{value}'. Valid: plan, code, scope, verify, discuss, strategy"
- Set CRITICS to the validated list

If no --only flag: CRITICS = [plan, code, scope, verify, discuss] (all 5)

**Report:**
```
---
## /gsd:critique -- Phase {N}: {Name}

Running {count} critic(s): {critic_list}
---
```
</step>

<step name="check_previous">
Check for existing CRITIQUE.md for diff tracking.

If init returned `has_previous_critique: true`:
- Parse previous CRITIQUE.md:
  ```bash
  PREV_PARSED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique parse "${previous_critique_path}")
  ```
- Store the parsed findings JSON for diff comparison in step 6 (diff_tracking)
- Rename previous CRITIQUE.md for safe diffing:
  ```bash
  cp "{phase_dir}/CRITIQUE.md" "{phase_dir}/CRITIQUE-previous.md"
  ```

**Clean up old temp files** from any previous run:
- Only delete temp files for critics being run (respect --only filter):
  ```bash
  # For each critic in CRITICS list:
  rm -f "{phase_dir}/CRITIQUE-{type}.md"
  ```
- Do NOT delete temp files for critics NOT being run (if --only specified, preserve others)
</step>

<step name="load_registry" priority="after check_previous, before spawn_critics">
Load mistake registry for critic context injection.

```bash
MISTAKES=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init mistakes)
```

Extract `mistake_count` and `mistakes` array from JSON result.

**If `mistake_count` is 0:** Set `REGISTRY_LOADED = false`. Skip all remaining registry processing. Critics will run without mistake context -- identical to pre-registry behavior.

**If `mistake_count` > 0:** Set `REGISTRY_LOADED = true`. Proceed to build per-critic context.

**Area-to-critic mapping (inline -- NOT a separate gsd-tools.cjs subcommand):**

For each mistake entry, determine which critics should receive it based on `area` tag:

| Area Tag | Critics |
|----------|---------|
| build-system | code, verify |
| testing | code, verify |
| api | code, plan |
| deployment | code, verify |
| tooling | code |
| database | code, plan |
| auth | code, scope |
| ui | code, verify |
| workflow | plan, scope |
| documentation | plan, discuss |
| security | code |
| performance | code |
| scope | scope, strategy |
| architecture | plan, code |
| (unknown area) | ALL critics |

**strategy critic:** Receives ALL entries regardless of area (reviews milestone-level patterns).

**Inclusive default:** When an area tag could apply to multiple critics, send to all of them (err on the side of inclusion).

**For each critic in CRITICS list, build its registry context:**

1. Filter the `mistakes` array: keep entries whose area maps to this critic type (per table above), PLUS all entries for strategy critic
2. For each matched entry, read the full mistake file content using the `path` field from the JSON to extract body sections
3. From the file content, extract two sections: `## Pattern` and `## Detection` (NOT Prevention -- Prevention is NOT sent to critics)
4. Include the file path so critics can read the full file when they detect a match and need Prevention for their finding output
5. Build the `<mistake_registry_context>` block for this critic's prompt:

```
<mistake_registry_context>
The following known mistake patterns are relevant to your review lane.
Check current work against these patterns. If you find a match, surface it
as a finding with minimum severity Warning.

Use Pattern + Detection to IDENTIFY matches.
When you find a match, read the full mistake file (path provided) to extract the
Prevention section, and include it in your finding output to make it actionable.

### MR-{NNN}: {title}
**Area:** {area}
**File:** {entry.path}

**Pattern:**
{pattern section content}

**Detection:**
{detection section content}

---
(repeat for each matched entry)
</mistake_registry_context>
```

**Report registry status:**
```
Mistake registry: {mistake_count} entries loaded
- {critic_type}: {N} entries matched
- {critic_type}: {N} entries matched
...
```
</step>

<step name="spawn_critics">
Display spawning indicators (following execute-phase pattern):

```
---
## Critique: Phase {N}

Spawning {count} critic(s) in parallel...

| Critic | Status |
|--------|--------|
| plan-critic | Spawning... |
| code-critic | Spawning... |
| scope-critic | Spawning... |
| verify-critic | Spawning... |
| discuss-critic | Spawning... |
---
```

**For each critic in CRITICS list, spawn a parallel Task():**

All Task() calls MUST be spawned simultaneously (parallel, not sequential).

**Subagent type resolution:** Use `gsd-critic-{type}` as the subagent_type. If a critic type is not registered as a subagent_type (e.g., `discuss`), fall back to `general-purpose` and prepend the prompt with: `"First, read ~/.claude/agents/gsd-critic-{type}.md for your role and instructions.\n\n"`.

```
Task(
  subagent_type="gsd-critic-{type}",
  model="{critic_model}",
  prompt="
    <objective>
    You are being invoked as part of /gsd:critique for Phase {phase_number}: {phase_name}.
    Review all relevant artifacts in this phase.
    Produce CRITIQUE-{type}.md following .planning/critique-template.md format.
    </objective>

    <files_to_read>
    Read these files at start using the Read tool:
    - Phase directory contents: {phase_dir}/ (list with Glob, then read PLANs, SUMMARYs, CONTEXT, RESEARCH)
    - Roadmap: .planning/ROADMAP.md
    - Requirements: .planning/REQUIREMENTS.md
    - Severity ref: .planning/severity-reference.md
    - Critique template: .planning/critique-template.md
    - Project context: .planning/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
    </files_to_read>

    {IF REGISTRY_LOADED AND this critic has matched entries from load_registry step:}
    <mistake_registry_context>
    {... per-critic context block built in load_registry step ...}
    </mistake_registry_context>
    {END IF}

    <output>
    Write your critique report to: {phase_dir}/CRITIQUE-{type}.md
    Follow .planning/critique-template.md format EXACTLY.
    Use critique_type: {type} in frontmatter.
    Use finding ID prefix: {type}-
    </output>

    <success_criteria>
    - CRITIQUE-{type}.md exists with valid YAML frontmatter
    - severity_counts matches actual finding count
    - Every finding has ID, file:line, evidence, severity justification (QUAL-02)
    - Findings organized: Critical > Warning > Info
    - Mistake registry entries checked against current work (if provided)
    </success_criteria>
  "
)
```

**Strategy critic special handling:** If the critic type is `strategy`, use a milestone-scope prompt instead of the phase-scope prompt above.

**Wait for all critics to complete.**

Update status table as each critic completes:
```
| plan-critic | Complete -- 2 critical, 3 warning, 1 info |
| code-critic | Complete -- 0 critical, 2 warning, 0 info |
```

If a critic fails (no output file): log warning and continue with available results.
</step>

<step name="collect_results">
After all critics complete, verify each expected temp file exists:

```bash
# For each critic that was spawned:
ls "{phase_dir}/CRITIQUE-{type}.md" 2>/dev/null
```

For any missing temp file: log warning "Warning: {type}-critic did not produce output" and skip in merge.

Parse each available temp file:
```bash
PARSED_{TYPE}=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique parse "{phase_dir}/CRITIQUE-{type}.md")
```

Collect all parsed results for the merge step.
</step>

<step name="merge_reports">
Combine findings from all available critic reports into a single merged CRITIQUE.md.

**Mechanical pre-merge:**

Call gsd-tools.cjs to get all findings in one structure with potential duplicate grouping:
```bash
MERGED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique merge {phase_dir}/CRITIQUE-plan.md {phase_dir}/CRITIQUE-code.md ...)
```

The merge command returns:
- `findings`: all findings in a flat list
- `potential_duplicates`: groups of findings sharing the same file reference from different critics
- `critics`: list of contributing critics
- `total`: total finding count

**LLM-based root cause dedup (orchestrator judgment):**

For each group in `potential_duplicates`:
1. Read the full evidence paragraphs from the per-critic temp files
2. Judge: same root cause? Different root causes at the same location?
3. If SAME root cause: merge into a single finding with richer evidence
4. If DIFFERENT root causes: keep both findings unchanged

**Construct merged CRITIQUE.md:**

Frontmatter:
- `critique_type`: `merged` (if multiple critics) or `{type}` (if --only with single critic)
- `phase`: phase identifier
- `reviewed_at`: current ISO timestamp
- `status`: `fail` if any critical findings, `warn` if warnings but no criticals, `pass` otherwise
- `critics`: array of all contributing critics
- `severity_counts`: recalculated from merged findings
- `reviewed_artifacts`: union from all per-critic reports
- `executive_summary`: synthesize from merged findings
- `dismissed`: carry forward from previous CRITIQUE.md if applicable

Body:
- Findings organized flat by severity: Critical > Warning > Info
- Each finding includes critic attribution

**Write merged CRITIQUE.md** to `{phase_dir}/CRITIQUE.md`.
</step>

<step name="diff_tracking">
Compare merged findings against previous CRITIQUE.md (if it existed).

**If previous CRITIQUE.md was parsed in step 2:**

Call diff tool:
```bash
DIFF=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique diff "{phase_dir}/CRITIQUE.md" "{phase_dir}/CRITIQUE-previous.md")
```

Tag findings with `[STILL OPEN]`, `[NEW]`, and add Resolved Findings section.

**Clean up:**
```bash
rm -f "{phase_dir}/CRITIQUE-previous.md"
```

**If NO previous CRITIQUE.md:** All findings are implicitly new -- do NOT tag them.
</step>

<step name="write_report">
Ensure the final merged CRITIQUE.md is written to `{phase_dir}/CRITIQUE.md`.

**Do NOT delete per-critic temp files** -- preserve for debugging.
</step>

<step name="present_summary">
Display inline summary with Critical and Warning findings in tables, Info as count only.
</step>

<step name="commit_report">
If `commit_docs` is true (from init):

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(phase-{N}): critique report" --files "{phase_dir}/CRITIQUE.md"
```

Commit ONLY the merged CRITIQUE.md. Do NOT commit per-critic temp files.
</step>

</process>

<context_efficiency>
Orchestrator: ~15-20% context. Critics: fresh 200k context each via Task(). Orchestrator reads only per-critic temp files, previous CRITIQUE.md, and gsd-tools.cjs JSON output.
</context_efficiency>

<error_handling>
- **Critic produces no output:** Log warning, skip in merge, continue with available results
- **Critic produces malformed output:** Parse what's possible, log parse_warnings
- **All critics fail:** Report error, suggest re-running with `--only`
- **Merge produces zero findings:** Report "No findings -- all checks passed"
- **Diff fails:** Log warning, skip diff tracking
- **Init fails (phase not found):** Error with clear message
</error_handling>

<resumption>
Re-running `/gsd:critique {phase}` overwrites the previous CRITIQUE.md (after diff tracking preserves change history).
</resumption>
