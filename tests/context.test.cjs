/**
 * GSD Tools Tests - context.cjs
 *
 * Tests for active project context management: readActiveContext, writeActiveContext,
 * resolveContext, .gitignore management, GSD_PROJECT env var override, and
 * circular dependency safety.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createTempMultiUserProject, createTempProject, cleanup } = require('./helpers.cjs');
const { readActiveContext, writeActiveContext, resolveContext } = require('../get-shit-done/bin/lib/context.cjs');
const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');

// ─── readActiveContext ──────────────────────────────────────────────────────

describe('readActiveContext', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('returns null when .active does not exist', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const ctx = readActiveContext(tmpDir, 'test-user');
    assert.strictEqual(ctx, null);
  });

  test('returns parsed context from .active', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;
    const ctx = readActiveContext(tmpDir, 'test-user');
    assert.deepStrictEqual(ctx, {
      project: 'test-project',
      resolved_path: '.planning/users/test-user/test-project',
    });
  });

  test('returns null on corrupted .active JSON', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const activePath = path.join(tmpDir, '.planning', 'users', 'test-user', '.active');
    fs.writeFileSync(activePath, 'this is not valid json {{{', 'utf-8');
    const ctx = readActiveContext(tmpDir, 'test-user');
    assert.strictEqual(ctx, null);
  });

  test('returns null when .active missing project field', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const activePath = path.join(tmpDir, '.planning', 'users', 'test-user', '.active');
    fs.writeFileSync(activePath, JSON.stringify({ foo: 'bar' }), 'utf-8');
    const ctx = readActiveContext(tmpDir, 'test-user');
    assert.strictEqual(ctx, null);
  });
});

// ─── writeActiveContext ──────────────────────────────────────────────────────

describe('writeActiveContext', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('creates .active file', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    writeActiveContext(tmpDir, 'test-user', 'new-project');
    const activePath = path.join(tmpDir, '.planning', 'users', 'test-user', '.active');
    assert.ok(fs.existsSync(activePath), '.active file should exist');
    const content = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.strictEqual(content.project, 'new-project');
    assert.strictEqual(content.resolved_path, '.planning/users/test-user/new-project');
  });

  test('creates user directory if missing', () => {
    const os = require('os');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    writeActiveContext(tmpDir, 'new-user', 'my-project');
    const activePath = path.join(tmpDir, '.planning', 'users', 'new-user', '.active');
    assert.ok(fs.existsSync(activePath), '.active file should exist after creating user dir');
    const content = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.strictEqual(content.project, 'my-project');
  });

  test('ensures gitignore coverage', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    // Remove the .gitignore that createTempMultiUserProject creates
    const gitignorePath = path.join(tmpDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      fs.unlinkSync(gitignorePath);
    }
    writeActiveContext(tmpDir, 'test-user', 'proj');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore should be created');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content.includes('**/.active'), '.gitignore should contain **/.active pattern');
  });

  test('does not duplicate gitignore entry', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    // .gitignore already has **/.active from createTempMultiUserProject
    writeActiveContext(tmpDir, 'test-user', 'proj1');
    writeActiveContext(tmpDir, 'test-user', 'proj2');
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\*\*\/\.active/g);
    assert.strictEqual(matches.length, 1, 'Pattern **/.active should appear exactly once');
  });
});

// ─── resolveContext ────────────────────────────────────────────────────────────

describe('resolveContext', () => {
  let tmpDir;
  let savedGsdUser;
  let savedGsdProject;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
    clearPlanningRootCache();
    // Restore env vars
    if (savedGsdUser !== undefined) {
      process.env.GSD_USER = savedGsdUser;
    } else {
      delete process.env.GSD_USER;
    }
    if (savedGsdProject !== undefined) {
      process.env.GSD_PROJECT = savedGsdProject;
    } else {
      delete process.env.GSD_PROJECT;
    }
  });

  test('GSD_PROJECT overrides .active', () => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;

    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;

    // Create a second project directory
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'users', 'test-user', 'other-project'),
      { recursive: true }
    );

    process.env.GSD_USER = 'test-user';
    process.env.GSD_PROJECT = 'other-project';

    const ctx = resolveContext(tmpDir);
    assert.strictEqual(ctx.project, 'other-project');
  });

  test('returns correct planning_root', () => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;

    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;

    process.env.GSD_USER = 'test-user';
    delete process.env.GSD_PROJECT;

    const ctx = resolveContext(tmpDir);
    assert.strictEqual(ctx.planning_root, '.planning/users/test-user/test-project');
  });

  test('error on missing .active (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/context.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const { resolveContext } = require('${corePath}'); resolveContext('${dir}');`;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GSD_USER: 'test-user', GSD_PROJECT: '' },
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('No active project'),
        `Expected "No active project" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('error on nonexistent GSD_PROJECT (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/context.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const { resolveContext } = require('${corePath}'); resolveContext('${dir}');`;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GSD_USER: 'test-user', GSD_PROJECT: 'nonexistent-project' },
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('not found'),
        `Expected "not found" in stderr, got: ${err.stderr}`
      );
    }
  });
});

// ─── Module load order ──────────────────────────────────────────────────────

describe('module load order', () => {
  test('no circular dependency crash', () => {
    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const identityPath = require.resolve('../get-shit-done/bin/lib/identity.cjs').replace(/\\/g, '/');
    const contextPath = require.resolve('../get-shit-done/bin/lib/context.cjs').replace(/\\/g, '/');
    const initPath = require.resolve('../get-shit-done/bin/lib/init.cjs').replace(/\\/g, '/');

    const script = `require('${contextPath}'); require('${corePath}'); require('${identityPath}'); require('${initPath}'); console.log('ok');`;

    const output = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.strictEqual(output.trim(), 'ok');
  });
});
