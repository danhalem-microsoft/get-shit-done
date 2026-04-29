'use strict';

/**
 * Step 6 — /gsd-add-mistake
 *
 * Extracted verbatim (assertion logic) from integration/gsd-lifecycle.test.cjs
 * lines 354-384 as part of the Wave 0 lifecycle decomposition (Plan 01-02).
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { walkForDir, readFrontmatter } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'add-mistake',
  produces: ['mistakes/*.md'],
  requires: [],

  async run(sandbox, ctx) {
    return runClaudeWithTools(
      'Run /gsd-add-mistake. The mistake: "Test assertions were too loose — checking only string length instead of structural correctness, which let broken skills pass silently." Area: testing. Confirm creation when prompted.',
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
    // Find mistakes directory
    const mistakeDir = walkForDir(path.join(sandbox, '.planning'), 'mistakes');
    if (!mistakeDir) {
      assert.ok(result.success, `gsd:add-mistake failed and no mistakes dir: ${result.error || result.result.slice(0, 500)}`);
      return;
    }

    const entries = fs.readdirSync(mistakeDir).filter(f => f.endsWith('.md'));
    if (entries.length === 0) return; // No entries — LLM flakiness

    // Validate format
    const entry = fs.readFileSync(path.join(mistakeDir, entries[0]), 'utf-8');
    const fm = readFrontmatter(path.join(mistakeDir, entries[0]));
    assert.ok(fm, 'Mistake entry has no frontmatter');
    assert.ok(fm.includes('id'), 'Mistake frontmatter missing id');

    // Use Claude to validate the mistake entry content quality
    const validation = runClaudeWithTools(
      `Read this mistake registry entry and answer with ONLY "VALID" or "INVALID: <reason>". ` +
      `A valid entry must have: (1) YAML frontmatter with an id field, (2) a section describing what happened, ` +
      `(3) a section describing prevention or why it matters. The section headings can vary. Entry:\n\n${entry}`,
      { cwd: sandbox, timeout: 30_000, maxBudget: 0.5 }
    );
    const verdict = (validation.result || '').trim();
    assert.ok(verdict.startsWith('VALID'), `Claude judged mistake entry invalid: ${verdict}`);
  },
};

module.exports = STEP;
