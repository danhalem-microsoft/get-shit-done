/**
 * Multi-user planning context resolution tests.
 *
 * Asserts that `tryGetPlanningContext`, `planningPaths`, and downstream
 * handlers like `initPlanPhase` correctly route to
 * `.planning/users/<user>/<project>/` when an active project exists, and
 * gracefully fall back to flat `.planning/` otherwise.
 *
 * Without this fixture the SDK would silently revert to single-user behavior
 * on every upstream merge — multi-user is a fork-only feature so upstream's
 * goldens won't catch the regression. See sdk/src/query/context.ts header
 * for the parity targets in core.cjs / identity.cjs / context.cjs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { tryGetPlanningContext, getPlanningRoot } from './context.js';
import { planningPaths } from './helpers.js';
import { initPlanPhase } from './init.js';

const USER_SLUG = 'test-user';
const ENV_KEYS_TO_RESTORE = ['GSD_USER', 'GSD_PROJECT', 'CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];

let tmpDir: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-multi-user-'));
  // Snapshot any env keys we might mutate so afterEach can restore them.
  savedEnv = {};
  for (const k of ENV_KEYS_TO_RESTORE) savedEnv[k] = process.env[k];
  // Force git config to NOT be a fallback path — pin identity via env var.
  process.env.GSD_USER = USER_SLUG;
  // Clear CI vars so resolver doesn't hard-error on environments where they happen to be set.
  for (const k of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS']) {
    delete process.env[k];
  }
  delete process.env.GSD_PROJECT;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  for (const k of ENV_KEYS_TO_RESTORE) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function seedMultiUserProject(project: string, opts: { active?: boolean } = {}): Promise<void> {
  const projectDir = join(tmpDir, '.planning', 'users', USER_SLUG, project);
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'ROADMAP.md'), `# Roadmap: ${project}\n\n### Phase 1: test-phase\n\n**Goal:** test\n**Requirements**: TEST-01\n**Plans**: TBD\n`);
  await writeFile(join(projectDir, 'PROJECT.md'), `# ${project}\n`);
  await writeFile(join(projectDir, 'STATE.md'), '---\nstatus: ready\n---\n# State\n');
  await writeFile(join(projectDir, 'config.json'), JSON.stringify({
    workflow: { research: true, plan_check: true, verifier: true, nyquist_validation: true },
  }));
  if (opts.active) {
    const activePath = join(tmpDir, '.planning', 'users', USER_SLUG, '.active');
    await writeFile(activePath, JSON.stringify({ project, resolved_path: `.planning/users/${USER_SLUG}/${project}` }));
  }
}

describe('tryGetPlanningContext', () => {
  it('resolves active project from .active pointer when multiple projects exist', async () => {
    await seedMultiUserProject('proj-a');
    await seedMultiUserProject('proj-b', { active: true });

    const ctx = tryGetPlanningContext(tmpDir);
    expect(ctx.active_user).toBe(USER_SLUG);
    expect(ctx.active_project).toBe('proj-b');
    expect(ctx.planning_root).toBe(`.planning/users/${USER_SLUG}/proj-b`);
  });

  it('auto-selects when exactly one project exists under user dir', async () => {
    await seedMultiUserProject('only-proj');

    const ctx = tryGetPlanningContext(tmpDir);
    expect(ctx.active_project).toBe('only-proj');
    expect(ctx.planning_root).toBe(`.planning/users/${USER_SLUG}/only-proj`);
  });

  it('honors GSD_PROJECT env override over .active', async () => {
    await seedMultiUserProject('proj-a', { active: true });
    await seedMultiUserProject('proj-b');
    process.env.GSD_PROJECT = 'proj-b';

    const ctx = tryGetPlanningContext(tmpDir);
    expect(ctx.active_project).toBe('proj-b');
  });

  it('returns legacy_detected when flat .planning/PROJECT.md exists without users/', async () => {
    await mkdir(join(tmpDir, '.planning'), { recursive: true });
    await writeFile(join(tmpDir, '.planning', 'PROJECT.md'), '# Legacy project\n');

    const ctx = tryGetPlanningContext(tmpDir);
    expect(ctx.legacy_detected).toBe(true);
    expect(ctx.planning_root).toBeNull();
  });

  it('throws on CI/CD environment detection', () => {
    process.env.CI = 'true';
    expect(() => tryGetPlanningContext(tmpDir)).toThrow(/CI\/CD environment detected/);
  });

  it('returns null project when zero projects + no .active', async () => {
    // .planning/users/<user>/ exists but no project subdirs
    await mkdir(join(tmpDir, '.planning', 'users', USER_SLUG), { recursive: true });

    const ctx = tryGetPlanningContext(tmpDir);
    expect(ctx.active_user).toBe(USER_SLUG);
    expect(ctx.active_project).toBeNull();
    expect(ctx.planning_root).toBeNull();
  });
});

describe('getPlanningRoot', () => {
  it('returns user-scoped path when active project resolves', async () => {
    await seedMultiUserProject('proj-x', { active: true });

    expect(getPlanningRoot(tmpDir)).toBe(`.planning/users/${USER_SLUG}/proj-x`);
  });

  it('falls back to flat .planning/ when no multi-user context exists', async () => {
    // Bare .planning/ with nothing in it (upstream test fixture pattern)
    await mkdir(join(tmpDir, '.planning'), { recursive: true });

    expect(getPlanningRoot(tmpDir)).toBe('.planning');
  });

  it('throws when neither layout exists', () => {
    expect(() => getPlanningRoot(tmpDir)).toThrow(/No active project/);
  });
});

describe('planningPaths (multi-user routing)', () => {
  it('routes all paths to .planning/users/<user>/<project>/ when active project resolves', async () => {
    await seedMultiUserProject('routed', { active: true });

    const paths = planningPaths(tmpDir);
    const expectedBase = join(tmpDir, '.planning', 'users', USER_SLUG, 'routed').replace(/\\/g, '/');

    expect(paths.planning).toBe(expectedBase);
    expect(paths.state).toBe(`${expectedBase}/STATE.md`);
    expect(paths.roadmap).toBe(`${expectedBase}/ROADMAP.md`);
    expect(paths.config).toBe(`${expectedBase}/config.json`);
    expect(paths.phases).toBe(`${expectedBase}/phases`);
    expect(paths.requirements).toBe(`${expectedBase}/REQUIREMENTS.md`);
  });

  it('falls back to flat .planning/ paths when no multi-user context exists', () => {
    // Don't create anything — completely empty tmp dir
    const paths = planningPaths(tmpDir);
    const expected = join(tmpDir, '.planning').replace(/\\/g, '/');
    expect(paths.planning).toBe(expected);
  });
});

describe('initPlanPhase end-to-end multi-user resolution', () => {
  it('returns user-scoped paths for ROADMAP / STATE / phases when an active project exists', async () => {
    await seedMultiUserProject('e2e-project', { active: true });

    const result = await initPlanPhase(['1'], tmpDir);
    const data = result.data as Record<string, unknown>;

    expect(data.planning_exists).toBe(true);
    expect(data.roadmap_exists).toBe(true);
    expect(data.phase_found).toBe(true);
    expect(data.phase_name).toBe('test-phase');
    expect(data.state_path).toBe(`.planning/users/${USER_SLUG}/e2e-project/STATE.md`);
    expect(data.roadmap_path).toBe(`.planning/users/${USER_SLUG}/e2e-project/ROADMAP.md`);
  });
});
