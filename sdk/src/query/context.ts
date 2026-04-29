/**
 * Multi-user planning context resolution.
 *
 * TypeScript port of `get-shit-done/bin/lib/{identity.cjs, context.cjs, core.cjs}`'s
 * `tryGetPlanningContext` / `getPlanningRoot` / `resolveIdentity` chain.
 *
 * Resolves the active GSD project under `.planning/users/<user>/<project>/`
 * with graceful fallback to the flat `.planning/` layout when no multi-user
 * context exists. Hard-errors on CI/CD detection (GSD is not supported in CI).
 *
 * Used by `helpers.ts:planningPaths()` so every SDK query handler that touches
 * paths automatically honors multi-user routing without needing to know about
 * users or projects directly.
 *
 * Multi-user is fork-only behavior. Upstream tests using flat `.planning/`
 * fixtures keep working via the legacy fallback in `getPlanningRoot()`.
 *
 * Source of truth (parity targets):
 *   - `bin/lib/core.cjs:1806` (getPlanningRoot)
 *   - `bin/lib/core.cjs:1847` (tryGetPlanningContext)
 *   - `bin/lib/identity.cjs:18` (resolveIdentity)
 *   - `bin/lib/context.cjs:13` (readActiveContext)
 *
 * @example
 * ```typescript
 * import { tryGetPlanningContext } from './context.js';
 *
 * const ctx = tryGetPlanningContext('/repo');
 * // { active_user: 'dan-halem', active_project: 'frontend',
 * //   planning_root: '.planning/users/dan-halem/frontend' }
 * ```
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { GSDError, ErrorClassification } from '../errors.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PlanningContext {
  active_user: string | null;
  active_project: string | null;
  planning_root: string | null;
  legacy_detected?: boolean;
}

// ─── Internal helpers (kept private to avoid circular imports with helpers.ts) ─

/** Local execGit copy — context.ts cannot import from commit.ts because commit.ts imports planningPaths from helpers.ts which imports from this file. */
function execGit(cwd: string, args: string[]): { exitCode: number; stdout: string } {
  try {
    const result = spawnSync('git', args, { cwd, stdio: 'pipe' });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ? result.stdout.toString() : '',
    };
  } catch {
    return { exitCode: 1, stdout: '' };
  }
}

function safeReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

// ─── CI/CD Detection ───────────────────────────────────────────────────────

const CI_ENV_VARS = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];

function isCIEnvironment(): boolean {
  return CI_ENV_VARS.some((v) => process.env[v]);
}

// ─── Slug Generation (port of core.cjs.generateSlugInternal + identity.cjs.sanitizeSlug) ─

function generateSlug(raw: string): string | null {
  if (!raw) return null;
  const slug = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function sanitizeSlug(raw: string): string | null {
  const base = generateSlug(raw);
  if (!base) return null;
  return base.substring(0, 30).replace(/-+$/, '');
}

// ─── User-Map I/O (port of identity.cjs) ───────────────────────────────────

function loadUserMap(cwd: string): Record<string, string | number> {
  const mapPath = join(cwd, '.planning', 'user-map.json');
  const content = safeReadFile(mapPath);
  if (content === null) return {};
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function lockIdentity(cwd: string, raw: string, slug: string): string {
  const map = loadUserMap(cwd);

  if (typeof map[raw] === 'string') return map[raw] as string;

  const existingSlugs = new Set<string>(
    Object.entries(map)
      .filter(([k, v]) => typeof v === 'string' && !k.startsWith('_'))
      .map(([, v]) => v as string),
  );

  let finalSlug = slug;
  if (existingSlugs.has(finalSlug)) {
    let counter = 2;
    while (existingSlugs.has(`${slug}-${counter}`)) counter++;
    finalSlug = `${slug}-${counter}`;
  }

  if (!('_schema' in map)) map._schema = 1;
  map[raw] = finalSlug;

  // Only persist if .planning/ already exists. Skipping the write on fresh
  // repos prevents crashes during graceful-fail flows; identity will be
  // re-resolved and locked once .planning/ is created.
  const planningDir = join(cwd, '.planning');
  if (existsSync(planningDir)) {
    try {
      writeFileSync(join(planningDir, 'user-map.json'), JSON.stringify(map, null, 2) + '\n', 'utf-8');
    } catch {
      // Best-effort write — read-only filesystems or permission errors are non-fatal.
    }
  }

  return finalSlug;
}

// ─── Identity Resolution (port of identity.cjs.resolveIdentity) ────────────

function resolveIdentity(cwd: string): { slug: string; source: string } | null {
  // 1. GSD_USER env var (no sanitization, direct passthrough)
  if (process.env.GSD_USER) {
    return { slug: process.env.GSD_USER, source: 'GSD_USER' };
  }

  // 2. git config user.name
  const nameResult = execGit(cwd, ['config', 'user.name']);
  if (nameResult.exitCode === 0 && nameResult.stdout.trim()) {
    const raw = nameResult.stdout.trim();
    const slug = sanitizeSlug(raw);
    if (slug) return { slug: lockIdentity(cwd, raw, slug), source: 'git-user-name' };
  }

  // 3. git config user.email local-part
  const emailResult = execGit(cwd, ['config', 'user.email']);
  if (emailResult.exitCode === 0 && emailResult.stdout.trim()) {
    const localPart = emailResult.stdout.trim().split('@')[0];
    if (localPart) {
      const slug = sanitizeSlug(localPart);
      if (slug) return { slug: lockIdentity(cwd, localPart, slug), source: 'git-user-email' };
    }
  }

  // 4. OS username
  try {
    const username = userInfo().username;
    if (username) {
      const slug = sanitizeSlug(username);
      if (slug) return { slug: lockIdentity(cwd, username, slug), source: 'os-username' };
    }
  } catch {
    // os.userInfo() can throw in containers without /etc/passwd
  }

  return null;
}

// ─── Active Context Read (port of context.cjs.readActiveContext) ──────────

function readActiveContext(cwd: string, user: string): { project: string } | null {
  const activePath = join(cwd, '.planning', 'users', user, '.active');
  const content = safeReadFile(activePath);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed.project) return null;
    return { project: parsed.project };
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Soft resolver: returns active user / project / planning root, or all-null on
 * graceful failure. Used by `planningPaths()` so every SDK query honors
 * multi-user routing without explicit user/project args.
 *
 * Hard-errors on CI/CD environment detection (GSD is not supported in CI).
 *
 * Returns `{ legacy_detected: true }` when a flat `.planning/PROJECT.md`
 * exists but `.planning/users/` does not — caller should run `/gsd-migrate`.
 *
 * Resolution order matches `core.cjs:tryGetPlanningContext`:
 *   1. CI/CD env vars → throw
 *   2. Legacy flat layout → return legacy_detected=true
 *   3. `GSD_PROJECT` env var (highest priority project override)
 *   4. `.planning/users/<user>/.active`
 *   5. Auto-select when exactly one project directory exists under user dir
 *   6. Otherwise return user with null project
 */
export function tryGetPlanningContext(cwd: string): PlanningContext {
  if (isCIEnvironment()) {
    throw new GSDError(
      'GSD Error: CI/CD environment detected. GSD is not supported in CI.',
      ErrorClassification.Blocked,
    );
  }

  if (
    existsSync(join(cwd, '.planning', 'PROJECT.md')) &&
    !existsSync(join(cwd, '.planning', 'users'))
  ) {
    return { active_user: null, active_project: null, planning_root: null, legacy_detected: true };
  }

  const identity = resolveIdentity(cwd);
  if (!identity) {
    return { active_user: null, active_project: null, planning_root: null };
  }

  const user = identity.slug;
  const envProject = process.env.GSD_PROJECT;
  let project: string | null = null;

  if (envProject) {
    if (existsSync(join(cwd, '.planning', 'users', user, envProject))) {
      project = envProject;
    }
  } else {
    const active = readActiveContext(cwd, user);
    if (active && existsSync(join(cwd, '.planning', 'users', user, active.project))) {
      project = active.project;
    }

    if (!project) {
      const userDir = join(cwd, '.planning', 'users', user);
      try {
        const entries = readdirSync(userDir, { withFileTypes: true });
        const projects = entries
          .filter((e) => e.isDirectory() && e.name !== '_archived' && !e.name.startsWith('.'))
          .map((e) => e.name);
        if (projects.length === 1) project = projects[0];
      } catch {
        // userDir doesn't exist — leave project null
      }
    }
  }

  const planning_root = project ? toPosixPath(join('.planning', 'users', user, project)) : null;

  return { active_user: user, active_project: project, planning_root };
}

/**
 * Authoritative resolver: returns the user-qualified planning root string
 * (e.g. `.planning/users/dan-halem/frontend`) with graceful fallback to flat
 * `.planning/` when no multi-user context exists.
 *
 * Mirrors `core.cjs:1806`'s flat-layout fallback that lets upstream-style
 * test fixtures continue to work without an active project.
 *
 * Throws only when neither layout exists.
 */
export function getPlanningRoot(cwd: string): string {
  const ctx = tryGetPlanningContext(cwd);
  if (ctx.planning_root) return ctx.planning_root;
  if (existsSync(join(cwd, '.planning'))) return '.planning';
  throw new GSDError(
    'GSD Error: No active project. Run /gsd-new-project to create one, or /gsd-switch to select one.',
    ErrorClassification.Validation,
  );
}
