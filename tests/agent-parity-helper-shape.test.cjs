'use strict';

/**
 * TEST-02 structural enforcement (static).
 *
 * Verifies integration/helpers/agent-parity.cjs exports the contract that
 * Phases 2, 3, 6 will consume. Does NOT invoke the live API.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HELPER_PATH = path.resolve(__dirname, '..', 'integration', 'helpers', 'agent-parity.cjs');

describe('TEST-02: runAgentParity helper shape', () => {
  test('module loads without throwing', () => {
    assert.doesNotThrow(() => require(HELPER_PATH));
  });

  test('module exports runAgentParity (async function)', () => {
    const helper = require(HELPER_PATH);
    assert.strictEqual(typeof helper.runAgentParity, 'function');
    // 3 declared + opts default = at least 3 in .length
    assert.ok(helper.runAgentParity.length >= 3, 'runAgentParity must accept (agentName, fixture, schema, opts)');
  });

  test('module exports SCHEMAS with three required kinds', () => {
    const { SCHEMAS } = require(HELPER_PATH);
    assert.ok(SCHEMAS, 'SCHEMAS must be exported');
    for (const k of ['critic-findings', 'plan-structural', 'schema-conformance']) {
      assert.ok(SCHEMAS[k], `missing schema kind: ${k}`);
      assert.strictEqual(SCHEMAS[k].kind, k, `${k}.kind must equal "${k}"`);
    }
  });

  test('critic-findings schema has threshold 0.85, noMissingCritical true', () => {
    const { SCHEMAS } = require(HELPER_PATH);
    assert.strictEqual(SCHEMAS['critic-findings'].threshold, 0.85);
    assert.strictEqual(SCHEMAS['critic-findings'].noMissingCritical, true);
    assert.deepStrictEqual(SCHEMAS['critic-findings'].severities, ['critical', 'major', 'minor']);
  });

  test('plan-structural schema has tolerance 0.10, redStepRequired false (Phase 1 default)', () => {
    const { SCHEMAS } = require(HELPER_PATH);
    assert.strictEqual(SCHEMAS['plan-structural'].taskCountTolerance, 0.10);
    assert.strictEqual(SCHEMAS['plan-structural'].requireMustHaveCoverage, 'set-equality');
    assert.strictEqual(SCHEMAS['plan-structural'].dependencyGraphCheck, 'isomorphic-by-content');
    assert.strictEqual(SCHEMAS['plan-structural'].redStepRequired, false,
      'Phase 1 default for redStepRequired is false; Phase 4 will flip to true');
  });

  test('schema-conformance schema has smokeCritiqueModel cheap', () => {
    const { SCHEMAS } = require(HELPER_PATH);
    assert.strictEqual(SCHEMAS['schema-conformance'].smokeCritiqueModel, 'cheap');
  });

  test('module exports loadBaseline and saveBaseline functions', () => {
    const helper = require(HELPER_PATH);
    assert.strictEqual(typeof helper.loadBaseline, 'function');
    assert.strictEqual(typeof helper.saveBaseline, 'function');
  });

  test('module exports BASELINES_DIR string', () => {
    const helper = require(HELPER_PATH);
    assert.strictEqual(typeof helper.BASELINES_DIR, 'string');
    assert.match(helper.BASELINES_DIR, /integration\/test-fixtures\/baselines$/);
  });

  test('pickMedianByDuration returns sorted-median, not array-index-N/2 (CR-04 guard)', () => {
    const { pickMedianByDuration } = require(HELPER_PATH);

    // 5 runs in completion order with non-monotonic durations.
    // Sorted by duration_ms: [50, 100, 150, 200, 300]; median index 2 -> 150 (run-4).
    // Pre-fix bug picked runs[2] = run-3 (duration 300). Post-fix returns run-4.
    const runs = [
      { id: 'run-1', duration_ms: 100, success: true },
      { id: 'run-2', duration_ms: 50,  success: true },
      { id: 'run-3', duration_ms: 300, success: true },
      { id: 'run-4', duration_ms: 150, success: true },
      { id: 'run-5', duration_ms: 200, success: true },
    ];
    const median = pickMedianByDuration(runs);
    assert.strictEqual(median.duration_ms, 150,
      `expected median duration 150 (run-4), got ${median.duration_ms} (${median.id})`);
    assert.strictEqual(median.id, 'run-4',
      'pickMedianByDuration must return the sorted-median run, not the index-2 run from completion order');
  });

  test('pickMedianByDuration handles even-N (4 runs) (CR-04 guard)', () => {
    const { pickMedianByDuration } = require(HELPER_PATH);
    // Sorted: [10, 20, 30, 40]. Math.floor(4/2) = 2 -> 30 (id 'b').
    const runs = [
      { id: 'a', duration_ms: 10, success: true },
      { id: 'b', duration_ms: 30, success: true },
      { id: 'c', duration_ms: 20, success: true },
      { id: 'd', duration_ms: 40, success: true },
    ];
    const median = pickMedianByDuration(runs);
    assert.strictEqual(median.duration_ms, 30, `expected duration 30, got ${median.duration_ms}`);
    assert.strictEqual(median.id, 'b');
  });

  test('pickMedianByDuration returns undefined for empty input (CR-04 guard)', () => {
    const { pickMedianByDuration } = require(HELPER_PATH);
    assert.strictEqual(pickMedianByDuration([]), undefined);
    assert.strictEqual(pickMedianByDuration(null), undefined);
    assert.strictEqual(pickMedianByDuration(undefined), undefined);
  });
});
