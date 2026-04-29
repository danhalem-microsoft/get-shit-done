<purpose>
Investigate UAT gaps and find root causes inline (in the orchestrator's main thread).

After UAT finds gaps, walk each gap one at a time: form hypotheses, read suspect files, test them, and capture the diagnosis. Update UAT.md with root causes, then hand off to plan-phase --gaps so it can author targeted fixes from actual diagnoses (not guesses).

The debugger agent has been retired — diagnostic work runs inline in the orchestrator using the standard reasoning + Read/Grep/Bash tools.
</purpose>

<paths>
DEBUG_DIR=${planning_root}/debug

Debug files use the `${planning_root}/debug/` path (hidden directory with leading dot).
</paths>

<core_principle>
**Diagnose before planning fixes.**

UAT tells us WHAT is broken (symptoms). Inline diagnosis finds WHY (root cause). plan-phase --gaps then creates targeted fixes based on actual causes, not guesses.

Without diagnosis: "Comment doesn't refresh" → guess at fix → maybe wrong
With diagnosis: "Comment doesn't refresh" → "useEffect missing dependency" → precise fix
</core_principle>

<process>


**Worktree config:** Read USE_WORKTREES from config:
```bash
USE_WORKTREES=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.use_worktrees 2>/dev/null || echo "true")
```
<step name="parse_gaps">
**Extract gaps from UAT.md:**

Read the "Gaps" section (YAML format):
```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  artifacts: []
  missing: []
```

For each gap, also read the corresponding test from "Tests" section to get full context.

Build gap list:
```
gaps = [
  {truth: "Comment appears immediately...", severity: "major", test_num: 2, reason: "..."},
  {truth: "Reply button positioned correctly...", severity: "minor", test_num: 5, reason: "..."},
  ...
]
```
</step>

<step name="report_plan">
**Report diagnosis plan to user:**

```
## Diagnosing {N} Gaps

Investigating root causes inline (sequentially):

| Gap (Truth) | Severity |
|-------------|----------|
| Comment appears immediately after submission | major |
| Reply button positioned correctly | minor |
| Delete removes comment | blocker |

For each gap, the orchestrator will:
1. Create DEBUG-{slug}.md with symptoms pre-filled
2. Form hypotheses, read suspect files, narrow down the cause
3. Record root cause + suggested fix direction
```
</step>

<step name="diagnose_gaps">
**Investigate each gap inline (sequential, no agent spawn):**

For each gap, follow the scientific-method debugging loop directly in the orchestrator's main thread using Read, Grep, and Bash:

1. **Reproduce** — confirm the symptom from the UAT test description.
2. **Hypothesize** — list 2-4 plausible causes (missing dependency, race condition, wrong import path, off-by-one, etc.).
3. **Read suspect files** — pull only the files relevant to each hypothesis.
4. **Test** — minimal scripted reproduction or targeted code inspection to falsify hypotheses.
5. **Capture** — write the confirmed root cause + evidence to `${DEBUG_DIR}/{slug}.md`.

Use the `get-shit-done/templates/DEBUG.md` template structure for each debug file.

For each gap, record:
- root_cause: The diagnosed cause
- files: Files involved
- debug_path: Path to debug session file
- suggested_fix: Hint for the gap-closure plan

If a gap cannot be diagnosed with reasonable effort:
- root_cause: "Investigation inconclusive — manual review needed"
- Note which issue needs manual attention and which hypotheses remain open
</step>

<step name="update_uat">
**Update UAT.md gaps with diagnosis:**

For each gap in the Gaps section, add artifacts and missing fields:

```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
    - "Trigger re-render when new comment added"
  debug_session: ${planning_root}/debug/comment-not-refreshing.md
```

Update status in frontmatter to "diagnosed".

Commit the updated UAT.md:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs({phase_num}): add root causes from diagnosis" --files "${planning_root}/phases/XX-name/{phase_num}-UAT.md"
```
</step>

<step name="report_results">
**Report diagnosis results and hand off:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DIAGNOSIS COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Gap (Truth) | Root Cause | Files |
|-------------|------------|-------|
| Comment appears immediately | useEffect missing dependency | CommentList.tsx |
| Reply button positioned correctly | CSS flex order incorrect | ReplyButton.tsx |
| Delete removes comment | API missing auth header | api/comments.ts |

Debug sessions: ${DEBUG_DIR}/

Proceeding to plan fixes...
```

Return to verify-work orchestrator for automatic planning.
Do NOT offer manual next steps - verify-work handles the rest.
</step>

</process>

<context_efficiency>
Inline diagnosis avoids agent-spawn overhead (UAT symptoms are already in context).
Diagnosis only — plan-phase --gaps handles fixes (no fix application here).
</context_efficiency>

<failure_handling>
**Inline diagnosis cannot find root cause for a gap:**
- Mark gap as "needs manual review"
- Continue with other gaps
- Report incomplete diagnosis

**A diagnosis loop runs out of useful hypotheses:**
- Check DEBUG-{slug}.md for partial progress
- Note open hypotheses in the debug session for future work

**All gaps stay inconclusive:**
- Something systemic (permissions, git, etc.)
- Report for manual investigation
- Fall back to plan-phase --gaps without root causes (less precise)
</failure_handling>

<success_criteria>
- [ ] Gaps parsed from UAT.md
- [ ] Each gap diagnosed inline in the orchestrator (no agent spawn)
- [ ] Root causes captured for every gap (or marked "manual review needed")
- [ ] UAT.md gaps updated with artifacts and missing
- [ ] Debug sessions saved to ${DEBUG_DIR}/
- [ ] Hand off to verify-work for automatic planning

**worktree_branch_check:** If diagnosis runs in a worktree (USE_WORKTREES=true), verify the worktree base before reading files. Use `git reset --hard` (not --soft) to correct any base mismatch.
</success_criteria>
