'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-08: spawn-timestamp delta <2s (hard); soft-warn at >1s (H6).
// Total walltime not serial — dynamic bound from prior ledger entries (H6).
//
// 02-07-fixes redesign — process-level parallelism via critic-spawn-batch.
//
// Architecture change vs Plan 02-07's original test:
//
// The original test asked a parent claude --print orchestrator to emit 6
// contiguous Task() calls in a single assistant message and used bash-wrap
// timestamp instrumentation to measure spawn-delta. That design exposed the
// in-process Task scheduler bug (anthropics/claude-code#7406) — the parent
// serialized the spawns even when the prompt was structured for parallel
// dispatch. Run-2 captured a 7960ms spawn-delta and 283811ms total walltime,
// both well over the assertion thresholds.
//
// 02-07-fixes ships a workaround: get-shit-done/bin/lib/critic-spawn-batch.cjs
// fans out 6 OS-level `claude --print` subprocesses via Node's
// `child_process.spawn` + `Promise.all`. The OS process scheduler does the
// real fan-out — the in-process Task scheduler is bypassed entirely.
//
// This test invokes the workaround directly (no parent orchestrator):
//   node get-shit-done/bin/gsd-tools.cjs critic-spawn-batch --phase-dir ... --json
// and parses the returned JSON. The `spawn_delta_ms` and `walltime_ms` fields
// in that JSON ARE the metrics the test asserts against — captured at the
// dispatcher's spawn() boundaries (Date.now() before spawn, Date.now() at
// child close), so they are not contaminated by parent-side serialization.
//
// Why modifying the test is justified here (the rare case): the test's
// assertion semantics are unchanged (spawn-delta < 2s, walltime ≈ max(single)
// not sum). The architecture under test changed — in-process Task batch
// became OS-process subprocess batch — and the measurement methodology has
// to follow it. The previous methodology was correctly catching the upstream
// bug; the new methodology validates the workaround's contract.
//
// FIXTURE_DIR: integration/test-fixtures/fixture-phase-2-critic/ (B7) — same
// fixture phase directory the original test used. CRITIQUE-*.md residues are
// scrubbed in afterEach.

const FIXTURE_DIR = path.resolve(__dirname, 'test-fixtures', 'fixture-phase-2-critic');
const LEDGER = path.resolve(__dirname, 'test-fixtures', 'walltime-ledger.jsonl');
const SPAWN_DELTA_HARD_MS = 2000;
const SPAWN_DELTA_SOFT_MS = 1000;  // H6 yellow flag
const FALLBACK_TOTAL_MS = 360_000; // H6 fallback when ledger sparse

function computeTotalWalltimeBound() {
  // H6 (per 02-REVIEWS.md verify-W-001): compute the total-walltime sanity bound
  // dynamically from prior phase-2-critic ledger entries (median single-critic × 6).
  // Falls back to 360_000ms if < 3 prior single-critic entries exist.
  if (!fs.existsSync(LEDGER)) return FALLBACK_TOTAL_MS;
  const lines = fs.readFileSync(LEDGER, 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#'));
  const singleEntries = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.phase === 'phase-2-critic' && /spike|single/i.test(e.test || '')) {
        singleEntries.push(e.walltime_ms);
      }
    } catch (_) { /* skip malformed line */ }
  }
  if (singleEntries.length < 3) return FALLBACK_TOTAL_MS;
  const sorted = [...singleEntries].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return 6 * median;
}

// B7: cleanup CRITIQUE-*.md from the FIXTURE_DIR so the committed directory stays clean.
function cleanFixtureCritiques() {
  if (!fs.existsSync(FIXTURE_DIR)) return;
  for (const f of fs.readdirSync(FIXTURE_DIR)) {
    if (/^CRITIQUE.*\.md$/.test(f)) {
      fs.unlinkSync(path.join(FIXTURE_DIR, f));
    }
  }
}

// Locate the dispatcher in the worktree being tested. We deliberately do NOT
// invoke `gsd-sdk query critic-spawn-batch` here because the system gsd-sdk
// (on PATH at /usr/local/bin/gsd-sdk) is built from the main worktree's
// uncompiled-yet TS, and via GSD_QUERY_FALLBACK it resolves to the system
// gsd-tools.cjs at /home/danhalem/personal/get-shit-done/get-shit-done/bin/.
// The system path may not yet have the new dispatcher case, so the test
// invokes the local-worktree dispatcher directly to measure the actual code
// being landed in this commit.
const DISPATCHER = path.join(getRepoRoot(), 'get-shit-done', 'bin', 'gsd-tools.cjs');

describe('CRIT-08: critic batch walltime is parallel-shaped (process-level)', () => {
  afterEach(() => { cleanFixtureCritiques(); });

  test('spawn-batch fans out 6 critics in <2s; total walltime is parallel-bounded', async () => {
    const TOTAL_WALLTIME_SANITY_MS = computeTotalWalltimeBound();
    process.stderr.write(`# CRIT-08: TOTAL_WALLTIME_SANITY_MS = ${TOTAL_WALLTIME_SANITY_MS} (H6 dynamic)\n`);

    // Invoke the dispatcher directly. This runs synchronously from the test's
    // perspective — the dispatcher returns once all 6 subprocesses have closed.
    // Per-critic budget set to $1 to keep total cost under $6 even in the worst
    // case (6 critics × $1). 12-min outer timeout matches the SDK handler's
    // ceiling.
    const startMs = Date.now();
    let stdout, exitCode, error;
    try {
      stdout = execFileSync('node', [
        DISPATCHER,
        'critic-spawn-batch',
        '--phase-dir', FIXTURE_DIR,
        '--budget', '1',
        '--json',
      ], {
        cwd: getRepoRoot(),
        encoding: 'utf-8',
        timeout: 720_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      exitCode = 0;
    } catch (err) {
      error = err;
      stdout = err.stdout?.toString() || '';
      exitCode = err.status ?? -1;
    }
    const wallMs = Date.now() - startMs;

    // Record the parent-side wall regardless of outcome — preserves cost
    // visibility in the ledger even if the test asserts fail.
    let parsed = null;
    try { parsed = JSON.parse(stdout); } catch { /* leave null */ }

    recordWalltime({
      test: 'integration:critic-batch-walltime',
      walltime_ms: wallMs,
      cost_usd: parsed?.cost_usd_total ?? 0,
      phase: 'phase-2-critic',
    });

    assert.ok(parsed, `dispatcher did not emit valid JSON. exit=${exitCode}, ` +
      `error=${error?.message || 'none'}, stdout(first 500)=${stdout.slice(0, 500)}`);

    // Per-critic outcomes: every lens must have a row in per_critic; failed
    // critics surface in critics_failed but the batch itself can still PASS
    // its parallelism contract — the test is about WALLTIME shape, not
    // about every critic landing successfully. The aggregate-shape contract
    // (CRIT-09 skip-and-continue) lives in critic-aggregate-shape.test.cjs.
    assert.strictEqual(parsed.per_critic.length, 6,
      `expected 6 per-critic entries, got ${parsed.per_critic.length}`);

    const spawnTimes = parsed.per_critic.map((r) => r.spawn_at_ms);
    assert.ok(spawnTimes.every((t) => typeof t === 'number' && t > 0),
      `every per_critic.spawn_at_ms must be a positive number; got ${JSON.stringify(spawnTimes)}`);

    const spawnDelta = parsed.spawn_delta_ms;

    // H6 soft warning (not a test failure)
    if (spawnDelta > SPAWN_DELTA_SOFT_MS) {
      process.stderr.write(
        `WARN: spawn-delta ${spawnDelta}ms > ${SPAWN_DELTA_SOFT_MS}ms ` +
        `(soft yellow flag; hard fail at ${SPAWN_DELTA_HARD_MS}ms)\n`
      );
    }

    // Hard fail: spawn-delta < 2s. With child_process.spawn back-to-back in a
    // tight Array.map → Promise.all, the OS spawn-time spread is typically
    // single-digit ms; 2s gives ample headroom for slow disk / busy CPU.
    assert.ok(spawnDelta < SPAWN_DELTA_HARD_MS,
      `spawn-delta ${spawnDelta}ms >= ${SPAWN_DELTA_HARD_MS}ms — ` +
      `process-level parallelism workaround did not deliver concurrent spawn (#7406 not bypassed)`);

    // Total walltime SHAPE assertion: with true parallel dispatch, total
    // walltime ≈ max(per-critic) + small spawn overhead. With serial
    // dispatch, total walltime ≈ sum(per-critic) ≈ 6 × min(per-critic).
    //
    // The PRIMARY parallelism-shape assertion is `total < 1.5 × max(per-critic)`:
    //   - parallel: total ≈ max → ratio ≈ 1.0  → PASS
    //   - serial:   total ≈ sum ≈ 5-6 × max     → ratio >> 1.5 → FAIL
    // 1.5× headroom absorbs spawn overhead + finishing-tail variance without
    // letting a partial-serial regression pass silently.
    //
    // The H6 dynamic bound (TOTAL_WALLTIME_SANITY_MS = 6 × median spike) is
    // RETAINED as a soft sanity stderr warning — it was tuned for tiny spike
    // probes (<10s each), so on a substantive critic run it can be misleading
    // when reported as a hard threshold. The 1.5× max(per-critic) shape
    // assertion is what actually proves parallelism on real workloads.
    const perCriticWalls = parsed.per_critic.map((r) => r.walltime_ms);
    const maxPerCritic = Math.max(...perCriticWalls);
    const sumPerCritic = perCriticWalls.reduce((a, b) => a + b, 0);
    const parallelismRatio = parsed.walltime_ms / maxPerCritic;

    if (parsed.walltime_ms > TOTAL_WALLTIME_SANITY_MS) {
      process.stderr.write(
        `WARN: walltime ${parsed.walltime_ms}ms > H6 spike-derived bound ${TOTAL_WALLTIME_SANITY_MS}ms ` +
        `— this is informational only when per-critic times exceed spike sizes; ` +
        `the parallelism-shape assertion (total / max-per-critic) is what gates the test.\n`
      );
    }

    assert.ok(parallelismRatio < 1.5,
      `total walltime ${parsed.walltime_ms}ms / max(per-critic) ${maxPerCritic}ms = ` +
      `${parallelismRatio.toFixed(2)} >= 1.5 — process-level workaround is serial. ` +
      `(For reference: sum(per-critic) = ${sumPerCritic}ms — if total ≈ sum, batch ran serially.)`);

    // Diagnostic: log the per-critic walltimes + parallelism ratio so success
    // and failure forensics are equally rich.
    const perCriticDiag = parsed.per_critic
      .map((r) => `${r.lens}=${r.walltime_ms}ms`)
      .join(' ');
    process.stderr.write(
      `# CRIT-08 result: spawn_delta=${spawnDelta}ms ` +
      `total_walltime=${parsed.walltime_ms}ms ` +
      `max_per_critic=${maxPerCritic}ms ` +
      `parallelism_ratio=${parallelismRatio.toFixed(2)} ` +
      `cost=${parsed.cost_usd_total?.toFixed(4) ?? '?'} status=${parsed.status} ` +
      `per_critic=[${perCriticDiag}]\n`
    );
  });
});
