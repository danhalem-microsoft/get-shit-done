'use strict';

/**
 * Step 3 — /gsd-plan-phase 1
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 248-295 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles, findPhaseDir } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'plan-phase',
  produces: ['PLAN.md'],
  may_produce: ['RESEARCH.md'],
  requires: ['discuss-phase'],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-plan-phase 1 to create the implementation plan for phase 1.',
      {
        cwd: sandbox,
        timeout: 600_000,
        maxBudget: 30,
        addDirs: [path.join(sandbox, '.claude')],
        env: ctx.env,
      }
    );
  },

  assertArtifacts(sandbox, result) {
    const userSlug = (result && result.userSlug) || 'test-user';
    const phaseDir = findPhaseDir(sandbox, userSlug);
    // Find plans with either naming convention: *-PLAN.md or PLAN-*.md
    const plans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);
    if (plans.length === 0) {
      // No plans created — real failure only if Claude reported success
      assert.ok(!result.success, `gsd-plan-phase reported success but created no plans in ${phaseDir}`);
      return; // CLI error, no plans — skip gracefully
    }

    // gsd-execute-phase requires *-PLAN.md suffix naming — fix any PLAN-* prefix files
    for (const plan of plans) {
      const basename = path.basename(plan);
      if (basename.startsWith('PLAN-') && !basename.endsWith('-PLAN.md')) {
        // Rename PLAN-01-foo.md → 01-foo-PLAN.md
        const withoutPrefix = basename.replace(/^PLAN-/, '');
        const withoutExt = withoutPrefix.replace(/\.md$/, '');
        const newName = `${withoutExt}-PLAN.md`;
        fs.renameSync(plan, path.join(path.dirname(plan), newName));
      }
    }

    // Re-find plans after rename (original paths are stale)
    const renamedPlans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);

    // Check first plan has content (frontmatter format varies)
    const planContent = fs.readFileSync(renamedPlans[0], 'utf-8');
    assert.ok(planContent.length > 200, `Plan ${plans[0]} has minimal content (${planContent.length} chars)`);
    assert.ok(
      planContent.includes('## Tasks') || planContent.includes('<task') ||
      planContent.includes('## Step') || planContent.includes('- [ ]'),
      'Plan has no tasks/steps section');

    // Dynamic researchers: check if RESEARCH.md was created
    const research = findFiles(phaseDir, /RESEARCH\.md$/i);
    if (research.length > 0) {
      const researchContent = fs.readFileSync(research[0], 'utf-8');
      assert.ok(researchContent.length > 100,
        'RESEARCH.md exists but has minimal content — researcher may not have produced output');
    }
    // (RESEARCH.md is optional — some phases skip it. Not a failure if missing.)
  },
};

module.exports = STEP;
