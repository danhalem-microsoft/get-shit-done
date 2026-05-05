/**
 * `critic-aggregate` (Phase 2 — Plan 02-06) — disk-based aggregator for the
 * 6 GSD critic agents (gsd-critic-{plan,code,scope,verify,discuss,strategy}).
 *
 * Mitigates the parallel-Task hallucination bug
 * (anthropics/claude-code#29181): the critique workflow at
 * `get-shit-done/workflows/critique.md` MUST NOT trust the parent agent's
 * text summaries of the 6 spawned Tasks; instead it shells out here to
 * read CRITIQUE-{lens}.md from disk.
 *
 * Implementation strategy (per 02-06-PLAN.md Step C, option (a) —
 * minimum surface area): this TS handler shells out to the existing
 * gsd-tools.cjs `critic-aggregate` dispatcher case, which holds the
 * single source of truth in `get-shit-done/bin/lib/critic-aggregate.cjs`.
 * The B1 fix (per 02-REVIEWS.md scope-C-001) is the registry entry in
 * sdk/src/query/index.ts so `gsd-sdk query critic-aggregate` resolves
 * natively rather than only via the GSD_QUERY_FALLBACK transparent
 * bridge — this also satisfies the drift-guard at
 * tests/gsd-sdk-query-registry-integration.test.cjs.
 *
 * @see get-shit-done/bin/lib/critic-aggregate.cjs (canonical handler)
 * @see get-shit-done/workflows/critique.md (only in-repo caller)
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

/**
 * Locate gsd-tools.cjs. Mirrors the probe order in
 * `sdk/src/gsd-tools.ts::resolveGsdToolsPath` but kept inline so this module
 * has zero coupling to the SDK's gsd-tools subprocess shim (the shim is the
 * fallback path; this is the registered native path).
 */
function locateGsdTools(projectDir: string): string {
  const candidates = [
    // Repo layout (slim project): get-shit-done/bin/gsd-tools.cjs at the
    // root of the worktree the SDK is being built inside.
    join(projectDir, 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    // User's installed Claude config layout.
    join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    join(homedir(), '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new GSDError(
      `critic-aggregate: cannot locate get-shit-done/bin/gsd-tools.cjs. ` +
        `Searched: ${candidates.join(', ')}`,
      ErrorClassification.Blocked,
    );
  }
  return found;
}

/**
 * `critic-aggregate` — disk-based critic-output aggregator.
 *
 * Args (forwarded verbatim to gsd-tools.cjs):
 *   --phase <N>             Phase number (looks up phase dir via planning tree)
 *   --phase-dir <path>      Direct phase-dir override (test fixture / external trees)
 *   --json                  Reserved (handler emits structured JSON regardless)
 *
 * Returns `{ data: <parsed JSON> }` matching the shape:
 *   {
 *     phase, phase_dir,
 *     critics_expected, critics_present, critics_missing,
 *     severity_counts_total: { critical, warning, info, total },
 *     status: "pass" | "warn" | "fail",
 *     files: [{ path, critique_type, severity_counts, status }]
 *   }
 */
export const criticAggregate: QueryHandler = async (args, projectDir) => {
  const dispatcher = locateGsdTools(projectDir);
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [dispatcher, 'critic-aggregate', ...args],
      { cwd: projectDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderrText = e?.stderr
      ? (typeof e.stderr === 'string' ? e.stderr : e.stderr.toString('utf-8'))
      : '';
    throw new GSDError(
      `critic-aggregate dispatcher failed: ${stderrText.trim() || e?.message || 'unknown error'}`,
      ErrorClassification.Execution,
    );
  }

  // gsd-tools.cjs `output()` writes pretty-printed JSON by default. Parse it
  // back into structured data so the QueryHandler contract holds.
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new GSDError(
      `critic-aggregate: dispatcher stdout was not valid JSON. Got: ${stdout.slice(0, 500)}`,
      ErrorClassification.Execution,
    );
  }

  return { data: parsed };
};
