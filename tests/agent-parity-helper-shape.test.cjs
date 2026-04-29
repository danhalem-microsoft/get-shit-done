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
});
