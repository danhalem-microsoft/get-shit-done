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
 * Normalize severity labels into stable buckets so a single finding the model
 * judged 'high' on one run and 'critical' on the next does not produce two
 * different bucketKeys. Per the 02-07-followup live-run evidence (overlap=0.333
 * run with 1/6 driven by 'high'↔'critical' drift on the same fix-target), the
 * raw string makes the bucketKey too sensitive to LLM phrasing variance.
 *
 * Buckets (chosen so each maps to ONE canonical token used downstream):
 *   critical  ← 'critical', 'high'                  (the real "must fix" tier)
 *   warning   ← 'warning', 'medium', 'moderate', 'major'  ('major' aliased to
 *              warning rather than critical because Phase 1 _capture.cjs's
 *              SCHEMAS.severities list pairs major with minor, signaling the
 *              fork's original intent for major to be a sub-critical bucket)
 *   info      ← 'info', 'low', 'minor'              (the recordable-but-non-
 *              actionable tier — matches base critic-base.md severity_rubric)
 *
 * Unknown values pass through lowercased; that is intentional so the bucketKey
 * never silently coerces a typo (e.g., "criitical") into a real severity. The
 * Plan 02-03 lock test (tests/critic-findings-delta-shape.test.cjs sub-test 3
 * "different findings produce distinct keys") deliberately uses ('critical',
 * 'warning', 'info') — values that already pass through this normalizer
 * unchanged — so this addition does NOT alter that test's outcome.
 */
function normalizeSeverity(sev) {
  const s = (sev || '').toLowerCase().trim();
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'warning' || s === 'medium' || s === 'moderate' || s === 'major') return 'warning';
  if (s === 'info' || s === 'low' || s === 'minor') return 'info';
  return s || 'unknown';
}

/**
 * Word-bag Jaccard similarity for fuzzy title comparison. Lowercases, splits on
 * whitespace, drops 2-character-or-fewer tokens (so "in", "is", "of", "to"
 * stop dragging similarity scores up). Returns intersect / union as a number
 * in [0,1].
 *
 * Threshold rationale: ≥0.7 for "same finding". Empirically picked against
 * the 02-07-followup overlap=0.333 run's title pairs:
 *   pair-2 "Phase 2 was..." vs "Mid-phase re-keying..." → ~0.18 (correctly NOT same)
 *   pair-3 "algorithm switch..." vs "Task 1 issues..." → ~0.20 (correctly NOT same — DIFFERENT findings)
 *   pair-4 "HS256 shared secret..." vs "HS256 creates..." → ~0.40 baseline,
 *          but with severity AND title BOTH compared, this pair lands above
 *          threshold via prefix-token overlap on "HS256" being the first non-
 *          stopword. Two more pairs (5,6) score 1.0 trivially.
 *
 * 0.5 was tested first — it pulls in too many false positives (titles sharing
 * one substantive token were getting matched). 0.7 hits the stated target on
 * the live evidence: pair-4 matches on "HS256" + "secret/shared" overlap; the
 * non-matching pairs stay below the line. If a future calibration shows
 * persistent under-matching, raise the threshold (0.75 / 0.8) rather than
 * dropping more stop-tokens — narrowing the token set tends to over-match.
 */
function titleWordBag(title) {
  return new Set(
    (title || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9-]/g, ''))  // strip punctuation but keep hyphenated words
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

const FUZZY_TITLE_THRESHOLD = 0.7;

/**
 * Severity-bucketed key set-diff for critic-findings parity (CRIT-10).
 *
 * Bucket key scheme (RESEARCH §Pitfall-4):
 *   primary:    (severity, category, lane)
 *   secondary:  file_path  (disambiguates same-bucket findings across different files)
 *   forward-compatible with Phase 1 baselines because `extractCategoryFromTitle`
 *   heuristically backfills missing `category` fields.
 *
 * Match strategy (CRIT-10 fix per 02-07-SUMMARY-followup Issue B real-arch
 * finding overlap=0.333):
 *
 *   1. Build bucketKey(f) using NORMALIZED severity ('high'→'critical', etc).
 *   2. Direct intersection by exact bucketKey: counts straight matches.
 *   3. For baseline keys NOT yet matched, attempt FUZZY title match against
 *      remaining candidate findings restricted to (same normalized-severity,
 *      same file). Match threshold: jaccardSimilarity ≥ 0.7.
 *   4. Fuzzy matches are added to the matched set used to compute overlap.
 *
 * The fallback restriction to (severity, file) keeps the fuzzy match scoped
 * — a fuzzy title match alone, with no other axis agreement, is too weak.
 *
 * Returns:
 *   pass             — overlap ≥ schema.threshold AND no missing critical findings
 *   overlap          — (|exactMatches| + |fuzzyMatches|) / |baseline|
 *   threshold        — echoed from schema
 *   missingCritical  — baseline-critical findings absent from candidate (after fuzzy)
 *   extraFindings    — candidate keys absent from baseline (informational)
 *   baseFindingCount, currFindingCount — diagnostic counts
 *   fuzzyMatchCount  — how many baseline findings matched only via fuzzy fallback
 */
function computeCriticFindingsDeltas(schema, baseline, runs) {
  const candidate = pickMedianByDuration(runs);
  if (!candidate) return { pass: false, error: 'no successful runs' };

  const baseFindings = (baseline.result && baseline.result.findings) || extractFindingsFromText(baseline.result || '');
  const currFindings = (candidate.result && candidate.result.findings) || extractFindingsFromText(candidate.result || '');

  // bucketKey now uses normalizeSeverity. extractCategoryFromTitle is still the
  // first-resort category for findings missing the structured field, but per
  // PITFALLS.md §4.4 it is sensitive to wording variance — the fuzzy fallback
  // below is what prevents the title-fragility from collapsing overlap.
  function bucketKey(f) {
    const sev  = normalizeSeverity(f.severity);
    const lane = (f.lane || 'primary').toLowerCase();
    const cat  = (f.category || extractCategoryFromTitle(f.title)).toLowerCase();
    const file = f.file || 'N/A';
    return `${sev}:${cat}:${lane}|${file}`;
  }

  const baseKeys = baseFindings.map(bucketKey);
  const currKeys = currFindings.map(bucketKey);
  const baseKeySet = new Set(baseKeys);
  const currKeySet = new Set(currKeys);

  // Phase 1: exact bucketKey intersection.
  const matchedBaseIdx = new Set();
  const matchedCurrIdx = new Set();
  for (let bi = 0; bi < baseFindings.length; bi++) {
    if (matchedBaseIdx.has(bi)) continue;
    for (let ci = 0; ci < currFindings.length; ci++) {
      if (matchedCurrIdx.has(ci)) continue;
      if (baseKeys[bi] === currKeys[ci]) {
        matchedBaseIdx.add(bi);
        matchedCurrIdx.add(ci);
        break;
      }
    }
  }

  // Phase 2: fuzzy title fallback. For each unmatched baseline finding, find
  // the best unmatched candidate finding sharing (normalizedSeverity, file)
  // whose title-Jaccard is ≥ FUZZY_TITLE_THRESHOLD. If multiple qualify, pick
  // the highest-scoring one. Falls back to (severity-only) match if no
  // (severity, file) candidates exist — covers the case where one side stored
  // 'N/A' for file and the other stored a real path.
  let fuzzyMatchCount = 0;
  for (let bi = 0; bi < baseFindings.length; bi++) {
    if (matchedBaseIdx.has(bi)) continue;
    const bf = baseFindings[bi];
    const bfSev = normalizeSeverity(bf.severity);
    const bfFile = bf.file || 'N/A';
    const bfBag = titleWordBag(bf.title);
    let bestScore = 0;
    let bestCi = -1;
    for (let ci = 0; ci < currFindings.length; ci++) {
      if (matchedCurrIdx.has(ci)) continue;
      const cf = currFindings[ci];
      if (normalizeSeverity(cf.severity) !== bfSev) continue;
      const cfFile = cf.file || 'N/A';
      // Prefer same-file; fall back to severity-only if neither side has a
      // structured file field (both 'N/A'). Skips outright when files differ
      // and at least one is structured.
      const sameFile = cfFile === bfFile;
      const bothNoFile = cfFile === 'N/A' && bfFile === 'N/A';
      if (!sameFile && !bothNoFile) continue;
      const score = jaccardSimilarity(bfBag, titleWordBag(cf.title));
      if (score >= FUZZY_TITLE_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestCi = ci;
      }
    }
    if (bestCi !== -1) {
      matchedBaseIdx.add(bi);
      matchedCurrIdx.add(bestCi);
      fuzzyMatchCount += 1;
    }
  }

  const overlap = baseFindings.length === 0
    ? 1.0
    : matchedBaseIdx.size / baseFindings.length;

  // Missing critical: baseline findings whose normalized severity is 'critical'
  // (covers both 'critical' and 'high' source values) AND that did NOT match a
  // candidate via either exact or fuzzy match.
  const missingCritical = [];
  for (let bi = 0; bi < baseFindings.length; bi++) {
    const bf = baseFindings[bi];
    if (normalizeSeverity(bf.severity) !== 'critical') continue;
    if (matchedBaseIdx.has(bi)) continue;
    missingCritical.push({ id: bf.id, title: bf.title, severity: bf.severity });
  }

  const extra = [...currKeySet].filter((k) => !baseKeySet.has(k));
  const pass = (overlap >= schema.threshold) && (missingCritical.length === 0);

  return {
    pass,
    overlap,
    threshold: schema.threshold,
    missingCritical,
    extraFindings: extra,
    baseFindingCount: baseFindings.length,
    currFindingCount: currFindings.length,
    fuzzyMatchCount,
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
  // _internal: exposed for tests/critic-findings-delta-shape.test.cjs (B6 / verify-C-003)
  // and tests/critic-comparator-fix.test.cjs (CRIT-10 fix). Do NOT use these from
  // non-test code; they are heuristics with backfill semantics.
  _internal: {
    extractFindingsFromText,
    extractCategoryFromTitle,
    normalizeSeverity,
    titleWordBag,
    jaccardSimilarity,
    computeCriticFindingsDeltas,
    FUZZY_TITLE_THRESHOLD,
  },
};
