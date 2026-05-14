'use strict';

/**
 * RED test for Phase 2.1 / CRIT-10 gap closure.
 *
 * GREEN TARGET: Plan 02.1-02 will add the embedding-path symbols to
 *   integration/helpers/agent-parity.cjs `_internal`:
 *     cosineSimilarity, normalizeForEmbedding, embeddingCacheKey,
 *     COSINE_TITLE_THRESHOLD, EMBEDDING_MODEL_DEFAULT, getEmbeddingModel,
 *     computeCriticFindingsDeltasEmbedding
 *
 * This file LOCKS the contract Plan 02.1-02 must satisfy. At this commit the
 * symbols above DO NOT EXIST yet — the file imports cleanly (no SyntaxError, no
 * MODULE_NOT_FOUND) but the destructured symbols are `undefined`. Every sub-test
 * fails with an `assert`-shaped message naming the missing symbol or violated
 * behavior. This is RED-by-contract: failures point at exactly which API is
 * missing or wrong, NOT at a syntactic or module-resolution problem.
 *
 * RUNTIME MODEL (CRITICAL):
 *   - This file NEVER makes a live API call to OpenAI.
 *   - Group D (primary path) injects pre-computed embedding vectors via
 *     `embeddingsByTitle: Map<normalizedTitle, vector>`. Plan 02.1-02 must
 *     accept this injection so unit tests stay offline.
 *   - Group E (fallback path) deliberately UNSETS `process.env.OPENAI_API_KEY`
 *     inside a `before()` hook and RESTORES it in `after()` — leak-safe.
 *
 * GROUPS:
 *   A. Primitives — cosineSimilarity (5 sub-tests)
 *   B. Normalization + cache key (5 sub-tests)
 *   C. Constants + config (5 sub-tests)
 *   D. Comparator primary path (1 load-bearing sub-test: CRIT-10 root-cause case)
 *   E. Fallback path (1 sub-test: OPENAI_API_KEY unset → useFallback=true + stderr warning)
 *   F. Diagnosis output (1 sub-test: perFindingDiagnosis shape)
 *
 * Sub-test count: 18 total. Plan 02.1-01 contract requires ≥10.
 *
 * Per D-CTX-15 / Phase 1 D-04 concurrency contract: no `process.chdir`, no shared
 * module-state mutation outside the scoped Group E describe block (env-var
 * mutation lives in `before/after` hooks scoped to that ONE describe block).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const parity = require('../integration/helpers/agent-parity.cjs');

// Import succeeds — the file exists from Phase 2. The destructured names are
// the ones Plan 02.1-02 will add. At this commit each is `undefined`; the
// per-test assertions below report that explicitly.
const internal = parity._internal;

assert.ok(internal, 'agent-parity.cjs must expose _internal namespace (Phase 1 / Phase 2 contract).');

// -----------------------------------------------------------------------------
// Synthetic-vector helpers — no external deps; deterministic; offline-only.
// -----------------------------------------------------------------------------

/**
 * Make a 1536-dim unit vector with `v[0] = 1` (a standard basis vector).
 * Used as the "baseline" vector for cosine comparisons.
 */
function makeBasisVec(dim = 1536) {
  const v = new Array(dim).fill(0);
  v[0] = 1;
  return v;
}

/**
 * Make a 1536-dim unit vector b such that cosineSimilarity(makeBasisVec(), b) === `cosine`.
 *   b[0] = cosine
 *   b[1] = sqrt(1 - cosine^2)
 *   rest = 0
 * Both vectors have unit norm so dot(a, b) === b[0] === cosine.
 */
function makeVecCosine(cosine, dim = 1536) {
  const v = new Array(dim).fill(0);
  v[0] = cosine;
  v[1] = Math.sqrt(1 - cosine * cosine);
  return v;
}

/** Orthogonal partner to makeBasisVec() — b[1] = 1, rest 0. */
function makeOrthogonalVec(dim = 1536) {
  const v = new Array(dim).fill(0);
  v[1] = 1;
  return v;
}

// =============================================================================
// Group A — cosineSimilarity primitives
// =============================================================================
describe('Phase 2.1 RED: Group A — cosineSimilarity primitives', () => {
  test('A1: cosineSimilarity returns 1.0 for two identical 1536-dim vectors', () => {
    assert.strictEqual(
      typeof internal.cosineSimilarity, 'function',
      `expected typeof _internal.cosineSimilarity === 'function', got '${typeof internal.cosineSimilarity}'`,
    );
    const a = makeBasisVec();
    const b = makeBasisVec();
    const cos = internal.cosineSimilarity(a, b);
    assert.ok(Math.abs(cos - 1.0) < 1e-9,
      `expected cosineSimilarity(a, a) ≈ 1.0, got ${cos}`);
  });

  test('A2: cosineSimilarity returns ~0 (within 1e-9) for two orthogonal vectors', () => {
    assert.strictEqual(typeof internal.cosineSimilarity, 'function',
      `expected typeof _internal.cosineSimilarity === 'function', got '${typeof internal.cosineSimilarity}'`);
    const a = makeBasisVec();
    const b = makeOrthogonalVec();
    const cos = internal.cosineSimilarity(a, b);
    assert.ok(Math.abs(cos) < 1e-9,
      `expected cosineSimilarity(e0, e1) ≈ 0, got ${cos}`);
  });

  test('A3: cosineSimilarity is symmetric: cos(a,b) === cos(b,a)', () => {
    assert.strictEqual(typeof internal.cosineSimilarity, 'function',
      `expected typeof _internal.cosineSimilarity === 'function', got '${typeof internal.cosineSimilarity}'`);
    const a = makeBasisVec();
    const b = makeVecCosine(0.42);
    const ab = internal.cosineSimilarity(a, b);
    const ba = internal.cosineSimilarity(b, a);
    assert.ok(Math.abs(ab - ba) < 1e-12,
      `expected cosineSimilarity to be symmetric, got cos(a,b)=${ab}, cos(b,a)=${ba}`);
  });

  test('A4: cosineSimilarity handles zero-vector input by returning 0 (no NaN)', () => {
    assert.strictEqual(typeof internal.cosineSimilarity, 'function',
      `expected typeof _internal.cosineSimilarity === 'function', got '${typeof internal.cosineSimilarity}'`);
    const zero = new Array(1536).fill(0);
    const a = makeBasisVec();
    const cos = internal.cosineSimilarity(zero, a);
    assert.strictEqual(cos, 0,
      `expected cosineSimilarity(zeroVec, a) === 0 (defensive guard), got ${cos} (Number.isNaN=${Number.isNaN(cos)})`);
    const cos2 = internal.cosineSimilarity(a, zero);
    assert.strictEqual(cos2, 0,
      `expected cosineSimilarity(a, zeroVec) === 0 (defensive guard), got ${cos2}`);
  });

  test('A5: cosineSimilarity throws on mismatched-length vectors', () => {
    assert.strictEqual(typeof internal.cosineSimilarity, 'function',
      `expected typeof _internal.cosineSimilarity === 'function', got '${typeof internal.cosineSimilarity}'`);
    const a = makeBasisVec(1536);
    const b = makeBasisVec(1024);
    assert.throws(
      () => internal.cosineSimilarity(a, b),
      /length|dim|dimension/i,
      'expected cosineSimilarity to throw an Error mentioning length/dim on mismatched-length vectors',
    );
  });
});

// =============================================================================
// Group B — normalization + cache key
// =============================================================================
describe('Phase 2.1 RED: Group B — normalizeForEmbedding + embeddingCacheKey', () => {
  test("B1: normalizeForEmbedding strips leading [CRITICAL], lowercases, collapses whitespace", () => {
    assert.strictEqual(typeof internal.normalizeForEmbedding, 'function',
      `expected typeof _internal.normalizeForEmbedding === 'function', got '${typeof internal.normalizeForEmbedding}'`);
    const result = internal.normalizeForEmbedding('  [CRITICAL] SQL Injection ');
    assert.strictEqual(result, 'sql injection',
      `expected normalizeForEmbedding('  [CRITICAL] SQL Injection ') === 'sql injection', got ${JSON.stringify(result)}`);
  });

  test("B2: normalizeForEmbedding handles [high] severity marker (case-insensitive)", () => {
    assert.strictEqual(typeof internal.normalizeForEmbedding, 'function',
      `expected typeof _internal.normalizeForEmbedding === 'function', got '${typeof internal.normalizeForEmbedding}'`);
    const result = internal.normalizeForEmbedding('[high]  Missing  validation');
    assert.strictEqual(result, 'missing validation',
      `expected normalizeForEmbedding('[high]  Missing  validation') === 'missing validation', got ${JSON.stringify(result)}`);
  });

  test("B3: embeddingCacheKey varies by model name (model participates in key)", () => {
    assert.strictEqual(typeof internal.embeddingCacheKey, 'function',
      `expected typeof _internal.embeddingCacheKey === 'function', got '${typeof internal.embeddingCacheKey}'`);
    const k1 = internal.embeddingCacheKey('text-embedding-3-small', 'foo');
    const k2 = internal.embeddingCacheKey('text-embedding-ada-002', 'foo');
    assert.notStrictEqual(k1, k2,
      'expected embeddingCacheKey to differ when model name changes, but keys were identical');
  });

  test("B4: embeddingCacheKey varies by title (title participates in key)", () => {
    assert.strictEqual(typeof internal.embeddingCacheKey, 'function',
      `expected typeof _internal.embeddingCacheKey === 'function', got '${typeof internal.embeddingCacheKey}'`);
    const k1 = internal.embeddingCacheKey('text-embedding-3-small', 'foo');
    const k2 = internal.embeddingCacheKey('text-embedding-3-small', 'bar');
    assert.notStrictEqual(k1, k2,
      'expected embeddingCacheKey to differ when title changes, but keys were identical');
  });

  test("B5: embeddingCacheKey is deterministic; returns 64-char lowercase hex (sha256)", () => {
    assert.strictEqual(typeof internal.embeddingCacheKey, 'function',
      `expected typeof _internal.embeddingCacheKey === 'function', got '${typeof internal.embeddingCacheKey}'`);
    const k1 = internal.embeddingCacheKey('m', 't');
    const k2 = internal.embeddingCacheKey('m', 't');
    assert.strictEqual(k1, k2,
      `expected embeddingCacheKey to be deterministic, got two different values for ('m','t'): ${k1} vs ${k2}`);
    assert.match(k1, /^[0-9a-f]{64}$/,
      `expected embeddingCacheKey output to be 64-char lowercase hex (sha256), got ${JSON.stringify(k1)}`);
  });
});

// =============================================================================
// Group C — constants + config
// =============================================================================
describe('Phase 2.1 RED: Group C — constants + getEmbeddingModel', () => {
  test('C1: COSINE_TITLE_THRESHOLD === 0.80', () => {
    assert.strictEqual(internal.COSINE_TITLE_THRESHOLD, 0.80,
      `expected _internal.COSINE_TITLE_THRESHOLD === 0.80, got ${internal.COSINE_TITLE_THRESHOLD} (typeof ${typeof internal.COSINE_TITLE_THRESHOLD})`);
  });

  test("C2: EMBEDDING_MODEL_DEFAULT === 'text-embedding-3-small'", () => {
    assert.strictEqual(internal.EMBEDDING_MODEL_DEFAULT, 'text-embedding-3-small',
      `expected _internal.EMBEDDING_MODEL_DEFAULT === 'text-embedding-3-small', got ${JSON.stringify(internal.EMBEDDING_MODEL_DEFAULT)} (typeof ${typeof internal.EMBEDDING_MODEL_DEFAULT})`);
  });

  test("C3: getEmbeddingModel returns config.workflow.embedding_model when set", () => {
    assert.strictEqual(typeof internal.getEmbeddingModel, 'function',
      `expected typeof _internal.getEmbeddingModel === 'function', got '${typeof internal.getEmbeddingModel}'`);
    const result = internal.getEmbeddingModel({ workflow: { embedding_model: 'custom-model' } });
    assert.strictEqual(result, 'custom-model',
      `expected getEmbeddingModel({workflow:{embedding_model:'custom-model'}}) === 'custom-model', got ${JSON.stringify(result)}`);
  });

  test("C4: getEmbeddingModel falls back to default when workflow.embedding_model unset", () => {
    assert.strictEqual(typeof internal.getEmbeddingModel, 'function',
      `expected typeof _internal.getEmbeddingModel === 'function', got '${typeof internal.getEmbeddingModel}'`);
    const result = internal.getEmbeddingModel({ workflow: {} });
    assert.strictEqual(result, 'text-embedding-3-small',
      `expected getEmbeddingModel({workflow:{}}) === 'text-embedding-3-small', got ${JSON.stringify(result)}`);
  });

  test("C5: getEmbeddingModel defensively handles null config", () => {
    assert.strictEqual(typeof internal.getEmbeddingModel, 'function',
      `expected typeof _internal.getEmbeddingModel === 'function', got '${typeof internal.getEmbeddingModel}'`);
    const result = internal.getEmbeddingModel(null);
    assert.strictEqual(result, 'text-embedding-3-small',
      `expected getEmbeddingModel(null) === 'text-embedding-3-small' (defensive), got ${JSON.stringify(result)}`);
  });
});

// =============================================================================
// Group D — comparator primary path (THE LOAD-BEARING TEST)
// =============================================================================
describe('Phase 2.1 RED: Group D — embedding-match rescues low-Jaccard paraphrase (CRIT-10 root cause)', () => {
  test('D1: comparator matches paraphrased findings via cosine when Jaccard fails (the load-bearing CRIT-10 case)', () => {
    assert.strictEqual(typeof internal.computeCriticFindingsDeltasEmbedding, 'function',
      `expected typeof _internal.computeCriticFindingsDeltasEmbedding === 'function', got '${typeof internal.computeCriticFindingsDeltasEmbedding}'`);
    assert.strictEqual(typeof internal.normalizeForEmbedding, 'function',
      `expected typeof _internal.normalizeForEmbedding === 'function' (needed to key the embeddings map), got '${typeof internal.normalizeForEmbedding}'`);

    const schema = parity.SCHEMAS['critic-findings']; // threshold 0.85

    // The CRIT-10 root-cause pair from 02-07-SUMMARY-fixes.md:
    //   baseline: "No input validation on req.body.email"
    //   candidate: "Missing input validation on email parameter"
    // Jaccard ≈ 0.333 (below 0.7 fuzzy threshold). Cosine === 0.87 (above 0.80).
    const baselineTitle = 'No input validation on req.body.email';
    const candidateTitle = 'Missing input validation on email parameter';

    const baseline = {
      result: {
        findings: [
          {
            id: 'b1',
            severity: 'critical',
            lane: 'primary',
            file: 'src/api/users.ts:14',
            title: baselineTitle,
          },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          {
            id: 'c1',
            severity: 'critical',
            lane: 'primary',
            file: 'src/api/users.ts:14',
            title: candidateTitle,
          },
        ],
      },
    };

    // Pre-computed embeddings: synthetic 1536-dim unit vectors whose cosine === 0.87.
    const vecBaseline = makeBasisVec();
    const vecCandidate = makeVecCosine(0.87);
    const embeddingsByTitle = new Map([
      [internal.normalizeForEmbedding(baselineTitle), vecBaseline],
      [internal.normalizeForEmbedding(candidateTitle), vecCandidate],
    ]);

    const result = internal.computeCriticFindingsDeltasEmbedding(
      schema,
      baseline,
      [candidate],
      { embeddingsByTitle },
    );

    assert.strictEqual(result.cosineMatchCount, 1,
      `expected cosineMatchCount === 1 (the paraphrase pair should match via cosine ≥ 0.80), got cosineMatchCount=${result.cosineMatchCount} (fuzzyMatchCount=${result.fuzzyMatchCount}, overlap=${result.overlap})`);
    assert.strictEqual(result.fuzzyMatchCount, 0,
      `expected fuzzyMatchCount === 0 (Jaccard ≈ 0.333 is below the 0.7 fuzzy threshold), got ${result.fuzzyMatchCount}`);
    assert.strictEqual(result.overlap, 1.0,
      `expected overlap === 1.0 (the only baseline finding was matched), got ${result.overlap}`);
    assert.strictEqual(result.pass, true,
      `expected pass === true (overlap=1.0 ≥ threshold=0.85 and no missing critical), got pass=${result.pass}`);
  });
});

// =============================================================================
// Group E — fallback path (scoped env-var mutation)
// =============================================================================
describe('Phase 2.1 RED: Group E — fallback when OPENAI_API_KEY is unset', () => {
  // Scoped env-var mutation. Stores the original value (or `undefined` sentinel
  // if unset) and restores it in `after()`. Concurrency-safe per D-CTX-15 /
  // Phase 1 D-04: scoped to THIS describe block only.
  const ORIGINAL_API_KEY_PRESENT = Object.prototype.hasOwnProperty.call(process.env, 'OPENAI_API_KEY');
  const ORIGINAL_API_KEY_VALUE = process.env.OPENAI_API_KEY;

  before(() => {
    delete process.env.OPENAI_API_KEY;
  });

  after(() => {
    if (ORIGINAL_API_KEY_PRESENT) {
      process.env.OPENAI_API_KEY = ORIGINAL_API_KEY_VALUE;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test('E1: comparator returns usedFallback=true + fallbackReason + stderr warning when OPENAI_API_KEY is unset and embeddingsByTitle missing', () => {
    assert.strictEqual(typeof internal.computeCriticFindingsDeltasEmbedding, 'function',
      `expected typeof _internal.computeCriticFindingsDeltasEmbedding === 'function', got '${typeof internal.computeCriticFindingsDeltasEmbedding}'`);

    const schema = parity.SCHEMAS['critic-findings'];
    const baseline = {
      result: {
        findings: [
          { id: 'b1', severity: 'warning', lane: 'primary', file: 'N/A', title: 'Some finding title' },
        ],
      },
    };
    const candidate = {
      success: true,
      duration_ms: 100,
      result: {
        findings: [
          { id: 'c1', severity: 'warning', lane: 'primary', file: 'N/A', title: 'Some finding title' },
        ],
      },
    };

    // Monkey-patch process.stderr.write to capture warnings emitted during the call.
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks = [];
    process.stderr.write = (chunk, ...rest) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return originalStderrWrite(chunk, ...rest);
    };

    let result;
    try {
      result = internal.computeCriticFindingsDeltasEmbedding(
        schema,
        baseline,
        [candidate],
        { allowFallback: true },
      );
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    // Did NOT throw — comparator returned a valid result.
    assert.ok(result && typeof result === 'object',
      'expected computeCriticFindingsDeltasEmbedding to return a result object on the fallback path, not throw');

    assert.strictEqual(result.usedFallback, true,
      `expected result.usedFallback === true when OPENAI_API_KEY unset + embeddingsByTitle absent, got usedFallback=${result.usedFallback}`);
    assert.strictEqual(result.fallbackReason, 'OPENAI_API_KEY unset',
      `expected result.fallbackReason === 'OPENAI_API_KEY unset', got ${JSON.stringify(result.fallbackReason)}`);

    // Shape preservation: result still has the Phase 2 keys.
    for (const key of ['pass', 'overlap', 'missingCritical', 'extraFindings', 'baseFindingCount', 'currFindingCount', 'fuzzyMatchCount']) {
      assert.ok(Object.prototype.hasOwnProperty.call(result, key),
        `expected fallback result to preserve Phase 2 key '${key}', but it was absent`);
    }

    const stderrText = stderrChunks.join('');
    assert.match(stderrText, /WARN: embedding API unavailable/,
      `expected stderr to include /WARN: embedding API unavailable/ when fallback fires, got: ${JSON.stringify(stderrText.slice(0, 500))}`);
  });
});

// =============================================================================
// Group F — diagnosis output
// =============================================================================
describe('Phase 2.1 RED: Group F — perFindingDiagnosis shape', () => {
  test('F1: perFindingDiagnosis has one entry per baseline finding; matched entries cosine≥0.80, unmatched entry shows best candidate + cosine', () => {
    assert.strictEqual(typeof internal.computeCriticFindingsDeltasEmbedding, 'function',
      `expected typeof _internal.computeCriticFindingsDeltasEmbedding === 'function', got '${typeof internal.computeCriticFindingsDeltasEmbedding}'`);
    assert.strictEqual(typeof internal.normalizeForEmbedding, 'function',
      `expected typeof _internal.normalizeForEmbedding === 'function', got '${typeof internal.normalizeForEmbedding}'`);

    const schema = parity.SCHEMAS['critic-findings'];

    // 4 baseline findings; 3 candidates with high cosine; 1 candidate with
    // low cosine (0.45) for the 4th baseline.
    const baselineFindings = [
      { id: 'b1', severity: 'critical', lane: 'primary', file: 'a.ts:1', title: 'Baseline finding alpha' },
      { id: 'b2', severity: 'critical', lane: 'primary', file: 'a.ts:2', title: 'Baseline finding beta' },
      { id: 'b3', severity: 'critical', lane: 'primary', file: 'a.ts:3', title: 'Baseline finding gamma' },
      { id: 'b4', severity: 'critical', lane: 'primary', file: 'a.ts:4', title: 'Baseline finding delta' },
    ];
    const candidateFindings = [
      { id: 'c1', severity: 'critical', lane: 'primary', file: 'a.ts:1', title: 'Candidate paraphrase alpha' },
      { id: 'c2', severity: 'critical', lane: 'primary', file: 'a.ts:2', title: 'Candidate paraphrase beta' },
      { id: 'c3', severity: 'critical', lane: 'primary', file: 'a.ts:3', title: 'Candidate paraphrase gamma' },
      { id: 'c4', severity: 'critical', lane: 'primary', file: 'a.ts:4', title: 'Unrelated candidate epsilon' },
    ];

    // Construct embeddings such that b1↔c1, b2↔c2, b3↔c3 all hit cosine 0.90
    // (above 0.80), while b4 has no match above 0.80 — b4's best candidate is
    // c4 with cosine 0.45.
    const embeddingsByTitle = new Map();
    embeddingsByTitle.set(internal.normalizeForEmbedding('Baseline finding alpha'), makeBasisVec());
    embeddingsByTitle.set(internal.normalizeForEmbedding('Candidate paraphrase alpha'), makeVecCosine(0.90));
    embeddingsByTitle.set(internal.normalizeForEmbedding('Baseline finding beta'), makeBasisVec());
    embeddingsByTitle.set(internal.normalizeForEmbedding('Candidate paraphrase beta'), makeVecCosine(0.90));
    embeddingsByTitle.set(internal.normalizeForEmbedding('Baseline finding gamma'), makeBasisVec());
    embeddingsByTitle.set(internal.normalizeForEmbedding('Candidate paraphrase gamma'), makeVecCosine(0.90));
    embeddingsByTitle.set(internal.normalizeForEmbedding('Baseline finding delta'), makeBasisVec());
    embeddingsByTitle.set(internal.normalizeForEmbedding('Unrelated candidate epsilon'), makeVecCosine(0.45));

    const baseline = { result: { findings: baselineFindings } };
    const candidate = { success: true, duration_ms: 100, result: { findings: candidateFindings } };

    const result = internal.computeCriticFindingsDeltasEmbedding(
      schema,
      baseline,
      [candidate],
      { embeddingsByTitle },
    );

    assert.ok(Array.isArray(result.perFindingDiagnosis),
      `expected result.perFindingDiagnosis to be an Array, got ${typeof result.perFindingDiagnosis} (${result.perFindingDiagnosis})`);
    assert.strictEqual(result.perFindingDiagnosis.length, 4,
      `expected perFindingDiagnosis.length === 4 (one entry per baseline), got ${result.perFindingDiagnosis.length}`);

    // Find the diagnosis for b4 (the unmatched one).
    const b4Diag = result.perFindingDiagnosis.find((d) => d.baselineId === 'b4');
    assert.ok(b4Diag,
      `expected a perFindingDiagnosis entry with baselineId === 'b4', got: ${JSON.stringify(result.perFindingDiagnosis.map((d) => d.baselineId))}`);
    assert.strictEqual(b4Diag.bestCandidateId, 'c4',
      `expected b4Diag.bestCandidateId === 'c4' (the only remaining candidate), got ${JSON.stringify(b4Diag.bestCandidateId)}`);
    assert.ok(Math.abs(b4Diag.cosine - 0.45) < 1e-6,
      `expected b4Diag.cosine ≈ 0.45, got ${b4Diag.cosine}`);

    // The matched baselines should all have cosine >= 0.80.
    for (const id of ['b1', 'b2', 'b3']) {
      const diag = result.perFindingDiagnosis.find((d) => d.baselineId === id);
      assert.ok(diag, `expected perFindingDiagnosis entry for baselineId === '${id}'`);
      assert.ok(diag.cosine >= 0.80,
        `expected perFindingDiagnosis[${id}].cosine >= 0.80 (matched), got ${diag.cosine}`);
    }
  });
});
