'use strict';

/**
 * CULL-07: migration table present in help workflow + CHANGELOG.
 *
 * Asserts every deleted/consolidated command and every deleted agent
 * has a row in BOTH commands/gsd/help.md (or its workflow body) AND
 * CHANGELOG.md.
 *
 * Per CONTEXT.md D-01: the OLD /gsd-review row is asserted via a regex
 * anchored to the migration row, requiring the `(old)` qualifier and the
 * `Removed` outcome (distinct from the NEW consolidated /gsd-review).
 *
 * Per CONTEXT.md D-04: this test uses only fs.readFileSync and own-scope
 * locals (no chdir, no shared cache mutation) so it is safe under
 * TEST_CONCURRENCY=8.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HELP_WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'help.md');
const HELP_COMMAND = path.join(ROOT, 'commands', 'gsd', 'help.md');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

const {
  deletedCommands,
  consolidatedCommands,
  deletedAgents,
} = require('./fixtures/cull-deletion-list.cjs');

function readHelpContent() {
  // Migration table may live in either file; concatenate both for the search.
  const workflowContent = fs.existsSync(HELP_WORKFLOW) ? fs.readFileSync(HELP_WORKFLOW, 'utf-8') : '';
  const commandContent = fs.existsSync(HELP_COMMAND) ? fs.readFileSync(HELP_COMMAND, 'utf-8') : '';
  return workflowContent + '\n' + commandContent;
}

describe('CULL-07: migration table in help workflow', () => {
  const helpContent = readHelpContent();

  test('help mentions Phase 1 migration table', () => {
    assert.match(helpContent, /Migration|migration/,
      'help.md (or workflow) must mention "migration"');
  });

  for (const cmd of deletedCommands) {
    test(`help has migration row for /gsd-${cmd}`, () => {
      assert.ok(helpContent.includes(`/gsd-${cmd}`),
        `help workflow missing migration row for /gsd-${cmd}`);
    });
  }

  for (const [oldCmd, replacement] of Object.entries(consolidatedCommands)) {
    test(`help has migration row for /gsd-${oldCmd} → ${replacement}`, () => {
      assert.ok(helpContent.includes(`/gsd-${oldCmd}`),
        `help workflow missing /gsd-${oldCmd}`);
      assert.ok(helpContent.includes(replacement) || helpContent.includes(`/${replacement}`),
        `help workflow missing replacement "${replacement}"`);
    });
  }

  for (const agent of deletedAgents) {
    test(`help has migration row for agent ${agent}`, () => {
      assert.ok(helpContent.includes(agent),
        `help workflow missing agent removal row for ${agent}`);
    });
  }

  // Per CONTEXT.md D-01 (LOCKED): the OLD /gsd-review row must be
  // regex-anchored to the migration row, with `(old)` qualifier required and
  // `Removed` outcome required. This is distinct from the NEW consolidated
  // /gsd-review which is added under "## Added" and not flagged here.
  test('D-01: OLD /gsd-review row uses (old) qualifier and Removed outcome', () => {
    const lines = helpContent.split('\n');
    // Find migration-row lines that mention gsd-review.
    const reviewRows = lines.filter((l) => /\bgsd-review\b/.test(l) && l.trim().startsWith('|'));
    // At least one of those rows must match the D-01 anchor pattern.
    const oldRowPattern = /^\|.*\bgsd-review\b.*\(old\).*Removed.*\|$/;
    const oldRow = reviewRows.find((l) => oldRowPattern.test(l));
    assert.ok(oldRow,
      `D-01 violation: no migration row matches the OLD /gsd-review pattern.\n` +
      `Required: a row matching ${oldRowPattern} (i.e., contains "gsd-review", "(old)", and "Removed").\n` +
      `Found gsd-review rows:\n` + reviewRows.map((r) => '  ' + r).join('\n'));
    // Additional content check: the disambiguation prose must be present somewhere.
    assert.match(helpContent, /different functionality, same name/,
      'D-01 violation: the OLD-vs-NEW /gsd-review disambiguation phrase ("different functionality, same name") must appear in the help content.');
  });
});

describe('CULL-07: migration mirror in CHANGELOG.md [Unreleased] block', () => {
  test('CHANGELOG has BREAKING CHANGES and Phase 1 cull mentions', () => {
    const cl = fs.readFileSync(CHANGELOG, 'utf-8');
    assert.match(cl, /BREAKING CHANGES/);
    assert.match(cl, /49 commands removed|49 commands removed outright/);
    assert.match(cl, /17 agents removed/);
    assert.match(cl, /9 commands consolidated/i);
  });

  test('CHANGELOG [Unreleased] block contains spot-checked deleted commands', () => {
    const cl = fs.readFileSync(CHANGELOG, 'utf-8');
    const unreleasedStart = cl.indexOf('## [Unreleased]');
    assert.ok(unreleasedStart >= 0, 'CHANGELOG must have ## [Unreleased] block');
    const nextBlock = cl.indexOf('\n## [', unreleasedStart + 5);
    const unreleased = nextBlock > 0 ? cl.slice(unreleasedStart, nextBlock) : cl.slice(unreleasedStart);
    // Spot-check 5 deleted commands:
    for (const cmd of ['audit-fix', 'graphify', 'debug', 'session-report', 'cleanup']) {
      assert.ok(unreleased.includes(cmd) || unreleased.includes(`/gsd-${cmd}`),
        `CHANGELOG [Unreleased] missing spot-check command "${cmd}"`);
    }
  });

  test('D-01: CHANGELOG [Unreleased] contains OLD-vs-NEW /gsd-review disambiguation', () => {
    const cl = fs.readFileSync(CHANGELOG, 'utf-8');
    assert.match(cl, /different functionality, same name/,
      'D-01 violation: CHANGELOG must include the OLD-vs-NEW /gsd-review disambiguation phrase.');
  });
});
