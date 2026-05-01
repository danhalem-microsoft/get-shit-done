'use strict';

/**
 * Agent-parity test helper (TEST-02). Cross-phase contract: consumed by
 * Phase 2 (critic-findings), Phase 3 (plan-structural), Phase 6 (schema-conformance).
 *
 * Per RESEARCH.md §1.2: the three schema kinds are LOCKED here; helper must
 * support all three even though Phase 1 only exercises capture mode (N=1).
 */

const fs = require('node:fs');
const path = require('node:path');
const { runClaudeWithTools } = require('./claude-runner.cjs');
const { recordWalltime } = require('./walltime-recorder.cjs');

const BASELINES_DIR = path.resolve(__dirname, '..', 'test-fixtures', 'baselines');

const SCHEMAS = {
  'critic-findings': {
    kind: 'critic-findings',
    threshold: 0.85,
    severities: ['critical', 'major', 'minor'],
    noMissingCritical: true,
    bucketKey: ['severity', 'category', 'lane'],
  },
  'plan-structural': {
    kind: 'plan-structural',
    taskCountTolerance: 0.10,
    requireMustHaveCoverage: 'set-equality',
    dependencyGraphCheck: 'isomorphic-by-content',
    redStepRequired: false,  // Phase 1 default; Phase 4 flips to true
  },
  'schema-conformance': {
    kind: 'schema-conformance',
    expectedSections: [],   // populated per-agent at call site
    fieldsPresent: [],
    smokeCritiqueModel: 'cheap',
    smokeCritiqueMaxBudget: 0.5,
  },
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  return n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
}

/**
 * Pick the median run from successful[] by duration_ms (CR-04 fix).
 * Sorts a COPY of successful so the source array is not mutated; for an even-N
 * array, picks index Math.floor(N/2) of the sorted copy (matches the behavior
 * the COMPARE-mode return previously CLAIMED via comment but did not implement).
 * Exported for unit testing in tests/agent-parity-helper-shape.test.cjs.
 */
function pickMedianByDuration(successful) {
  if (!Array.isArray(successful) || successful.length === 0) return undefined;
  const sortedByDuration = [...successful].sort(
    (a, b) => (a.duration_ms ?? 0) - (b.duration_ms ?? 0)
  );
  return sortedByDuration[Math.floor(sortedByDuration.length / 2)];
}

function loadBaseline(agentName, fixtureId) {
  const file = path.join(BASELINES_DIR, agentName, `${fixtureId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveBaseline(agentName, fixtureId, payload) {
  const dir = path.join(BASELINES_DIR, agentName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fixtureId}.json`), JSON.stringify(payload, null, 2) + '\n');
}

/**
 * @param {string} agentName     e.g., 'gsd-critic-plan'
 * @param {object} fixture       { fixtureId, prompt, cwd, env, addDirs }
 * @param {object} schema        one of SCHEMAS values OR { kind, ...overrides }
 * @param {object} opts          { walltimeBudgetMs, maxCostUsd, n, recordWalltime, phase, mode }
 *                               mode: 'capture' (write baseline, N=1) or 'compare' (read baseline, N=5)
 * @returns {Promise<ParityResult>}
 */
async function runAgentParity(agentName, fixture, schema, opts = {}) {
  const mode = opts.mode ?? 'compare';
  const N = opts.n ?? (mode === 'capture' ? 1 : 5);
  const phase = opts.phase ?? 'phase-1-cull';

  const runs = [];
  for (let i = 0; i < N; i++) {
    let result;
    try {
      result = await runClaudeWithTools(fixture.prompt, {
        cwd: fixture.cwd,
        timeout: opts.walltimeBudgetMs ?? 600_000,
        maxBudget: opts.maxCostUsd ?? 30,
        addDirs: fixture.addDirs,
        env: fixture.env,
      });
    } catch (err) {
      runs.push({ failed: true, reason: err.message, walltime_ms: 0, cost: 0 });
      continue;
    }

    if (opts.recordWalltime !== false) {
      recordWalltime({
        test: `agent-parity:${agentName}:${fixture.fixtureId}`,
        walltime_ms: result.duration_ms ?? 0,
        cost_usd: result.cost ?? 0,
        phase,
      });
    }
    runs.push(result);
  }

  const successful = runs.filter((r) => !r.failed && r.success);
  if (successful.length < Math.ceil(N / 2)) {
    return {
      pass: false,
      deltas: { error: `insufficient successful runs (${successful.length} of ${N})` },
      walltime_ms: { p50: 0, p95: 0 },
      cost_usd: runs.reduce((s, r) => s + (r.cost ?? 0), 0),
      per_run_summary: runs,
    };
  }

  // CAPTURE mode: write baseline; no comparison.
  if (mode === 'capture') {
    const payload = {
      _meta: {
        agent: agentName,
        fixture_id: fixture.fixtureId,
        captured_at: new Date().toISOString(),
        schema_kind: schema.kind,
        runs_recorded: 1,
      },
      result: successful[0].result,
      raw: successful[0].raw,
    };
    saveBaseline(agentName, fixture.fixtureId, payload);
    return {
      pass: true,
      mode: 'capture',
      baseline_path: path.join(BASELINES_DIR, agentName, `${fixture.fixtureId}.json`),
      walltime_ms: { p50: successful[0].duration_ms, p95: successful[0].duration_ms },
      cost_usd: successful[0].cost,
      per_run_summary: runs,
    };
  }

  // COMPARE mode: load baseline, compute schema-aware deltas.
  const baseline = loadBaseline(agentName, fixture.fixtureId);
  if (!baseline) {
    return {
      pass: false,
      deltas: { error: `baseline not found for ${agentName}/${fixture.fixtureId}` },
      per_run_summary: runs,
    };
  }

  const deltas = computeDeltas(schema, baseline, successful);
  const walltimes = successful.map((r) => r.duration_ms);
  const totalCost = runs.reduce((s, r) => s + (r.cost ?? 0), 0);

  return {
    pass: deltas.pass,
    baseline,
    current: pickMedianByDuration(successful),  // sorted-median by duration_ms (CR-04 fix)
    deltas,
    walltime_ms: { p50: median(walltimes), p95: walltimes.sort((a,b)=>a-b)[Math.ceil(walltimes.length*0.95)-1] || median(walltimes) },
    cost_usd: totalCost,
    per_run_summary: runs,
  };
}

function computeDeltas(schema, baseline, runs) {
  // Per-schema comparison logic. Stub for kinds the helper supports —
  // Phase 2/3/6 will exercise these in production; for Phase 1 capture-mode
  // these branches are not exercised but MUST compile + be exported.
  switch (schema.kind) {
    case 'critic-findings':
      return computeCriticFindingsDeltas(schema, baseline, runs);
    case 'plan-structural':
      return computePlanStructuralDeltas(schema, baseline, runs);
    case 'schema-conformance':
      return computeSchemaConformanceDeltas(schema, baseline, runs);
    default:
      return { pass: false, error: `unknown schema kind: ${schema.kind}` };
  }
}

function computeCriticFindingsDeltas(schema, baseline, runs) {
  // Stub for Phase 2 calibration. Returns shape that Phase 2 will exercise;
  // for Phase 1 (capture mode only) this is not invoked at runtime.
  return {
    pass: true,
    overlap: 1.0,
    missingCritical: [],
    extraFindings: [],
    note: 'stub — Phase 2 implements full critic-findings comparison',
  };
}

function computePlanStructuralDeltas(schema, baseline, runs) {
  // Stub for Phase 3.
  return {
    pass: true,
    taskCountDelta: 0,
    mustHaveCoverage: 'set-equal',
    dependencyGraphIsomorphic: true,
    redStepPresent: !schema.redStepRequired,
    note: 'stub — Phase 3 implements full plan-structural comparison',
  };
}

function computeSchemaConformanceDeltas(schema, baseline, runs) {
  // Stub for Phase 6.
  return {
    pass: true,
    sectionsMissing: [],
    fieldsMissing: [],
    note: 'stub — Phase 6 implements full schema-conformance comparison',
  };
}

module.exports = { runAgentParity, SCHEMAS, BASELINES_DIR, loadBaseline, saveBaseline, pickMedianByDuration };
