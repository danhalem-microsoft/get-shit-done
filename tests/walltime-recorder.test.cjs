'use strict';

/**
 * walltime-recorder.cjs unit tests (CR-05 guard).
 *
 * Verifies cost_usd validation: missing or non-number cost_usd MUST throw
 * (previous bug silently wrote 0). Uses _setLedgerForTest to avoid mutating
 * the real integration/test-fixtures/walltime-ledger.jsonl.
 *
 * Per CONTEXT.md D-04: only fs.readFileSync (read-only); local-scope vars;
 * no process.chdir; the ledger override + restore pattern keeps shared state
 * intact across tests (each test restores LEDGER before returning).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const recorder = require('../integration/helpers/walltime-recorder.cjs');

function withTempLedger(fn) {
  const tmp = path.join(
    os.tmpdir(),
    `walltime-recorder-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
  const restore = recorder._setLedgerForTest(tmp);
  try {
    return fn(tmp);
  } finally {
    restore();
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

test('recordWalltime throws when cost_usd is missing (CR-05 guard)', () => {
  withTempLedger(() => {
    assert.throws(
      () => recorder.recordWalltime({
        test: 'unit:walltime-recorder:missing-cost-usd',
        walltime_ms: 100,
        phase: 'phase-1-cull',
        // NOTE: cost_usd missing entirely — pre-fix wrote 0 silently
      }),
      /cost_usd/,
      'expected error mentioning cost_usd; pre-fix, this call silently wrote cost_usd: 0'
    );
  });
});

test('recordWalltime throws when caller passes cost instead of cost_usd (CR-05 guard)', () => {
  withTempLedger(() => {
    assert.throws(
      () => recorder.recordWalltime({
        test: 'unit:walltime-recorder:wrong-field-name',
        walltime_ms: 100,
        phase: 'phase-1-cull',
        cost: 0.5,  // WRONG field name — claude-runner.cjs returns .cost not .cost_usd
      }),
      /cost_usd/,
      'expected error mentioning cost_usd; pre-fix, this call silently wrote cost_usd: 0 (the CR-05 bug)'
    );
  });
});

test('recordWalltime throws when cost_usd is non-number (CR-05 guard)', () => {
  withTempLedger(() => {
    assert.throws(
      () => recorder.recordWalltime({
        test: 'unit:walltime-recorder:non-number-cost-usd',
        walltime_ms: 100,
        phase: 'phase-1-cull',
        cost_usd: '0.5',  // string, not number
      }),
      /cost_usd/,
      'expected error mentioning cost_usd when type is not number'
    );
  });
});

test('recordWalltime succeeds with valid cost_usd and writes the value to the ledger (CR-05 guard)', () => {
  withTempLedger((tmp) => {
    const record = recorder.recordWalltime({
      test: 'unit:walltime-recorder:valid',
      walltime_ms: 1234,
      phase: 'phase-1-cull',
      cost_usd: 0.5,
    });

    assert.strictEqual(record.cost_usd, 0.5, 'returned record has cost_usd: 0.5');
    assert.strictEqual(record.walltime_ms, 1234);
    assert.strictEqual(record.phase, 'phase-1-cull');

    // Confirm the JSONL line landed in the temp ledger
    const ledgerContent = fs.readFileSync(tmp, 'utf8');
    const lastLine = ledgerContent.trim().split('\n').pop();
    const parsed = JSON.parse(lastLine);
    assert.strictEqual(parsed.cost_usd, 0.5, 'ledger line has cost_usd: 0.5 (no silent zero coercion)');
    assert.strictEqual(parsed.test, 'unit:walltime-recorder:valid');
  });
});

test('existing call site in agent-parity.cjs uses cost_usd field name (CR-05 contract check)', () => {
  // Static guard: confirm the in-tree caller passes cost_usd (not cost).
  // If a future refactor renames the field, this test fails BEFORE phase-1
  // walltime data goes corrupt.
  const parityPath = path.resolve(__dirname, '..', 'integration', 'helpers', 'agent-parity.cjs');
  const src = fs.readFileSync(parityPath, 'utf8');
  assert.match(src, /cost_usd:\s*result\.cost/,
    'agent-parity.cjs must pass cost_usd: result.cost (not cost: result.cost) to recordWalltime');
});
