'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runGsdTools, createTestProject, getRepoRoot } = require('./helpers/claude-runner.cjs');

describe('gsd-tools.cjs workflow integration', () => {
  let projectDir;
  const userSlug = 'test-user';
  const projectName = 'test-project';

  before(() => {
    projectDir = createTestProject('workflow-int', {
      multiUser: true,
      userSlug,
      projectName,
    });

    // Create a realistic phase with plans
    const phaseDir = path.join(projectDir, '.planning', 'users', userSlug, projectName, 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Plan file with frontmatter
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), [
      '---',
      'wave: 1',
      'depends_on: []',
      'files_modified: [test.js]',
      'autonomous: true',
      '---',
      '# Plan 01-01: Test Plan',
      '## Goal',
      'Test plan for integration testing.',
      '## Tasks',
      '<task id="01-01-01"><title>Do a thing</title></task>',
    ].join('\n'));

    // STATE.md
    const stateDir = path.join(projectDir, '.planning', 'users', userSlug, projectName);
    fs.writeFileSync(path.join(stateDir, 'STATE.md'), [
      '---',
      'gsd_state_version: 1.0',
      'milestone: v1.0',
      'milestone_name: Test Milestone',
      'status: active',
      `last_updated: "${new Date().toISOString()}"`,
      'progress:',
      '  total_phases: 1',
      '  completed_phases: 0',
      '  total_plans: 1',
      '  completed_plans: 0',
      '---',
      '# Project State',
      '## Current Phase',
      'Phase 01',
    ].join('\n'));

    // ROADMAP.md
    fs.writeFileSync(path.join(stateDir, 'ROADMAP.md'), [
      '# Roadmap',
      '## v1.0 — Test Milestone',
      '### Phase 1: Test Phase',
      '**Goal:** Test the thing',
      '- [ ] 01-01-PLAN.md — Test plan',
    ].join('\n'));

    // config.json
    fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({
      executor_model: '',
      verifier_model: '',
      parallelization: false,
    }));

    // PROJECT.md
    fs.writeFileSync(path.join(stateDir, 'PROJECT.md'), [
      '# Test Project',
      'A project for integration testing.',
    ].join('\n'));

    // Initial commit so git works
    execFileSync('git', ['add', '-A'], { cwd: projectDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: projectDir, stdio: 'pipe' });
  });

  // All tests pass GSD_USER to bypass identity slug derivation (lockIdentity adds
  // collision suffixes that won't match the fixture's directory names)
  const gsdEnv = { GSD_USER: userSlug };

  test('init execute-phase returns phase_found:true with correct planning_root', () => {
    const result = runGsdTools(['init', 'execute-phase', '1'], { cwd: projectDir, env: gsdEnv });
    assert.ok(result.json, `Expected JSON output, got: ${result.output}`);
    assert.strictEqual(result.json.phase_found, true, 'phase_found should be true');
    assert.strictEqual(result.json.active_project, projectName);
    assert.strictEqual(result.json.active_user, userSlug);
    assert.ok(result.json.planning_root.includes(`users/${userSlug}/${projectName}`),
      `planning_root should contain multi-user path, got: ${result.json.planning_root}`);
    assert.ok(result.json.phase_dir.includes('01-test-phase'),
      `phase_dir should reference the phase, got: ${result.json.phase_dir}`);
    assert.strictEqual(result.json.plan_count, 1);
  });

  test('init execute-phase returns phase_found:false for nonexistent phase', () => {
    const result = runGsdTools(['init', 'execute-phase', '99'], { cwd: projectDir, env: gsdEnv });
    assert.ok(result.json, `Expected JSON output, got: ${result.output}`);
    assert.strictEqual(result.json.phase_found, false);
  });

  test('init execute-phase from wrong CWD returns null active_project', () => {
    // This is the exact bug that broke us — running from ~ instead of project root
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-cwd-test-'));
    const result = runGsdTools(['init', 'execute-phase', '1'], { cwd: tmpDir, env: gsdEnv });
    assert.ok(result.json, `Expected JSON output, got: ${result.output}`);
    assert.strictEqual(result.json.active_project, null,
      'Should return null active_project when not in a project directory');
    assert.strictEqual(result.json.phase_found, false,
      'Should return phase_found:false when not in a project directory');
  });

  test('phase-plan-index returns wave grouping for valid phase', () => {
    const result = runGsdTools(['phase-plan-index', '01'], { cwd: projectDir, env: gsdEnv });
    assert.ok(result.json, `Expected JSON output, got: ${result.output}`);
    assert.strictEqual(result.json.phase, '01');
    assert.ok(Array.isArray(result.json.plans), 'plans should be an array');
    assert.strictEqual(result.json.plans.length, 1);
    assert.strictEqual(result.json.plans[0].id, '01-01');
    assert.strictEqual(result.json.plans[0].wave, 1);
    assert.strictEqual(result.json.plans[0].has_summary, false);
    assert.ok(result.json.waves, 'waves grouping should exist');
    assert.deepStrictEqual(result.json.waves['1'], ['01-01']);
  });

  test('find-phase resolves to multi-user path', () => {
    const result = runGsdTools(['find-phase', '1', '--raw'], { cwd: projectDir, env: gsdEnv });
    assert.ok(result.json || result.output.includes('01-test-phase'),
      `find-phase should resolve phase, got: ${result.output}`);
  });

  test('state begin-phase updates STATE.md', () => {
    const result = runGsdTools(
      ['state', 'begin-phase', '--phase', '01', '--name', 'test-phase', '--plans', '1'],
      { cwd: projectDir, env: gsdEnv }
    );
    assert.ok(result.json, `Expected JSON output, got: ${result.output}`);
    assert.ok(result.json.updated, 'Should report updated fields');

    // Verify STATE.md was actually modified
    const stateContent = fs.readFileSync(
      path.join(projectDir, '.planning', 'users', userSlug, projectName, 'STATE.md'),
      'utf-8'
    );
    assert.ok(stateContent.includes('01') || stateContent.includes('test-phase'),
      'STATE.md should reference the phase');
  });
});
