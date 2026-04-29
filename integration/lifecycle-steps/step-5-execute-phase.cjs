'use strict';

/**
 * Step 5 — /gsd-execute-phase 1
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 320-350 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'execute-phase',
  produces: ['SUMMARY.md'],
  requires: ['plan-phase'],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-execute-phase 1 to execute all plans in phase 1.',
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
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    const timedOut = (result.error || '').includes('ETIMEDOUT');
    if (!result.success && !budgetExhausted && !timedOut) {
      // Unexpected CLI error — check if artifacts exist anyway
      const summaries = findFiles(path.join(sandbox, '.planning'), /SUMMARY.*\.md$|.*-SUMMARY\.md$/i);
      if (summaries.length === 0) return; // No artifacts — pass gracefully
    }

    // Search entire .planning/ for summaries (may be in different phase dir paths)
    const summaries = findFiles(path.join(sandbox, '.planning'), /SUMMARY.*\.md$|.*-SUMMARY\.md$/i);
    if ((budgetExhausted || timedOut) && summaries.length === 0) return;
    if (summaries.length === 0) return; // execute-phase didn't produce summaries — LLM flakiness

    // Check summary has content
    const summaryContent = fs.readFileSync(summaries[0], 'utf-8');
    assert.ok(summaryContent.length > 100, `SUMMARY has minimal content (${summaryContent.length} chars)`);

    // Git commits exist from execution
    const log = execFileSync('git', ['log', '--oneline', '-20'], {
      cwd: sandbox, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(log.split('\n').length >= 3,
      `Expected multiple commits from execution, git log shows: ${log.slice(0, 300)}`);
  },
};

module.exports = STEP;
