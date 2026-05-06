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

/**
 * Severity-bucketed key set-diff for critic-findings parity (CRIT-10).
 *
 * Bucket key scheme (RESEARCH §Pitfall-4):
 *   primary:    (severity, category, lane)
 *   secondary:  file_path  (disambiguates same-bucket findings across different files)
 *   forward-compatible with Phase 1 baselines because `extractCategoryFromTitle`
 *   heuristically backfills missing `category` fields.
 *
 * Returns:
 *   pass            — overlap ≥ schema.threshold AND no missing critical findings
 *   overlap         — |intersection| / |baseline|
 *   threshold       — echoed from schema
 *   missingCritical — baseline-critical findings absent from candidate
 *   extraFindings   — candidate keys absent from baseline (informational)
 *   baseFindingCount, currFindingCount — diagnostic counts
 */
function computeCriticFindingsDeltas(schema, baseline, runs) {
  const candidate = pickMedianByDuration(runs);
  if (!candidate) return { pass: false, error: 'no successful runs' };

  const baseFindings = (baseline.result && baseline.result.findings) || extractFindingsFromText(baseline.result || '');
  const currFindings = (candidate.result && candidate.result.findings) || extractFindingsFromText(candidate.result || '');

  function bucketKey(f) {
    const sev  = (f.severity || 'unknown').toLowerCase();
    const lane = (f.lane || 'primary').toLowerCase();
    const cat  = (f.category || extractCategoryFromTitle(f.title)).toLowerCase();
    const file = f.file || 'N/A';
    return `${sev}:${cat}:${lane}|${file}`;
  }

  const baseKeys = new Set(baseFindings.map(bucketKey));
  const currKeys = new Set(currFindings.map(bucketKey));
  const intersection = [...baseKeys].filter((k) => currKeys.has(k));
  const overlap = baseKeys.size === 0 ? 1.0 : intersection.length / baseKeys.size;

  const missingCritical = [...baseFindings]
    .filter((f) => (f.severity || '').toLowerCase() === 'critical')
    .filter((f) => !currKeys.has(bucketKey(f)));

  const extra = [...currKeys].filter((k) => !baseKeys.has(k));
  const pass = (overlap >= schema.threshold) && (missingCritical.length === 0);

  return {
    pass,
    overlap,
    threshold: schema.threshold,
    missingCritical: missingCritical.map((f) => ({ id: f.id, title: f.title, severity: f.severity })),
    extraFindings: extra,
    baseFindingCount: baseFindings.length,
    currFindingCount: currFindings.length,
  };
}

// Helper: parse findings out of textual result if structured object isn't returned.
//
// Two formats supported (in order):
//
// 1. JSON-fenced block (Phase 1 baseline format used by 5 of 6 critic baselines —
//    critic-{code,scope,verify,discuss,strategy}). Looks like:
//      ```json
//      { "findings": [ { "severity": "critical", "lane": "...", "title": "...", ... }, ... ] }
//      ```
//    The JSON object's `findings` array is returned. Per-finding fields are normalized:
//    severity is lowercased; missing `id` is synthesized as `extracted-<idx>` so bucketKey
//    has something stable; `file` defaults to 'N/A' (only one baseline puts file paths in
//    evidence rather than a structured field). Multiple fences in one text are concatenated.
//
// 2. Critic-card markdown blocks (used by some live agent outputs):
//      ### [CRITICAL] Some finding title — short summary
//      - **ID:** `F-001`
//      - **File:** `src/foo.ts:42`
//      - **Severity:** critical
//      - **Lane:** primary
//
// If JSON-fence parsing yields ≥1 finding, those are returned and the markdown-card
// regex is NOT run (mixing the two would double-count when an agent emits both forms).
// If no JSON fence is found OR the JSON parse fails OR the parsed payload has no
// `findings` array, the markdown-card extractor runs on the original text.
//
// One baseline (critic-plan/plan-with-known-issues.json) has neither shape — its
// `result` is an English-prose summary with no structured findings. That baseline
// returns []; CRIT-10 parity for critic-plan will therefore continue to overlap=1.0
// trivially (baseFindingCount=0 → overlap=|∅|/|∅| → 1.0 by the helper's own zero-div
// guard). The fix is honest about this: it does not paper over the missing structured
// data; it only unblocks the 5 of 6 critics that DO have parseable baselines.
function extractFindingsFromText(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  // (1) JSON-fenced block. Lazy-match the body so multiple fences in one string each
  // get their own pass. The closing ``` is required (avoids consuming the rest of the
  // document if the model emitted only an opening fence).
  const jsonFenceRe = /```json\s*([\s\S]*?)```/g;
  const jsonFindings = [];
  let jm;
  while ((jm = jsonFenceRe.exec(text)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(jm[1]);
    } catch (_err) {
      // Malformed fence — skip this fence, try the next.
      continue;
    }
    if (parsed && Array.isArray(parsed.findings)) {
      for (let i = 0; i < parsed.findings.length; i++) {
        const f = parsed.findings[i] || {};
        jsonFindings.push({
          id: f.id || `extracted-${jsonFindings.length}`,
          severity: (f.severity || 'unknown').toLowerCase(),
          file: f.file || 'N/A',
          lane: (f.lane || 'primary').toLowerCase(),
          title: f.title || '',
          // category preserved if present so bucketKey doesn't fall back to the
          // first-two-words heuristic when the agent emitted a real category.
          category: f.category || undefined,
        });
      }
    }
  }
  if (jsonFindings.length > 0) return jsonFindings;

  // (2) Markdown critic-card fallback (live-agent shape that some agents emit).
  const findings = [];
  const cardRe = /###\s+\[([A-Z]+)\][^\n]*?\n[\s\S]*?\*\*ID:\*\*\s+`?([^`\s]+)`?[\s\S]*?\*\*File:\*\*\s+`?([^`\n]+)`?[\s\S]*?\*\*Severity:\*\*\s+(\w+)[\s\S]*?\*\*Lane:\*\*\s+(\w+)/g;
  let m;
  while ((m = cardRe.exec(text)) !== null) {
    findings.push({
      id: m[2].trim(),
      severity: m[4].toLowerCase(),
      file: m[3].trim(),
      lane: m[5].toLowerCase(),
      title: m[0].split('\n')[0].replace(/###\s+\[[A-Z]+\]\s+/, '').replace(/\s+—.*$/, '').trim(),
    });
  }
  return findings;
}

// Heuristic: derive a category bucket from a finding title when the structured
// `category` field is missing (Phase 1 baselines lack it). Takes the first two
// whitespace-separated words, lowercases, and joins with a hyphen.
//   "Missing requirement coverage in PLAN.md"  -> "missing-requirement"
//   "Dependency cycle between Plans 4 and 6"   -> "dependency-cycle"
// Stability: deterministic — pure function of input string.
function extractCategoryFromTitle(title) {
  return (title || 'unknown').toLowerCase().split(/\s+/).slice(0, 2).join('-');
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

module.exports = {
  runAgentParity,
  SCHEMAS,
  BASELINES_DIR,
  loadBaseline,
  saveBaseline,
  pickMedianByDuration,
  // _internal: exposed for tests/critic-findings-delta-shape.test.cjs (B6 / verify-C-003).
  // Do NOT use these from non-test code; they are heuristics with backfill semantics.
  _internal: { extractFindingsFromText, extractCategoryFromTitle },
};
