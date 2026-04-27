---
name: reapply-patches
description: Re-apply local patches after GSD update using three-way merge
argument-hint: "[--dry-run]"
---

<objective>
Re-apply user customizations to GSD files after an update overwrites them.
Uses three-way merge (pristine baseline → current installed → user's patched version)
to preserve user changes while accepting upstream updates.
</objective>

<process>

## 1. Detect modified files

Read `gsd-local-patches/backup-meta.json` for the list of files that were
backed up before the update.

## 2. For each modified file, choose merge strategy

### Option A — Three-way merge (preferred)

**Pristine baseline detection:** Use `pristine_hashes` from backup-meta.json as the
primary baseline source. For each file, read the SHA-256 hash recorded in
`backup-meta.json` and iterate git log commits (format="%H") to find the
commit whose blob matches the pristine hash.

This approach is necessary because the first add commit (via `git log --diff-filter=A`)
returns a stale baseline on repos that have been through multiple update cycles.
The first added version may be many versions old — not the version immediately
prior to the current update.

**Fallback:** If no pristine hash is recorded in backup-meta.json (older installer
that predates pristine_hashes), fall back to the diff-filter=A heuristic.

1. Locate pristine baseline via sha256sum hash matching from backup-meta.json
2. Extract pristine version from matching commit: `git show {COMMIT}:{path}`
3. Three-way merge: pristine (base) + current (theirs) + patched (ours)
4. Write merged result to disk

### Option B — Manual diff review

1. Show unified diff between current and patched
2. User applies changes manually

## 3. Gated hunk verification (#1999)

Before writing merged results, verify each hunk was applied correctly:

For each merged file:
1. Extract all hunks from the user's patch
2. Verify each hunk is present in the merged output
3. If a hunk is missing, flag it for manual review

**Hunk gate:** If any hunk fails verification, do NOT auto-write. Present
the failing hunks and ask user to confirm or manually fix.

## 4. Write merged result

Write the merged content to disk, replacing the current (updated) version.

## 5. Post-merge verification

After writing merged files, run a verification pass to detect dropped hunks:

**Hunk presence check:** For each user-modified section (from the patch), verify
the modification exists in the final merged file. Compare line-by-line against
the original patch hunks.

**Line-count check:** Compare the line count of the merged file against expected
(pristine + patch additions - patch deletions). Flag significant deviations.

Verification is advisory — do not block the merge. If verification finds issues:
- Status: "hunks may be missing" (vs "Merged (verified)" for clean merges)
- "Backup available at gsd-local-patches/{path} for manual recovery"

## 6. Report status per file

| File | Strategy | Status |
|------|----------|--------|
| path/to/file.md | Three-way merge | Merged (verified) |
| path/to/other.md | Three-way merge | hunks may be missing |

</process>

<success_criteria>
- [ ] All modified files detected from backup-meta.json
- [ ] Three-way merge attempted for each file with pristine baseline
- [ ] Gated hunk verification run before writing
- [ ] Post-merge verification confirms no dropped hunks
- [ ] Backup available for manual recovery
- [ ] Status report shows per-file results
</success_criteria>
