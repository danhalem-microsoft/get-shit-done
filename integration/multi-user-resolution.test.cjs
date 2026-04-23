'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runGsdTools, createTestProject, getRepoRoot } = require('./helpers/claude-runner.cjs');

describe('Multi-user path resolution via gsd-tools', () => {
  let projectDir;

  before(() => {
    projectDir = createTestProject('multi-user-int', {
      multiUser: true,
      userSlug: 'alice',
      projectName: 'project-alpha',
    });

    // Add second user with their own project
    const bobDir = path.join(projectDir, '.planning', 'users', 'bob', 'project-beta', 'phases', '01-bob-phase');
    fs.mkdirSync(bobDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'users', 'bob', '.active'),
      JSON.stringify({ project: 'project-beta' })
    );
    fs.writeFileSync(path.join(bobDir, '01-01-PLAN.md'), [
      '---', 'wave: 1', 'depends_on: []', 'files_modified: [bob.js]', 'autonomous: true', '---',
      '# Plan 01-01: Bob Plan',
    ].join('\n'));

    // Add phase to alice's project too
    const alicePhaseDir = path.join(projectDir, '.planning', 'users', 'alice', 'project-alpha', 'phases', '01-alice-phase');
    fs.mkdirSync(alicePhaseDir, { recursive: true });
    fs.writeFileSync(path.join(alicePhaseDir, '01-01-PLAN.md'), [
      '---', 'wave: 1', 'depends_on: []', 'files_modified: [alice.js]', 'autonomous: true', '---',
      '# Plan 01-01: Alice Plan',
    ].join('\n'));

    // Both users need STATE.md, ROADMAP.md for init to work
    for (const [user, proj] of [['alice', 'project-alpha'], ['bob', 'project-beta']]) {
      const base = path.join(projectDir, '.planning', 'users', user, proj);
      fs.writeFileSync(path.join(base, 'STATE.md'), [
        '---', 'gsd_state_version: 1.0', 'milestone: v1.0', 'status: active', '---',
        '# State', `## User: ${user}`,
      ].join('\n'));
      fs.writeFileSync(path.join(base, 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(base, 'PROJECT.md'), `# ${proj}\n`);
      fs.writeFileSync(path.join(base, 'config.json'), '{}');
    }

    // Update user-map
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'user-map.json'),
      JSON.stringify({ _schema: 1, 'alice@test.com': 'alice', 'bob@test.com': 'bob' })
    );

    // Git commit
    execFileSync('git', ['add', '-A'], { cwd: projectDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: projectDir, stdio: 'pipe' });
  });

  test('active user resolves to alice (the .active file owner)', () => {
    const result = runGsdTools(['init', 'execute-phase', '1'], { cwd: projectDir });
    assert.ok(result.json, `Expected JSON, got: ${result.output}`);
    assert.strictEqual(result.json.active_user, 'alice');
    assert.strictEqual(result.json.active_project, 'project-alpha');
  });

  test('GSD_PROJECT env var overrides active project', () => {
    const result = runGsdTools(['init', 'execute-phase', '1'], {
      cwd: projectDir,
      env: { GSD_PROJECT: 'project-beta' },
    });
    assert.ok(result.json, `Expected JSON, got: ${result.output}`);
    assert.strictEqual(result.json.active_project, 'project-beta');
  });

  test('alice and bob phase dirs are distinct paths', () => {
    const aliceResult = runGsdTools(['init', 'execute-phase', '1'], { cwd: projectDir });
    assert.ok(aliceResult.json?.phase_dir, 'alice phase_dir missing');

    const bobResult = runGsdTools(['init', 'execute-phase', '1'], {
      cwd: projectDir,
      env: { GSD_PROJECT: 'project-beta' },
    });
    assert.ok(bobResult.json?.phase_dir, 'bob phase_dir missing');

    assert.notStrictEqual(aliceResult.json.phase_dir, bobResult.json.phase_dir,
      'alice and bob should have different phase directories');
    assert.ok(aliceResult.json.phase_dir.includes('alice'), `alice path should contain 'alice': ${aliceResult.json.phase_dir}`);
    assert.ok(bobResult.json.phase_dir.includes('bob'), `bob path should contain 'bob': ${bobResult.json.phase_dir}`);
  });

  test('planning_root is user-scoped, not global .planning/', () => {
    const result = runGsdTools(['init', 'execute-phase', '1'], { cwd: projectDir });
    assert.ok(result.json?.planning_root, 'planning_root missing');
    assert.ok(result.json.planning_root.startsWith('.planning/users/'),
      `planning_root should start with .planning/users/, got: ${result.json.planning_root}`);
    assert.ok(!result.json.planning_root.endsWith('/phases'),
      'planning_root should not include /phases suffix');
  });

  test('no .planning/phases/ directory is used (flat layout rejected)', () => {
    const flatPhases = path.join(projectDir, '.planning', 'phases');
    assert.ok(!fs.existsSync(flatPhases),
      'Flat .planning/phases/ should not exist in multi-user project');

    const result = runGsdTools(['init', 'execute-phase', '1'], { cwd: projectDir });
    assert.ok(result.json?.phase_dir?.includes('users/'),
      `phase_dir should route through users/, got: ${result.json?.phase_dir}`);
  });
});
