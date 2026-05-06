'use strict';

/**
 * Unit guard for critic-spawn-batch (Phase 2 — 02-07-fixes / CRIT-08 workaround).
 *
 * Three concerns:
 *   1. The dispatcher case in get-shit-done/bin/gsd-tools.cjs resolves to
 *      lib/critic-spawn-batch.cjs (no missing route).
 *   2. The handler is wired into the SDK registry at sdk/src/query/index.ts
 *      so `gsd-sdk query critic-spawn-batch` resolves natively rather than
 *      transparently bridging.
 *   3. The handler emits the expected JSON shape — even when the spawned
 *      `claude` is mocked to a script that creates the per-critic files
 *      synchronously.
 *
 * Concern (3) requires NO live API calls. We swap the CLAUDE_BIN env var to
 * a tiny shell script that writes a valid CRITIQUE-{lens}.md and emits
 * `{ subtype: 'success', total_cost_usd: 0.001, duration_ms: 5 }` JSON to
 * stdout — exactly the shape the real `claude --print --output-format json`
 * emits. The handler should then report status='pass' with all 6 per_critic
 * entries having success=true.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, 'get-shit-done', 'bin', 'gsd-tools.cjs');
const SDK_INDEX = path.join(ROOT, 'sdk', 'src', 'query', 'index.ts');
const SPAWN_LIB = path.join(ROOT, 'get-shit-done', 'bin', 'lib', 'critic-spawn-batch.cjs');

let TMP, MOCK_BIN;

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-spawn-batch-test-'));
  MOCK_BIN = path.join(TMP, 'mock-claude.sh');

  // The mock claude binary parses its argv enough to extract the prompt
  // (delivered via stdin), reads it to figure out which lens it's running as,
  // writes a minimally-valid CRITIQUE-{lens}.md to phase_dir, and emits the
  // success-shape JSON. This is exactly what `claude --print --output-format
  // json` would do for a successful run, just deterministically and without
  // network calls.
  //
  // Lens detection: the prompt buildCriticPrompt() emits "lens: <name>" inside
  // the <phase_context> block. Phase dir is also embedded in the prompt
  // ("phase_dir: <path>"). The mock greps both.
  const mockSrc = `#!/usr/bin/env bash
set -euo pipefail
prompt=$(cat)
lens=$(printf '%s' "$prompt" | grep -oE 'lens: [a-z]+' | head -1 | awk '{print $2}')
phase_dir=$(printf '%s' "$prompt" | grep -oE 'phase_dir: [^[:space:]]+' | head -1 | awk '{print $2}')
if [ -z "$lens" ] || [ -z "$phase_dir" ]; then
  echo '{"subtype":"error","result":"could not parse lens or phase_dir from prompt"}' >&2
  exit 1
fi
mkdir -p "$phase_dir"
cat > "$phase_dir/CRITIQUE-$lens.md" <<EOF
---
critique_type: $lens
status: pass
severity_counts:
  critical: 0
  warning: 0
  info: 0
  total: 0
phase: mock
generated_at: 2026-05-04T00:00:00Z
---

# Mock CRITIQUE-$lens.md

No findings (test stub).
EOF
printf '{"subtype":"success","result":"mock $lens done","total_cost_usd":0.001,"duration_ms":5,"num_turns":1}'
exit 0
`;
  fs.writeFileSync(MOCK_BIN, mockSrc, { mode: 0o755 });
});

after(() => {
  if (TMP && fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

describe('critic-spawn-batch dispatcher + SDK + shape', () => {
  test('gsd-tools.cjs has a critic-spawn-batch case wired to the lib module', () => {
    const tools = fs.readFileSync(TOOLS, 'utf-8');
    assert.match(tools, /case\s+'critic-spawn-batch'/,
      'gsd-tools.cjs must include a `case \'critic-spawn-batch\':` arm');
    assert.match(tools, /criticSpawnBatch\.cmdCriticSpawnBatch/,
      'the case must call criticSpawnBatch.cmdCriticSpawnBatch');
    assert.ok(fs.existsSync(SPAWN_LIB),
      `expected lib at ${SPAWN_LIB}`);
  });

  test('SDK registry exposes critic-spawn-batch as a native handler', () => {
    const sdk = fs.readFileSync(SDK_INDEX, 'utf-8');
    assert.match(sdk, /import\s*\{\s*criticSpawnBatch\s*\}\s*from\s*'\.\/critic-spawn-batch\.js'/,
      'sdk/src/query/index.ts must import criticSpawnBatch');
    assert.match(sdk, /registry\.register\(\s*'critic-spawn-batch'\s*,\s*criticSpawnBatch\s*\)/,
      'sdk/src/query/index.ts must register critic-spawn-batch as a native handler');
  });

  test('dispatcher emits JSON contract when CLAUDE_BIN is mocked', () => {
    // Run the dispatcher with the mock claude bin, against a fresh phase dir.
    // The mock writes 6 valid CRITIQUE-*.md files; the dispatcher should
    // report status='pass' with 6/6 success.
    const phaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-'));
    let stdout;
    try {
      stdout = execFileSync('node', [
        TOOLS, 'critic-spawn-batch',
        '--phase-dir', phaseDir,
        '--json',
      ], {
        env: { ...process.env, CLAUDE_BIN: MOCK_BIN },
        encoding: 'utf-8',
        timeout: 60_000,
        cwd: ROOT,
      });
    } finally {
      // Always cleanup the temp phase dir, even on assertion failure.
      try { fs.rmSync(phaseDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    const parsed = JSON.parse(stdout);

    assert.strictEqual(parsed.status, 'pass',
      `expected status='pass', got '${parsed.status}'. critics_failed=${JSON.stringify(parsed.critics_failed)}`);
    assert.strictEqual(parsed.critics_succeeded.length, 6,
      `expected 6 critics_succeeded, got ${parsed.critics_succeeded.length}: ${JSON.stringify(parsed.critics_succeeded)}`);
    assert.strictEqual(parsed.critics_failed.length, 0);
    assert.strictEqual(parsed.per_critic.length, 6);
    assert.deepStrictEqual(
      parsed.critics_expected.slice().sort(),
      ['code', 'discuss', 'plan', 'scope', 'strategy', 'verify']);

    // Spawn-delta should be tiny — child_process.spawn loop is a microsecond
    // wide. We don't assert a specific bound here (that's the job of the
    // live walltime test); the mock-bin test just sanity-checks the field
    // exists and is a sane value. < 1000ms even on a slow CI machine is
    // generous (typical: 5-50ms).
    assert.ok(typeof parsed.spawn_delta_ms === 'number' && parsed.spawn_delta_ms < 1000,
      `spawn_delta_ms must be < 1s in mock mode (no network), got ${parsed.spawn_delta_ms}ms`);

    // Each per-critic entry must have the contract fields.
    for (const r of parsed.per_critic) {
      assert.ok(typeof r.lens === 'string');
      assert.ok(typeof r.success === 'boolean');
      assert.ok(typeof r.walltime_ms === 'number' && r.walltime_ms >= 0);
      assert.ok(typeof r.spawn_at_ms === 'number' && r.spawn_at_ms > 0);
      assert.strictEqual(r.success, true,
        `${r.lens} should have succeeded with mock CLAUDE_BIN; got error=${r.error}`);
      assert.strictEqual(r.critique_file_exists, true,
        `${r.lens} CRITIQUE file should have flushed to disk per mock`);
    }
  });

  test('dispatcher errors out cleanly when neither --phase nor --phase-dir is given', () => {
    let exitCode = 0;
    try {
      execFileSync('node', [TOOLS, 'critic-spawn-batch', '--json'], {
        env: { ...process.env, CLAUDE_BIN: MOCK_BIN },
        encoding: 'utf-8',
        timeout: 10_000,
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      exitCode = err.status ?? -1;
      const stderr = err.stderr?.toString() || '';
      assert.match(stderr, /--phase.*required|--phase-dir.*required/,
        `expected error mentioning --phase or --phase-dir requirement; got stderr: ${stderr.slice(0, 300)}`);
    }
    assert.notStrictEqual(exitCode, 0,
      'dispatcher must exit non-zero when required args missing');
  });

  test('dispatcher reports per-critic failure when CLAUDE_BIN crashes for one lens', () => {
    // Mock that fails for the 'verify' lens and succeeds for the rest. This
    // exercises the partial-success path that aggregator's CRIT-09
    // skip-and-continue policy expects.
    const partialMockBin = path.join(TMP, 'mock-claude-partial.sh');
    const partialSrc = `#!/usr/bin/env bash
set -euo pipefail
prompt=$(cat)
lens=$(printf '%s' "$prompt" | grep -oE 'lens: [a-z]+' | head -1 | awk '{print $2}')
phase_dir=$(printf '%s' "$prompt" | grep -oE 'phase_dir: [^[:space:]]+' | head -1 | awk '{print $2}')
if [ "$lens" = "verify" ]; then
  echo "verify lens forced failure" >&2
  exit 1
fi
mkdir -p "$phase_dir"
cat > "$phase_dir/CRITIQUE-$lens.md" <<EOF
---
critique_type: $lens
status: pass
severity_counts:
  critical: 0
  warning: 0
  info: 0
  total: 0
phase: mock
generated_at: 2026-05-04T00:00:00Z
---

# mock
EOF
printf '{"subtype":"success","result":"mock $lens","total_cost_usd":0.001,"duration_ms":5,"num_turns":1}'
exit 0
`;
    fs.writeFileSync(partialMockBin, partialSrc, { mode: 0o755 });

    const phaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-partial-'));
    let stdout;
    try {
      stdout = execFileSync('node', [
        TOOLS, 'critic-spawn-batch',
        '--phase-dir', phaseDir,
        '--json',
      ], {
        env: { ...process.env, CLAUDE_BIN: partialMockBin },
        encoding: 'utf-8',
        timeout: 60_000,
        cwd: ROOT,
      });
    } finally {
      try { fs.rmSync(phaseDir, { recursive: true, force: true }); } catch {}
    }

    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.status, 'partial',
      `expected status='partial' (5/6 ok), got '${parsed.status}'`);
    assert.strictEqual(parsed.critics_succeeded.length, 5);
    assert.strictEqual(parsed.critics_failed.length, 1);
    assert.strictEqual(parsed.critics_failed[0].lens, 'verify');
    assert.match(parsed.critics_failed[0].error, /exit code 1|verify lens forced failure/i);
  });
});
