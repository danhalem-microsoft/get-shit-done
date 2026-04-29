'use strict';

// GSD Lifecycle Pipeline — thin composer (post-cull, 9 steps).
// Per RESEARCH.md §1.4.5: direct require() of each step file, no JSON-driven
// loading — keeps the Wave 0 transition simple. Each step file at
// integration/lifecycle-steps/step-N-<name>.cjs exports
// { name, produces, may_produce, requires, run, assertArtifacts }.
// Cost: ~$50-80/run, ~20-30 min. Run via bazel test //integration:gsd-lifecycle.

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox } = require('./helpers/claude-runner.cjs');

const STEPS = [
  require('./lifecycle-steps/step-1-new-project.cjs'),
  require('./lifecycle-steps/step-2-discuss-phase.cjs'),
  require('./lifecycle-steps/step-3-plan-phase.cjs'),
  require('./lifecycle-steps/step-4-review-critique.cjs'),
  require('./lifecycle-steps/step-5-execute-phase.cjs'),
  require('./lifecycle-steps/step-6-add-mistake.cjs'),
  require('./lifecycle-steps/step-7-add-taste.cjs'),
  require('./lifecycle-steps/step-8-verify-work.cjs'),
  require('./lifecycle-steps/step-9-progress.cjs'),
];

describe('GSD lifecycle pipeline (post-cull, 9 steps)', () => {
  let sandbox;
  const userSlug = 'test-user';
  const ctx = { env: { GSD_USER: userSlug } };
  const stepResults = {};

  before(() => { sandbox = createSandbox('lifecycle'); });

  // ── Pre-checks: Fork integrity ────────────────────────────────
  test('pre-check: fork-only modules exist in sandbox', () => {
    const libDir = path.join(sandbox, '.claude', 'get-shit-done', 'bin', 'lib');
    for (const mod of ['identity.cjs', 'context.cjs', 'taste.cjs']) {
      assert.ok(fs.existsSync(path.join(libDir, mod)), `Fork module missing: ${mod}`);
    }
  });
  test('pre-check: fork patches intact in sandbox', () => {
    const libDir = path.join(sandbox, '.claude', 'get-shit-done', 'bin', 'lib');
    const core = fs.readFileSync(path.join(libDir, 'core.cjs'), 'utf-8');
    assert.ok(core.includes('tryGetPlanningContext'), 'core.cjs missing tryGetPlanningContext');
    const init = fs.readFileSync(path.join(libDir, 'init.cjs'), 'utf-8');
    assert.ok(init.includes('active_user') && init.includes('active_project'), 'init.cjs missing active_user/active_project');
  });
  test('pre-check: critic agents exist in sandbox', () => {
    const agentsDir = path.join(sandbox, '.claude', 'agents');
    const critics = fs.readdirSync(agentsDir).filter(f => f.startsWith('gsd-critic-'));
    assert.ok(critics.length >= 6, `Expected >= 6 critic agents, found ${critics.length}`);
  });
  test('pre-check: researcher files exist in sandbox', () => {
    const researchersDir = path.join(sandbox, '.claude', 'get-shit-done', 'researchers');
    const rs = fs.readdirSync(researchersDir).filter(f => f.endsWith('.md'));
    assert.ok(rs.length >= 11, `Expected >= 11 researchers, found ${rs.length}`);
  });
  test('pre-check: code-search template exists in sandbox', () => {
    const t = path.join(sandbox, '.claude', 'get-shit-done', 'templates');
    assert.ok(fs.existsSync(t) && fs.readdirSync(t).some(f => f.includes('code-search')), 'code-search template not found');
  });

  // ── Lifecycle steps (1..9) ────────────────────────────────────
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    test(`step ${i + 1}: ${step.name}`, async (t) => {
      for (const req of (step.requires || [])) {
        if (!stepResults[req]?.success) return t.skip(`prerequisite ${req} did not succeed`);
      }
      const result = await step.run(sandbox, ctx);
      result.userSlug = userSlug;
      step.assertArtifacts(sandbox, result);
      stepResults[step.name] = result;
    });
  }
});
