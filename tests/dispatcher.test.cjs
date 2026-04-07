/**
 * GSD Tools Tests - Dispatcher
 *
 * Tests for gsd-tools.cjs dispatch routing and error paths.
 * Covers: no-command, unknown command, unknown subcommands for every command group,
 * --cwd parsing, and previously untouched routing branches.
 *
 * Requirements: DISP-01, DISP-02
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempMultiUserProject, cleanup } = require('./helpers.cjs');
const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');

/** Helper: create multi-user project with common planning files. */
function setupMultiUserProject(opts = {}) {
  const { tmpDir, userSlug, projectName } = createTempMultiUserProject(opts);
  const planningRoot = `.planning/users/${userSlug}/${projectName}`;
  const projectDir = path.join(tmpDir, planningRoot);

  return { tmpDir, userSlug, projectName, planningRoot, projectDir };
}

// ─── Dispatcher Error Paths ──────────────────────────────────────────────────

describe('dispatcher error paths', () => {
  let tmpDir;

  beforeEach(() => {
    const ctx = setupMultiUserProject();
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  // No command
  test('no-command invocation prints usage and exits non-zero', () => {
    const result = runGsdTools('', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Usage:'), `Expected "Usage:" in stderr, got: ${result.error}`);
  });

  // Unknown command
  test('unknown command produces clear error and exits non-zero', () => {
    const result = runGsdTools('nonexistent-cmd', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown command'), `Expected "Unknown command" in stderr, got: ${result.error}`);
  });

  // --cwd= form with valid directory
  test('--cwd= form overrides working directory', () => {
    const { tmpDir: cwdDir, projectDir } = setupMultiUserProject();
    try {
      // Create STATE.md in project dir so state load can find it
      fs.writeFileSync(
        path.join(projectDir, 'STATE.md'),
        '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\n'
      );
      const result = runGsdTools(`--cwd=${cwdDir} state load`, process.cwd());
      assert.strictEqual(result.success, true, `Should succeed with --cwd=, got: ${result.error}`);
    } finally {
      clearPlanningRootCache();
      cleanup(cwdDir);
    }
  });

  // --cwd= with empty value
  test('--cwd= with empty value produces error', () => {
    const result = runGsdTools('--cwd= state load', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Missing value for --cwd'), `Expected "Missing value for --cwd" in stderr, got: ${result.error}`);
  });

  // --cwd with nonexistent path
  test('--cwd with invalid path produces error', () => {
    const result = runGsdTools('--cwd /nonexistent/path/xyz state load', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Invalid --cwd'), `Expected "Invalid --cwd" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: template
  test('template unknown subcommand errors', () => {
    const result = runGsdTools('template bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown template subcommand'), `Expected "Unknown template subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: frontmatter
  test('frontmatter unknown subcommand errors', () => {
    const result = runGsdTools('frontmatter bogus file.md', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown frontmatter subcommand'), `Expected "Unknown frontmatter subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: verify
  test('verify unknown subcommand errors', () => {
    const result = runGsdTools('verify bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown verify subcommand'), `Expected "Unknown verify subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: phases
  test('phases unknown subcommand errors', () => {
    const result = runGsdTools('phases bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown phases subcommand'), `Expected "Unknown phases subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: roadmap
  test('roadmap unknown subcommand errors', () => {
    const result = runGsdTools('roadmap bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown roadmap subcommand'), `Expected "Unknown roadmap subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: requirements
  test('requirements unknown subcommand errors', () => {
    const result = runGsdTools('requirements bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown requirements subcommand'), `Expected "Unknown requirements subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: phase
  test('phase unknown subcommand errors', () => {
    const result = runGsdTools('phase bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown phase subcommand'), `Expected "Unknown phase subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: milestone
  test('milestone unknown subcommand errors', () => {
    const result = runGsdTools('milestone bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown milestone subcommand'), `Expected "Unknown milestone subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: validate
  test('validate unknown subcommand errors', () => {
    const result = runGsdTools('validate bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown validate subcommand'), `Expected "Unknown validate subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: todo
  test('todo unknown subcommand errors', () => {
    const result = runGsdTools('todo bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown todo subcommand'), `Expected "Unknown todo subcommand" in stderr, got: ${result.error}`);
  });

  // Unknown subcommand: init
  test('init unknown workflow errors', () => {
    const result = runGsdTools('init bogus', tmpDir);
    assert.strictEqual(result.success, false, 'Should exit non-zero');
    assert.ok(result.error.includes('Unknown init workflow'), `Expected "Unknown init workflow" in stderr, got: ${result.error}`);
  });
});

// ─── Dispatcher Routing Branches ─────────────────────────────────────────────

describe('dispatcher routing branches', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProject();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  // find-phase
  test('find-phase locates phase directory by number', () => {
    const phaseDir = path.join(projectDir, 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('find-phase 01', tmpDir);
    assert.strictEqual(result.success, true, `find-phase failed: ${result.error}`);
    assert.ok(result.output.includes('01-test-phase'), `Expected output to contain "01-test-phase", got: ${result.output}`);
  });

  // init resume
  test('init resume returns valid JSON', () => {
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    const result = runGsdTools('init resume', tmpDir);
    assert.strictEqual(result.success, true, `init resume failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // init verify-work
  test('init verify-work returns valid JSON', () => {
    // Create STATE.md
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    // Create ROADMAP.md with phase section
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      '# Roadmap\n\n## Milestone: v1.0 Test\n\n### Phase 1: Test Phase\n**Goal**: Test goal\n**Depends on**: None\n**Requirements**: TEST-01\n**Success Criteria**:\n  1. Tests pass\n**Plans**: 1 plan\nPlans:\n- [x] 01-01-PLAN.md\n\n## Progress\n\n| Phase | Plans | Status | Date |\n|-------|-------|--------|------|\n| 1 | 1/1 | Complete | 2026-01-01 |\n'
    );

    // Create phase dir
    const phaseDir = path.join(projectDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init verify-work 01', tmpDir);
    assert.strictEqual(result.success, true, `init verify-work failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // roadmap update-plan-progress
  test('roadmap update-plan-progress updates phase progress', () => {
    // Create ROADMAP.md with progress table
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      '# Roadmap\n\n## Milestone: v1.0 Test\n\n### Phase 1: Test Phase\n**Goal**: Test goal\n**Depends on**: None\n**Requirements**: TEST-01\n**Success Criteria**:\n  1. Tests pass\n**Plans**: 1 plan\nPlans:\n- [ ] 01-01-PLAN.md\n\n## Progress\n\n| Phase | Plans | Status | Date |\n|-------|-------|--------|------|\n| 1 | 0/1 | Not Started | - |\n'
    );

    // Create phase dir with PLAN and SUMMARY
    const phaseDir = path.join(projectDir, 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '01-01-PLAN.md'),
      '---\nphase: 01-test-phase\nplan: "01"\n---\n\n# Plan\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '---\nphase: 01-test-phase\nplan: "01"\n---\n\n# Summary\n'
    );

    const result = runGsdTools('roadmap update-plan-progress 1', tmpDir);
    assert.strictEqual(result.success, true, `roadmap update-plan-progress failed: ${result.error}`);
  });

  // state (no subcommand) — default load
  test('state with no subcommand calls cmdStateLoad', () => {
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Test)\nPlan: 01-01 complete\nStatus: Ready\nLast activity: 2026-01-01\n\nProgress: [##########] 100%\n\n## Session Continuity\n\nLast session: 2026-01-01\nStopped at: Test\nResume file: None\n'
    );

    const result = runGsdTools('state', tmpDir);
    assert.strictEqual(result.success, true, `state load failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
  });

  // summary-extract
  test('summary-extract parses SUMMARY.md frontmatter', () => {
    const phaseDir = path.join(projectDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const summaryContent = `---
phase: 01-test
plan: "01"
subsystem: testing
tags: [node, test]
duration: 5min
completed: "2026-01-01"
key-decisions:
  - "Used node:test"
requirements-completed: [TEST-01]
---

# Phase 1 Plan 01: Test Summary

**Tests added for core module**
`;

    const summaryPath = path.join(phaseDir, '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, summaryContent);

    // Use relative path from tmpDir
    const result = runGsdTools(`summary-extract ${planningRoot}/phases/01-test/01-01-SUMMARY.md`, tmpDir);
    assert.strictEqual(result.success, true, `summary-extract failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(typeof parsed === 'object', 'Output should be valid JSON object');
    assert.strictEqual(parsed.path, `${planningRoot}/phases/01-test/01-01-SUMMARY.md`, 'Path should match input');
    assert.deepStrictEqual(parsed.requirements_completed, ['TEST-01'], 'requirements_completed should contain TEST-01');
  });
});

// ─── Switch / Archive / Restore / Project-Setup Dispatcher ──────────────────

describe('switch dispatcher', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('switch <project> routes to cmdInitSwitch and switches', () => {
    const { tmpDir, userSlug, planningRoot } = setupMultiUserProject({ projectName: 'alpha' });
    // Create a second project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'beta', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch beta', tmpDir);
      assert.ok(result.success, `switch failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.switched, true);
      assert.strictEqual(output.project, 'beta');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch without args routes to listing mode', () => {
    const { tmpDir, userSlug } = setupMultiUserProject({ projectName: 'alpha' });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'beta', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch', tmpDir);
      assert.ok(result.success, `switch listing failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.switched, false);
      assert.ok(Array.isArray(output.projects));
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('archive-project dispatcher', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('archive-project <name> routes correctly', () => {
    const { tmpDir, userSlug } = setupMultiUserProject({ projectName: 'to-archive' });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'other', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('archive-project to-archive', tmpDir);
      assert.ok(result.success, `archive-project failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.archived, true);
      assert.strictEqual(output.project, 'to-archive');
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('restore-project dispatcher', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('restore-project <name> routes correctly', () => {
    const { tmpDir, userSlug } = setupMultiUserProject({ projectName: 'current' });
    // Create archived project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'old', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('restore-project old', tmpDir);
      assert.ok(result.success, `restore-project failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.restored, true);
      assert.strictEqual(output.project, 'old');
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('init project-setup dispatcher', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('init project-setup routes correctly', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProject();
    try {
      const result = runGsdTools('init project-setup', tmpDir);
      assert.ok(result.success, `init project-setup failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.user, userSlug);
      assert.ok(Array.isArray(output.projects));
      assert.strictEqual(output.planning_exists, true);
    } finally {
      cleanup(tmpDir);
    }
  });
});
