<purpose>
Check for GSD updates and execute clean installation. This fork uses git-based updates only (npm is not supported).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## Updating From Fork

1. `cd /path/to/your/get-shit-done`
2. `git pull origin main`
3. `node bin/install.js --global`
4. Verify: `node scripts/verify-install.js` (if available)

For upstream changes: use `/gsd:sync-upstream`

---

## Update Steps

<step name="detect_repo_location">
Find the GSD fork repository on disk. Check common locations:

```bash
# Check if we're already in the repo
if [ -f "bin/install.js" ] && [ -f "package.json" ] && grep -q "get-shit-done" package.json 2>/dev/null; then
  echo "REPO_DIR=$(pwd)"
elif [ -d "$HOME/get-shit-done" ] && [ -f "$HOME/get-shit-done/bin/install.js" ]; then
  echo "REPO_DIR=$HOME/get-shit-done"
elif [ -d "$HOME/personal/get-shit-done" ] && [ -f "$HOME/personal/get-shit-done/bin/install.js" ]; then
  echo "REPO_DIR=$HOME/personal/get-shit-done"
else
  echo "NOT_FOUND"
fi
```

If NOT_FOUND, ask the user where they cloned the repo.
</step>

<step name="get_installed_version">
Detect whether GSD is installed locally or globally by checking both locations and validating install integrity:

```bash
# Check local first (takes priority only if valid)
LOCAL_VERSION_FILE="" LOCAL_MARKER_FILE="" LOCAL_DIR=""
for dir in .claude .config/opencode .opencode .gemini; do
  if [ -f "./$dir/get-shit-done/VERSION" ]; then
    LOCAL_VERSION_FILE="./$dir/get-shit-done/VERSION"
    LOCAL_MARKER_FILE="./$dir/get-shit-done/workflows/update.md"
    LOCAL_DIR="$(cd "./$dir" 2>/dev/null && pwd)"
    break
  fi
done
GLOBAL_VERSION_FILE="" GLOBAL_MARKER_FILE="" GLOBAL_DIR=""
for dir in .claude .config/opencode .opencode .gemini; do
  if [ -f "$HOME/$dir/get-shit-done/VERSION" ]; then
    GLOBAL_VERSION_FILE="$HOME/$dir/get-shit-done/VERSION"
    GLOBAL_MARKER_FILE="$HOME/$dir/get-shit-done/workflows/update.md"
    GLOBAL_DIR="$(cd "$HOME/$dir" 2>/dev/null && pwd)"
    break
  fi
done

IS_LOCAL=false
if [ -n "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$LOCAL_VERSION_FILE"; then
  if [ -z "$GLOBAL_DIR" ] || [ "$LOCAL_DIR" != "$GLOBAL_DIR" ]; then
    IS_LOCAL=true
  fi
fi

if [ "$IS_LOCAL" = true ]; then
  cat "$LOCAL_VERSION_FILE"
  echo "LOCAL"
elif [ -n "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$GLOBAL_VERSION_FILE"; then
  cat "$GLOBAL_VERSION_FILE"
  echo "GLOBAL"
else
  echo "UNKNOWN"
fi
```

Parse output:
- If last line is "LOCAL": local install is valid; installed version is first line; use `--local`
- If last line is "GLOBAL": local missing/invalid, global install is valid; installed version is first line; use `--global`
- If "UNKNOWN": proceed to install step (treat as version 0.0.0)
</step>

<step name="pull_and_check">
Pull latest changes and check if there's anything new:

```bash
cd $REPO_DIR
git fetch origin main
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main)
if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  echo "ALREADY_CURRENT"
else
  git log --oneline HEAD..origin/main
  echo "UPDATES_AVAILABLE"
fi
```

**If ALREADY_CURRENT:**
```
## GSD Update

You're already on the latest version.
```

Exit.
</step>

<step name="show_changes_and_confirm">
**If updates available**, show what's new BEFORE updating:

```bash
cd $REPO_DIR
git log --oneline HEAD..origin/main
```

Display preview and ask for confirmation:

Use AskUserQuestion:
- Question: "Proceed with update?"
- Options:
  - "Yes, update now"
  - "No, cancel"

**If user cancels:** Exit.
</step>

<step name="run_update">
Pull and reinstall using the install type detected earlier:

```bash
cd $REPO_DIR
git pull origin main
```

**If LOCAL install:**
```bash
node bin/install.js --local
```

**If GLOBAL install (or unknown):**
```bash
node bin/install.js --global
```

Capture output. If install fails, show error and exit.

Clear the update cache so statusline indicator disappears:

```bash
for dir in .claude .config/opencode .opencode .gemini; do
  rm -f "./$dir/cache/gsd-update-check.json"
  rm -f "$HOME/$dir/cache/gsd-update-check.json"
done
```
</step>

<step name="display_result">
Format completion message:

```
GSD Updated successfully.

Restart Claude Code to pick up the new commands.
```
</step>

</process>

<success_criteria>
- [ ] Fork repo located on disk
- [ ] Installed version and location detected correctly
- [ ] Update skipped if already current
- [ ] Changes shown BEFORE update
- [ ] User confirmation obtained
- [ ] git pull executed successfully
- [ ] node bin/install.js executed successfully
- [ ] Restart reminder shown
</success_criteria>
