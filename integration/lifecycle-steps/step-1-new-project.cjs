'use strict';

/**
 * Step 1 — /gsd-new-project
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 187-216 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'new-project',
  produces: ['PROJECT.md', 'ROADMAP.md', 'STATE.md'],
  requires: [],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-new-project. The project is called "test-widget" — a Node.js CLI tool that generates JSON reports from CSV files. Keep it simple, 2-3 phases max. Answer any questions with reasonable defaults.',
      {
        cwd: sandbox,
        timeout: 600_000,
        maxBudget: 50,
        addDirs: [path.join(sandbox, '.claude')],
        env: ctx.env,
      }
    );
  },

  assertArtifacts(sandbox, result) {
    // Check artifacts regardless of CLI exit status
    const planningDir = path.join(sandbox, '.planning');

    // Find PROJECT.md anywhere under .planning/
    const projectMd = findFiles(planningDir, /PROJECT\.md$/);
    if (projectMd.length === 0) {
      // No artifacts at all — real failure
      assert.fail(`gsd-new-project produced no artifacts. CLI: ${result.error || ''} | result: ${(result.result || '').slice(0, 500)}`);
    }

    // ROADMAP.md exists
    const roadmapMd = findFiles(planningDir, /ROADMAP\.md$/);
    assert.ok(roadmapMd.length >= 1, `ROADMAP.md not found under ${planningDir}`);
    const roadmapContent = fs.readFileSync(roadmapMd[0], 'utf-8');
    assert.ok(roadmapContent.includes('Phase') || roadmapContent.includes('phase'),
      'ROADMAP.md does not mention any phases');

    // STATE.md exists (frontmatter is optional — format varies by GSD version)
    const stateMd = findFiles(planningDir, /STATE\.md$/);
    assert.ok(stateMd.length >= 1, `STATE.md not found under ${planningDir}`);
    const stateContent = fs.readFileSync(stateMd[0], 'utf-8');
    assert.ok(stateContent.includes('Phase') || stateContent.includes('phase') || stateContent.includes('status'),
      'STATE.md does not contain phase/status information');
  },
};

module.exports = STEP;
