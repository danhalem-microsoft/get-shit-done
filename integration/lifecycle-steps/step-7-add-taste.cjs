'use strict';

/**
 * Step 7 — /gsd-add-taste
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 388-411 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { walkForDir } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'add-taste',
  produces: ['taste/*.md'],
  requires: [],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-add-taste. The preference: "Always use assert.strictEqual over assert.ok for value comparisons. Loose assertions hide bugs and create false confidence." Domain: testing. Confidence: high. Confirm when prompted.',
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
    const tasteDir = walkForDir(path.join(sandbox, '.planning'), 'taste');
    if (!tasteDir) {
      assert.ok(result.success, `gsd:add-taste failed and no taste dir: ${result.error || result.result.slice(0, 500)}`);
      return;
    }

    const entries = fs.readdirSync(tasteDir).filter(f => f.endsWith('.md'));
    if (entries.length === 0) return;

    // Use Claude to validate taste entry
    const entry = fs.readFileSync(path.join(tasteDir, entries[0]), 'utf-8');
    const validation = runClaudeWithTools(
      `Read this taste/preference entry and answer with ONLY "VALID" or "INVALID: <reason>". ` +
      `A valid entry must have: (1) YAML frontmatter with identifying fields (id, title, or name), ` +
      `(2) a domain field in frontmatter, (3) content describing a development preference. Entry:\n\n${entry}`,
      { cwd: sandbox, timeout: 30_000, maxBudget: 0.5 }
    );
    const verdict = (validation.result || '').trim();
    assert.ok(verdict.startsWith('VALID'), `Claude judged taste entry invalid: ${verdict}`);
  },
};

module.exports = STEP;
