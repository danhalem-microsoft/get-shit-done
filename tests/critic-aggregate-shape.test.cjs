'use strict';

/**
 * Phase 2 / Plan 02-06 / Task 2 — unit guard for the critic-aggregate
 * dispatcher's JSON contract.
 *
 * Two sub-tests:
 *   (a) all 6 critics present — verifies critics_expected/critics_present
 *       contain every lens, severity totals roll up, status reflects the
 *       worst severity present.
 *   (b) missing critics — verifies critics_missing is populated when
 *       fewer than 6 CRITIQUE-*.md files exist (CRIT-09 disk-read
 *       enforcement, mitigates the parallel-Task hallucination bug
 *       anthropics/claude-code#29181).
 *
 * Test approach (per RESEARCH §Pattern-3):
 *   - Build a temp phase dir with hand-rolled CRITIQUE-{lens}.md files.
 *   - Invoke `node get-shit-done/bin/gsd-tools.cjs critic-aggregate
 *     --phase-dir <tmp> --json` as a subprocess (out-of-process, same
 *     surface used by the workflow).
 *   - Parse stdout as JSON, assert shape and totals.
 *
 * NOTE on YAML format: the fork's extractFrontmatter parser (in
 * get-shit-done/bin/lib/frontmatter.cjs) does NOT support inline-flow
 * map syntax `{critical: 0, warning: 0}`. Test fixtures MUST use
 * indented YAML for nested keys.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, 'get-shit-done', 'bin', 'gsd-tools.cjs');

/**
 * Helper: build a temp phase dir with the supplied critique fixtures,
 * invoke fn(tmpPath), then clean up.
 *
 * @param {Object<string, string>} critiques - map of lens name → file content
 * @param {(tmpPath: string) => any} fn - test body
 */
function withTempPhaseDir(critiques, fn) {
  const tmp = path.join(
    os.tmpdir(),
    `critic-aggregate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tmp, { recursive: true });
  for (const [lens, content] of Object.entries(critiques)) {
    fs.writeFileSync(path.join(tmp, `CRITIQUE-${lens}.md`), content, 'utf-8');
  }
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Build a CRITIQUE fixture with indented YAML frontmatter (the only
 * shape the fork's parser supports for nested keys).
 */
function makeFixture(lens, status, counts) {
  const c = counts || { critical: 0, warning: 0, info: 0, total: 0 };
  return [
    '---',
    `critique_type: ${lens}`,
    `status: ${status}`,
    'severity_counts:',
    `  critical: ${c.critical || 0}`,
    `  warning: ${c.warning || 0}`,
    `  info: ${c.info || 0}`,
    `  total: ${c.total || 0}`,
    '---',
    '',
  ].join('\n');
}

test('critic-aggregate emits expected JSON shape with all 6 critics present', () => {
  withTempPhaseDir({
    plan:     makeFixture('plan',     'pass', { critical: 0, warning: 0, info: 1, total: 1 }),
    code:     makeFixture('code',     'warn', { critical: 0, warning: 2, info: 0, total: 2 }),
    scope:    makeFixture('scope',    'pass', { critical: 0, warning: 0, info: 0, total: 0 }),
    verify:   makeFixture('verify',   'pass', { critical: 0, warning: 0, info: 0, total: 0 }),
    discuss:  makeFixture('discuss',  'pass', { critical: 0, warning: 0, info: 0, total: 0 }),
    strategy: makeFixture('strategy', 'pass', { critical: 0, warning: 0, info: 0, total: 0 }),
  }, (tmp) => {
    const out = execFileSync('node', [TOOLS, 'critic-aggregate', '--phase-dir', tmp, '--json'], {
      encoding: 'utf-8',
    });
    const result = JSON.parse(out);

    // critics_expected is a stable, ordered list of all 6 lens names.
    assert.deepStrictEqual(
      [...result.critics_expected].sort(),
      ['code', 'discuss', 'plan', 'scope', 'strategy', 'verify'],
      'critics_expected must list all 6 lens names'
    );

    // critics_missing is empty when all 6 files exist.
    assert.deepStrictEqual(result.critics_missing, [],
      'critics_missing must be [] when all critiques present');

    // severity_counts_total rolls up all per-file counts.
    assert.strictEqual(result.severity_counts_total.warning, 2,
      'warning total = code (2) + others (0) = 2');
    assert.strictEqual(result.severity_counts_total.info, 1,
      'info total = plan (1) + others (0) = 1');
    assert.strictEqual(result.severity_counts_total.critical, 0,
      'critical total = 0');
    assert.strictEqual(result.severity_counts_total.total, 3,
      'total = 2 (warn) + 1 (info) = 3');

    // status reflects the worst-severity-present rule:
    // critical>0 → fail; else warning>0 → warn; else pass.
    assert.strictEqual(result.status, 'warn',
      'status must be "warn" when warnings present and no criticals');

    // files[] has one entry per critic, with each carrying its critique_type.
    assert.strictEqual(result.files.length, 6,
      'files[] must have one entry per present critic');
    const presentTypes = result.files.map((f) => f.critique_type).sort();
    assert.deepStrictEqual(presentTypes,
      ['code', 'discuss', 'plan', 'scope', 'strategy', 'verify']);
  });
});

test('critic-aggregate flags missing critics (CRIT-09 disk-read enforcement)', () => {
  withTempPhaseDir({
    // Only 2 of 6 critics dropped CRITIQUE files on disk — the other 4
    // are deliberately absent. The aggregator MUST surface them in
    // critics_missing rather than silently passing (mitigates
    // anthropics/claude-code#29181 — workflow trusts disk, not text).
    plan: makeFixture('plan', 'pass'),
    code: makeFixture('code', 'pass'),
  }, (tmp) => {
    const out = execFileSync('node', [TOOLS, 'critic-aggregate', '--phase-dir', tmp, '--json'], {
      encoding: 'utf-8',
    });
    const result = JSON.parse(out);

    assert.deepStrictEqual(
      [...result.critics_missing].sort(),
      ['discuss', 'scope', 'strategy', 'verify'],
      'critics_missing must list every absent critic file'
    );
    assert.deepStrictEqual(
      [...result.critics_present].sort(),
      ['code', 'plan'],
      'critics_present must list only files present on disk'
    );
    // 4 missing critics with no severity contribution → totals all zero.
    assert.strictEqual(result.severity_counts_total.total, 0);
    // Status is pass when no warnings/criticals — missing critics are
    // surfaced separately (CRIT-09) but do not auto-fail the report.
    assert.strictEqual(result.status, 'pass');
  });
});
