'use strict';

/**
 * TEST-03 structural enforcement: every baseline JSON has a complete _meta block.
 *
 * Walks integration/test-fixtures/baselines/<agent>/<fixture-id>.json (excluding
 * .input.json files and _meta.json) and asserts each baseline file has the
 * locked _meta schema set by Plan 04's capture run.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINES_DIR = path.join(ROOT, 'integration', 'test-fixtures', 'baselines');

const VALID_SCHEMA_KINDS = new Set(['critic-findings', 'plan-structural', 'schema-conformance']);

// Phase 1 corpus minimum (per integration/test-fixtures/baselines/_meta.json:
// agent_count=22, fixture_count=22). Floor never decreases — future phases may add
// more baselines, but the corpus must never shrink.
const PHASE_1_CORPUS_FLOOR = 22;

function* walkBaselines() {
  if (!fs.existsSync(BASELINES_DIR)) return;
  for (const agent of fs.readdirSync(BASELINES_DIR)) {
    const agentDir = path.join(BASELINES_DIR, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;
    for (const file of fs.readdirSync(agentDir)) {
      if (file.endsWith('.input.json')) continue;
      if (file === '_meta.json') continue;
      if (!file.endsWith('.json')) continue;
      yield { agent, file, abs: path.join(agentDir, file) };
    }
  }
}

describe('TEST-03: every baseline file has a complete _meta block', () => {
  const baselines = Array.from(walkBaselines());

  test(`at least ${PHASE_1_CORPUS_FLOOR} baselines present (Phase 1 corpus)`, () => {
    assert.ok(baselines.length >= PHASE_1_CORPUS_FLOOR,
      `Expected >=${PHASE_1_CORPUS_FLOOR} baseline files (Phase 1 corpus), found ${baselines.length}`);
  });

  for (const { agent, file, abs } of baselines) {
    test(`${agent}/${file}: _meta block valid`, () => {
      let baseline;
      assert.doesNotThrow(() => {
        baseline = JSON.parse(fs.readFileSync(abs, 'utf-8'));
      }, `${agent}/${file}: must be valid JSON`);

      assert.ok(baseline._meta, `${agent}/${file}: must have _meta object`);
      assert.strictEqual(baseline._meta.agent, agent,
        `${agent}/${file}: _meta.agent must equal directory name "${agent}"`);
      assert.ok(typeof baseline._meta.fixture_id === 'string' && baseline._meta.fixture_id.length > 0,
        `${agent}/${file}: _meta.fixture_id must be non-empty string`);

      assert.ok(baseline._meta.captured_at, `${agent}/${file}: _meta.captured_at required`);
      assert.doesNotThrow(() => new Date(baseline._meta.captured_at).toISOString(),
        `${agent}/${file}: _meta.captured_at must be ISO 8601 parseable`);

      assert.ok(VALID_SCHEMA_KINDS.has(baseline._meta.schema_kind),
        `${agent}/${file}: _meta.schema_kind must be one of ${[...VALID_SCHEMA_KINDS].join(', ')}; got "${baseline._meta.schema_kind}"`);

      assert.strictEqual(baseline._meta.runs_recorded, 1,
        `${agent}/${file}: _meta.runs_recorded must be 1 for Phase 1 capture mode`);

      assert.ok(baseline.result, `${agent}/${file}: must have non-empty "result" field`);

      // fixture_id should match the filename (without .json extension)
      const expectedId = path.basename(file, '.json');
      assert.strictEqual(baseline._meta.fixture_id, expectedId,
        `${agent}/${file}: _meta.fixture_id "${baseline._meta.fixture_id}" must match filename "${expectedId}"`);
    });
  }
});
