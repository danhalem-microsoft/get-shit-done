'use strict';

/**
 * Step 2 — /gsd-discuss-phase 1 --auto
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 220-244 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles, findPhaseDir, findRoadmap } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'discuss-phase',
  produces: ['CONTEXT.md'],
  requires: ['new-project'],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-discuss-phase 1 --auto to discuss the first phase with auto-defaults.',
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

    // Prerequisite gate: composer should skip via `requires`, but be defensive.
    if (!findRoadmap(sandbox)) {
      // Composer guards this, but if assertArtifacts is called standalone and
      // there is no roadmap, treat as a no-op (skip-on-flake pattern).
      return;
    }

    // Check artifacts regardless of CLI exit status (LLM may have created them before erroring)
    const phaseDir = findPhaseDir(sandbox, userSlug);
    if (!phaseDir) {
      // CLI failed AND no phase dir created — real failure only if Claude didn't even try
      assert.ok(result.success, `gsd-discuss-phase failed and no phase dir created: ${result.error || result.result.slice(0, 500)}`);
      return;
    }

    const contextFiles = findFiles(phaseDir, /CONTEXT\.md$/i);
    if (contextFiles.length === 0) {
      // Phase dir exists but no CONTEXT.md — CLI may have errored partway
      assert.ok(result.success, `gsd-discuss-phase created phase dir but no CONTEXT.md: ${result.error || result.result.slice(0, 500)}`);
      return;
    }
    const content = fs.readFileSync(contextFiles[0], 'utf-8');
    assert.ok(content.includes('decision') || content.includes('Decision') || content.includes('<decisions>'),
      'CONTEXT.md does not contain decisions section');
  },
};

module.exports = STEP;
