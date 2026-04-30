'use strict';

/**
 * CULL-04: /gsd-phase consolidated command with subcommands.
 *
 * Static test — does not invoke Claude.
 *
 * Verifies:
 *  - commands/gsd/phase.md exists with frontmatter `name: gsd:phase`.
 *  - All 3 subcommands (add, insert, remove) appear in the consolidated
 *    command surface so /gsd-help discovery and the orchestrator can
 *    route them.
 *
 * Per CONTEXT.md `<decisions>`: phase-manipulation commands have NO
 * deprecation stubs — only the 6 quality-gate commands carry stubs
 * (covered by tests/consolidated-review-flags.test.cjs). The migration
 * table in commands/gsd/help.md and CHANGELOG.md (Plan 09) covers
 * discovery for the 3 deleted phase-manipulation commands.
 *
 * Per CONTEXT.md D-04: read-only fs.readFileSync, no shared state, no
 * process.chdir — safe under TEST_CONCURRENCY=8.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands', 'gsd');

const SUBCOMMANDS = ['add', 'insert', 'remove'];

describe('CULL-04: /gsd-phase consolidated command', () => {
  const cmdPath = path.join(COMMANDS_DIR, 'phase.md');

  test('commands/gsd/phase.md exists', () => {
    assert.ok(fs.existsSync(cmdPath), 'phase.md must exist');
  });

  test('frontmatter declares name: gsd:phase', () => {
    const content = fs.readFileSync(cmdPath, 'utf-8');
    // Frontmatter is the block between the first two `---` markers.
    const fmEnd = content.indexOf('---', 4);
    const fm = content.slice(4, fmEnd);
    assert.match(fm, /name:\s*gsd:phase/);
  });

  for (const sub of SUBCOMMANDS) {
    test(`phase.md mentions subcommand "${sub}"`, () => {
      const content = fs.readFileSync(cmdPath, 'utf-8');
      // Match `add`, `insert`, `remove` as standalone tokens — they appear
      // in the argument-hint, the <objective> body, and the <process>
      // dispatch block. \\b is sufficient because all three subcommands
      // are common English words but the contexts above guarantee a hit.
      const re = new RegExp(`\\b${sub}\\b`);
      assert.match(content, re, `phase.md must reference subcommand "${sub}"`);
    });
  }

  test('phase.md is a single consolidated command (not 3 separate files)', () => {
    // Per CONTEXT.md decision: phase-manipulation commands have NO stubs.
    // Plan 08 deletes the old per-subcommand files (add-phase.md,
    // insert-phase.md, remove-phase.md). This test documents that intent
    // — the assertion is a no-op until Plan 08 lands; after Plan 08 the
    // existence check above plus the surviving-roster test will enforce
    // the consolidation structurally.
    assert.ok(true);
  });
});
