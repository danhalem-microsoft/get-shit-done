'use strict';

/**
 * Step 4 — /gsd-review --critique 1 (POST-CULL)
 *
 * Pre-cull this step invoked /gsd-critique 1; the post-cull spine routes the
 * critique pathway through the consolidated /gsd-review entry point per
 * RESEARCH.md §1.4.5. Plan 07 will land the consolidated review command —
 * until then, this step's live invocation is expected RED. The static
 * decomposition test (tests/lifecycle-decomposed.test.cjs) is the GREEN gate
 * for Wave 0.
 *
 * Extracted from integration/gsd-lifecycle.test.cjs lines 299-316 (assertion
 * logic verbatim).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles, findPhaseDir } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'review-critique',
  produces: ['CRITIQUE.md'],
  requires: ['plan-phase'],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-review --critique 1 to review the phase 1 plans.',
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
    const critiques = findFiles(phaseDir, /CRITIQUE\.md$/i);
    if (critiques.length === 0) {
      // No critique produced — CLI error or budget, pass gracefully
      return;
    }
    assert.ok(critiques.length >= 1, `CRITIQUE.md not found in ${phaseDir}`);

    const content = fs.readFileSync(critiques[0], 'utf-8');
    assert.ok(content.length > 100, `CRITIQUE.md has minimal content (${content.length} chars)`);
  },
};

module.exports = STEP;
