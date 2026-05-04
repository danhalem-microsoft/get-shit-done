// tests/walltime-ledger-schema.test.cjs
//
// XCUT-03 schema gate (B9 — closes verify-C-004 from 02-REVIEWS.md).
// Validates EVERY line of integration/test-fixtures/walltime-ledger.jsonl meets:
//   - exact key set: { date, test, walltime_ms, cost_usd, phase } (no extras, no missing)
//   - cost_usd: non-negative number (catches Phase 1 CR-05 cost→cost_usd regression)
//   - walltime_ms: positive integer
//   - date: parses as ISO 8601
//   - phase: matches /^phase-\d+-[a-z-]+$/
//
// Mandatory — NOT optional. The earlier "optional" label in RESEARCH was wrong;
// XCUT-03 (REQUIREMENTS.md:103) is a hard requirement.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(REPO_ROOT, 'integration', 'test-fixtures', 'walltime-ledger.jsonl');
const REQUIRED_KEYS = ['date', 'test', 'walltime_ms', 'cost_usd', 'phase'];
const PHASE_RE = /^phase-\d+-[a-z-]+$/;

function readEntries() {
  const raw = fs.readFileSync(LEDGER, 'utf8');
  return raw.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith('#')).map((line, i) => {
    try { return { lineNum: i + 1, entry: JSON.parse(line) }; }
    catch (e) { throw new Error(`Line ${i + 1} is not valid JSON: ${e.message}`); }
  });
}

test('XCUT-03: ledger has exact key set on every entry (no extras, no missing)', () => {
  const entries = readEntries();
  assert.ok(entries.length > 0, 'walltime-ledger.jsonl is empty — Phase 1 should have entries');
  for (const { lineNum, entry } of entries) {
    const keys = Object.keys(entry).sort();
    assert.deepStrictEqual(keys, REQUIRED_KEYS.slice().sort(),
      `Line ${lineNum}: keys mismatch. Got ${keys.join(',')}, expected ${REQUIRED_KEYS.join(',')}`);
  }
});

test('XCUT-03: cost_usd is a non-negative number on every entry (CR-05 regression guard)', () => {
  for (const { lineNum, entry } of readEntries()) {
    assert.strictEqual(typeof entry.cost_usd, 'number',
      `Line ${lineNum}: cost_usd is ${typeof entry.cost_usd} (not number). Catches the cost→cost_usd typo regression Phase 1 burned a fix on.`);
    assert.ok(entry.cost_usd >= 0,
      `Line ${lineNum}: cost_usd=${entry.cost_usd} is negative`);
    assert.ok(!Number.isNaN(entry.cost_usd),
      `Line ${lineNum}: cost_usd is NaN (likely a silent-coercion bug)`);
  }
});

test('XCUT-03: walltime_ms is a positive integer on every entry', () => {
  for (const { lineNum, entry } of readEntries()) {
    assert.ok(Number.isInteger(entry.walltime_ms),
      `Line ${lineNum}: walltime_ms=${entry.walltime_ms} is not an integer`);
    assert.ok(entry.walltime_ms > 0,
      `Line ${lineNum}: walltime_ms=${entry.walltime_ms} is not positive`);
  }
});

test('XCUT-03: date parses as ISO 8601 on every entry', () => {
  for (const { lineNum, entry } of readEntries()) {
    assert.ok(typeof entry.date === 'string',
      `Line ${lineNum}: date is not a string`);
    const parsed = Date.parse(entry.date);
    assert.ok(!Number.isNaN(parsed),
      `Line ${lineNum}: date "${entry.date}" does not parse as ISO 8601`);
  }
});

test('XCUT-03: phase matches /^phase-\\d+-[a-z-]+$/ on every entry', () => {
  for (const { lineNum, entry } of readEntries()) {
    assert.match(entry.phase, PHASE_RE,
      `Line ${lineNum}: phase="${entry.phase}" does not match phase-N-name pattern`);
  }
});
