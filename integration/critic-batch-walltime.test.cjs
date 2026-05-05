'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-08: spawn-timestamp delta <2s (hard); soft-warn at >1s (H6).
// Total walltime not serial — dynamic bound from prior ledger entries (H6).
// B7: runs against test-managed fixture dir at integration/test-fixtures/fixture-phase-2-critic/,
// NOT Phase 1's .planning/. CRITIQUE-*.md files written there are scrubbed in afterEach.
//
// Path-2 reconnaissance choice (per integration/test-fixtures/spawn-timestamp-shape.txt
// ANNOTATIONS — 2026-05-04): per-Task timestamps are NOT exposed in result.raw at the
// surface level captured (only top-level duration_ms; usage.iterations[] has no
// timestamps). The fixture explicitly recommends "use bash-tool stderr timestamp
// wrapping per RESEARCH §Pitfall-2 — wrap each Task call in `date +%s%N` echos".
// The implementation below asks the orchestrator prompt to emit one TASK-START
// marker line via Bash before each Task() spawn. extractTaskStartTimes parses
// the markers from result.result. This implements Path-2 (bash-wrap fallback).

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

// Path-2 extractor: parse "TASK-START <lens> <epoch_ns>" lines from result.result.
// The orchestrator prompt asks the parent to echo one such line via Bash
// IMMEDIATELY BEFORE each of its 6 Task() calls (in the same assistant message
// that contains the Tasks). Returns array of millisecond timestamps (epoch_ns / 1e6).
function extractTaskStartTimes(result) {
  const text = result.result || '';
  const re = /TASK-START\s+(\w+)\s+(\d+)/g;
  const stamps = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const ns = BigInt(m[2]);
    stamps.push(Number(ns / 1_000_000n));
  }
  return stamps;
}

describe('CRIT-08: critic batch walltime is parallel-shaped', () => {
  afterEach(() => { cleanFixtureCritiques(); });

  test('all 6 critics spawn within 2s of each other; total walltime is parallel-bounded', async () => {
    const TOTAL_WALLTIME_SANITY_MS = computeTotalWalltimeBound();
    process.stderr.write(`# CRIT-08: TOTAL_WALLTIME_SANITY_MS = ${TOTAL_WALLTIME_SANITY_MS} (H6 dynamic)\n`);

    const result = await runClaudeWithTools(
      `You are testing the GSD critic batch parallelism for CRIT-08.

Phase dir: ${FIXTURE_DIR}

DO NOT call gsd-sdk query find-phase. Resolve phase_dir directly to: ${FIXTURE_DIR}

In a SINGLE assistant message, emit ALL 6 Task() calls in one contiguous block (no other tool calls before, between, or after them — the test depends on the parallelism guarantee Claude Code provides only when Tasks are emitted contiguously). Each Task's prompt MUST instruct the subagent to record its own start timestamp via Bash AS ITS FIRST ACTION, and include that timestamp in its final return text. The exact prompt template for each critic:

  Task(subagent_type="gsd-critic-plan", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START plan <N>' (literal text, with N substituted). After that line, do your normal work: review *-PLAN.md per <plan_specific_checklist>, write CRITIQUE-plan.md, verify the file flushed, return.")
  Task(subagent_type="gsd-critic-code", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START code <N>' (literal text, with N substituted). After that line, do your normal work: review per <code_specific_checklist>, write CRITIQUE-code.md, verify the file flushed, return.")
  Task(subagent_type="gsd-critic-scope", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START scope <N>' (literal text, with N substituted). After that line, do your normal work: review per <scope_specific_checklist>, write CRITIQUE-scope.md, verify the file flushed, return.")
  Task(subagent_type="gsd-critic-verify", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START verify <N>' (literal text, with N substituted). After that line, do your normal work: review must_haves frontmatter per <verify_specific_checklist>, write CRITIQUE-verify.md, verify the file flushed, return.")
  Task(subagent_type="gsd-critic-discuss", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START discuss <N>' (literal text, with N substituted). After that line, do your normal work: review CONTEXT.md per <discuss_specific_checklist>, write CRITIQUE-discuss.md, verify the file flushed, return.")
  Task(subagent_type="gsd-critic-strategy", prompt="Phase dir: ${FIXTURE_DIR}. CRIT-08 timing instrumentation: as your FIRST action, run \\\`date +%s%N\\\` via Bash and capture the nanosecond epoch as N. Then in your FINAL return text include ONE line of EXACTLY this shape: 'TASK-START strategy <N>' (literal text, with N substituted). After that line, do your normal work: review per <strategy_specific_checklist>, write CRITIQUE-strategy.md, verify the file flushed, return.")

After all 6 Tasks return, you MUST print all 6 TASK-START lines (one per line) verbatim in your final response so the test harness can read them via regex. The TASK-START lines come from the subagents' return text — extract them and reprint them. Then merge per get-shit-done/workflows/critique.md Step 6: run \`gsd-sdk query critic-aggregate --phase-dir ${FIXTURE_DIR} --json\` and write the merged CRITIQUE.md.`,
      {
        cwd: getRepoRoot(),
        timeout: 600_000,
        maxBudget: 30,
      }
    );

    recordWalltime({
      test: 'integration:critic-batch-walltime',
      walltime_ms: result.duration_ms,
      cost_usd: result.cost,
      phase: 'phase-2-critic',
    });

    assert.ok(result.success,
      `critique failed: ${result.error || (result.result || '').slice(0, 300)}`);

    const taskStartTimes = extractTaskStartTimes(result);
    assert.strictEqual(taskStartTimes.length, 6,
      `expected 6 Task spawn timestamps, found ${taskStartTimes.length}. ` +
      `result.result snippet: ${(result.result || '').slice(0, 800)}`);

    const spawnDelta = Math.max(...taskStartTimes) - Math.min(...taskStartTimes);

    // H6 soft warning (not a test failure)
    if (spawnDelta > SPAWN_DELTA_SOFT_MS) {
      process.stderr.write(
        `WARN: spawn-delta ${spawnDelta}ms > ${SPAWN_DELTA_SOFT_MS}ms ` +
        `(soft yellow flag; hard fail at ${SPAWN_DELTA_HARD_MS}ms)\n`
      );
    }

    // Hard fail
    assert.ok(spawnDelta < SPAWN_DELTA_HARD_MS,
      `spawn-delta ${spawnDelta}ms >= ${SPAWN_DELTA_HARD_MS}ms — Tasks may be running serially (#7406)`);

    assert.ok(result.duration_ms < TOTAL_WALLTIME_SANITY_MS,
      `walltime ${result.duration_ms}ms >= ${TOTAL_WALLTIME_SANITY_MS}ms (H6 dynamic) — likely serial degradation`);
  });
});
