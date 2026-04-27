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
const { readActiveContext, writeActiveContext, resolveContext, listProjects } = require('../get-shit-done/bin/lib/context.cjs');
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

  test('auto-selects single project when .active is missing (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/context.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const { resolveContext } = require('${corePath}'); const r = resolveContext('${dir}'); process.stdout.write(JSON.stringify(r));`;

    const output = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GSD_USER: 'test-user', GSD_PROJECT: '' },
    });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.project, 'test-project');
    assert.strictEqual(ctx.planning_root, '.planning/users/test-user/test-project');
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

// ─── listProjects ─────────────────────────────────────────────────────────────

describe('listProjects', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('returns structured array with project metadata', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;

    // Add STATE.md with frontmatter to the project
    const projectDir = path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project');
    fs.writeFileSync(path.join(projectDir, 'STATE.md'), [
      '---',
      'status: active',
      'progress:',
      '  completed_phases: 2',
      '  total_phases: 5',
      '---',
      '',
      '# Project State',
      '',
      '## Current Phase',
      '',
      '**Phase 3: API Layer** — In Progress',
    ].join('\n'));

    fs.writeFileSync(path.join(projectDir, 'PROJECT.md'), [
      '# Project: Test Project',
      '',
      '**Core Value:** Build the best API layer for widgets',
      '',
      'More content here',
    ].join('\n'));

    const projects = listProjects(tmpDir, 'test-user');
    assert.ok(Array.isArray(projects), 'should return an array');
    assert.strictEqual(projects.length, 1);

    const proj = projects[0];
    assert.strictEqual(proj.name, 'test-project');
    assert.ok(proj.last_activity, 'should have last_activity');
    assert.strictEqual(proj.progress, '2/5');
    assert.strictEqual(proj.description, 'Build the best API layer for widgets');
  });

  test('returns empty array when user directory does not exist', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const projects = listProjects(tmpDir, 'nonexistent-user');
    assert.ok(Array.isArray(projects));
    assert.strictEqual(projects.length, 0);
  });

  test('filters out _archived directory', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    fs.mkdirSync(path.join(userDir, '_archived', 'old-project'), { recursive: true });
    const projects = listProjects(tmpDir, 'test-user');
    const names = projects.map(p => p.name);
    assert.ok(!names.includes('_archived'), '_archived should be filtered out');
  });

  test('handles missing STATE.md and PROJECT.md gracefully', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    fs.mkdirSync(path.join(userDir, 'bare-project'), { recursive: true });
    const projects = listProjects(tmpDir, 'test-user');
    const bare = projects.find(p => p.name === 'bare-project');
    assert.ok(bare, 'bare-project should be listed');
    assert.strictEqual(bare.current_phase, null);
    assert.strictEqual(bare.description, null);
    assert.strictEqual(bare.progress, '0/0');
  });

  test('lists multiple projects with metadata', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    fs.mkdirSync(path.join(userDir, 'project-a'), { recursive: true });
    fs.mkdirSync(path.join(userDir, 'project-b'), { recursive: true });
    const projects = listProjects(tmpDir, 'test-user');
    assert.strictEqual(projects.length, 3); // test-project + project-a + project-b
  });

  test('filters out dotfiles', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    // .active is a file not a dir, but let's ensure dotfile dirs are filtered
    fs.mkdirSync(path.join(userDir, '.hidden-dir'), { recursive: true });
    const projects = listProjects(tmpDir, 'test-user');
    const names = projects.map(p => p.name);
    assert.ok(!names.includes('.hidden-dir'), 'dotfile dirs should be filtered');
    assert.ok(!names.includes('.active'), '.active should not appear');
  });
});

// ─── resolveContext (auto-select and null return) ─────────────────────────────

describe('resolveContext auto-select', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
    clearPlanningRootCache();
  });

  function runResolveContext(dir, env = {}) {
    const contextPath = require.resolve('../get-shit-done/bin/lib/context.cjs').replace(/\\/g, '/');
    const d = dir.replace(/\\/g, '/');
    const script = `const { resolveContext } = require('${contextPath}'); const r = resolveContext('${d}'); process.stdout.write(JSON.stringify(r));`;

    const cleanEnv = { ...process.env };
    delete cleanEnv.CI;
    delete cleanEnv.GITHUB_ACTIONS;
    delete cleanEnv.GITLAB_CI;
    delete cleanEnv.JENKINS_URL;
    delete cleanEnv.CIRCLECI;
    delete cleanEnv.TRAVIS;
    delete cleanEnv.GSD_USER;
    delete cleanEnv.GSD_PROJECT;
    Object.assign(cleanEnv, env);

    return execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    });
  }

  test('auto-selects single project without .active file (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.project, 'test-project');
    assert.strictEqual(ctx.planning_root, '.planning/users/test-user/test-project');
  });

  test('returns null project for zero projects (subprocess)', () => {
    const os = require('os');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    fs.mkdirSync(userDir, { recursive: true });
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'user-map.json'), JSON.stringify({ _schema: 1, 'Test User': 'test-user' }, null, 2) + '\n');

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.user, 'test-user');
    assert.strictEqual(ctx.project, null);
    assert.strictEqual(ctx.planning_root, null);
  });

  test('returns null project for multiple projects without .active (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'users', 'test-user', 'second-project'),
      { recursive: true }
    );

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.user, 'test-user');
    assert.strictEqual(ctx.project, null);
    assert.strictEqual(ctx.planning_root, null);
  });

  test('still reads .active when multiple projects exist (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: true });
    tmpDir = result.tmpDir;
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'users', 'test-user', 'second-project'),
      { recursive: true }
    );

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.project, 'test-project');
    assert.strictEqual(ctx.planning_root, '.planning/users/test-user/test-project');
  });

  test('GSD_PROJECT still overrides auto-select (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'users', 'test-user', 'other-project'),
      { recursive: true }
    );

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user', GSD_PROJECT: 'other-project' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.project, 'other-project');
  });

  test('auto-select ignores _archived directory (subprocess)', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'users', 'test-user', '_archived', 'old-project'),
      { recursive: true }
    );

    const output = runResolveContext(tmpDir, { GSD_USER: 'test-user' });
    const ctx = JSON.parse(output.trim());
    assert.strictEqual(ctx.project, 'test-project');
  });
});

// ─── getPlanningRoot with null resolveContext ─────────────────────────────────

describe('getPlanningRoot with null resolveContext', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
    clearPlanningRootCache();
  });

  test('falls back to flat .planning when resolveContext returns null project (subprocess)', () => {
    const os = require('os');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    const userDir = path.join(tmpDir, '.planning', 'users', 'test-user');
    fs.mkdirSync(userDir, { recursive: true });
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'user-map.json'), JSON.stringify({ _schema: 1, 'Test User': 'test-user' }, null, 2) + '\n');

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const { getPlanningRoot } = require('${corePath}'); console.log(getPlanningRoot('${dir}'));`;

    const cleanEnv = { ...process.env };
    delete cleanEnv.CI;
    delete cleanEnv.GITHUB_ACTIONS;
    delete cleanEnv.GITLAB_CI;
    delete cleanEnv.JENKINS_URL;
    delete cleanEnv.CIRCLECI;
    delete cleanEnv.TRAVIS;
    delete cleanEnv.GSD_USER;
    delete cleanEnv.GSD_PROJECT;
    cleanEnv.GSD_USER = 'test-user';

    // With graceful fallback, getPlanningRoot returns '.planning' when
    // no multi-user project exists but .planning/ directory is present.
    const result = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    });
    assert.strictEqual(result.trim(), '.planning');
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
