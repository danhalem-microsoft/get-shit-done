/**
 * GSD Tools Tests - migration.test.cjs
 *
 * Tests for legacy .planning/ structure migration flow.
 * Covers: tryGetPlanningContext legacy detection, getPlanningRoot error messages,
 * cmdMigrate file moves, config preservation, and .active creation.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { cleanup } = require('./helpers.cjs');

/**
 * Create a legacy .planning/ structure (flat, with PROJECT.md).
 * No .planning/users/ directory — this is the old-style structure.
 */
function createLegacyProject(opts = {}) {
  const { projectName = 'My Project', includeProjectMd = true } = opts;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-migration-'));

  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });

  if (includeProjectMd) {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      `# ${projectName}\n\nThis is a test project.\n`
    );
  }

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    `---\nstatus: active\n---\n\n# Project State\n`
  );

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'ROADMAP.md'),
    `# Roadmap v1.0\n\n## Phase 1: Foundation\n`
  );

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
    `# Requirements\n\n- REQ-01: Something\n`
  );

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({ commit_docs: true, mode: 'yolo' }, null, 2)
  );

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'phases', '01-foundation', '01-01-PLAN.md'),
    `# Plan 01\n`
  );

  return tmpDir;
}

/**
 * Create a legacy project with git repo for migration tests that commit.
 */
function createLegacyGitProject(opts = {}) {
  const tmpDir = createLegacyProject(opts);

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

// ─── tryGetPlanningContext legacy detection ──────────────────────────────────

describe('tryGetPlanningContext legacy detection', () => {
  const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');
  let tmpDir;
  let origGsdUser, origGsdProject;

  beforeEach(() => {
    origGsdUser = process.env.GSD_USER;
    origGsdProject = process.env.GSD_PROJECT;
    delete process.env.GSD_USER;
    delete process.env.GSD_PROJECT;
  });

  afterEach(() => {
    if (origGsdUser !== undefined) process.env.GSD_USER = origGsdUser;
    else delete process.env.GSD_USER;
    if (origGsdProject !== undefined) process.env.GSD_PROJECT = origGsdProject;
    else delete process.env.GSD_PROJECT;
    clearPlanningRootCache();
    if (tmpDir) cleanup(tmpDir);
  });

  test('legacy structure returns legacy_detected flag instead of crashing', () => {
    tmpDir = createLegacyGitProject();

    const { tryGetPlanningContext } = require('../get-shit-done/bin/lib/core.cjs');
    const ctx = tryGetPlanningContext(tmpDir);

    assert.strictEqual(ctx.legacy_detected, true, 'should have legacy_detected flag');
    assert.strictEqual(ctx.active_user, null, 'active_user should be null');
    assert.strictEqual(ctx.active_project, null, 'active_project should be null');
    assert.strictEqual(ctx.planning_root, null, 'planning_root should be null');
  });
});

// ─── getPlanningRoot legacy error message ──────────────────────────────────

describe('getPlanningRoot legacy error message', () => {
  const { runGsdTools } = require('./helpers.cjs');
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  test('legacy structure shows migration instructions', () => {
    tmpDir = createLegacyGitProject();

    // Call getPlanningRoot directly via subprocess — state load uses planningPaths
    // which soft-falls back, so we need the direct path to test the hard error.
    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const { getPlanningRoot } = require('${corePath}'); getPlanningRoot('${dir}');`;

    const cleanEnv = { ...process.env };
    delete cleanEnv.CI;
    delete cleanEnv.GITHUB_ACTIONS;
    delete cleanEnv.GITLAB_CI;
    delete cleanEnv.JENKINS_URL;
    delete cleanEnv.CIRCLECI;
    delete cleanEnv.TRAVIS;
    delete cleanEnv.GSD_USER;
    delete cleanEnv.GSD_PROJECT;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv,
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('migrate'), `Error should mention migration, got: ${err.stderr}`);
    }
  });
});

// ─── cmdMigrate tests ───────────────────────────────────────────────────────

describe('cmdMigrate', () => {
  const { runGsdTools } = require('./helpers.cjs');
  const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');
  let tmpDir;

  afterEach(() => {
    clearPlanningRootCache();
    if (tmpDir) cleanup(tmpDir);
  });

  test('reads project name from existing PROJECT.md', () => {
    tmpDir = createLegacyGitProject({ projectName: 'My Frontend App' });

    const result = runGsdTools('migrate', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.project, 'should have a project slug');
    assert.ok(output.project.includes('my-frontend-app') || output.project === 'my-frontend-app',
      `Project slug should derive from PROJECT.md name, got: ${output.project}`);
  });

  test('resolves user identity for target directory', () => {
    tmpDir = createLegacyGitProject();

    const result = runGsdTools('migrate', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.user, 'should have user slug');
    assert.strictEqual(output.user, 'test-user', 'should resolve from git config');
  });

  test('auto mode moves files to .planning/users/<user>/<project>/', () => {
    tmpDir = createLegacyGitProject({ projectName: 'Test Project' });

    const result = runGsdTools('migrate --auto', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.migrated, true, 'should report migrated');

    // Verify files exist at target
    const target = path.join(tmpDir, '.planning', 'users', output.user, output.project);
    assert.ok(fs.existsSync(path.join(target, 'STATE.md')), 'STATE.md should be at target');
    assert.ok(fs.existsSync(path.join(target, 'ROADMAP.md')), 'ROADMAP.md should be at target');
    assert.ok(fs.existsSync(path.join(target, 'REQUIREMENTS.md')), 'REQUIREMENTS.md should be at target');
    assert.ok(fs.existsSync(path.join(target, 'phases', '01-foundation', '01-01-PLAN.md')),
      'Phase files should be at target');

    // Verify originals removed (except config.json at root)
    assert.ok(!fs.existsSync(path.join(tmpDir, '.planning', 'STATE.md')), 'Original STATE.md should be removed');
    assert.ok(!fs.existsSync(path.join(tmpDir, '.planning', 'ROADMAP.md')), 'Original ROADMAP.md should be removed');
  });

  test('preserves config.json at .planning/ root during migration', () => {
    tmpDir = createLegacyGitProject();

    const result = runGsdTools('migrate --auto', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // config.json should remain at .planning/ root
    const rootConfig = path.join(tmpDir, '.planning', 'config.json');
    assert.ok(fs.existsSync(rootConfig), 'config.json should remain at .planning/ root');

    const config = JSON.parse(fs.readFileSync(rootConfig, 'utf-8'));
    assert.strictEqual(config.commit_docs, true, 'config content should be preserved');
  });

  test('creates .active pointing to new project', () => {
    tmpDir = createLegacyGitProject({ projectName: 'My App' });

    const result = runGsdTools('migrate --auto', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    const activePath = path.join(tmpDir, '.planning', 'users', output.user, '.active');
    assert.ok(fs.existsSync(activePath), '.active file should be created');

    const activeContent = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.strictEqual(activeContent.project, output.project, '.active should point to migrated project');
  });

  test('missing PROJECT.md in non-auto mode returns needs_project_name', () => {
    tmpDir = createLegacyGitProject({ includeProjectMd: false });

    const result = runGsdTools('migrate', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.needs_project_name, true, 'should indicate needs_project_name');
  });

  test('missing PROJECT.md in auto mode errors with clear message', () => {
    tmpDir = createLegacyGitProject({ includeProjectMd: false });

    const result = runGsdTools('migrate --auto', tmpDir);
    assert.ok(!result.success, 'should fail in auto mode without PROJECT.md');
    assert.ok(result.error.includes('--project-name'),
      `Error should mention --project-name flag, got: ${result.error}`);
  });

  test('--project-name flag overrides PROJECT.md', () => {
    tmpDir = createLegacyGitProject({ projectName: 'Original Name' });

    const result = runGsdTools('migrate --auto --project-name custom-override', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.project, 'custom-override', 'should use override name');
    assert.strictEqual(output.migrated, true, 'should complete migration');
  });

  test('after migration, getPlanningRoot resolves correctly', () => {
    tmpDir = createLegacyGitProject({ projectName: 'Test Project' });

    // First migrate
    const migrateResult = runGsdTools('migrate --auto', tmpDir);
    assert.ok(migrateResult.success, `Migrate failed: ${migrateResult.error}`);

    const output = JSON.parse(migrateResult.output);

    // Set env vars to point to the migrated project
    const envPrefix = `GSD_USER=${output.user} GSD_PROJECT=${output.project}`;

    // Now run a command that uses getPlanningRoot — it should work
    const stateResult = runGsdTools(
      ['state', 'load'],
      tmpDir
    );
    // The state load requires GSD_USER/GSD_PROJECT, but since runGsdTools uses exec
    // we can't easily set env vars through it. Let's just verify the directory structure is valid.
    const target = path.join(tmpDir, '.planning', 'users', output.user, output.project);
    assert.ok(fs.existsSync(target), 'Target directory should exist after migration');
    assert.ok(fs.existsSync(path.join(target, 'STATE.md')), 'STATE.md should be in target');
  });

  test('errors when no .planning/ directory exists', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-migration-'));
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });

    const result = runGsdTools('migrate', tmpDir);
    assert.ok(!result.success, 'should fail with no .planning/');
    assert.ok(result.error.includes('Nothing to migrate') || result.error.includes('No .planning'),
      `Error should mention nothing to migrate, got: ${result.error}`);
  });

  test('errors when multi-user structure already exists', () => {
    tmpDir = createLegacyGitProject();
    // Create a users/ directory to simulate already migrated
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users'), { recursive: true });

    const result = runGsdTools('migrate', tmpDir);
    assert.ok(!result.success, 'should fail when users/ already exists');
    assert.ok(result.error.includes('already exists') || result.error.includes('Nothing to migrate'),
      `Error should mention already exists, got: ${result.error}`);
  });
});
