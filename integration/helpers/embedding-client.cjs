'use strict';

/**
 * OpenAI / Azure OpenAI Embeddings client wrapper for Phase 2.1 / CRIT-10 comparator.
 *
 * Supports TWO modes — selected automatically by `detectMode()` from process.env:
 *
 *   mode === 'azure'  — Azure OpenAI deployment. Requires:
 *                         AZURE_OPENAI_API_KEY (or AZURE_OPENAI_KEY)
 *                         AZURE_OPENAI_ENDPOINT
 *                         AZURE_OPENAI_EMBEDDING_DEPLOYMENT
 *                       Optional:
 *                         AZURE_OPENAI_API_VERSION (defaults to '2024-02-15-preview')
 *                       Constructed via `new AzureOpenAI({apiKey, endpoint, apiVersion, deployment})`.
 *                       The deployment NAME is passed as the `model` field on each
 *                       embeddings.create() call (Azure routes by deployment, not model
 *                       name — the SDK still expects `model` to be populated).
 *
 *   mode === 'openai' — Vanilla OpenAI. Requires OPENAI_API_KEY. Constructed
 *                       via `new OpenAI({apiKey})`. `model` is the configured
 *                       embedding model (default 'text-embedding-3-small').
 *
 *   mode === 'none'   — Neither configured. `embedTitles` throws
 *                       `OpenAIKeyUnsetError` so the caller in agent-parity.cjs
 *                       routes to the Phase 2 Jaccard fallback (D-CTX-04, D-CTX-05).
 *
 * Detection precedence: Azure wins when both Azure (key + endpoint + embedding
 * deployment) AND OPENAI_API_KEY are present. Rationale: if a user has gone to
 * the trouble of setting the THREE Azure env vars, that is a deliberate choice
 * for their environment and we should not silently route to a stray vanilla key.
 *
 * Phase 2.1 references:
 *   D-CTX-04 — Either Azure (full triple) or OPENAI_API_KEY required for the
 *              primary path; clear early error if neither is set.
 *              `OpenAIKeyUnsetError` is the sentinel the caller in agent-parity.cjs
 *              catches by `.name` to route to the documented Jaccard fallback.
 *   D-CTX-10 — Per-(model, normalized title) disk cache at
 *              `integration/test-fixtures/baselines/embeddings/<critic>/<sha256(model:normalized)>.json`.
 *              In Azure mode the cache key uses the EMBEDDING DEPLOYMENT NAME as the
 *              model — so swapping deployments automatically invalidates the cache.
 *   D-CTX-11 — Batch embedding requests up to 2048 input strings per API call.
 *   D-CTX-15 — Concurrency-safe: never changes cwd, NO module-level mutable state
 *              besides the test-only client factory override (which is null in
 *              production runs), atomic write via tmp-then-rename.
 *
 * Fallback policy LIVES IN THE CALLER (`integration/helpers/agent-parity.cjs`).
 * This module ONLY throws on unrecoverable conditions; the caller decides whether
 * to fall back to Phase 2 Jaccard (D-CTX-05).
 *
 * Public exports:
 *   - `embedTitles(titles, opts)` → Promise<Map<normalizedTitle, number[]>>
 *   - `detectMode()` → {mode, ...}  pure env-only detector for unit tests
 *   - `OpenAIKeyUnsetError` — Error subclass with name === 'OpenAIKeyUnsetError'
 *   - `EMBEDDINGS_CACHE_DIR` — absolute path constant for the on-disk cache root
 *   - `_setClientFactory(fn|null)` — TEST-ONLY seam to inject a mock client
 *                                    factory; pass `null` to restore production
 *                                    behavior. Never call from non-test code.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Defer `require('openai')` to inside `embedTitles` so the unset-key code path
// can throw `OpenAIKeyUnsetError` without paying the SDK init cost (and so the
// unit-test environment without openai installed could in theory still load
// this module to test the error class). Node's own require-cache handles the
// laziness — a per-call `require('openai')` is O(1) after the first call, and
// the only module-level mutable state introduced here is `__clientFactory`,
// which is `null` in production and only set by unit tests via the explicit
// `_setClientFactory` seam (and the test always restores `null` in `after()`).

// ----------------------------------------------------------------------------
// Public sentinel error
// ----------------------------------------------------------------------------

/**
 * Thrown when no usable credentials are configured (neither Azure nor vanilla).
 * The caller in `agent-parity.cjs` catches by `err.name === 'OpenAIKeyUnsetError'`
 * to distinguish "missing key" from network failures, so the WARN message can
 * cite the precise reason.
 *
 * Name preserved as `OpenAIKeyUnsetError` (not generalized to a multi-provider
 * name) so the existing caller-side string match keeps working. The message is
 * generalized to mention both providers.
 */
class OpenAIKeyUnsetError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'OpenAIKeyUnsetError';
  }
}

// ----------------------------------------------------------------------------
// Cache root
// ----------------------------------------------------------------------------

// `integration/helpers/embedding-client.cjs` lives in `integration/helpers/`,
// so `..` resolves to `integration/`. The cache root mirrors the baselines tree.
const EMBEDDINGS_CACHE_DIR = path.resolve(__dirname, '..', 'test-fixtures', 'baselines', 'embeddings');

// ----------------------------------------------------------------------------
// Pure helpers (duplicated with agent-parity.cjs by intent — D-CTX-15 forbids
// shared mutable state; pure functions are free to be duplicated since they
// carry no state and produce identical outputs for identical inputs).
// ----------------------------------------------------------------------------

/**
 * Lowercase + strip leading `[severity]` marker + collapse whitespace + trim.
 * MUST stay byte-identical with `agent-parity.cjs::normalizeForEmbedding` so the
 * cache keys produced here match the lookup the comparator does on retrieval.
 */
function normalizeForEmbedding(title) {
  return (title || '')
    .toLowerCase()
    .replace(/^\s*\[[a-z]+\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cacheKey(model, normalizedTitle) {
  return crypto.createHash('sha256')
    .update(`${model}:${normalizedTitle}`)
    .digest('hex');
}

// ----------------------------------------------------------------------------
// Provider detection
// ----------------------------------------------------------------------------

/**
 * Detect which embeddings backend to use from process.env.
 *
 * Returns one of:
 *   { mode: 'azure', azureKey, azureEndpoint, azureApiVersion, azureEmbeddingDeployment }
 *   { mode: 'openai', apiKey }
 *   { mode: 'none' }
 *
 * Detection precedence: Azure (when ALL THREE of key + endpoint + embedding
 * deployment are set) wins over vanilla OPENAI_API_KEY. The user's deliberate
 * configuration of the Azure-specific triple is taken as an explicit signal
 * for their environment.
 *
 * Azure key resolution accepts EITHER `AZURE_OPENAI_API_KEY` or the legacy
 * `AZURE_OPENAI_KEY` (some installations carry both as duplicates).
 */
function detectMode() {
  const azureKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureEmbeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
  const vanillaKey = process.env.OPENAI_API_KEY;

  if (azureKey && azureEndpoint && azureEmbeddingDeployment) {
    return {
      mode: 'azure',
      azureKey,
      azureEndpoint,
      azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
      azureEmbeddingDeployment,
    };
  }
  if (vanillaKey) {
    return { mode: 'openai', apiKey: vanillaKey };
  }
  return { mode: 'none' };
}

// ----------------------------------------------------------------------------
// Test-only client factory seam
// ----------------------------------------------------------------------------

/**
 * Module-level override for the OpenAI / AzureOpenAI client constructor. When
 * `null` (production) the SDK is loaded via `require('openai')`. When set by a
 * unit test via `_setClientFactory(fn)`, `embedTitles` calls `fn(modeCfg)` to
 * obtain the client instead. The factory MUST return an object whose
 * `.embeddings.create({input, model})` matches the SDK contract (returns
 * `{ data: [ { embedding: number[], index?: number }, ... ] }`).
 *
 * Setting this to a non-null value introduces module-level state and violates
 * the D-CTX-15 "no module-level mutable state" rule — that is why this is
 * explicitly labeled TEST-ONLY and why the seam takes `null` to restore.
 * Tests must call `_setClientFactory(null)` in `after()` to restore.
 */
let __clientFactory = null;

function _setClientFactory(fn) {
  __clientFactory = fn;
}

// ----------------------------------------------------------------------------
// embedTitles
// ----------------------------------------------------------------------------

/**
 * Embed an array of titles via the OpenAI Embeddings API (vanilla or Azure)
 * with a per-(model,title) disk cache.
 *
 * @param {string[]} titles  Raw finding titles. Will be normalized internally;
 *                           duplicates after normalization are de-duped before
 *                           the API call.
 * @param {object}   opts
 * @param {string}   [opts.apiKey]      Vanilla-mode override. If set, forces
 *                                      mode='openai' regardless of env. Throws
 *                                      `OpenAIKeyUnsetError` only when BOTH this
 *                                      and the env-detected mode are absent.
 * @param {string}   [opts.model='text-embedding-3-small']  Embedding model name
 *                                      for vanilla mode. In Azure mode the
 *                                      EMBEDDING DEPLOYMENT NAME is used as the
 *                                      cache-key 'model' instead (so changing
 *                                      Azure deployments invalidates the cache).
 * @param {string}   [opts.cacheBucket='misc']  Subdirectory under EMBEDDINGS_CACHE_DIR
 *                                      where this run's cache files live (typically
 *                                      the critic short name, so per-critic clusters).
 * @param {number}   [opts.timeoutMs=30000]  Per-request timeout for the SDK
 *                                      (mitigates T-2.1-A: DoS via slow upstream).
 * @returns {Promise<Map<string, number[]>>}  Map keyed by NORMALIZED title → embedding
 *                                            vector (Array<number>).
 *
 * Concurrency contract (D-CTX-15):
 *   - Never changes cwd (no chdir calls anywhere in this module).
 *   - No module-level mutable state EXCEPT the test-only `__clientFactory`
 *     override, which is `null` in production runs.
 *   - Cache writes are atomic: tmp file with `${pid}.${now()}` suffix renamed to
 *     the final path. POSIX rename is atomic.
 */
async function embedTitles(titles, opts = {}) {
  // (1) Resolve which mode we're in. `opts.apiKey` forces vanilla mode (back-
  // compat with the Phase 2.1-02 contract where the only override was an
  // explicit vanilla key). Otherwise consult env.
  let modeCfg;
  if (opts.apiKey) {
    modeCfg = { mode: 'openai', apiKey: opts.apiKey };
  } else {
    modeCfg = detectMode();
  }

  if (modeCfg.mode === 'none') {
    throw new OpenAIKeyUnsetError(
      'No embedding-provider credentials are set. ' +
      'Set OPENAI_API_KEY for vanilla OpenAI, OR set the Azure triple ' +
      '(AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_EMBEDDING_DEPLOYMENT) ' +
      'for Azure OpenAI. See https://platform.openai.com/api-keys or your Azure portal.'
    );
  }

  // (2) Resolve the "model" string used both for cache keying AND as the
  // `model` field on the SDK call. In Azure mode this IS the deployment name
  // (Azure routes embeddings.create by deployment, but the SDK still requires
  // a non-empty `model` field on the request payload).
  const model = modeCfg.mode === 'azure'
    ? modeCfg.azureEmbeddingDeployment
    : (opts.model ?? 'text-embedding-3-small');
  const cacheBucket = opts.cacheBucket ?? 'misc';
  const timeoutMs = opts.timeoutMs ?? 30_000;

  // (3) Ensure the cache directory exists.
  const bucketDir = path.join(EMBEDDINGS_CACHE_DIR, cacheBucket);
  fs.mkdirSync(bucketDir, { recursive: true });

  // (4) Walk titles, dedupe on normalized form, classify hit vs miss.
  /** @type {Map<string, number[]>} */
  const result = new Map();
  /** @type {string[]} */
  const missing = [];
  const seen = new Set();

  for (const title of (titles || [])) {
    const normalized = normalizeForEmbedding(title);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (normalized.length === 0) continue;  // skip empty titles; nothing to embed

    const cacheFile = path.join(bucketDir, `${cacheKey(model, normalized)}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (parsed && Array.isArray(parsed.vector)) {
          result.set(normalized, parsed.vector);
          continue;
        }
      } catch (_err) {
        // Corrupted cache entry — treat as miss; will be overwritten by next write.
      }
    }
    missing.push(normalized);
  }

  // (5) All cache-hit fast path.
  if (missing.length === 0) return result;

  // (6) Construct the client. Test-only `__clientFactory` override wins when
  // set; otherwise build via the real SDK. Initialization happens only when a
  // network call is actually needed.
  let client;
  if (__clientFactory) {
    client = __clientFactory(modeCfg);
  } else if (modeCfg.mode === 'azure') {
    // `require('openai')` is cached by Node after the first call (idempotent;
    // no module-level mutable state introduced — D-CTX-15).
    const openaiMod = require('openai');
    const AzureOpenAI = openaiMod.AzureOpenAI;
    if (typeof AzureOpenAI !== 'function') {
      throw new Error(
        "embedding-client: installed 'openai' SDK does not export AzureOpenAI. " +
        "Upgrade to openai >= 4.x (the project pins ^6.37 in package.json)."
      );
    }
    client = new AzureOpenAI({
      apiKey: modeCfg.azureKey,
      endpoint: modeCfg.azureEndpoint,
      apiVersion: modeCfg.azureApiVersion,
      deployment: modeCfg.azureEmbeddingDeployment,
      timeout: timeoutMs,
    });
  } else {
    const openaiMod = require('openai');
    const OpenAI = openaiMod.OpenAI || openaiMod.default || openaiMod;
    client = new OpenAI({ apiKey: modeCfg.apiKey, timeout: timeoutMs });
  }

  // (7) Batch the misses into chunks of ≤2048 (D-CTX-11). Wrap the create()
  // call in a try/catch that annotates network/auth errors with the mode so
  // the caller's WARN can be mode-specific.
  const BATCH_SIZE = 2048;
  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const chunk = missing.slice(start, start + BATCH_SIZE);
    let response;
    try {
      response = await client.embeddings.create({ model, input: chunk });
    } catch (err) {
      // Annotate the error message so the caller's stderr WARN can distinguish
      // an Azure deployment misconfig from a vanilla-key auth issue. The
      // ORIGINAL `err.code` / `err.status` are preserved so `agent-parity.cjs`'s
      // catch-block detection still works.
      if (modeCfg.mode === 'azure') {
        err.message = `Azure embedding deployment '${modeCfg.azureEmbeddingDeployment}' at ${modeCfg.azureEndpoint} failed: ${err.message}`;
      }
      throw err;
    }

    // Defensive: ensure response.data is an array with one entry per input.
    if (!response || !Array.isArray(response.data) || response.data.length !== chunk.length) {
      throw new Error(
        `${modeCfg.mode === 'azure' ? 'Azure ' : ''}embeddings response shape unexpected: ` +
        `data.length=${response && Array.isArray(response.data) ? response.data.length : 'n/a'}, ` +
        `expected ${chunk.length}`
      );
    }

    for (let i = 0; i < response.data.length; i++) {
      // `response.data[i].index` is the SDK-assigned ordinal; in practice it
      // mirrors `i`, but we use the explicit index when present for robustness.
      const entry = response.data[i];
      const idx = (typeof entry.index === 'number') ? entry.index : i;
      const normalized = chunk[idx];
      const vector = entry.embedding;
      if (!Array.isArray(vector)) {
        throw new Error(`embeddings: entry ${i} missing 'embedding' array`);
      }
      result.set(normalized, vector);

      // Atomic write: tmp file then rename.
      const cacheFile = path.join(bucketDir, `${cacheKey(model, normalized)}.json`);
      const tmpFile = `${cacheFile}.tmp.${process.pid}.${Date.now()}.${i}`;
      fs.writeFileSync(tmpFile, JSON.stringify({ model, title: normalized, vector }) + '\n');
      try {
        fs.renameSync(tmpFile, cacheFile);
      } catch (renameErr) {
        // If rename fails (very unusual on Linux), clean up tmp file and rethrow.
        try { fs.unlinkSync(tmpFile); } catch (_unlinkErr) { /* swallow */ }
        throw renameErr;
      }
    }
  }

  return result;
}

module.exports = {
  embedTitles,
  detectMode,
  OpenAIKeyUnsetError,
  EMBEDDINGS_CACHE_DIR,
  _setClientFactory,
};
