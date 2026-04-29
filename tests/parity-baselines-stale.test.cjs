'use strict';

/**
 * TEST-05 baseline staleness guard.
 *
 * Walks integration/test-fixtures/baselines/<agent>/<fixture-id>.json and
 * fails if any baseline is older than 90 days without an explicit
 * _meta.staleness_acknowledged field set within the last 30 days.
 *
 * Per RESEARCH.md §1.5: this guard prevents silent baseline rot. The
 * acknowledgment escape hatch lets users keep an old baseline deliberately
 * (with periodic re-acknowledgment).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINES_DIR = path.join(ROOT, 'integration', 'test-fixtures', 'baselines');
const STALE_DAYS = 90;
const ACK_GRACE_DAYS = 30;
const NINETY_DAYS_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = ACK_GRACE_DAYS * 24 * 60 * 60 * 1000;

// Phase 1 corpus minimum (per integration/test-fixtures/baselines/_meta.json:
// agent_count=22, fixture_count=22). Floor never decreases.
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

describe('TEST-05: baselines fresh within 90 days OR explicitly acknowledged', () => {
  const baselines = Array.from(walkBaselines());

  test(`at least ${PHASE_1_CORPUS_FLOOR} baselines present (Phase 1 corpus)`, () => {
    assert.ok(baselines.length >= PHASE_1_CORPUS_FLOOR,
      `Expected >=${PHASE_1_CORPUS_FLOOR} baseline files, found ${baselines.length}`);
  });

  for (const { agent, file, abs } of baselines) {
    test(`${agent}/${file}: fresh within 90 days OR acknowledged`, () => {
      const baseline = JSON.parse(fs.readFileSync(abs, 'utf-8'));
      assert.ok(baseline._meta?.captured_at,
        `${agent}/${file}: _meta.captured_at missing — cannot evaluate freshness`);
      const captured = new Date(baseline._meta.captured_at).getTime();
      const ageMs = Date.now() - captured;

      if (ageMs <= NINETY_DAYS_MS) {
        // Fresh — no acknowledgment needed.
        return;
      }

      // Stale — must have _meta.staleness_acknowledged within the last 30 days.
      const ack = baseline._meta.staleness_acknowledged;
      const ageDays = Math.floor(ageMs / 86_400_000);
      assert.ok(ack,
        `${agent}/${file}: ${ageDays} days old (>${STALE_DAYS}); add _meta.staleness_acknowledged: "<YYYY-MM-DD>" or refresh the baseline`);

      const ackTime = new Date(ack).getTime();
      assert.ok(!Number.isNaN(ackTime),
        `${agent}/${file}: _meta.staleness_acknowledged "${ack}" is not parseable as a date`);

      const ackAgeMs = Date.now() - ackTime;
      const ackAgeDays = Math.floor(ackAgeMs / 86_400_000);
      assert.ok(ackAgeMs <= THIRTY_DAYS_MS,
        `${agent}/${file}: _meta.staleness_acknowledged is itself ${ackAgeDays} days old (>${ACK_GRACE_DAYS}); re-acknowledge or refresh`);
    });
  }
});
