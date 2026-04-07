<purpose>
Display a summary table showing each user's active project, current phase, progress, and last activity across the monorepo.
</purpose>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init team-status)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON. Check `planning_exists` — if false, report "No multi-user planning structure found."

## 2. Get Team Status

```bash
STATUS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" team-status)
if [[ "$STATUS" == @file:* ]]; then STATUS=$(cat "${STATUS#@file:}"); fi
```

Parse JSON to get `users` array and `count`.

## 3. Display

If count is 0, display: "No users found under .planning/users/."

Otherwise, format as a table:

```
## Team Status

| User | Project | Status | Progress | Last Active |
|------|---------|--------|----------|-------------|
| dan  | frontend | active | 13/16 plans | 2 hours ago |
| alice | backend | in-progress | 4/8 plans | 3 days ago |

**Total:** 2 users
```

Include a header: "## Team Status" and the total user count.

</process>
