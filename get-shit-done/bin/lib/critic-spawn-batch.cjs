/**
 * critic-spawn-batch — process-level parallelism workaround for CRIT-08.
 *
 * The 6 GSD critic agents (gsd-critic-{plan,code,scope,verify,discuss,strategy})
 * are normally spawned via `Task()` calls inside a SINGLE assistant message
 * (see get-shit-done/workflows/critique.md). Per
 * [anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406)
 * the parent's Task scheduler often serializes those spawns: walltime ≈ sum of
 * single-critic times rather than max. The 02-07-followup live evidence put
 * spawn-delta at 7960ms (vs the 2000ms hard threshold) and total walltime at
 * 283811ms (vs 6× median ≈ 47s).
 *
 * This module sidesteps the in-process Task scheduler entirely. It uses Node's
 * `child_process.spawn` to fire 6 OS-level `claude --print` subprocesses
 * concurrently, then awaits all 6 via `Promise.all`. Each subprocess receives a
 * prompt that loads the shared critic-base + the lens-specific addendum and
 * writes CRITIQUE-{lens}.md to the phase dir directly. No subagent layer.
 *
 * Walltime contract: total ≈ max(per-critic) + ~1s spawn overhead, NOT sum.
 * This is the contract integration/critic-batch-walltime.test.cjs validates.
 *
 * Outputs (after all 6 finish):
 *   - <phase_dir>/CRITIQUE-{plan,code,scope,verify,discuss,strategy}.md (per-critic)
 *   - JSON to stdout: { phase_dir, critics, walltime_ms, spawn_delta_ms,
 *                       cost_usd_total, errors, ledger_entries }
 *
 * The caller is expected to chain `gsd-sdk query critic-aggregate --phase ...`
 * after this command to merge per-critic CRITIQUE files into the unified
 * CRITIQUE.md (per Plan 02-06's disk-aggregation contract). Spawn-batch is the
 * fan-out step; aggregate is the fan-in.
 *
 * Fallback: if spawn-batch fails (auth missing, claude binary not found, etc.)
 * the workflow can fall back to the in-process single-message Task pattern
 * documented in get-shit-done/workflows/critique.md (the original CRIT-06
 * primary path is preserved as a fallback comment block).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { findPhaseInternal, output, error } = require('./core.cjs');

const EXPECTED_LENSES = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];

// Per-subprocess defaults. The CRIT-10 parity test budget caps at $30 across
// 30 critic invocations (~$1/each in the highest-cost worst case); for the
// fan-out batch a single critic on a small phase typically lands under $0.50,
// so $5/subprocess is a generous ceiling that prevents one runaway spawn from
// tanking the budget without rejecting normal-cost critics.
const DEFAULT_PER_CRITIC_BUDGET_USD = 5;
// 10-minute per-subprocess timeout. Single-critic median in the
// 02-07-followup ledger was ~7-15s; 10min is ~40× the median and 2× the
// observed worst case (critic-strategy at ~5min in run-2). Set high so the
// timeout is never the cause of a critic failing on a normal phase but low
// enough to surface true-hang scenarios within a reasonable window.
const DEFAULT_TIMEOUT_MS = 600_000;

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

/**
 * Build the per-critic prompt. The prompt loads the shared critic-base and
 * lens-specific addendum via @-imports (matching the in-process Task pattern
 * in critique.md); claude --print resolves these imports against ~/.claude/.
 *
 * The prompt embeds the phase_dir so the critic resolves it directly without
 * calling gsd-sdk query find-phase (which would burn ~$0.10 per critic).
 */
function buildCriticPrompt(lens, phaseDir) {
  return `@~/.claude/get-shit-done/agents/_shared/critic-base.md
@~/.claude/agents/gsd-critic-${lens}.md

<phase_context>
phase_dir: ${phaseDir}
lens: ${lens}
</phase_context>

You are running as the gsd-critic-${lens} agent in non-interactive (--print) mode.

Resolve phase_dir from the <phase_context> block above to: ${phaseDir}

DO NOT call gsd-sdk query find-phase — phase_dir is already resolved.

Read the phase artifacts that your <${lens}_specific_checklist> requires (skip silently if absent):
- *-PLAN.md / PLAN.md
- *-SUMMARY.md / SUMMARY.md
- VERIFICATION.md, CONTEXT.md
- prior CRITIQUE-${lens}.md (carry-forward any dismissed findings)

Apply your <${lens}_specific_checklist>. Write findings to ${phaseDir}/CRITIQUE-${lens}.md per your <output_contract> (YAML frontmatter + body grouped critical → warning → info).

After writing, run the post-write verify check from your <output_contract>:
  test -f ${phaseDir}/CRITIQUE-${lens}.md

Then return briefly. Do not include the findings in your return text — the orchestrator reads them from disk via the critic-aggregate query.`;
}

/**
 * Spawn one claude --print subprocess for a given critic lens.
 *
 * Returns a Promise resolving to:
 *   { lens, success, walltime_ms, cost_usd, spawn_at_ms, error?, output? }
 *
 * Never rejects — surfaces failures via { success: false, error } so
 * Promise.all returns ALL 6 results regardless of individual failures
 * (matches CRIT-09's skip-and-continue policy: a failed critic must not
 * abort the other 5).
 */
function spawnOneCritic(lens, phaseDir, opts = {}) {
  const budget = opts.budget ?? DEFAULT_PER_CRITIC_BUDGET_USD;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  const cwd = opts.cwd || process.cwd();

  const prompt = buildCriticPrompt(lens, phaseDir);
  const args = [
    '--print',
    '--dangerously-skip-permissions',
    '--output-format', 'json',
    '--max-budget-usd', String(budget),
  ];
  // Allow the critic to read the phase dir AND the project root (for
  // cross-references like REQUIREMENTS.md, ROADMAP.md). The phase dir is
  // typically inside the project root so --add-dir on the project covers it,
  // but pass both explicitly to be safe.
  if (opts.addDirs) {
    for (const d of opts.addDirs) {
      args.push('--add-dir', d);
    }
  } else {
    args.push('--add-dir', cwd);
  }

  return new Promise((resolve) => {
    // Capture spawn time at the EXACT moment we hand off to the OS scheduler.
    // This is the spawn-delta measurement point: across 6 calls to spawnOneCritic
    // in a Promise.all, all 6 spawn_at_ms values must land within a few hundred
    // milliseconds of each other (the OS process-create overhead is the only
    // serialization here, not a parent-process tool scheduler).
    const spawnAtMs = Date.now();
    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
        cwd,
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Synchronous spawn failure (e.g., binary not found before fork).
      resolve({
        lens,
        success: false,
        walltime_ms: 0,
        cost_usd: 0,
        spawn_at_ms: spawnAtMs,
        error: `spawn failed: ${err.message}`,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      // SIGKILL escalation if SIGTERM doesn't take in 5s. This catches the
      // case where claude is hung in a network retry loop with signal masks.
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* gone */ }
      }, 5_000);
    }, timeout);

    child.stdout.on('data', (chunk) => { stdoutBuf += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        lens,
        success: false,
        walltime_ms: Date.now() - spawnAtMs,
        cost_usd: 0,
        spawn_at_ms: spawnAtMs,
        error: `child error: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const walltimeMs = Date.now() - spawnAtMs;

      if (timedOut) {
        resolve({
          lens,
          success: false,
          walltime_ms: walltimeMs,
          cost_usd: 0,
          spawn_at_ms: spawnAtMs,
          error: `timeout after ${timeout}ms`,
          output: stdoutBuf.slice(0, 500),
        });
        return;
      }

      // Parse the JSON output (--output-format json).
      let parsed = null;
      try { parsed = JSON.parse(stdoutBuf.trim()); } catch { /* leave null */ }

      if (code !== 0 && !parsed) {
        resolve({
          lens,
          success: false,
          walltime_ms: walltimeMs,
          cost_usd: 0,
          spawn_at_ms: spawnAtMs,
          error: `exit code ${code}: ${stderrBuf.slice(0, 500)}`,
          output: stdoutBuf.slice(0, 500),
        });
        return;
      }

      // Even with exit 0 we should validate the JSON shape — claude --print
      // sometimes emits non-success JSON (e.g., budget exceeded) that we
      // need to surface as a failure.
      const success = parsed?.subtype === 'success';
      const cost = parsed?.total_cost_usd ?? 0;
      const subDuration = parsed?.duration_ms ?? walltimeMs;

      // Verify the CRITIQUE file actually flushed to disk. The agent's
      // <output_contract> mandates this, but defense-in-depth: re-check from
      // the parent so a hallucinated "I wrote the file" return text is caught.
      const expectedFile = path.join(phaseDir, `CRITIQUE-${lens}.md`);
      const fileExists = fs.existsSync(expectedFile);

      resolve({
        lens,
        success: success && fileExists,
        walltime_ms: walltimeMs,
        // Use the agent-reported duration_ms when present so the per-critic
        // walltime reported here is the inner duration (not the spawn-to-close
        // wall which includes tear-down overhead). When the JSON parse failed
        // fall back to the parent-side wall.
        agent_duration_ms: subDuration,
        cost_usd: cost,
        spawn_at_ms: spawnAtMs,
        critique_file_exists: fileExists,
        error: !success ? `claude returned subtype=${parsed?.subtype}: ${parsed?.result?.slice(0, 200) || ''}`
               : !fileExists ? `claude reported success but ${expectedFile} not found on disk`
               : null,
      });
    });

    // Pipe the prompt to stdin and close.
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * The cmdCriticSpawnBatch handler. Invoked from gsd-tools.cjs as
 *   gsd-tools critic-spawn-batch --phase <N> [--phase-dir <path>] [--json]
 *
 * Spawns 6 parallel `claude --print` subprocesses (one per lens) via
 * Promise.all and returns the structured per-critic result + walltime
 * diagnostics. Always emits JSON to stdout; --json is a no-op (reserved
 * for future stdout-format toggles, matches critic-aggregate.cjs convention).
 */
async function cmdCriticSpawnBatch(cwd, { phase, phaseDirOverride, useJson, raw, budget, timeout }) {
  if (!phase && !phaseDirOverride) {
    error('--phase <N> or --phase-dir <path> required');
  }

  const phaseDir = phaseDirOverride
    ? path.resolve(cwd, phaseDirOverride)
    : findPhaseInternal(cwd, phase).dir;

  if (!fs.existsSync(phaseDir)) {
    error(`phase_dir not found: ${phaseDir}`);
  }

  const batchStartMs = Date.now();

  // Spawn ALL 6 critics concurrently via Promise.all. The synchronous spawn()
  // calls happen back-to-back inside the Array.map, so every child's
  // spawn_at_ms is captured within a few ms of the others — that is the
  // foundation of the spawn-delta < 2s contract.
  const promises = EXPECTED_LENSES.map((lens) =>
    spawnOneCritic(lens, phaseDir, { cwd, budget, timeout })
  );

  const results = await Promise.all(promises);

  const batchWalltimeMs = Date.now() - batchStartMs;

  // Compute spawn-delta: the spread of spawn_at_ms across the 6 children.
  // This is the metric the CRIT-08 walltime test asserts against (< 2000ms).
  // With Node's child_process.spawn back-to-back, the spread should be
  // single-digit milliseconds — orders of magnitude better than the in-process
  // Task scheduler's observed 7960ms.
  const spawnTimes = results.map((r) => r.spawn_at_ms);
  const spawnDelta = Math.max(...spawnTimes) - Math.min(...spawnTimes);

  const totalCostUsd = results.reduce((s, r) => s + (r.cost_usd || 0), 0);

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const out = {
    phase: phase || path.basename(phaseDir),
    phase_dir: phaseDir,
    critics_expected: EXPECTED_LENSES.slice(),
    critics_succeeded: succeeded.map((r) => r.lens),
    critics_failed: failed.map((r) => ({ lens: r.lens, error: r.error })),
    walltime_ms: batchWalltimeMs,
    spawn_delta_ms: spawnDelta,
    cost_usd_total: totalCostUsd,
    per_critic: results.map((r) => ({
      lens: r.lens,
      success: r.success,
      walltime_ms: r.walltime_ms,
      agent_duration_ms: r.agent_duration_ms,
      cost_usd: r.cost_usd,
      spawn_at_ms: r.spawn_at_ms,
      critique_file_exists: r.critique_file_exists,
      error: r.error,
    })),
    status: failed.length === 0 ? 'pass' : (succeeded.length > 0 ? 'partial' : 'fail'),
  };

  void useJson;
  output(out, raw, out.status);
}

module.exports = {
  cmdCriticSpawnBatch,
  spawnOneCritic,
  buildCriticPrompt,
  EXPECTED_LENSES,
  DEFAULT_PER_CRITIC_BUDGET_USD,
  DEFAULT_TIMEOUT_MS,
};
