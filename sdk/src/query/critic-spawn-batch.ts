/**
 * `critic-spawn-batch` (Phase 2 — 02-07-fixes) — process-level parallelism
 * workaround for CRIT-08 (anthropics/claude-code#7406 — in-process Task
 * scheduler serialization).
 *
 * Spawns 6 OS-level `claude --print` subprocesses (one per critic lens) via
 * Node's `child_process.spawn` + `Promise.all`. Total walltime = max(per-critic),
 * not sum. Each subprocess writes CRITIQUE-{lens}.md to phase_dir; the caller
 * then chains `gsd-sdk query critic-aggregate` to merge them.
 *
 * Implementation strategy mirrors `critic-aggregate.ts`: this handler shells
 * out to the gsd-tools.cjs `critic-spawn-batch` dispatcher case, which holds
 * the source of truth in `get-shit-done/bin/lib/critic-spawn-batch.cjs`. The
 * registry entry here is what makes `gsd-sdk query critic-spawn-batch ...`
 * resolve natively without falling through to the GSD_QUERY_FALLBACK bridge.
 *
 * @see get-shit-done/bin/lib/critic-spawn-batch.cjs (canonical handler)
 * @see get-shit-done/workflows/critique.md (primary caller — fan-out path)
 * @see get-shit-done/bin/lib/critic-aggregate.cjs (the fan-in counterpart)
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

/**
 * Locate gsd-tools.cjs. Mirrors the probe order in `critic-aggregate.ts`.
 */
function locateGsdTools(projectDir: string): string {
  const candidates = [
    join(projectDir, 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    join(homedir(), '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new GSDError(
      `critic-spawn-batch: cannot locate get-shit-done/bin/gsd-tools.cjs. ` +
        `Searched: ${candidates.join(', ')}`,
      ErrorClassification.Blocked,
    );
  }
  return found;
}

/**
 * `critic-spawn-batch` — fan-out 6 critic subprocesses concurrently.
 *
 * Args (forwarded verbatim to gsd-tools.cjs):
 *   --phase <N>             Phase number (looks up phase dir via planning tree)
 *   --phase-dir <path>      Direct phase-dir override (test fixture / external trees)
 *   --budget <usd>          Per-critic max budget (default: $5/each)
 *   --timeout <ms>          Per-critic timeout (default: 600_000 = 10 min)
 *   --json                  Reserved (handler emits structured JSON regardless)
 *
 * Returns `{ data: <parsed JSON> }` matching the shape:
 *   {
 *     phase, phase_dir,
 *     critics_expected: ["plan", "code", "scope", "verify", "discuss", "strategy"],
 *     critics_succeeded: string[],
 *     critics_failed: [{ lens, error }],
 *     walltime_ms: number,           // total batch walltime
 *     spawn_delta_ms: number,        // spread of spawn timestamps
 *     cost_usd_total: number,
 *     per_critic: [{
 *       lens, success, walltime_ms, agent_duration_ms, cost_usd,
 *       spawn_at_ms, critique_file_exists, error
 *     }],
 *     status: "pass" | "partial" | "fail"
 *   }
 */
export const criticSpawnBatch: QueryHandler = async (args, projectDir) => {
  const dispatcher = locateGsdTools(projectDir);
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [dispatcher, 'critic-spawn-batch', ...args],
      {
        cwd: projectDir,
        encoding: 'utf-8',
        // The fan-out batch can take up to ~10 min per critic in worst case +
        // a small spawn-overhead buffer. 12 min covers normal usage; if a
        // single critic times out internally the dispatcher returns a
        // structured failure for that critic without the parent timing out.
        timeout: 720_000,
        // Per-critic claude --print can produce up to ~1MB of JSON output.
        // 6 × 1MB + frontmatter overhead → 10MB ceiling matches critic-aggregate.
        maxBuffer: 10 * 1024 * 1024,
      },
    );
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderrText = e?.stderr
      ? typeof e.stderr === 'string'
        ? e.stderr
        : e.stderr.toString('utf-8')
      : '';
    throw new GSDError(
      `critic-spawn-batch dispatcher failed: ${stderrText.trim() || e?.message || 'unknown error'}`,
      ErrorClassification.Execution,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new GSDError(
      `critic-spawn-batch: dispatcher stdout was not valid JSON. Got: ${stdout.slice(0, 500)}`,
      ErrorClassification.Execution,
    );
  }

  return { data: parsed };
};
