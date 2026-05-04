// tests/critic-line-budget.test.cjs
//
// Static guard for CRIT-02, CRIT-03, CRIT-04 (Phase 2 Wave 0).
//
// Wave-0 RED expectation: until Plan 02 lands agents/_shared/critic-base.md
// AND Plans 04+05 trim each addendum down to ≤ 100 lines (with the @-import
// to agents/_shared/critic-base.md as the leading non-blank body line), this
// test fails. The first failure references the missing base file.
//
// H5 (per 02-REVIEWS.md): the lineCount helper below is the canonical
// wc -l-equivalent form (split('\n').length minus trailing-newline). Any
// future critic-shape test MUST reuse this form, not introduce a variant.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'agents', '_shared', 'critic-base.md');
const CRITICS = [
  'gsd-critic-plan', 'gsd-critic-code', 'gsd-critic-scope',
  'gsd-critic-verify', 'gsd-critic-discuss', 'gsd-critic-strategy',
];

// H5 (per 02-REVIEWS.md): canonical line-count helper. wc -l-equivalent.
// Identical to the helper used in tests/critic-no-base-shadowing.test.cjs and
// any future critic-shape test. DO NOT introduce a per-test variant.
function lineCount(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.length === 0) return 0;
  const trailingNewline = content.endsWith('\n') ? 1 : 0;
  return content.split('\n').length - trailingNewline;
}

test('critic-base.md ≤ 250 lines (CRIT-02)', () => {
  assert.ok(fs.existsSync(BASE), 'agents/_shared/critic-base.md must exist');
  const lines = lineCount(BASE);
  assert.ok(lines <= 250, `critic-base.md is ${lines} lines, max 250`);
});

test('each critic addendum ≤ 100 lines (CRIT-03)', () => {
  for (const name of CRITICS) {
    const file = path.join(ROOT, 'agents', `${name}.md`);
    const lines = lineCount(file);
    assert.ok(lines <= 100, `${name}.md is ${lines} lines, max 100`);
  }
});

test('total critic line-count ≤ 700 (CRIT-04)', () => {
  let total = lineCount(BASE);
  for (const name of CRITICS) {
    total += lineCount(path.join(ROOT, 'agents', `${name}.md`));
  }
  assert.ok(total <= 700, `total critic lines = ${total}, max 700 (down from 1731 baseline)`);
});

test('each critic begins with the @-import to base (CRIT-03 reachability)', () => {
  for (const name of CRITICS) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${name}.md`), 'utf-8');
    const afterFrontmatter = content.split(/^---\s*$/m).slice(2).join('---').trim();
    const firstLine = afterFrontmatter.split('\n').find((l) => l.trim().length > 0);
    assert.match(firstLine || '',
      /^@~?\/?\.claude\/get-shit-done\/agents\/_shared\/critic-base\.md\s*$/,
      `${name}.md must begin (after frontmatter) with @-reference to critic-base.md, got: "${firstLine}"`);
  }
});
