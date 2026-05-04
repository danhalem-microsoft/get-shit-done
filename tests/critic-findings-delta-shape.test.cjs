'use strict';

/**
 * B6 fix (per 02-REVIEWS.md verify-C-003): the 85% parity threshold (CRIT-10)
 * is semantically meaningless if the heuristic backfill drifts. This test
 * locks the title→category mapping against a representative fixture set
 * derived from the Phase 1 critic baselines under
 * integration/test-fixtures/baselines/critic-{plan,code,scope,verify,discuss,strategy}/.
 *
 * The baselines store result text (not structured findings), so this fixture
 * set uses representative critic-style finding titles that match the patterns
 * each critic produces — derived from the *.input.json fixture descriptions
 * (e.g. "CRITICAL — SQL string concatenation", "MAJOR — Synchronous file I/O
 * on hot path", "CRITICAL — REQ-AUTH-02 (logout) not planned").
 *
 * If the heuristic changes (e.g. kebab→underscore or the slice extends from
 * 2 words to 3), the "Known mappings" sub-test fails fast and Plan 07's
 * CRIT-10 ≥ 0.85 overlap threshold is once again well-defined.
 *
 * Three sub-tests:
 *   1. Known mappings — ≥10 representative title→category pairs.
 *   2. Stability      — extractCategoryFromTitle is deterministic across calls.
 *   3. Distinguishability — clearly different findings produce distinct bucketKeys.
 *
 * Sub-test 3 catches the "different findings sharing first-two-words →
 * false-pass" failure mode by varying severity, lane, category, and file
 * across 5 hand-picked findings and asserting all 5 keys differ.
 *
 * Per CONTEXT.md D-04 (per-test concurrency contract): read-only fs access,
 * own-scope locals, no process.chdir, no shared-state mutation.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const parity = require('../integration/helpers/agent-parity.cjs');

assert.ok(parity._internal, 'agent-parity.cjs must expose _internal namespace (Plan 02-03 Task 1)');
const { extractCategoryFromTitle } = parity._internal;

// Representative fixture set: 12 title→category pairs spanning all six critic
// lenses (plan/code/scope/verify/discuss/strategy). Titles derive from the
// patterns documented in integration/test-fixtures/baselines/critic-*/
// `*.input.json` description fields. The expected category column is the
// kebab-case first-two-words of each title — which is what the heuristic in
// integration/helpers/agent-parity.cjs `extractCategoryFromTitle` returns.
//
// IMPORTANT: if you change the heuristic, you MUST update these expected
// values in lockstep. The point of this fixture is that drifting the
// heuristic without updating the parity threshold semantics is loud, not
// silent — that is the failure mode B6 / verify-C-003 calls out.
const KNOWN_MAPPINGS = [
  // critic-plan: from plan-with-known-issues — REQ-AUTH-02 (logout) not planned;
  // missing verify on Task 2; vague Task 1 action; no test tasks despite "tested".
  { title: 'Missing requirement coverage in PLAN.md',     expected: 'missing-requirement' },
  { title: 'Vague action lacks file path',                expected: 'vague-action' },
  { title: 'Verify block missing on Task 2',              expected: 'verify-block' },
  // critic-code: from code-with-smells — SQL injection; sync I/O on hot path;
  // no error handling in parseConfig; magic number without named constant.
  { title: 'SQL string concatenation in queryUser',       expected: 'sql-string' },
  { title: 'Synchronous file I/O on hot path',            expected: 'synchronous-file' },
  { title: 'Magic number 86400 without named constant',   expected: 'magic-number' },
  // critic-scope: from scope-with-creep — out-of-scope work pulled into a phase.
  { title: 'Scope creep introduces unplanned subsystem',  expected: 'scope-creep' },
  { title: 'Dependency cycle between Plans 4 and 6',      expected: 'dependency-cycle' },
  // critic-verify: from verify-with-gaps — verify references non-existent test.
  { title: 'Verify references non-existent test file',    expected: 'verify-references' },
  { title: 'Success criteria not measurable',             expected: 'success-criteria' },
  // critic-discuss / critic-strategy: hidden assumptions, tradeoff omissions.
  { title: 'Hidden assumption about JWT lifetime',        expected: 'hidden-assumption' },
  { title: 'Tradeoff between latency and durability',     expected: 'tradeoff-between' },
];

describe('B6 / verify-C-003: critic-findings delta-shape heuristic', () => {
  test('extractCategoryFromTitle: known title→category mappings (≥10 entries)', () => {
    assert.ok(KNOWN_MAPPINGS.length >= 10,
      `B6 requires ≥10 representative mappings; got ${KNOWN_MAPPINGS.length}. ` +
      `See integration/test-fixtures/baselines/critic-*/ for source corpora.`);
    for (const { title, expected } of KNOWN_MAPPINGS) {
      const got = extractCategoryFromTitle(title);
      assert.strictEqual(got, expected,
        `extractCategoryFromTitle(${JSON.stringify(title)}) = ${JSON.stringify(got)}, ` +
        `expected ${JSON.stringify(expected)}`);
    }
  });

  test('extractCategoryFromTitle: stability — same input returns same output across 3 calls', () => {
    for (const { title } of KNOWN_MAPPINGS) {
      const a = extractCategoryFromTitle(title);
      const b = extractCategoryFromTitle(title);
      const c = extractCategoryFromTitle(title);
      assert.strictEqual(a, b, `unstable result for ${JSON.stringify(title)}: ${a} != ${b}`);
      assert.strictEqual(b, c, `unstable result for ${JSON.stringify(title)}: ${b} != ${c}`);
    }
  });

  test('bucketKey: clearly different findings produce distinct keys', () => {
    // Re-derive the bucketKey here to keep the test independent of the
    // helper's internal closure. Same formula as
    // integration/helpers/agent-parity.cjs `bucketKey`:
    //   ${severity}:${category}:${lane}|${file}
    // Catches the "different findings sharing first-two-words → false-pass"
    // failure mode by varying ONE axis at a time across 5 findings.
    function bucketKey(f) {
      const sev  = (f.severity || 'unknown').toLowerCase();
      const lane = (f.lane || 'primary').toLowerCase();
      const cat  = (f.category || extractCategoryFromTitle(f.title)).toLowerCase();
      const file = f.file || 'N/A';
      return `${sev}:${cat}:${lane}|${file}`;
    }

    const findings = [
      { severity: 'critical', lane: 'primary',    category: 'missing-requirement', file: 'a.md:1' },
      { severity: 'critical', lane: 'cross-flag', category: 'missing-requirement', file: 'a.md:1' }, // diff lane
      { severity: 'warning',  lane: 'primary',    category: 'missing-requirement', file: 'a.md:1' }, // diff sev
      { severity: 'critical', lane: 'primary',    category: 'dependency-cycle',    file: 'a.md:1' }, // diff cat
      { severity: 'critical', lane: 'primary',    category: 'missing-requirement', file: 'b.md:7' }, // diff file
    ];

    const keys = findings.map(bucketKey);
    assert.strictEqual(new Set(keys).size, 5,
      `expected 5 distinct bucketKeys, got ${new Set(keys).size}: ${keys.join(' | ')}`);
  });
});
