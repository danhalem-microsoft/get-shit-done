# Stack Research: Multi-User State Isolation Patterns

**Domain:** Multi-user state isolation in file-based monorepo dev tools
**Researched:** 2026-03-17
**Confidence:** HIGH (patterns are well-established across Nx, Bazel, Turborepo, Rush)

---

## Executive Summary

Every major monorepo tool solves the same problem GSD faces: separating **shared configuration** (committed, team-visible) from **per-user state** (local, ephemeral or user-scoped). The universal pattern is **structural isolation by directory** — not file locking, not databases, not IPC. GSD's planned `.planning/users/<user>/<project>/` hierarchy directly mirrors this industry consensus.

---

## Recommended Patterns

### Core Pattern: Shared Config vs Per-User State Separation

Every tool studied uses the same two-tier model:

| Tool | Shared (committed) | Per-User (gitignored or user-scoped) | Isolation Mechanism |
|------|-------------------|--------------------------------------|---------------------|
| **Bazel** | `BUILD` files, `MODULE.bazel`, `.bazelrc` | `~/.cache/bazel/_bazel_$USER/` (output_user_root) | OS-level user directory (`_bazel_$USER`) |
| **Nx** | `nx.json`, `project.json` | `.nx/cache/`, `.nx/workspace-data/` | Gitignored `.nx/` directory per workspace |
| **Turborepo** | `turbo.json` (root + package-level) | `.turbo/cache/`, auth tokens via env vars | Gitignored `.turbo/`, env-var credentials |
| **Rush** | `common/config/rush/`, `rush.json` | `common/temp/`, user auth via `.npmrc` | Gitignored `common/temp/` |
| **XDG Spec** | N/A | `$XDG_STATE_HOME` (~/.local/state), `$XDG_CONFIG_HOME` (~/.config) | Env-var-based directory resolution |

**Why this pattern dominates:** File locking adds complexity and failure modes (stale locks, deadlocks). Directory-level isolation makes conflicts **structurally impossible** — two users can never write to the same file because their files live at different paths. This is exactly what GSD's `users/<user>/<project>/` hierarchy achieves.

**Confidence: HIGH** — This is the unanimous approach across all surveyed tools.

---

### Pattern 1: Directory-Based User Isolation (Recommended for GSD)

**What:** Each user's state lives in a directory keyed by their identity. No two users share a state file.

**How Bazel does it:**
```
~/.cache/bazel/
  _bazel_dan/           # Per OS user
    <hash>/             # Per workspace (MD5 of workspace path)
      execroot/
      bazel-out/
  _bazel_alice/
    <hash>/
```

**How GSD should do it:**
```
.planning/
  config.json           # SHARED: Global defaults (committed)
  .active               # LOCAL: Current user+project selection (gitignored)
  users/
    dan/                # Per git user
      frontend/         # Per project
        PROJECT.md
        STATE.md
        ...
      auth-service/
    alice/
      frontend/
```

**Key difference from Bazel:** Bazel isolates state *outside* the repo (in `~/.cache/`). GSD intentionally keeps per-user state *inside* the repo (in `.planning/users/`) so it's git-tracked and visible to teammates via `/gsd:team-status`. This is a deliberate design choice — GSD planning artifacts are *collaborative artifacts*, not caches.

**Confidence: HIGH** — The PROJECT.md already specifies this structure and it matches industry patterns.

---

### Pattern 2: Git Identity Resolution

**What:** Derive the user directory name from `git config user.name` or `user.email`.

**How git config resolution works (from git docs):**
1. System level: `$(prefix)/etc/gitconfig`
2. Global level: `~/.gitconfig` or `$XDG_CONFIG_HOME/git/config`
3. Local level: `.git/config` (repo-specific, default for writes)
4. Worktree level: `.git/config.worktree`
5. Command line: `-c` flags and `GIT_CONFIG_*` env vars

Later levels override earlier ones. The programmatic API:
```bash
git config get user.name          # Returns resolved value
git config get --show-origin user.name  # Shows which file it came from
```

**Recommended implementation for GSD (Node.js):**
```javascript
const { execSync } = require('child_process');

function resolveGitUser() {
  try {
    // Prefer user.name — it's the human-readable identifier
    const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    if (name) return sanitizeForFilesystem(name);
  } catch (e) { /* not set */ }

  try {
    // Fallback: extract local-part from email
    const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    if (email) return sanitizeForFilesystem(email.split('@')[0]);
  } catch (e) { /* not set */ }

  // Last resort: OS username
  return sanitizeForFilesystem(require('os').userInfo().username);
}

function sanitizeForFilesystem(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')        // spaces → hyphens
    .replace(/[^a-z0-9._-]/g, '') // strip unsafe chars
    .replace(/^[.-]+/, '')        // no leading dots/hyphens
    .slice(0, 64);                // reasonable length limit
}
```

**Why `user.name` over `user.email`:**
- More readable directory names (`dan/` vs `dan.halem/`)
- Consistent with how monorepo tools identify users in logs
- `user.name` is more commonly configured (git requires it for commits)

**Edge cases to handle:**
- `user.name` not set → fall back to email local-part → fall back to OS username
- Multiple users with same name → unlikely in practice; if it happens, email-based resolution
- Name changes → creates a new directory; old projects orphaned (acceptable — documented behavior)

**Confidence: HIGH** — Git identity is the standard approach. No tool builds its own identity system.

---

### Pattern 3: Active Context Selection (`.active` File)

**What:** A local (gitignored) file that records which user+project is currently active, read by every `gsd-tools.cjs` invocation.

**Analogies in the ecosystem:**
- Bazel: `--output_base` flag (stateless, per-invocation)
- Nx: Implicit — the workspace root IS the project
- kubectl: `~/.kube/config` with `current-context` field
- AWS CLI: `~/.aws/credentials` with `[default]` profile + `AWS_PROFILE` env var
- nvm: `.nvmrc` per directory + `nvm use` to switch

**Recommended implementation:**
```json
// .planning/.active (gitignored)
{
  "user": "dan",
  "project": "frontend",
  "resolved_path": ".planning/users/dan/frontend",
  "set_at": "2026-03-17T10:30:00Z"
}
```

**Why `.active` should be gitignored:**
- Each user's active project is local state — it would conflict instantly if committed
- Matches how every tool handles "current selection" (kubectl context, AWS profile, etc.)
- The Turborepo pattern: what to cache (shared) vs where/how to authenticate (local)

**Why a file, not an env var:**
- Persists across shell sessions, terminal restarts
- Survives Claude Code `/clear` and session boundaries
- Single read per invocation (no env-var propagation issues across subagent spawns)
- Discoverable — you can `cat .planning/.active` to debug

**Override mechanism (recommended):**
```bash
# Env var override for CI or scripting
GSD_USER=alice GSD_PROJECT=frontend gsd-tools.cjs state load

# .active file is the default, env vars override
```

**Confidence: HIGH** — File-based context selection with env-var override is the universal pattern.

---

### Pattern 4: Atomic File Writes (Write-Temp-Rename)

**What:** Never write directly to a state file. Write to a temporary file, then atomically rename.

**Why this matters for GSD:** Multiple Claude Code sessions (or a user and an agent) could write to STATE.md or `.active` simultaneously. `fs.writeFileSync` is NOT atomic — a crash mid-write produces a corrupted file.

**The standard Node.js pattern:**
```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function atomicWriteSync(filePath, content) {
  const dir = path.dirname(filePath);
  // Temp file in same directory ensures same filesystem (rename requirement)
  const tmpPath = path.join(dir, `.tmp-${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);  // Atomic on POSIX
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
    throw err;
  }
}
```

**Why this works:**
- `fs.renameSync` is atomic on POSIX systems when source and target are on the same filesystem
- On Windows, `fs.renameSync` overwrites atomically as of Node.js 12+
- The temp file MUST be in the same directory (same mount point) as the target
- No external dependencies required — uses only `fs`, `path`, `crypto`

**Why NOT file locking:**
- File locking (`flock`, `lockfile`) adds failure modes (stale locks after crashes)
- GSD's structural isolation means two users never write the same file
- The only shared-write risk is `.active` — and that's per-user local state anyway
- Bazel uses a lock but also notes it's a source of problems ("contending for the same lock")

**Confidence: HIGH** — Write-temp-rename is the standard pattern. File locking is unnecessary given directory isolation.

---

### Pattern 5: Configuration Layering (Global → Project → Override)

**What:** Configuration resolved from multiple layers with clear precedence.

**How the ecosystem does it:**

| Layer | Git Analogy | Nx Analogy | GSD Equivalent |
|-------|-------------|------------|----------------|
| System defaults | `$(prefix)/etc/gitconfig` | Nx defaults | Hardcoded in `gsd-tools.cjs` |
| Shared config | — | `nx.json` | `.planning/config.json` |
| Project config | `.git/config` | `project.json` | `.planning/users/dan/frontend/config.json` |
| Local override | `-c key=value` | Env vars (`NX_*`) | `GSD_*` env vars |

**Recommended resolution order for GSD:**
```
1. Hardcoded defaults (in code)
2. .planning/config.json (shared, committed)
3. .planning/users/<user>/<project>/config.json (per-project, committed)
4. GSD_* environment variables (local, ephemeral)
```

Later layers override earlier layers. This is identical to how git, npm, and every major CLI tool resolves configuration.

**Confidence: HIGH** — Universal pattern across all surveyed tools.

---

### Pattern 6: Team Visibility Without Shared State

**What:** Users can see what others are working on without sharing state files.

**The approach:**
```bash
# /gsd:team-status implementation concept
# Simply scan the directory structure — no shared database needed

.planning/users/
  dan/
    frontend/STATE.md     → Parse frontmatter: current_phase, last_session
    auth-service/STATE.md → Parse frontmatter: current_phase, last_session
  alice/
    frontend/STATE.md     → Parse frontmatter: current_phase, last_session
```

**Why this works:**
- Each STATE.md is authoritative for its user+project combination
- Reading another user's STATE.md is a read-only operation — no conflict
- Git history shows when each user last committed state changes
- No aggregation service, no database, no polling

**How Nx does something similar:**
- `nx graph` reads project configuration from all `project.json` files
- No central registry — the filesystem IS the database
- Same pattern: scan directories, parse files, aggregate read-only

**Confidence: HIGH** — Filesystem-as-database for read-only aggregation is well-proven.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **File locking (flock/lockfile)** | Adds stale-lock failure modes; unnecessary with directory isolation | Write-temp-rename for atomicity; directory isolation for conflict avoidance |
| **SQLite or embedded databases** | Violates zero-dependency constraint; merge conflicts on binary files; overkill for this use case | Markdown + YAML frontmatter (existing pattern) |
| **Custom identity system** | Unnecessary complexity; git identity already available everywhere | `git config user.name` with filesystem sanitization |
| **Symlinks for active project** | Platform-inconsistent (Windows); confusing for debugging; git doesn't track symlinks well | JSON `.active` file with resolved path |
| **Environment-only context** | Doesn't persist across sessions; lost on terminal restart; not discoverable by agents | `.active` file with env-var override |
| **Centralized state server** | Violates async/git-based architecture; adds infrastructure dependency | Per-user state files with read-only aggregation |
| **Shared STATE.md with merge resolution** | Merge conflicts are inevitable; YAML/frontmatter merges are lossy | Separate STATE.md per user+project (structural isolation) |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| User-first hierarchy (`users/dan/project/`) | Project-first hierarchy (`projects/frontend/dan/`) | If projects are the primary organizational unit and users are secondary; NOT recommended for GSD because user autonomy is the core value |
| `.active` file in `.planning/` | Global active context in `~/.config/gsd/` (XDG pattern) | If same user works in multiple repos simultaneously and wants per-repo context; the in-repo `.active` is better because it's workspace-scoped like Nx/Turbo |
| Git `user.name` for identity | Git `user.email` for identity | If multiple users share the same `user.name`; email is guaranteed unique but produces uglier directory names |
| Committed per-user directories | Gitignored per-user directories (like `.nx/cache/`) | If planning artifacts are truly ephemeral; NOT for GSD because planning artifacts are durable collaborative context |
| Flat `.planning/.active` | Per-directory `.gsd-context` files (like `.nvmrc`) | If monorepo subdirectories map 1:1 to GSD projects; adds complexity for marginal benefit |

---

## Stack Patterns by Variant

**If single user, single project (backward-compat mode):**
- Detect absence of `users/` directory
- Fall back to flat `.planning/` as root
- No `.active` file needed — implicit single context
- *Rationale: Keeps GSD usable for solo devs who don't need multi-user*

**If CI/CD environment (no interactive user):**
- Set `GSD_USER` and `GSD_PROJECT` environment variables
- Skip `.active` file creation
- User resolved from env, not `git config`
- *Rationale: CI runners share git config; env vars provide explicit identity*

**If monorepo with Bazel targets:**
- Project names could map to Bazel package paths (e.g., `//frontend/app` → `frontend-app`)
- Optional `bazel_target` field in project `config.json`
- *Rationale: Allows GSD projects to reference Bazel build graph without coupling*

---

## Implementation Priorities (for Roadmap)

Based on the patterns above, the implementation order should be:

1. **Git identity resolution** — Foundation for everything else. Simple, well-defined, zero dependencies.
2. **Directory structure + path resolution** — Change `gsd-tools.cjs` to resolve paths through `users/<user>/<project>/`. This is the single biggest change.
3. **`.active` file + `/gsd:switch`** — Active context selection and switching.
4. **Configuration layering** — Global → project config resolution.
5. **Atomic writes** — Upgrade `fs.writeFileSync` calls to write-temp-rename.
6. **`/gsd:team-status`** — Read-only aggregation across user directories.

---

## Sources

- [Bazel Output Directory Layout](https://bazel.build/docs/output_directories) — `output_user_root` at `_bazel_$USER`, per-workspace hashing, directory isolation
- [Bazel Scripts and Output Base](https://bazel.build/run/scripts#output-base) — Lock contention, concurrent access, `--output_base` override
- [Nx Configuration (nx.json)](https://nx.dev/reference/nx-json) — Shared config in `nx.json`, cache in `.nx/cache/`, env-var overrides
- [Nx Caching](https://nx.dev/concepts/how-caching-works) — Local cache default, configurable `cacheDirectory`
- [Turborepo Configuration](https://turborepo.dev/repo/docs/reference/configuration) — `turbo.json` shared, `.turbo/cache/` local, auth via env vars
- [Rush Setup](https://rushjs.io/pages/maintainer/setup_new_repo/) — `common/config/rush/` shared, `common/temp/` gitignored
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) — `XDG_STATE_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` separation
- [Git Config Documentation](https://git-scm.com/docs/git-config) — Config hierarchy (system → global → local → worktree), programmatic access

---
*Stack research for: Multi-user state isolation in monorepo dev tools*
*Researched: 2026-03-17*
