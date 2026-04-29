'use strict';

/**
 * Capture script — invoked once during Phase 1 Wave 0 to populate the
 * pre-refactor agent baseline corpus. Idempotent: re-running overwrites
 * existing baselines.
 *
 * USAGE: node integration/test-fixtures/baselines/_capture.cjs [agent-name]
 *
 * If [agent-name] is omitted, captures all 22 agents (per CONTEXT.md D-03).
 *
 * Per WARNING-fix: each agent runs inside its own sandbox (createSandbox from
 * claude-runner.cjs) seeded with the fixture's `sandbox_files` map. This
 * mirrors the existing pattern in gsd-lifecycle.test.cjs and ensures captures
 * are reproducible against the repo state at capture time. The git SHA at
 * capture time is recorded in _meta.json (captured_commit field) so a future
 * re-capture can be reproduced against the same source state.
 *
 * Cost is non-budget per user instruction; live API calls are expected.
 *
 * The capture script is NOT a test — do not wire it into `npm test` or Bazel.
 * It is a one-shot procedure.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { runAgentParity, SCHEMAS } = require('../../helpers/agent-parity.cjs');
const { createSandbox } = require('../../helpers/claude-runner.cjs');

const BASELINES_DIR = path.resolve(__dirname);

const AGENTS = [
  'critic-plan', 'critic-code', 'critic-scope', 'critic-verify', 'critic-discuss', 'critic-strategy',
  'gsd-planner', 'gsd-research-synthesizer',
  'gsd-pattern-mapper', 'gsd-phase-researcher', 'gsd-plan-checker', 'gsd-verifier', 'gsd-executor',
  'gsd-project-researcher', 'gsd-roadmapper', 'gsd-code-reviewer', 'gsd-code-fixer',
  'gsd-integration-checker', 'gsd-security-auditor', 'gsd-assumptions-analyzer',
  'gsd-advisor-researcher', 'gsd-user-profiler',
];
// Per CONTEXT.md D-03: exactly 22 unique agents. Do NOT add a 23rd.
if (AGENTS.length !== 22) {
  throw new Error(`AGENTS.length must be 22 per CONTEXT.md D-03 (got ${AGENTS.length})`);
}

async function captureOne(agent) {
  const dir = path.join(BASELINES_DIR, agent);
  const inputs = fs.readdirSync(dir).filter((f) => f.endsWith('.input.json'));
  for (const inputFile of inputs) {
    const fixture = require(path.join(dir, inputFile));
    const schema = SCHEMAS[fixture.expected_schema_kind];
    if (!schema) throw new Error(`unknown schema: ${fixture.expected_schema_kind} in ${inputFile}`);

    // Per WARNING-fix: each capture runs inside its own sandbox seeded with
    // the fixture's sandbox_files map. This matches gsd-lifecycle.test.cjs and
    // makes the capture independent of the executor's cwd. createSandbox is
    // synchronous (returns the absolute sandbox path).
    const sandboxPath = createSandbox(`baseline-capture-${agent}-${fixture.fixture_id}`);
    if (fixture.sandbox_files) {
      for (const [relPath, content] of Object.entries(fixture.sandbox_files)) {
        const abs = path.join(sandboxPath, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
    }

    const result = await runAgentParity(
      agent,
      {
        fixtureId: fixture.fixture_id,
        prompt: fixture.prompt,
        cwd: sandboxPath,
        env: fixture.env || {},
        addDirs: [],
      },
      schema,
      { mode: 'capture', n: 1, phase: 'phase-1-cull', maxCostUsd: 30, walltimeBudgetMs: 600_000 },
    );
    if (!result.pass) {
      throw new Error(`capture failed: ${agent}/${fixture.fixture_id} → ${JSON.stringify(result.deltas)}`);
    }
    console.log(`captured ${agent}/${fixture.fixture_id} → ${result.baseline_path}`);
  }
}

async function main() {
  const target = process.argv[2];
  const agents = target ? [target] : AGENTS;
  for (const agent of agents) {
    await captureOne(agent);
  }

  // After captures, write _meta.json with the captured_commit SHA per WARNING-fix
  // (T-01-04-06: un-reproducible baseline mitigation). Only write _meta.json on
  // a full-corpus capture run; single-agent re-captures should not overwrite it.
  if (!target) {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const meta = {
      captured_at: new Date().toISOString(),
      captured_commit: sha,
      captured_by: 'phase-1-cull-wave-0',
      agent_count: AGENTS.length,
      fixture_count: AGENTS.length,
      agents: AGENTS,
      schemas_used: ['critic-findings', 'plan-structural', 'schema-conformance'],
      commit_message: 'chore: capture pre-refactor agent baselines for parity testing',
    };
    fs.writeFileSync(path.join(BASELINES_DIR, '_meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`Wrote _meta.json (captured_commit=${sha.slice(0, 12)})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
