'use strict';

/**
 * Step 9 — /gsd-progress
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 435-445 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 *
 * NOTE (post-cull): /gsd-stats has been removed from the spine; the pre-cull
 * step-10 file is intentionally absent. Live progress is the final pipeline
 * step.
 */

const path = require('node:path');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');

const STEP = {
  name: 'progress',
  produces: [],
  requires: [],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-progress and show the output.',
      {
        cwd: sandbox,
        timeout: 300_000,
        maxBudget: 15,
        addDirs: [path.join(sandbox, '.claude')],
        env: ctx.env,
      }
    );
  },

  assertArtifacts(sandbox, result) {
    assert.ok(result.success, `gsd-progress failed: ${result.error || result.result.slice(0, 500)}`);
    assert.ok(result.turns >= 2, `Expected >= 2 tool turns, got ${result.turns}`);

    const output = result.result.toLowerCase();
    assert.ok(
      output.includes('phase') || output.includes('plan') || output.includes('progress'),
      `Output missing project state markers. Got: ${result.result.slice(0, 500)}`
    );
  },
};

module.exports = STEP;
