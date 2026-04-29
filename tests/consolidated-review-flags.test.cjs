'use strict';

/**
 * CULL-03 + CULL-05: /gsd-review consolidated command surface and 6
 * deprecation stubs.
 *
 * Static test — does not invoke Claude.
 *
 * Verifies:
 *  - commands/gsd/review.md exists with frontmatter `name: gsd:review`.
 *  - All 6 dispatch flags (--code, --code-fix, --security, --coverage,
 *    --critique, --converge) are mentioned in the consolidated command
 *    surface so /gsd-help discovery and the orchestrator can route them.
 *  - Each of the 6 deprecation stubs:
 *      (a) exists and carries a deprecation marker;
 *      (b) dispatches to /gsd-review --<correct-flag>;
 *      (c) does NOT recursively dispatch to its own old name with
 *          $ARGUMENTS (T-01-07-01 — infinite-loop guard).
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

const FLAGS = ['--code', '--code-fix', '--security', '--coverage', '--critique', '--converge'];

// LOCKED stub mapping per CONTEXT.md `<decisions>` (Phase 1 quality-gate
// consolidation). Order: [old-command-filename-stem, new-flag-name].
const STUBS = [
  ['secure-phase',            'security'],
  ['validate-phase',          'coverage'],
  ['code-review',             'code'],
  ['code-review-fix',         'code-fix'],
  ['critique',                'critique'],
  ['plan-review-convergence', 'converge'],
];

describe('CULL-03: /gsd-review consolidated command', () => {
  const cmdPath = path.join(COMMANDS_DIR, 'review.md');

  test('commands/gsd/review.md exists', () => {
    assert.ok(fs.existsSync(cmdPath), 'review.md must exist');
  });

  test('frontmatter declares name: gsd:review', () => {
    const content = fs.readFileSync(cmdPath, 'utf-8');
    // Frontmatter is the block between the first two `---` markers.
    const fmEnd = content.indexOf('---', 4);
    const fm = content.slice(4, fmEnd);
    assert.match(fm, /name:\s*gsd:review/);
  });

  for (const flag of FLAGS) {
    test(`review.md mentions dispatch flag ${flag}`, () => {
      const content = fs.readFileSync(cmdPath, 'utf-8');
      assert.ok(
        content.includes(flag),
        `review.md must mention ${flag} (so /gsd-help discovery and the orchestrator can route it)`,
      );
    });
  }
});

describe('CULL-05: 6 deprecation stubs for consolidated quality-gate commands', () => {
  for (const [oldName, newFlag] of STUBS) {
    const stubPath = path.join(COMMANDS_DIR, `${oldName}.md`);

    test(`${oldName}.md exists as a deprecation stub`, () => {
      assert.ok(fs.existsSync(stubPath), `${oldName}.md must exist`);
      const content = fs.readFileSync(stubPath, 'utf-8');
      assert.match(
        content,
        /DEPRECATED|deprecated|deprecation/,
        `${oldName}.md missing deprecation marker`,
      );
    });

    test(`${oldName}.md dispatches to /gsd-review --${newFlag}`, () => {
      const content = fs.readFileSync(stubPath, 'utf-8');
      // Escape hyphens defensively for regex even though the character is
      // literal in JS regex; this keeps the assertion robust to future
      // flag additions that contain hyphens.
      const target = `/gsd-review --${newFlag.replace(/-/g, '\\-')}`;
      assert.match(
        content,
        new RegExp(target),
        `${oldName}.md must dispatch to /gsd-review --${newFlag}`,
      );
    });

    test(`${oldName}.md does NOT recursively dispatch to itself`, () => {
      const content = fs.readFileSync(stubPath, 'utf-8');
      // The stub MAY mention its own name in prose (e.g. "/gsd-secure-phase
      // has been consolidated..."). It MUST NOT dispatch via the
      // /gsd-<old-name> $ARGUMENTS pattern — that would be an infinite loop
      // (threat T-01-07-01).
      const recursivePattern = new RegExp(
        `/gsd-${oldName.replace(/-/g, '\\-')}[ ]+\\$ARGUMENTS`,
      );
      assert.doesNotMatch(
        content,
        recursivePattern,
        `${oldName}.md MUST NOT dispatch to its own old name (would be infinite loop)`,
      );
    });
  }
});
