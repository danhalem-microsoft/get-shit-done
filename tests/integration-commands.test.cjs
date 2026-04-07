/**
 * Integration tests: Multi-user path resolution across 6 high-risk commands.
 *
 * Verifies that execute-phase, plan-phase, verify-work, phase-op (discuss-phase),
 * quick, and progress all resolve planning_root to .planning/users/<user>/<project>/
 * using three resolution methods:
 *   1. .active file
 *   2. GSD_USER + GSD_PROJECT env vars (no .active)
 *   3. Single-project auto-select (no .active, exactly 1 project)
 *
 * Requirement: LIFE-08
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createTempMultiUserProject, cleanup, TOOLS_PATH } = require('./helpers.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

const USER_SLUG = 'test-user';
const PROJECT_NAME = 'test-project';

/**
 * Run gsd-tools with optional env overrides. Returns parsed result.
 * On command failure, still returns output/error for inspection.
 */
function runCommand(args, cwd, env = {}) {
  const argList = typeof args === 'string' ? args.split(' ') : args;
  try {
    const result = execFileSync(process.execPath, [TOOLS_PATH, ...argList], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { success: true, output: result.trim(), error: '' };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

/**
 * Create temp multi-user project with a minimal phase directory for commands
 * that take a phase argument.
 */
function setupProject(opts = {}) {
  const result = createTempMultiUserProject({
    userSlug: USER_SLUG,
    projectName: PROJECT_NAME,
    ...opts,
  });
  const planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
  const projectDir = path.join(result.tmpDir, planningRoot);

  // Create a minimal phase directory for commands that need phase arg
  const phaseDir = path.join(projectDir, 'phases', '01-test');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Test Plan\n');

  return { tmpDir: result.tmpDir, userSlug: result.userSlug, projectName: result.projectName, planningRoot, projectDir };
}

/**
 * Extract planning_root from command output — checks stdout even on failure,
 * since some commands may fail for reasons unrelated to path resolution.
 */
function extractPlanningRoot(result) {
  const text = result.output || result.error;
  try {
    const parsed = JSON.parse(text);
    return parsed.planning_root;
  } catch {
    return null;
  }
}

/**
 * Extract active_user and active_project from command output.
 */
function extractContext(result) {
  const text = result.output || result.error;
  try {
    const parsed = JSON.parse(text);
    return {
      active_user: parsed.active_user,
      active_project: parsed.active_project,
      planning_root: parsed.planning_root,
    };
  } catch {
    return { active_user: null, active_project: null, planning_root: null };
  }
}

// The 6 commands to test with their init args
const COMMANDS = [
  { name: 'execute-phase', args: ['init', 'execute-phase', '01'] },
  { name: 'plan-phase', args: ['init', 'plan-phase', '01'] },
  { name: 'verify-work', args: ['init', 'verify-work', '01'] },
  { name: 'phase-op', args: ['init', 'phase-op', '01'] },
  { name: 'quick', args: ['init', 'quick', 'test task'] },
  { name: 'progress', args: ['init', 'progress'] },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Command integration: multi-user path resolution', () => {

  // ── Method 1: .active file ──────────────────────────────────────────────

  describe('via .active file', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    for (const cmd of COMMANDS) {
      test(`${cmd.name} init resolves planning_root via .active file`, () => {
        const ctx = setupProject({ withActive: true });
        tmpDir = ctx.tmpDir;

        const result = runCommand(cmd.args, tmpDir);
        const context = extractContext(result);

        assert.strictEqual(
          context.planning_root,
          `.planning/users/${USER_SLUG}/${PROJECT_NAME}`,
          `${cmd.name}: planning_root mismatch. Output: ${result.output}. Error: ${result.error}`
        );
        assert.strictEqual(context.active_user, USER_SLUG,
          `${cmd.name}: active_user mismatch`);
        assert.strictEqual(context.active_project, PROJECT_NAME,
          `${cmd.name}: active_project mismatch`);
      });
    }
  });

  // ── Method 2: GSD_USER + GSD_PROJECT env vars ──────────────────────────

  describe('via GSD_USER + GSD_PROJECT env vars', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    for (const cmd of COMMANDS) {
      test(`${cmd.name} init resolves planning_root via env vars`, () => {
        // Create project WITHOUT .active file
        const ctx = setupProject({ withActive: false });
        tmpDir = ctx.tmpDir;

        const result = runCommand(cmd.args, tmpDir, {
          GSD_USER: USER_SLUG,
          GSD_PROJECT: PROJECT_NAME,
        });
        const context = extractContext(result);

        assert.strictEqual(
          context.planning_root,
          `.planning/users/${USER_SLUG}/${PROJECT_NAME}`,
          `${cmd.name}: planning_root mismatch via env vars. Output: ${result.output}. Error: ${result.error}`
        );
        assert.strictEqual(context.active_user, USER_SLUG,
          `${cmd.name}: active_user mismatch via env vars`);
        assert.strictEqual(context.active_project, PROJECT_NAME,
          `${cmd.name}: active_project mismatch via env vars`);
      });
    }
  });

  // ── Method 3: Single-project auto-select ───────────────────────────────

  describe('via single-project auto-select', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    for (const cmd of COMMANDS) {
      test(`${cmd.name} init resolves planning_root via auto-select`, () => {
        // Create project WITHOUT .active file — single project triggers auto-select
        const ctx = setupProject({ withActive: false });
        tmpDir = ctx.tmpDir;

        const result = runCommand(cmd.args, tmpDir);
        const context = extractContext(result);

        assert.strictEqual(
          context.planning_root,
          `.planning/users/${USER_SLUG}/${PROJECT_NAME}`,
          `${cmd.name}: planning_root mismatch via auto-select. Output: ${result.output}. Error: ${result.error}`
        );
        assert.strictEqual(context.active_user, USER_SLUG,
          `${cmd.name}: active_user mismatch via auto-select`);
        assert.strictEqual(context.active_project, PROJECT_NAME,
          `${cmd.name}: active_project mismatch via auto-select`);
      });
    }
  });

  // ── Cross-method consistency ───────────────────────────────────────────

  describe('cross-method consistency', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    test('all resolution methods produce identical context for execute-phase', () => {
      // Method 1: .active
      const ctx1 = setupProject({ withActive: true });
      tmpDir = ctx1.tmpDir;
      const result1 = extractContext(runCommand(['init', 'execute-phase', '01'], tmpDir));
      cleanup(tmpDir);

      // Method 2: env vars
      const ctx2 = setupProject({ withActive: false });
      tmpDir = ctx2.tmpDir;
      const result2 = extractContext(runCommand(['init', 'execute-phase', '01'], tmpDir, {
        GSD_USER: USER_SLUG,
        GSD_PROJECT: PROJECT_NAME,
      }));
      cleanup(tmpDir);

      // Method 3: auto-select
      const ctx3 = setupProject({ withActive: false });
      tmpDir = ctx3.tmpDir;
      const result3 = extractContext(runCommand(['init', 'execute-phase', '01'], tmpDir));

      // All three should match
      assert.deepStrictEqual(result1, result2, 'active vs env vars mismatch');
      assert.deepStrictEqual(result2, result3, 'env vars vs auto-select mismatch');
    });
  });
});
