'use strict';

/**
 * Walltime ledger writer (XCUT-03 setup; consumer trend test in Phase 6).
 *
 * Appends one JSONL entry per live test invocation to
 * integration/test-fixtures/walltime-ledger.jsonl.
 *
 * Used by: integration/helpers/agent-parity.cjs (Phases 1-6).
 *
 * Pattern source: get-shit-done/bin/lib/profile-pipeline.cjs:357
 */

const fs = require('node:fs');
const path = require('node:path');

let LEDGER = path.resolve(__dirname, '..', 'test-fixtures', 'walltime-ledger.jsonl');

/**
 * Append one JSONL entry to the ledger.
 * @param {object} entry { test, walltime_ms, cost_usd, phase }
 */
function recordWalltime(entry) {
  if (!entry || typeof entry.test !== 'string' ||
      typeof entry.walltime_ms !== 'number' ||
      typeof entry.phase !== 'string' ||
      typeof entry.cost_usd !== 'number') {
    throw new Error(
      'recordWalltime: entry must have {test: string, walltime_ms: number, cost_usd: number, phase: string}. ' +
      'Pass cost_usd (not cost) — the silent-zero coercion of missing cost_usd was the CR-05 bug.'
    );
  }
  if (!fs.existsSync(path.dirname(LEDGER))) {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  }
  const record = {
    date: new Date().toISOString().slice(0, 10),
    test: entry.test,
    walltime_ms: entry.walltime_ms,
    cost_usd: entry.cost_usd,
    phase: entry.phase,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(record) + '\n');
  return record;
}

/**
 * Test-only: swap the LEDGER path so unit tests can write to a temp file
 * without polluting integration/test-fixtures/walltime-ledger.jsonl.
 * Returns a restore function that resets LEDGER to its previous value.
 * Production callers MUST NOT use this — leading underscore signals test-only.
 */
function _setLedgerForTest(p) {
  const prev = LEDGER;
  LEDGER = p;
  return () => { LEDGER = prev; };
}

module.exports = { recordWalltime, LEDGER, _setLedgerForTest };
