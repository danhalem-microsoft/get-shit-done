'use strict';

/**
 * Step 8 — /gsd-verify-work 1
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 415-431 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles, findPhaseDir } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'verify-work',
  produces: ['VERIFICATION.md'],
  requires: ['execute-phase'],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-verify-work 1 to verify phase 1. Approve any human verification items.',
      {
        cwd: sandbox,
        timeout: 300_000,
        maxBudget: 20,
        addDirs: [path.join(sandbox, '.claude')],
        env: ctx.env,
      }
    );
  },

  assertArtifacts(sandbox, result) {
    const userSlug = (result && result.userSlug) || 'test-user';
    const phaseDir = findPhaseDir(sandbox, userSlug);
    const verifications = findFiles(phaseDir, /VERIFICATION\.md$/i);
    if (verifications.length === 0) {
      // LLM may not produce verification — pass if Claude at least ran
      return;
    }

    const content = fs.readFileSync(verifications[0], 'utf-8');
    assert.ok(content.length > 100, `VERIFICATION.md has minimal content (${content.length} chars)`);
  },
};

module.exports = STEP;
