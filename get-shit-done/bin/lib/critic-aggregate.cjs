/**
 * Critic-aggregate — glob CRITIQUE-*.md in a phase dir, parse YAML frontmatter,
 * return aggregated JSON for the critique workflow orchestrator.
 *
 * Mitigates anthropics/claude-code#29181 (parallel-Task hallucination): the
 * orchestrator reads critic output from disk via this CLI subcommand instead
 * of trusting the parent agent's text summary.
 *
 * Output JSON shape (per Plan 02-06 RESEARCH §Pattern-3):
 *   {
 *     phase: string,
 *     phase_dir: string,
 *     critics_expected: ["plan", "code", "scope", "verify", "discuss", "strategy"],
 *     critics_present: string[],
 *     critics_missing: string[],
 *     severity_counts_total: { critical: number, warning: number, info: number, total: number },
 *     status: "pass" | "warn" | "fail",
 *     files: [{ path, critique_type, severity_counts, status }]
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findPhaseInternal, output, error } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

const EXPECTED_LENSES = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];

/**
 * Coerce severity-count value to integer. The fork's extractFrontmatter
 * parser returns leaf scalars as STRINGS (verified at task-1 implementation
 * time: `severity_counts.critical: 0` parses to the string "0"). The
 * aggregator must accept both string and numeric inputs and emit numeric
 * totals so downstream JSON consumers can rely on the type.
 */
function toInt(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeSeverityCounts(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return {
    critical: toInt(src.critical),
    warning: toInt(src.warning),
    info: toInt(src.info),
    total: toInt(src.total),
  };
}

function cmdCriticAggregate(cwd, { phase, phaseDirOverride, useJson, raw }) {
  if (!phase && !phaseDirOverride) {
    error('--phase <N> or --phase-dir <path> required');
  }

  const phaseDir = phaseDirOverride
    ? path.resolve(cwd, phaseDirOverride)
    : findPhaseInternal(cwd, phase).dir;

  const files = [];
  const missing = [];

  for (const lens of EXPECTED_LENSES) {
    const file = path.join(phaseDir, `CRITIQUE-${lens}.md`);
    if (!fs.existsSync(file)) {
      missing.push(lens);
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      // Treat unreadable file as missing — never throw (T-02-D mitigation).
      missing.push(lens);
      continue;
    }
    const fm = extractFrontmatter(content);
    files.push({
      path: file,
      critique_type: fm.critique_type || lens,
      severity_counts: normalizeSeverityCounts(fm.severity_counts),
      status: fm.status || 'unknown',
    });
  }

  const totals = files.reduce((acc, f) => {
    for (const k of Object.keys(f.severity_counts || {})) {
      acc[k] = (acc[k] || 0) + (f.severity_counts[k] || 0);
    }
    return acc;
  }, { critical: 0, warning: 0, info: 0, total: 0 });

  const result = {
    phase: phase || path.basename(phaseDir),
    phase_dir: phaseDir,
    critics_expected: EXPECTED_LENSES.slice(),
    critics_present: files.map((f) => f.critique_type),
    critics_missing: missing,
    severity_counts_total: totals,
    status: totals.critical > 0 ? 'fail' : (totals.warning > 0 ? 'warn' : 'pass'),
    files,
  };

  // useJson is currently informational — the dispatcher's `output()` already
  // emits JSON by default. Reserved for future stdout-format toggles.
  void useJson;
  output(result, raw, result.status);
}

module.exports = { cmdCriticAggregate, EXPECTED_LENSES, normalizeSeverityCounts };
