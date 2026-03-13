<purpose>
Sync this fork with the upstream get-shit-done repository. Provides a consistent
workflow for pulling upstream changes, reviewing them, selecting a merge strategy,
and resolving conflicts — with specific guidance for files known to diverge between
the fork and upstream.
</purpose>

<process>

<step name="verify_upstream">
Check if upstream remote exists:

```bash
git remote -v | grep upstream
```

**If upstream remote exists:** Confirm URL is correct.

**If upstream remote does NOT exist:**
```bash
git remote add upstream https://github.com/glittercowboy/get-shit-done.git
```

Verify:
```bash
git remote -v | grep upstream
```

Report: "Upstream remote configured: https://github.com/glittercowboy/get-shit-done.git"
</step>

<step name="fetch_upstream">
Fetch latest upstream changes:

```bash
git fetch upstream
```

Report: "Fetched latest upstream changes."
</step>

<step name="review_changes">
Show changes between current HEAD and upstream/main:

```bash
git log HEAD..upstream/main --oneline
```

**If no new commits:**
```
Already up to date with upstream. No new changes to merge.
```
Exit workflow.

**If new commits exist:**
```
## Upstream Changes

${commit_count} new commit(s) from upstream:

${commit_log}

---
```

Show file-level diff summary:
```bash
git diff HEAD..upstream/main --stat
```

Present changes to user for review.
</step>

<step name="select_strategy">
Let user choose merge strategy:

AskUserQuestion:
- header: "Merge strategy"
- question: "How would you like to incorporate upstream changes?"
- options:
  - "Merge all" — Merge all upstream commits into current branch
  - "Cherry-pick" — Select specific commits to merge
  - "Abort" — Cancel sync, review changes manually

**If "Merge all":** Proceed to merge_all step.
**If "Cherry-pick":** Proceed to cherry_pick step.
**If "Abort":** Exit with "Sync cancelled. Review changes with: git log HEAD..upstream/main"
</step>

<step name="merge_all">
Merge all upstream changes:

```bash
git merge upstream/main --no-edit
```

**If merge succeeds:** Proceed to post_merge_verify.

**If merge has conflicts:** Proceed to handle_conflicts.
</step>

<step name="cherry_pick">
Show commits and let user select:

```bash
git log HEAD..upstream/main --oneline --reverse
```

Ask user which commit hashes to cherry-pick (comma-separated or range).

For each selected commit:
```bash
git cherry-pick ${commit_hash}
```

If cherry-pick conflicts: proceed to handle_conflicts for each.
</step>

<step name="handle_conflicts">
When merge conflicts occur, provide targeted guidance.

**Known high-conflict files** (most likely to diverge between fork and upstream):
- `get-shit-done/workflows/discuss-phase.md` — Fork has taste consultation additions
- `get-shit-done/workflows/complete-milestone.md` — Fork has extraction gate
- `get-shit-done/bin/gsd-tools.cjs` — Fork has mistake registry, taste routing, researcher routing
- `get-shit-done/bin/lib/commands.cjs` — Fork has researcher scan/load commands
- `get-shit-done/bin/install.js` — Fork may have custom install hooks

**For each conflicted file:**

```bash
git diff --name-only --diff-filter=U
```

Present:
```
## Merge Conflicts

The following files have conflicts:

${conflict_list}

For each file, I'll show the conflict and recommend a resolution strategy.
```

**Resolution guidance per file type:**

1. **Workflow files (.md):** Fork additions (taste/extraction steps) should be preserved.
   Keep both fork additions AND upstream changes. Fork's steps are additive — they
   don't modify existing steps, they insert new ones.

2. **gsd-tools.cjs:** Fork additions (taste routing, mistake registry, researcher routing)
   are additive case statements. Keep fork additions AND upstream additions.
   The router switch statement allows both to coexist.

3. **lib/*.cjs:** Fork additions are new exports. Keep both.

4. **install.js:** Review carefully — both sides may modify the same install logic.
   Prefer upstream's install flow with fork's additional file copies.

For each conflict:
```bash
# Show conflict markers
grep -n "<<<<<<" ${file}
```

AskUserQuestion:
- header: "Resolve"
- question: "How to resolve ${file}?"
- options:
  - "Keep fork version" — Use our version (ours)
  - "Keep upstream version" — Use upstream (theirs)
  - "Manual merge" — I'll edit the file manually
  - "Show diff" — Show me the full conflict before deciding

After resolution:
```bash
git add ${file}
```

After all conflicts resolved:
```bash
git commit --no-edit
```
</step>

<step name="post_merge_verify">
Verify the merge result:

1. **Syntax check critical files:**
```bash
node -c get-shit-done/bin/gsd-tools.cjs
node -c get-shit-done/bin/lib/taste.cjs 2>/dev/null || true
node -c get-shit-done/bin/lib/commands.cjs
```

2. **Test install works:**
```bash
node bin/install.js --global --dry-run 2>/dev/null || echo "Note: --dry-run not supported, skipping install test"
```

3. **Verify fork-specific files still exist:**
```bash
ls get-shit-done/bin/lib/taste.cjs 2>/dev/null && echo "taste.cjs: OK" || echo "taste.cjs: MISSING"
ls commands/gsd/add-taste.md 2>/dev/null && echo "add-taste: OK" || echo "add-taste: MISSING"
ls commands/gsd/extract-taste.md 2>/dev/null && echo "extract-taste: OK" || echo "extract-taste: MISSING"
ls commands/gsd/add-mistake.md 2>/dev/null && echo "add-mistake: OK" || echo "add-mistake: MISSING"
ls commands/gsd/sync-upstream.md 2>/dev/null && echo "sync-upstream: OK" || echo "sync-upstream: MISSING"
```

Report:
```
## Sync Complete

Merged ${commit_count} upstream commit(s).
All syntax checks passed.
Fork-specific files verified.

Run `node bin/install.js --global` to update your installed version.
```
</step>

</process>

<success_criteria>
- [ ] Upstream remote configured
- [ ] Upstream changes fetched
- [ ] Changes reviewed by user
- [ ] Merge strategy selected and executed
- [ ] Conflicts resolved with appropriate guidance
- [ ] Post-merge syntax checks pass
- [ ] Fork-specific files verified present
- [ ] User knows to run install.js to update
</success_criteria>
