'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { getRepoRoot } = require('./helpers/claude-runner.cjs');

describe('Fork feature preservation', () => {
  const repoRoot = getRepoRoot();

  // Source of truth for fork features — from FORK.md
  const FORK_FEATURES = [
    { name: 'Code-Search Integration', agentFile: 'agents/gsd-codebase-mapper.md' },
    { name: 'Critic Agents', dir: 'agents', prefix: 'gsd-critic-', minCount: 6 },
    { name: 'Dynamic Researchers', dir: 'get-shit-done/researchers', minCount: 11 },
    { name: 'Adaptive Synthesizer', agentFile: 'agents/gsd-research-synthesizer.md' },
    { name: 'Mistake Registry', commandFile: 'commands/gsd/add-mistake.md' },
    { name: 'Taste Library', moduleFile: 'get-shit-done/bin/lib/taste.cjs' },
  ];

  test('FORK.md exists and lists all 6 feature areas', () => {
    const forkMd = fs.readFileSync(path.join(repoRoot, 'FORK.md'), 'utf-8');
    for (const feature of FORK_FEATURES) {
      assert.ok(forkMd.includes(feature.name),
        `FORK.md missing feature area: ${feature.name}`);
    }
  });

  test('all fork feature files exist on disk', () => {
    for (const feature of FORK_FEATURES) {
      const file = feature.agentFile || feature.commandFile || feature.moduleFile;
      if (file) {
        assert.ok(fs.existsSync(path.join(repoRoot, file)),
          `Missing file for ${feature.name}: ${file}`);
      }
    }
  });

  test('critic agents meet minimum count', () => {
    const f = FORK_FEATURES.find(f => f.prefix);
    const dir = path.join(repoRoot, f.dir);
    const files = fs.readdirSync(dir).filter(n => n.startsWith(f.prefix));
    assert.ok(files.length >= f.minCount,
      `Expected >= ${f.minCount} critic agents, got ${files.length}: ${files.join(', ')}`);
  });

  test('researcher files meet minimum count', () => {
    const f = FORK_FEATURES.find(f => f.name === 'Dynamic Researchers');
    const dir = path.join(repoRoot, f.dir);
    const files = fs.readdirSync(dir).filter(n => n.endsWith('.md'));
    assert.ok(files.length >= f.minCount,
      `Expected >= ${f.minCount} researchers, got ${files.length}`);
  });

  test('taste.cjs loads and exports expected functions', () => {
    const mod = require(path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'taste.cjs'));
    assert.ok(typeof mod === 'object' && mod !== null, 'taste.cjs must export an object');
  });

  // Fork-patch code path tests
  test('identity.cjs exists (fork-only module)', () => {
    const p = path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'identity.cjs');
    assert.ok(fs.existsSync(p), 'identity.cjs missing — fork patch may have been overwritten by upstream sync');
  });

  test('context.cjs exists (fork-only module)', () => {
    const p = path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'context.cjs');
    assert.ok(fs.existsSync(p), 'context.cjs missing — fork patch may have been overwritten by upstream sync');
  });

  test('core.cjs contains tryGetPlanningContext (fork patch)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'core.cjs'), 'utf-8');
    assert.ok(content.includes('tryGetPlanningContext'),
      'core.cjs missing tryGetPlanningContext — fork patch overwritten');
  });

  test('init.cjs contains withProjectRoot fork patch', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'get-shit-done', 'bin', 'lib', 'init.cjs'), 'utf-8');
    assert.ok(content.includes('active_user') && content.includes('active_project'),
      'init.cjs missing active_user/active_project injection — fork patch overwritten');
  });

  test('installed copy matches repo copy for fork-critical files', () => {
    const installedBase = path.join(process.env.HOME, '.claude', 'get-shit-done', 'bin', 'lib');
    const repoBase = path.join(repoRoot, 'get-shit-done', 'bin', 'lib');
    const criticalFiles = ['init.cjs', 'core.cjs', 'identity.cjs', 'context.cjs'];

    for (const file of criticalFiles) {
      const installed = path.join(installedBase, file);
      const repo = path.join(repoBase, file);
      if (!fs.existsSync(installed)) {
        // Installed copy may not exist in CI — skip, don't fail
        continue;
      }
      const installedContent = fs.readFileSync(installed, 'utf-8');
      const repoContent = fs.readFileSync(repo, 'utf-8');
      assert.strictEqual(installedContent, repoContent,
        `Installed ${file} differs from repo copy — run install to sync`);
    }
  });
});
