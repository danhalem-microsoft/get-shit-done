'use strict';

/**
 * Phase 2 / Plan 02-06 / Task 3 — static structural guard for the
 * critique workflow.
 *
 * Three subtests:
 *   (a) workflow contains exactly 6 Task(subagent_type="gsd-critic-...") spawns
 *   (b) workflow invokes `gsd-sdk query critic-aggregate` (CRIT-07 disk read)
 *   (c) the 6 Task() calls are contiguous — no `Wait` / `Step <N>` /
 *       `After ... returns` prose appears BETWEEN any two consecutive
 *       Task calls. Per H4 (02-REVIEWS.md plan-H-001) this is a
 *       negative-lookahead tightening of the previous lazy
 *       `Task\(...){6}` regex, which would have matched even when
 *       intervening prose serializes the batch.
 *
 * This test is a static PROXY for CRIT-06 runtime parallelism — full
 * walltime verification (max-of-6 vs. sum-of-6) lives in the live
 * critic-fault-injection test at Plan 02-07 (CRIT-08).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'critique.md');

test('critique workflow contains 6 Task() calls (CRIT-06 static proxy)', () => {
  assert.ok(fs.existsSync(WORKFLOW),
    'get-shit-done/workflows/critique.md must exist (Plan 02-06 lands it)');
  const content = fs.readFileSync(WORKFLOW, 'utf-8');
  const matches = content.match(
    /Task\(\s*subagent_type\s*=\s*"gsd-critic-(plan|code|scope|verify|discuss|strategy)"/g
  ) || [];
  assert.strictEqual(matches.length, 6,
    `Expected 6 Task(subagent_type="gsd-critic-*") spawns in critique.md, found ${matches.length}`);
});

test('critique workflow calls critic-aggregate via gsd-sdk (CRIT-07 disk-read)', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf-8');
  assert.match(content, /gsd-sdk\s+query\s+critic-aggregate/,
    'workflow must invoke `gsd-sdk query critic-aggregate` to read critic output from disk');
});

test('critique workflow Task spawns are contiguous — no Wait/Step/After prose between them (CRIT-06; H4)', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf-8');

  // H4 (per 02-REVIEWS.md plan-H-001): the previous regex
  // `Task\(...){6}` was too lazy — it matched even with intervening
  // prose like "Wait for ...", "Step 4: ...", "After Task 1 returns
  // ..." that downgrades the parallel batch to serial. We tighten with
  // negative lookahead between consecutive Task calls.
  //
  // Strategy: find the indices of all 6 Task() calls, then for each
  // consecutive pair, slice the substring between them and assert
  // none of the parallelism-killer phrases appear.

  const taskRegex = /Task\(\s*subagent_type/g;
  const indices = [];
  let m;
  while ((m = taskRegex.exec(content)) !== null) {
    indices.push(m.index);
  }
  assert.strictEqual(indices.length, 6,
    `expected 6 Task() calls in critique.md, found ${indices.length}`);

  for (let i = 0; i + 1 < indices.length; i++) {
    const between = content.slice(indices[i], indices[i + 1]);
    assert.doesNotMatch(between, /\bWait\b/i,
      `"Wait" appears between Task ${i + 1} and Task ${i + 2} — prose like this serializes the batch (CRIT-06; H4)`);
    assert.doesNotMatch(between, /\bStep\s+\d+\b/,
      `"Step <N>" appears between Task ${i + 1} and Task ${i + 2} — Tasks must be in a single contiguous block (CRIT-06; H4)`);
    assert.doesNotMatch(between, /\bAfter\b[^\n]{0,80}\breturns?\b/i,
      `"After ... returns" appears between Task ${i + 1} and Task ${i + 2} — Tasks must be in a single contiguous block (CRIT-06; H4)`);
  }
});
