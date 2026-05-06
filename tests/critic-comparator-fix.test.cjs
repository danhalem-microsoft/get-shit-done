'use strict';

/**
 * CRIT-10 comparator fix lock-test.
 *
 * Locks in the two behaviors added by the Phase 2 follow-up fix to
 * integration/helpers/agent-parity.cjs::computeCriticFindingsDeltas:
 *
 *   1. normalizeSeverity — collapses 'high'↔'critical' and other obvious aliases
 *      into a single bucket BEFORE bucketKey construction. This addresses the
 *      02-07-followup overlap=0.333 finding's pair-1 (severity drift between
 *      otherwise-identical findings).
 *
 *   2. Fuzzy title matching — when an exact bucketKey miss occurs, attempt a
 *      Jaccard-similarity match (≥0.7) restricted to (same-normalized-severity,
 *      same-or-both-N/A file). This addresses pair-2/3/4 (title-fragility
 *      caused by the first-two-words extractCategoryFromTitle heuristic).
 *
 * If a future change breaks either behavior, this test fails fast and the
 * 0.85 overlap target documented in 02-07-SUMMARY-followup is no longer
 * achievable. The previous lock test (tests/critic-findings-delta-shape.test.cjs)
 * locks the heuristic-extraction layer; this test locks the comparator layer.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const parity = require('../integration/helpers/agent-parity.cjs');

const {
  normalizeSeverity,
  titleWordBag,
  jaccardSimilarity,
  computeCriticFindingsDeltas,
  FUZZY_TITLE_THRESHOLD,
} = parity._internal;

describe('CRIT-10 comparator fix: normalizeSeverity', () => {
  test('high and critical map to the same canonical bucket', () => {
    assert.strictEqual(normalizeSeverity('high'), 'critical');
    assert.strictEqual(normalizeSeverity('critical'), 'critical');
    assert.strictEqual(normalizeSeverity('HIGH'), 'critical');
    assert.strictEqual(normalizeSeverity('Critical'), 'critical');
  });

  test('warning aliases collapse to warning', () => {
    assert.strictEqual(normalizeSeverity('warning'), 'warning');
    assert.strictEqual(normalizeSeverity('medium'), 'warning');
    assert.strictEqual(normalizeSeverity('moderate'), 'warning');
    assert.strictEqual(normalizeSeverity('major'), 'warning');
  });

  test('info aliases collapse to info', () => {
    assert.strictEqual(normalizeSeverity('info'), 'info');
    assert.strictEqual(normalizeSeverity('low'), 'info');
    assert.strictEqual(normalizeSeverity('minor'), 'info');
  });

  test('unknown values pass through lowercased; empty -> unknown', () => {
    assert.strictEqual(normalizeSeverity(''), 'unknown');
    assert.strictEqual(normalizeSeverity(null), 'unknown');
    assert.strictEqual(normalizeSeverity(undefined), 'unknown');
    assert.strictEqual(normalizeSeverity('foo'), 'foo');
    assert.strictEqual(normalizeSeverity('BAR'), 'bar');
  });
});

describe('CRIT-10 comparator fix: titleWordBag + jaccardSimilarity', () => {
  test('drops short tokens (≤2 chars)', () => {
    const bag = titleWordBag('SQL is in the query');
    // Expected: SQL, query (the rest are dropped or stop-tokens)
    assert.ok(bag.has('sql'));
    assert.ok(bag.has('query'));
    assert.ok(!bag.has('is'), 'short token "is" must be dropped');
    assert.ok(!bag.has('in'), 'short token "in" must be dropped');
  });

  test('jaccard returns 0 when both bags are empty', () => {
    assert.strictEqual(jaccardSimilarity(new Set(), new Set()), 0);
  });

  test('jaccard returns 1.0 for identical title-bags', () => {
    const a = titleWordBag('HS256 shared secret across phases');
    const b = titleWordBag('HS256 shared secret across phases');
    assert.strictEqual(jaccardSimilarity(a, b), 1.0);
  });

  test('jaccard returns 0 when one side is empty', () => {
    const a = titleWordBag('Some longer title here');
    const b = new Set();
    assert.strictEqual(jaccardSimilarity(a, b), 0);
  });

  test('FUZZY_TITLE_THRESHOLD is exposed and equals 0.7', () => {
    assert.strictEqual(FUZZY_TITLE_THRESHOLD, 0.7);
  });
});

describe('CRIT-10 comparator fix: computeCriticFindingsDeltas behavior', () => {
  // Drives the same shape that runAgentParity passes to computeDeltas:
  //   schema = SCHEMAS['critic-findings'] (threshold 0.85)
  //   baseline = { result: { findings: [...] } }
  //   runs = [ { result: { findings: [...] }, duration_ms } ]
  // (the helper also handles the string-result + extractFindingsFromText path,
  // but the structured-input path is the cleanest way to lock comparator semantics.)
  const schema = parity.SCHEMAS['critic-findings'];

  test('severity drift (high↔critical) on otherwise-identical finding now matches', () => {
    const baseline = {
      result: {
        findings: [
          {
            id: 'f-1',
            severity: 'high',
            lane: 'primary',
            file: 'src/auth.ts:14',
            title: 'JWT format inconsistency across phases',
            category: 'jwt-format',
          },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          {
            id: 'f-1',
            severity: 'critical',  // drifted
            lane: 'primary',
            file: 'src/auth.ts:14',
            title: 'JWT format inconsistency across phases',
            category: 'jwt-format',
          },
        ],
      },
    };

    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 1.0,
      `expected overlap=1.0 (severity drift normalized), got ${result.overlap}`);
    assert.strictEqual(result.missingCritical.length, 0,
      `expected no missing-critical (high→critical normalized), got ${JSON.stringify(result.missingCritical)}`);
    assert.strictEqual(result.pass, true);
  });

  test('title fragility (different first-two-words) now matches via fuzzy fallback', () => {
    // Same finding, same severity, same file, BUT the model phrased the title
    // differently and extractCategoryFromTitle produces different first-two-word
    // categories: 'database-query' vs 'slow-database'. Without fuzzy fallback,
    // the bucketKeys diverge and the parity test would mark these as a miss.
    // Word-bag Jaccard is 0.80 (≥ 0.7 threshold) so fuzzy fallback rescues
    // the match. This mirrors the 02-07-followup overlap=0.333 finding's
    // pair-2/3/4 — same issue, different intro words.
    const baseline = {
      result: {
        findings: [
          {
            id: 'f-1',
            severity: 'high',
            lane: 'primary',
            file: 'N/A',
            title: 'Database query performance regression',
            // Note: NO category field — forces extractCategoryFromTitle backfill.
          },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          {
            id: 'f-1',
            severity: 'high',
            lane: 'primary',
            file: 'N/A',
            title: 'Slow database query performance regression',
          },
        ],
      },
    };

    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 1.0,
      `expected overlap=1.0 (fuzzy title match), got overlap=${result.overlap}, fuzzyMatchCount=${result.fuzzyMatchCount}`);
    assert.ok(result.fuzzyMatchCount >= 1,
      `expected at least 1 fuzzy match, got ${result.fuzzyMatchCount}`);
  });

  test('genuinely different findings stay unmatched (low Jaccard)', () => {
    // Unlike the fuzzy-match case above, these two titles share no substantive
    // tokens. Fuzzy fallback must NOT treat them as the same finding.
    const baseline = {
      result: {
        findings: [
          {
            id: 'f-1',
            severity: 'high',
            lane: 'primary',
            file: 'N/A',
            title: 'Algorithm switch ordering issue between phases',
          },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          {
            id: 'f-2',
            severity: 'high',
            lane: 'primary',
            file: 'N/A',
            title: 'Database migration rollback strategy missing',
          },
        ],
      },
    };

    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 0.0,
      `expected overlap=0.0 (no fuzzy match for unrelated titles), got ${result.overlap}`);
    assert.strictEqual(result.fuzzyMatchCount, 0);
  });

  test('exact match still works the same (no behavior change for pre-existing matches)', () => {
    const sameFinding = {
      id: 'f-1',
      severity: 'critical',
      lane: 'primary',
      file: 'src/db.ts:42',
      title: 'SQL injection in queryUser',
      category: 'sql-injection',
    };
    const baseline = { result: { findings: [sameFinding] } };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: { findings: [sameFinding] },
    };
    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 1.0);
    assert.strictEqual(result.fuzzyMatchCount, 0,
      'exact match must NOT count as a fuzzy match');
    assert.strictEqual(result.pass, true);
  });

  test('missing critical (post-fuzzy) still hard-fails', () => {
    // Critical baseline finding has no corresponding candidate — even after
    // fuzzy fallback. Pass must be false regardless of overlap on the
    // remaining findings.
    const baseline = {
      result: {
        findings: [
          { id: 'f-1', severity: 'critical', lane: 'primary', file: 'N/A',
            title: 'Critical security flaw in auth module' },
          { id: 'f-2', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Code style convention drift' },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          // f-1 is missing entirely; f-2 matches
          { id: 'f-2', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Code style convention drift' },
          // Decoy: same fuzzy-bag as f-1 but DIFFERENT severity bucket
          // (info/low vs critical) — must NOT be allowed to match.
          { id: 'decoy', severity: 'low', lane: 'primary', file: 'N/A',
            title: 'Critical security flaw in auth module' },
        ],
      },
    };
    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.missingCritical.length, 1,
      `expected 1 missing-critical, got ${result.missingCritical.length}`);
    assert.strictEqual(result.missingCritical[0].id, 'f-1');
    assert.strictEqual(result.pass, false);
  });

  test('overlap below threshold but no missing-critical → pass false', () => {
    // 1/4 baseline matched → overlap 0.25 < 0.85 threshold.
    const baseline = {
      result: {
        findings: [
          { id: 'b1', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Issue one alpha' },
          { id: 'b2', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Issue two beta' },
          { id: 'b3', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Issue three gamma' },
          { id: 'b4', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Issue four delta' },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          { id: 'b1', severity: 'medium', lane: 'primary', file: 'N/A',
            title: 'Issue one alpha' },
        ],
      },
    };
    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 0.25);
    assert.strictEqual(result.missingCritical.length, 0,
      'no critical findings in baseline, so missingCritical must be empty');
    assert.strictEqual(result.pass, false,
      'overlap=0.25 < threshold=0.85 must fail');
  });

  test('empty baseline → overlap 1.0 (zero-div guard preserved)', () => {
    const baseline = { result: { findings: [] } };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: { findings: [{ id: 'x', severity: 'high', title: 'unrelated' }] },
    };
    const result = computeCriticFindingsDeltas(schema, baseline, [candidate]);
    assert.strictEqual(result.overlap, 1.0);
    assert.strictEqual(result.missingCritical.length, 0);
  });
});
