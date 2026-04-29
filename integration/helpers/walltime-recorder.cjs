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

const LEDGER = path.resolve(__dirname, '..', 'test-fixtures', 'walltime-ledger.jsonl');

/**
 * Append one JSONL entry to the ledger.
 * @param {object} entry { test, walltime_ms, cost_usd, phase }
 */
function recordWalltime(entry) {
  if (!entry || typeof entry.test !== 'string' ||
      typeof entry.walltime_ms !== 'number' ||
      typeof entry.phase !== 'string') {
    throw new Error('recordWalltime: entry must have {test, walltime_ms, cost_usd, phase}');
  }
  if (!fs.existsSync(path.dirname(LEDGER))) {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  }
  const record = {
    date: new Date().toISOString().slice(0, 10),
    test: entry.test,
    walltime_ms: entry.walltime_ms,
    cost_usd: entry.cost_usd ?? 0,
    phase: entry.phase,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(record) + '\n');
  return record;
}

module.exports = { recordWalltime, LEDGER };
