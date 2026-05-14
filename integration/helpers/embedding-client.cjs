'use strict';

/**
 * OpenAI Embeddings API client wrapper for Phase 2.1 / CRIT-10 comparator.
 *
 * Phase 2.1 references:
 *   D-CTX-04 — OPENAI_API_KEY required for primary path; clear early error if absent.
 *              `OpenAIKeyUnsetError` is the sentinel the caller in agent-parity.cjs
 *              catches by `.name` to route to the documented Jaccard fallback.
 *   D-CTX-10 — Per-(model, normalized title) disk cache at
 *              `integration/test-fixtures/baselines/embeddings/<critic>/<sha256(model:normalized)>.json`.
 *              Cache key includes model name → automatic invalidation on model change.
 *              File contents: `{model, title, vector}` so a manual `diff` reveals the embedded text.
 *   D-CTX-11 — Batch embedding requests up to 2048 input strings per OpenAI call.
 *   D-CTX-15 — Concurrency-safe: never changes cwd, NO module-level mutable state,
 *              atomic write via tmp-then-rename (POSIX rename is atomic; Linux test env).
 *
 * Fallback policy LIVES IN THE CALLER (`integration/helpers/agent-parity.cjs`).
 * This module ONLY throws on unrecoverable conditions; the caller decides whether
 * to fall back to Phase 2 Jaccard (D-CTX-05).
 *
 * Public exports:
 *   - `embedTitles(titles, opts)` → Promise<Map<normalizedTitle, number[]>>
 *   - `OpenAIKeyUnsetError` — Error subclass with name === 'OpenAIKeyUnsetError'
 *   - `EMBEDDINGS_CACHE_DIR` — absolute path constant for the on-disk cache root
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Defer `require('openai')` to inside `embedTitles` so the unset-key code path
// can throw `OpenAIKeyUnsetError` without paying the SDK init cost (and so the
// unit-test environment without openai installed could in theory still load
// this module to test the error class). Node's own require-cache handles the
// laziness — a per-call `require('openai')` is O(1) after the first call, and
// no module-level mutable state is introduced here (D-CTX-15).

// ----------------------------------------------------------------------------
// Public sentinel error
// ----------------------------------------------------------------------------

/**
 * Thrown when neither `opts.apiKey` nor `process.env.OPENAI_API_KEY` is set.
 * The caller in `agent-parity.cjs` catches by `err.name === 'OpenAIKeyUnsetError'`
 * to distinguish "missing key" from network failures, so the WARN message can
 * cite the precise reason.
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
// embedTitles
// ----------------------------------------------------------------------------

/**
 * Embed an array of titles via the OpenAI Embeddings API with a per-(model,title)
 * disk cache.
 *
 * @param {string[]} titles  Raw finding titles. Will be normalized internally;
 *                           duplicates after normalization are de-duped before
 *                           the API call.
 * @param {object}   opts
 * @param {string}   [opts.apiKey]      Falls back to `process.env.OPENAI_API_KEY`.
 *                                      Throws `OpenAIKeyUnsetError` if both are absent.
 * @param {string}   [opts.model='text-embedding-3-small']  Embedding model name.
 *                                      Participates in the cache key, so changing
 *                                      the model automatically invalidates the cache.
 * @param {string}   [opts.cacheBucket='misc']  Subdirectory under EMBEDDINGS_CACHE_DIR
 *                                      where this run's cache files live (typically
 *                                      the critic short name, so per-critic clusters).
 * @param {number}   [opts.timeoutMs=30000]  Per-request timeout for the OpenAI SDK
 *                                      (mitigates T-2.1-A: DoS via slow upstream).
 * @returns {Promise<Map<string, number[]>>}  Map keyed by NORMALIZED title → embedding
 *                                            vector (Array<number>).
 *
 * Concurrency contract (D-CTX-15):
 *   - Never changes cwd (no chdir calls anywhere in this module).
 *   - No module-level mutable state beyond the lazy-loaded SDK constructor cache
 *     (idempotent: re-load of `require('openai')` is a no-op after first call).
 *   - Cache writes are atomic: tmp file with `${pid}.${now()}` suffix renamed to
 *     the final path. POSIX rename is atomic. Two concurrent calls with the same
 *     cache key both write byte-identical content; one wins the rename, the other
 *     no-ops (the file content is deterministic given (model, normalizedTitle)).
 */
async function embedTitles(titles, opts = {}) {
  // (1) Resolve API key — fail-fast on unset (D-CTX-04).
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIKeyUnsetError(
      'OPENAI_API_KEY must be set for the embedding-based comparator (Phase 2.1 D-CTX-04). ' +
      'Set OPENAI_API_KEY in env or pass opts.apiKey explicitly. ' +
      'See https://platform.openai.com/api-keys for a project key.'
    );
  }

  const model = opts.model ?? 'text-embedding-3-small';
  const cacheBucket = opts.cacheBucket ?? 'misc';
  const timeoutMs = opts.timeoutMs ?? 30_000;

  // (2) Ensure the cache directory exists.
  const bucketDir = path.join(EMBEDDINGS_CACHE_DIR, cacheBucket);
  fs.mkdirSync(bucketDir, { recursive: true });

  // (3) Walk titles, dedupe on normalized form, classify hit vs miss.
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

  // (4) All cache-hit fast path.
  if (missing.length === 0) return result;

  // (5) Initialize SDK only when a network call is actually needed.
  // `require('openai')` is cached by Node after the first call (idempotent;
  // no module-level mutable state introduced — D-CTX-15).
  const openaiMod = require('openai');
  const OpenAI = openaiMod.OpenAI || openaiMod.default || openaiMod;
  const client = new OpenAI({ apiKey, timeout: timeoutMs });

  // (6) Batch the misses into chunks of ≤2048 (D-CTX-11).
  const BATCH_SIZE = 2048;
  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const chunk = missing.slice(start, start + BATCH_SIZE);
    const response = await client.embeddings.create({ model, input: chunk });

    // Defensive: ensure response.data is an array with one entry per input.
    if (!response || !Array.isArray(response.data) || response.data.length !== chunk.length) {
      throw new Error(
        `OpenAI embeddings response shape unexpected: ` +
        `data.length=${response && Array.isArray(response.data) ? response.data.length : 'n/a'}, ` +
        `expected ${chunk.length}`
      );
    }

    for (let i = 0; i < response.data.length; i++) {
      // `response.data[i].index` is the OpenAI-assigned ordinal; in practice it
      // mirrors `i`, but we use the explicit index when present for robustness.
      const entry = response.data[i];
      const idx = (typeof entry.index === 'number') ? entry.index : i;
      const normalized = chunk[idx];
      const vector = entry.embedding;
      if (!Array.isArray(vector)) {
        throw new Error(`OpenAI embeddings: entry ${i} missing 'embedding' array`);
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
  OpenAIKeyUnsetError,
  EMBEDDINGS_CACHE_DIR,
};
