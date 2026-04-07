/**
 * GSD Tools Tests - Init
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempMultiUserProject, cleanup } = require('./helpers.cjs');
const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');

/** Helper: create multi-user project with common planning files. */
function setupMultiUserProjectWithFiles(opts = {}) {
  const { tmpDir, userSlug, projectName } = createTempMultiUserProject(opts);
  const planningRoot = `.planning/users/${userSlug}/${projectName}`;
  const projectDir = path.join(tmpDir, planningRoot);

  return { tmpDir, userSlug, projectName, planningRoot, projectDir };
}

describe('init commands', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('init execute-phase returns file paths', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init execute-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, `${planningRoot}/STATE.md`);
    assert.strictEqual(output.roadmap_path, `${planningRoot}/ROADMAP.md`);
    assert.strictEqual(output.config_path, `${planningRoot}/config.json`);
  });

  test('init plan-phase returns file paths', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research Findings');
    fs.writeFileSync(path.join(phaseDir, '03-VERIFICATION.md'), '# Verification');
    fs.writeFileSync(path.join(phaseDir, '03-UAT.md'), '# UAT');

    const result = runGsdTools('init plan-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, `${planningRoot}/STATE.md`);
    assert.strictEqual(output.roadmap_path, `${planningRoot}/ROADMAP.md`);
    assert.strictEqual(output.requirements_path, `${planningRoot}/REQUIREMENTS.md`);
    assert.strictEqual(output.context_path, `${planningRoot}/phases/03-api/03-CONTEXT.md`);
    assert.strictEqual(output.research_path, `${planningRoot}/phases/03-api/03-RESEARCH.md`);
    assert.strictEqual(output.verification_path, `${planningRoot}/phases/03-api/03-VERIFICATION.md`);
    assert.strictEqual(output.uat_path, `${planningRoot}/phases/03-api/03-UAT.md`);
  });

  test('init progress returns file paths', () => {
    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, `${planningRoot}/STATE.md`);
    assert.strictEqual(output.roadmap_path, `${planningRoot}/ROADMAP.md`);
    assert.strictEqual(output.project_path, `${planningRoot}/PROJECT.md`);
    assert.strictEqual(output.config_path, `${planningRoot}/config.json`);
  });

  test('init phase-op returns core and optional phase file paths', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research');
    fs.writeFileSync(path.join(phaseDir, '03-VERIFICATION.md'), '# Verification');
    fs.writeFileSync(path.join(phaseDir, '03-UAT.md'), '# UAT');

    const result = runGsdTools('init phase-op 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, `${planningRoot}/STATE.md`);
    assert.strictEqual(output.roadmap_path, `${planningRoot}/ROADMAP.md`);
    assert.strictEqual(output.requirements_path, `${planningRoot}/REQUIREMENTS.md`);
    assert.strictEqual(output.context_path, `${planningRoot}/phases/03-api/03-CONTEXT.md`);
    assert.strictEqual(output.research_path, `${planningRoot}/phases/03-api/03-RESEARCH.md`);
    assert.strictEqual(output.verification_path, `${planningRoot}/phases/03-api/03-VERIFICATION.md`);
    assert.strictEqual(output.uat_path, `${planningRoot}/phases/03-api/03-UAT.md`);
  });

  test('init plan-phase omits optional paths if files missing', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init plan-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.context_path, undefined);
    assert.strictEqual(output.research_path, undefined);
  });

  // ── phase_req_ids extraction (fix for #684) ──────────────────────────────

  test('init plan-phase extracts phase_req_ids from ROADMAP', () => {
    fs.mkdirSync(path.join(projectDir, 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Requirements**: CP-01, CP-02, CP-03\n**Plans:** 0 plans\n`
    );

    const result = runGsdTools('init plan-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, 'CP-01, CP-02, CP-03');
  });

  test('init plan-phase strips brackets from phase_req_ids', () => {
    fs.mkdirSync(path.join(projectDir, 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Requirements**: [CP-01, CP-02]\n**Plans:** 0 plans\n`
    );

    const result = runGsdTools('init plan-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, 'CP-01, CP-02');
  });

  test('init plan-phase returns null phase_req_ids when Requirements line is absent', () => {
    fs.mkdirSync(path.join(projectDir, 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 0 plans\n`
    );

    const result = runGsdTools('init plan-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, null);
  });

  test('init plan-phase returns null phase_req_ids when ROADMAP is absent', () => {
    fs.mkdirSync(path.join(projectDir, 'phases', '03-api'), { recursive: true });

    const result = runGsdTools('init plan-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, null);
  });

  test('init execute-phase extracts phase_req_ids from ROADMAP', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Requirements**: EX-01, EX-02\n**Plans:** 1 plans\n`
    );

    const result = runGsdTools('init execute-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, 'EX-01, EX-02');
  });

  test('init plan-phase returns null phase_req_ids when value is TBD', () => {
    fs.mkdirSync(path.join(projectDir, 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Requirements**: TBD\n**Plans:** 0 plans\n`
    );

    const result = runGsdTools('init plan-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, null, 'TBD placeholder should return null');
  });

  test('init execute-phase returns null phase_req_ids when Requirements line is absent', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      `# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 1 plans\n`
    );

    const result = runGsdTools('init execute-phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_req_ids, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitTodos (INIT-01)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitTodos', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('empty pending dir returns zero count', () => {
    fs.mkdirSync(path.join(projectDir, 'todos', 'pending'), { recursive: true });

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.deepStrictEqual(output.todos, []);
    assert.strictEqual(output.pending_dir_exists, true);
  });

  test('missing pending dir returns zero count', () => {
    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.deepStrictEqual(output.todos, []);
    assert.strictEqual(output.pending_dir_exists, false);
  });

  test('multiple todos with fields are read correctly', () => {
    const pendingDir = path.join(projectDir, 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');
    fs.writeFileSync(path.join(pendingDir, 'task-2.md'), 'title: Add feature\narea: frontend\ncreated: 2026-02-24');
    fs.writeFileSync(path.join(pendingDir, 'task-3.md'), 'title: Write docs\narea: backend\ncreated: 2026-02-23');

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 3);
    assert.strictEqual(output.todos.length, 3);

    const task1 = output.todos.find(t => t.file === 'task-1.md');
    assert.ok(task1, 'task-1.md should be in todos');
    assert.strictEqual(task1.title, 'Fix bug');
    assert.strictEqual(task1.area, 'backend');
    assert.strictEqual(task1.created, '2026-02-25');
    assert.strictEqual(task1.path, `${planningRoot}/todos/pending/task-1.md`);
  });

  test('area filter returns only matching todos', () => {
    const pendingDir = path.join(projectDir, 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');
    fs.writeFileSync(path.join(pendingDir, 'task-2.md'), 'title: Add feature\narea: frontend\ncreated: 2026-02-24');
    fs.writeFileSync(path.join(pendingDir, 'task-3.md'), 'title: Write docs\narea: backend\ncreated: 2026-02-23');

    const result = runGsdTools('init todos backend', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 2);
    assert.strictEqual(output.area_filter, 'backend');
    for (const todo of output.todos) {
      assert.strictEqual(todo.area, 'backend');
    }
  });

  test('area filter miss returns zero count', () => {
    const pendingDir = path.join(projectDir, 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');

    const result = runGsdTools('init todos nonexistent', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.strictEqual(output.area_filter, 'nonexistent');
  });

  test('malformed file uses defaults', () => {
    const pendingDir = path.join(projectDir, 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'broken.md'), 'some random content without fields');

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    const todo = output.todos[0];
    assert.strictEqual(todo.title, 'Untitled');
    assert.strictEqual(todo.area, 'general');
    assert.strictEqual(todo.created, 'unknown');
  });

  test('non-md files are ignored', () => {
    const pendingDir = path.join(projectDir, 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task.md'), 'title: Real task\narea: dev\ncreated: 2026-01-01');
    fs.writeFileSync(path.join(pendingDir, 'notes.txt'), 'title: Not a task\narea: dev\ncreated: 2026-01-01');

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    assert.strictEqual(output.todos[0].file, 'task.md');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitMilestoneOp (INIT-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitMilestoneOp', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('no phase directories returns zero counts', () => {
    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 0);
    assert.strictEqual(output.completed_phases, 0);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('multiple phases with no summaries', () => {
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    const phase2 = path.join(projectDir, 'phases', '02-api');
    fs.mkdirSync(phase1, { recursive: true });
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 2);
    assert.strictEqual(output.completed_phases, 0);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('mix of complete and incomplete phases', () => {
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    const phase2 = path.join(projectDir, 'phases', '02-api');
    fs.mkdirSync(phase1, { recursive: true });
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 2);
    assert.strictEqual(output.completed_phases, 1);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('all phases complete', () => {
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 1);
    assert.strictEqual(output.completed_phases, 1);
    assert.strictEqual(output.all_phases_complete, true);
  });

  test('archive directory scanning', () => {
    fs.mkdirSync(path.join(projectDir, 'archive', 'v1.0'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'archive', 'v0.9'), { recursive: true });

    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.archive_count, 2);
    assert.strictEqual(output.archived_milestones.length, 2);
  });

  test('no archive directory returns empty', () => {
    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.archive_count, 0);
    assert.deepStrictEqual(output.archived_milestones, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitPhaseOp fallback (INIT-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitPhaseOp fallback', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('normal path with existing directory', () => {
    const phaseDir = path.join(projectDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Context');
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 1 plans\n'
    );

    const result = runGsdTools('init phase-op 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.ok(output.phase_dir.includes('03-api'), 'phase_dir should contain 03-api');
    assert.strictEqual(output.has_context, true);
    assert.strictEqual(output.has_plans, true);
  });

  test('fallback to ROADMAP when no directory exists', () => {
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 5: Widget Builder\n**Goal:** Build widgets\n**Plans:** TBD\n'
    );

    const result = runGsdTools('init phase-op 5', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.strictEqual(output.phase_dir, null);
    assert.strictEqual(output.phase_slug, 'widget-builder');
    assert.strictEqual(output.has_research, false);
    assert.strictEqual(output.has_context, false);
    assert.strictEqual(output.has_plans, false);
  });

  test('neither directory nor roadmap entry returns not found', () => {
    fs.writeFileSync(
      path.join(projectDir, 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 1: Setup\n**Goal:** Setup project\n**Plans:** TBD\n'
    );

    const result = runGsdTools('init phase-op 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false);
    assert.strictEqual(output.phase_dir, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitProgress (INIT-03)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitProgress', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('no phases returns empty state', () => {
    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 0);
    assert.deepStrictEqual(output.phases, []);
    assert.strictEqual(output.current_phase, null);
    assert.strictEqual(output.next_phase, null);
    assert.strictEqual(output.has_work_in_progress, false);
  });

  test('multiple phases with mixed statuses', () => {
    // Phase 01: complete (has plan + summary)
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    // Phase 02: in_progress (has plan, no summary)
    const phase2 = path.join(projectDir, 'phases', '02-api');
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    // Phase 03: pending (no plan, no research)
    const phase3 = path.join(projectDir, 'phases', '03-ui');
    fs.mkdirSync(phase3, { recursive: true });
    fs.writeFileSync(path.join(phase3, '03-CONTEXT.md'), '# Context');

    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 3);
    assert.strictEqual(output.completed_count, 1);
    assert.strictEqual(output.in_progress_count, 1);
    assert.strictEqual(output.has_work_in_progress, true);

    assert.strictEqual(output.current_phase.number, '02');
    assert.strictEqual(output.current_phase.status, 'in_progress');

    assert.strictEqual(output.next_phase.number, '03');
    assert.strictEqual(output.next_phase.status, 'pending');

    // Verify phase entries have expected structure
    const p1 = output.phases.find(p => p.number === '01');
    assert.strictEqual(p1.status, 'complete');
    assert.strictEqual(p1.plan_count, 1);
    assert.strictEqual(p1.summary_count, 1);
  });

  test('researched status detected correctly', () => {
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-RESEARCH.md'), '# Research');

    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    const p1 = output.phases.find(p => p.number === '01');
    assert.strictEqual(p1.status, 'researched');
    assert.strictEqual(p1.has_research, true);
    assert.strictEqual(output.current_phase.number, '01');
  });

  test('all phases complete returns no current or next', () => {
    const phase1 = path.join(projectDir, 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed_count, 1);
    assert.strictEqual(output.current_phase, null);
    assert.strictEqual(output.next_phase, null);
  });

  test('paused_at detected from STATE.md', () => {
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '# Project State\n\n**Paused At:** Phase 2, Task 3 — implementing auth\n'
    );

    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.paused_at, 'paused_at should be set');
    assert.ok(output.paused_at.includes('Phase 2, Task 3'), 'paused_at should contain pause location');
  });

  test('no paused_at when STATE.md has no pause line', () => {
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '# Project State\n\nSome content without pause.\n'
    );

    const result = runGsdTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.paused_at, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitQuick (INIT-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitQuick', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('with description generates slug and task_dir', () => {
    const result = runGsdTools('init quick "Fix login bug"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'fix-login-bug');
    assert.strictEqual(output.next_num, 1);
    assert.strictEqual(output.task_dir, `${planningRoot}/quick/1-fix-login-bug`);
    assert.strictEqual(output.description, 'Fix login bug');
  });

  test('without description returns null slug and task_dir', () => {
    const result = runGsdTools('init quick', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, null);
    assert.strictEqual(output.task_dir, null);
    assert.strictEqual(output.description, null);
    assert.strictEqual(output.next_num, 1);
  });

  test('next number increments from existing entries', () => {
    const quickDir = path.join(projectDir, 'quick');
    fs.mkdirSync(path.join(quickDir, '1-old-task'), { recursive: true });
    fs.mkdirSync(path.join(quickDir, '3-another-task'), { recursive: true });

    const result = runGsdTools('init quick "New task"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next_num, 4);
  });

  test('long description truncates slug to 40 chars', () => {
    const result = runGsdTools('init quick "This is a very long description that should get truncated to forty characters maximum"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.slug.length <= 40, `Slug should be <= 40 chars, got ${output.slug.length}: "${output.slug}"`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitMapCodebase (INIT-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitMapCodebase', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('no codebase dir returns empty', () => {
    const result = runGsdTools('init map-codebase', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, false);
    assert.deepStrictEqual(output.existing_maps, []);
    assert.strictEqual(output.codebase_dir_exists, false);
  });

  test('with existing maps lists md files only', () => {
    const codebaseDir = path.join(projectDir, 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(path.join(codebaseDir, 'STACK.md'), '# Stack');
    fs.writeFileSync(path.join(codebaseDir, 'ARCHITECTURE.md'), '# Architecture');
    fs.writeFileSync(path.join(codebaseDir, 'notes.txt'), 'not a markdown file');

    const result = runGsdTools('init map-codebase', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, true);
    assert.strictEqual(output.existing_maps.length, 2);
    assert.ok(output.existing_maps.includes('STACK.md'), 'Should include STACK.md');
    assert.ok(output.existing_maps.includes('ARCHITECTURE.md'), 'Should include ARCHITECTURE.md');
  });

  test('empty codebase dir returns no maps', () => {
    const codebaseDir = path.join(projectDir, 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });

    const result = runGsdTools('init map-codebase', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, false);
    assert.deepStrictEqual(output.existing_maps, []);
    assert.strictEqual(output.codebase_dir_exists, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitNewProject (INIT-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitNewProject', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('greenfield project with no code', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, false);
    assert.strictEqual(output.has_package_file, false);
    assert.strictEqual(output.is_brownfield, false);
    assert.strictEqual(output.needs_codebase_map, false);
  });

  test('brownfield with package.json detected', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');

    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, true);
  });

  test('brownfield with codebase map does not need map', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(projectDir, 'codebase'), { recursive: true });

    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, false);
  });

  test('planning_exists flag is correct', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.planning_exists, true);
  });

  test('returns project_name from active context', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.project_name, 'string');
    assert.ok(output.project_name.length > 0, 'project_name should be non-empty');
    assert.strictEqual(output.active_project, output.project_name);
  });

  test('returns config_path field', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.config_path, 'config_path should be set');
    assert.ok(output.config_path.endsWith('/config.json'), 'config_path should end with config.json');
  });

  test('returns scope_path null when not configured', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.scope_path, null);
  });

  test('returns scope_path when configured in project config', () => {
    // Write a config with scope_path
    const configPath = path.join(projectDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ scope_path: 'packages/frontend' }));

    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.scope_path, 'packages/frontend');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitNewMilestone (INIT-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitNewMilestone', () => {
  let tmpDir, planningRoot, projectDir;

  beforeEach(() => {
    const ctx = setupMultiUserProjectWithFiles();
    tmpDir = ctx.tmpDir;
    planningRoot = ctx.planningRoot;
    projectDir = ctx.projectDir;
  });

  afterEach(() => {
    clearPlanningRootCache();
    cleanup(tmpDir);
  });

  test('returns expected fields', () => {
    const result = runGsdTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('current_milestone' in output, 'Should have current_milestone');
    assert.ok('current_milestone_name' in output, 'Should have current_milestone_name');
    assert.ok('researcher_model' in output, 'Should have researcher_model');
    assert.ok('synthesizer_model' in output, 'Should have synthesizer_model');
    assert.ok('roadmapper_model' in output, 'Should have roadmapper_model');
    assert.ok('commit_docs' in output, 'Should have commit_docs');
    assert.strictEqual(output.project_path, `${planningRoot}/PROJECT.md`);
    assert.strictEqual(output.roadmap_path, `${planningRoot}/ROADMAP.md`);
    assert.strictEqual(output.state_path, `${planningRoot}/STATE.md`);
  });

  test('file existence flags reflect actual state', () => {
    // Default: no STATE.md, ROADMAP.md, or PROJECT.md in project dir
    const result1 = runGsdTools('init new-milestone', tmpDir);
    assert.ok(result1.success, `Command failed: ${result1.error}`);

    const output1 = JSON.parse(result1.output);
    assert.strictEqual(output1.state_exists, false);
    assert.strictEqual(output1.roadmap_exists, false);
    assert.strictEqual(output1.project_exists, false);

    // Create files in multi-user project directory and verify flags change
    fs.writeFileSync(path.join(projectDir, 'STATE.md'), '# State');
    fs.writeFileSync(path.join(projectDir, 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(projectDir, 'PROJECT.md'), '# Project');

    const result2 = runGsdTools('init new-milestone', tmpDir);
    assert.ok(result2.success, `Command failed: ${result2.error}`);

    const output2 = JSON.parse(result2.output);
    assert.strictEqual(output2.state_exists, true);
    assert.strictEqual(output2.roadmap_exists, true);
    assert.strictEqual(output2.project_exists, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Null planning_root handling (PATH-13)
// ─────────────────────────────────────────────────────────────────────────────

describe('null planning_root handling', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('init commands return null/false paths when no active project', () => {
    const { tmpDir } = createTempMultiUserProject({ withActive: false });
    try {
      const result = runGsdTools('init new-milestone', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.planning_root, null);
      assert.strictEqual(output.state_path, null);
      assert.strictEqual(output.roadmap_path, null);
      assert.strictEqual(output.project_path, null);
      assert.strictEqual(output.state_exists, false);
      assert.strictEqual(output.roadmap_exists, false);
      assert.strictEqual(output.project_exists, false);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init context fields (PATH-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('init context fields', () => {
  const { execSync } = require('child_process');
  const { TOOLS_PATH } = require('./helpers.cjs');

  afterEach(() => {
    clearPlanningRootCache();
  });

  function setupMultiUserProjectWithFilesForContext(opts) {
    const { tmpDir, userSlug, projectName } = createTempMultiUserProject(opts);
    const projectDir = path.join(tmpDir, '.planning', 'users', userSlug, projectName);

    // Create minimal planning files needed by init commands
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '---\nphase: 1\nstatus: not_started\n---\n# State\n'
    );
    fs.writeFileSync(path.join(projectDir, 'ROADMAP.md'), '# Roadmap\n');

    // Create a phase directory with a plan
    const phaseDir = path.join(projectDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');

    return { tmpDir, userSlug, projectName, projectDir, phaseDir };
  }

  test('cmdInitProgress includes context fields', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProjectWithFilesForContext({});
    try {
      const result = runGsdTools('init progress', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.active_user, userSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${userSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('cmdInitNewProject includes context fields (null when no project)', () => {
    const { tmpDir } = createTempMultiUserProject({ withActive: false });
    try {
      const result = runGsdTools('init new-project', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      // Identity resolves (git user.name is set), but no active project
      assert.strictEqual(typeof output.active_user, 'string');
      assert.strictEqual(output.active_project, null);
      assert.strictEqual(output.planning_root, null);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('cmdInitExecutePhase includes context fields', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProjectWithFilesForContext({});
    try {
      const result = runGsdTools('init execute-phase 1', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.active_user, userSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${userSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('cmdInitPlanPhase includes context fields', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProjectWithFilesForContext({});
    try {
      const result = runGsdTools('init plan-phase 1', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.active_user, userSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${userSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('cmdInitMapCodebase includes context fields', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProjectWithFilesForContext({});
    try {
      const result = runGsdTools('init map-codebase', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.active_user, userSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${userSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('cmdInitMistakes includes context fields', () => {
    const { tmpDir, userSlug, projectName } = setupMultiUserProjectWithFilesForContext({});
    try {
      const result = runGsdTools('init mistakes', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.active_user, userSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${userSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('GSD_USER override reflected in init output', () => {
    const overrideSlug = 'override-user';
    const { tmpDir, projectName } = setupMultiUserProjectWithFilesForContext({});

    // Create project directory for the override user
    const overrideProjectDir = path.join(
      tmpDir, '.planning', 'users', overrideSlug, projectName, 'phases'
    );
    fs.mkdirSync(overrideProjectDir, { recursive: true });

    try {
      const result = execSync(`node "${TOOLS_PATH}" init progress`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GSD_USER: overrideSlug, GSD_PROJECT: projectName },
      });

      const output = JSON.parse(result.trim());
      assert.strictEqual(output.active_user, overrideSlug);
      assert.strictEqual(output.active_project, projectName);
      assert.strictEqual(output.planning_root, `.planning/users/${overrideSlug}/${projectName}`);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitSwitch (LIFE-03, LIFE-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitSwitch', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('switch with exact project match returns switched result', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'alpha' });
    // Create a second project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'beta', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch beta', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.switched, true);
      assert.strictEqual(output.project, 'beta');
      assert.ok(output.planning_root.includes('beta'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch with fuzzy match (substring) finds project', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'my-frontend-app' });
    // Create a second project to prevent auto-select
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'my-backend-api', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch frontend', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.switched, true);
      assert.strictEqual(output.project, 'my-frontend-app');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch with no match returns error', () => {
    const { tmpDir } = createTempMultiUserProject({ projectName: 'alpha' });
    try {
      const result = runGsdTools('switch nonexistent', tmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'), `Expected "not found" in error: ${result.error}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch without args returns project listing', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'alpha' });
    // Create a second project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'beta', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.switched, false);
      assert.ok(Array.isArray(output.projects));
      assert.ok(output.projects.length >= 2);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch writes .active on successful match', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'alpha' });
    // Create a second project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'beta', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch beta', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      // Check .active file was updated
      const activePath = path.join(tmpDir, '.planning', 'users', userSlug, '.active');
      const activeContent = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
      assert.strictEqual(activeContent.project, 'beta');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('switch with ambiguous match returns error', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'app-frontend' });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'app-backend', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('switch app', tmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Ambiguous'), `Expected "Ambiguous" in error: ${result.error}`);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitProjectSetup (LIFE-01, LIFE-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitProjectSetup', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('returns user identity and existing projects list', () => {
    const { tmpDir, userSlug, projectName } = createTempMultiUserProject();
    try {
      const result = runGsdTools('init project-setup', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.user, userSlug);
      assert.ok(Array.isArray(output.projects));
      assert.ok(output.projects.some(p => p.name === projectName));
      assert.strictEqual(output.planning_exists, true);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('works without any existing projects', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ withActive: false });
    // Remove the default project directory
    const projectDir = path.join(tmpDir, '.planning', 'users', userSlug, 'test-project');
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    try {
      const result = runGsdTools('init project-setup', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.user, userSlug);
      assert.deepStrictEqual(output.projects, []);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns global config when present', () => {
    const { tmpDir } = createTempMultiUserProject();
    // Create a global config
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ mode: 'yolo', granularity: 'fine' }, null, 2),
      'utf-8'
    );
    try {
      const result = runGsdTools('init project-setup', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.global_config.mode, 'yolo');
      assert.strictEqual(output.global_config.granularity, 'fine');
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdArchiveProject / cmdRestoreProject (LIFE-09)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdArchiveProject', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('archive moves project directory to _archived/', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'old-project' });
    // Create a second project so we have something after archive
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'current-project', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('archive-project old-project', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.archived, true);
      assert.strictEqual(output.project, 'old-project');

      // Verify directory was moved
      const archivedPath = path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'old-project');
      const originalPath = path.join(tmpDir, '.planning', 'users', userSlug, 'old-project');
      assert.ok(fs.existsSync(archivedPath), 'Archived directory should exist');
      assert.ok(!fs.existsSync(originalPath), 'Original directory should not exist');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('archive clears .active when archiving active project', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'active-project' });
    // Create a second project
    fs.mkdirSync(path.join(tmpDir, '.planning', 'users', userSlug, 'other-project', 'phases'), { recursive: true });
    try {
      const result = runGsdTools('archive-project active-project', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      // .active should either be cleared or point to the remaining project
      const activePath = path.join(tmpDir, '.planning', 'users', userSlug, '.active');
      if (fs.existsSync(activePath)) {
        const activeContent = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
        assert.notStrictEqual(activeContent.project, 'active-project', 'Should not still point to archived project');
      }
    } finally {
      cleanup(tmpDir);
    }
  });

  test('archive errors on nonexistent project', () => {
    const { tmpDir } = createTempMultiUserProject();
    try {
      const result = runGsdTools('archive-project nonexistent', tmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found') || result.error.includes('does not exist'),
        `Expected error about missing project: ${result.error}`);
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('cmdRestoreProject', () => {
  afterEach(() => {
    clearPlanningRootCache();
  });

  test('restore moves project from _archived/ back', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'current' });
    // Create an archived project
    const archivedPath = path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'old-project', 'phases');
    fs.mkdirSync(archivedPath, { recursive: true });
    try {
      const result = runGsdTools('restore-project old-project', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      const output = JSON.parse(result.output);
      assert.strictEqual(output.restored, true);
      assert.strictEqual(output.project, 'old-project');

      // Verify directory was moved
      const restoredPath = path.join(tmpDir, '.planning', 'users', userSlug, 'old-project');
      const archivedDir = path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'old-project');
      assert.ok(fs.existsSync(restoredPath), 'Restored directory should exist');
      assert.ok(!fs.existsSync(archivedDir), 'Archived directory should not exist');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('restore errors on duplicate name', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'my-project' });
    // Create a project with the same name in _archived
    const archivedPath = path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'my-project', 'phases');
    fs.mkdirSync(archivedPath, { recursive: true });
    try {
      const result = runGsdTools('restore-project my-project', tmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('already exists'),
        `Expected "already exists" in error: ${result.error}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('restore errors on project not found in _archived', () => {
    const { tmpDir } = createTempMultiUserProject();
    try {
      const result = runGsdTools('restore-project nonexistent', tmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'),
        `Expected "not found" in error: ${result.error}`);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('restore sets restored project as active', () => {
    const { tmpDir, userSlug } = createTempMultiUserProject({ projectName: 'current' });
    // Create an archived project
    const archivedPath = path.join(tmpDir, '.planning', 'users', userSlug, '_archived', 'restored-project', 'phases');
    fs.mkdirSync(archivedPath, { recursive: true });
    try {
      const result = runGsdTools('restore-project restored-project', tmpDir);
      assert.ok(result.success, `Command failed: ${result.error}`);

      // Check .active file was updated
      const activePath = path.join(tmpDir, '.planning', 'users', userSlug, '.active');
      const activeContent = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
      assert.strictEqual(activeContent.project, 'restored-project');
    } finally {
      cleanup(tmpDir);
    }
  });
});
