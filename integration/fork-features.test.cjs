'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, getRepoRoot } = require('./helpers/claude-runner.cjs');

/**
 * Fork feature validation suite.
 * Validates all 6 fork-specific feature areas still function after upstream syncs.
 * See FORK.md for feature descriptions.
 *
 * NOTE: This test uses getRepoRoot() (not createTestProject) because it validates
 * the actual repo source tree, not a temp fixture. No projectDir needed.
 */

const FORK_FEATURES = [
  { name: 'Code-Search Integration', agentFile: 'agents/gsd-codebase-mapper.md' },
  { name: 'Critic Agents', pattern: 'agents/gsd-critic-*.md', dir: 'agents', prefix: 'gsd-critic-', minCount: 6 },
  { name: 'Dynamic Researchers', dir: 'get-shit-done/researchers', minCount: 11 },
  { name: 'Adaptive Synthesizer', agentFile: 'agents/gsd-research-synthesizer.md' },
  { name: 'Mistake Registry', commandFile: 'commands/gsd/add-mistake.md' },
  { name: 'Taste Library', file: 'get-shit-done/bin/lib/taste.cjs' },
];

describe('Fork feature validation', () => {
  const repoRoot = getRepoRoot();

  test('FORK.md exists and lists all 6 feature areas', () => {
    const forkMd = fs.readFileSync(path.join(repoRoot, 'FORK.md'), 'utf-8');
    for (const feature of FORK_FEATURES) {
      assert.ok(forkMd.includes(feature.name), `Missing fork feature: ${feature.name}`);
    }
  });

  test('all fork feature agent/command files exist', () => {
    for (const feature of FORK_FEATURES) {
      if (feature.agentFile) {
        const p = path.join(repoRoot, feature.agentFile);
        assert.ok(fs.existsSync(p), `Missing agent file for ${feature.name}: ${feature.agentFile}`);
      }
      if (feature.commandFile) {
        const p = path.join(repoRoot, feature.commandFile);
        assert.ok(fs.existsSync(p), `Missing command file for ${feature.name}: ${feature.commandFile}`);
      }
      if (feature.file) {
        const p = path.join(repoRoot, feature.file);
        assert.ok(fs.existsSync(p), `Missing file for ${feature.name}: ${feature.file}`);
      }
    }
  });

  test('critic agent files meet minimum count', () => {
    const criticFeature = FORK_FEATURES.find(f => f.prefix);
    const dir = path.join(repoRoot, criticFeature.dir);
    assert.ok(fs.existsSync(dir), `${criticFeature.dir}/ directory missing`);
    const files = fs.readdirSync(dir).filter(f => f.startsWith(criticFeature.prefix));
    assert.ok(
      files.length >= criticFeature.minCount,
      `Expected >= ${criticFeature.minCount} critic files, got ${files.length}: ${files.join(', ')}`
    );
  });

  test('researcher files meet minimum count', () => {
    const researchFeature = FORK_FEATURES.find(f => f.name === 'Dynamic Researchers');
    const dir = path.join(repoRoot, researchFeature.dir);
    assert.ok(fs.existsSync(dir), `${researchFeature.dir}/ directory missing`);
    const files = fs.readdirSync(dir);
    assert.ok(
      files.length >= researchFeature.minCount,
      `Expected >= ${researchFeature.minCount} researcher files, got ${files.length}`
    );
  });

  test('taste library module loads and exports an object', () => {
    const tastePath = path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'taste.cjs');
    assert.ok(fs.existsSync(tastePath), 'taste.cjs missing');
    const mod = require(tastePath);
    assert.ok(typeof mod === 'object' && mod !== null, 'taste.cjs does not export a non-null object');
  });

  test('claude can describe fork features and mentions specific feature names', () => {
    // Feed FORK.md content via stdin pipe — too large for a CLI argument
    const { execFileSync } = require('node:child_process');
    const forkContent = fs.readFileSync(path.join(repoRoot, 'FORK.md'), 'utf-8').slice(0, 2000);
    const prompt = `Here is FORK.md:\n\n${forkContent}\n\nList the 6 fork feature areas by name, one per line.`;
    let output = '';
    try {
      output = execFileSync('claude', ['--print', '-'], {
        cwd: repoRoot,
        timeout: 180_000,
        encoding: 'utf-8',
        input: prompt,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      output = err.stdout?.toString().trim() || '';
    }
    assert.ok(output.length > 0, 'Expected output from Claude');
    const lower = output.toLowerCase();
    const matches = FORK_FEATURES.filter(f => lower.includes(f.name.toLowerCase()));
    assert.ok(
      matches.length >= 3,
      `Claude only mentioned ${matches.length}/6 fork features. Output: ${output.slice(0, 300)}`
    );
  });
});
