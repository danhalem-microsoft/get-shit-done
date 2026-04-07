/**
 * GSD Tools Tests - core.cjs
 *
 * Tests for the foundational module's exports including regressions
 * for known bugs (REG-01: loadConfig model_overrides, REG-02: getRoadmapPhaseInternal export).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadConfig,
  resolveModelInternal,
  MODEL_PROFILES,
  escapeRegex,
  generateSlugInternal,
  normalizePhaseName,
  comparePhaseNum,
  safeReadFile,
  pathExistsInternal,
  getMilestoneInfo,
  getMilestonePhaseFilter,
  getRoadmapPhaseInternal,
  searchPhaseInDir,
  findPhaseInternal,
  clearPlanningRootCache,
} = require('../get-shit-done/bin/lib/core.cjs');
const { execSync } = require('child_process');
const { createTempMultiUserProject, cleanup } = require('./helpers.cjs');

// ─── loadConfig ────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  let tmpDir;
  let planningRoot;
  let originalCwd;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  function writeConfig(obj) {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'config.json'),
      JSON.stringify(obj, null, 2)
    );
  }

  test('returns defaults when config.json is missing', () => {
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'balanced');
    assert.strictEqual(config.commit_docs, true);
    assert.strictEqual(config.research, true);
    assert.strictEqual(config.plan_checker, true);
    assert.strictEqual(config.brave_search, false);
    assert.strictEqual(config.parallelization, true);
    assert.strictEqual(config.nyquist_validation, true);
  });

  test('reads model_profile from config.json', () => {
    writeConfig({ model_profile: 'quality' });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'quality');
  });

  test('reads nested config keys', () => {
    writeConfig({ planning: { commit_docs: false } });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.commit_docs, false);
  });

  test('reads branching_strategy from git section', () => {
    writeConfig({ git: { branching_strategy: 'per-phase' } });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.branching_strategy, 'per-phase');
  });

  // Bug: loadConfig previously omitted model_overrides from return value
  test('returns model_overrides when present (REG-01)', () => {
    writeConfig({ model_overrides: { 'gsd-executor': 'opus' } });
    const config = loadConfig(tmpDir);
    assert.deepStrictEqual(config.model_overrides, { 'gsd-executor': 'opus' });
  });

  test('returns model_overrides as null when not in config', () => {
    writeConfig({ model_profile: 'balanced' });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_overrides, null);
  });

  test('returns defaults when config.json contains invalid JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'config.json'),
      'not valid json {{{{'
    );
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'balanced');
    assert.strictEqual(config.commit_docs, true);
  });

  test('handles parallelization as boolean', () => {
    writeConfig({ parallelization: false });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.parallelization, false);
  });

  test('handles parallelization as object with enabled field', () => {
    writeConfig({ parallelization: { enabled: false } });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.parallelization, false);
  });

  test('prefers top-level keys over nested keys', () => {
    writeConfig({ commit_docs: false, planning: { commit_docs: true } });
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.commit_docs, false);
  });

  // ─── Two-file merge and source tracking ────────────────────────────────────

  function writeGlobalConfig(obj) {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify(obj, null, 2)
    );
  }

  test('reads from global config when per-project config is missing', () => {
    // Remove per-project config
    const projectConfigPath = path.join(tmpDir, planningRoot, 'config.json');
    if (fs.existsSync(projectConfigPath)) fs.unlinkSync(projectConfigPath);
    writeGlobalConfig({ model_profile: 'budget' });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'budget');
  });

  test('per-project config overrides global config', () => {
    writeGlobalConfig({ model_profile: 'budget', brave_search: true });
    writeConfig({ model_profile: 'quality' });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'quality', 'per-project should override global');
    assert.strictEqual(config.brave_search, true, 'global key not in per-project should persist');
  });

  test('returns defaults when neither config exists', () => {
    // Remove both configs
    const projectConfigPath = path.join(tmpDir, planningRoot, 'config.json');
    if (fs.existsSync(projectConfigPath)) fs.unlinkSync(projectConfigPath);
    const globalConfigPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'balanced');
    assert.strictEqual(config.commit_docs, true);
  });

  test('_sources tracks correct source per key', () => {
    writeGlobalConfig({ model_profile: 'budget', brave_search: true });
    writeConfig({ model_profile: 'quality' });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.ok(config._sources, '_sources should exist');
    // model_profile from per-project
    assert.ok(config._sources.model_profile.includes(planningRoot), 'model_profile should come from per-project config');
    // brave_search from global
    assert.ok(config._sources.brave_search.includes('.planning/config.json') || config._sources.brave_search.includes('.planning'), 'brave_search should come from global config');
    // commit_docs from defaults
    assert.strictEqual(config._sources.commit_docs, 'default', 'commit_docs should come from defaults');
  });

  test('_sources is default for all keys when no config files exist', () => {
    const projectConfigPath = path.join(tmpDir, planningRoot, 'config.json');
    if (fs.existsSync(projectConfigPath)) fs.unlinkSync(projectConfigPath);
    const globalConfigPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.ok(config._sources);
    assert.strictEqual(config._sources.model_profile, 'default');
    assert.strictEqual(config._sources.commit_docs, 'default');
  });

  test('depth migration in global config', () => {
    writeGlobalConfig({ depth: 'comprehensive' });
    const projectConfigPath = path.join(tmpDir, planningRoot, 'config.json');
    if (fs.existsSync(projectConfigPath)) fs.unlinkSync(projectConfigPath);
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.granularity, 'fine', 'depth: comprehensive should migrate to granularity: fine');
    // Verify the file was updated
    const globalContent = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'config.json'), 'utf-8'));
    assert.ok(!('depth' in globalContent), 'depth key should be removed from global config');
    assert.strictEqual(globalContent.granularity, 'fine', 'granularity should be written to global config');
  });

  test('depth migration in per-project config takes precedence', () => {
    writeGlobalConfig({ depth: 'quick' });
    writeConfig({ depth: 'comprehensive' });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.granularity, 'fine', 'per-project depth: comprehensive should take precedence');
  });

  test('model_overrides from per-project overrides global', () => {
    writeGlobalConfig({ model_overrides: { 'gsd-executor': 'sonnet' } });
    writeConfig({ model_overrides: { 'gsd-executor': 'opus' } });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.deepStrictEqual(config.model_overrides, { 'gsd-executor': 'opus' });
  });

  test('model_overrides from global when per-project has none', () => {
    writeGlobalConfig({ model_overrides: { 'gsd-planner': 'haiku' } });
    writeConfig({ model_profile: 'balanced' });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.deepStrictEqual(config.model_overrides, { 'gsd-planner': 'haiku' });
  });

  test('loadConfig works when no active project (global + defaults only)', () => {
    // Remove per-project by clearing env vars so no project resolves
    delete process.env.GSD_PROJECT;
    clearPlanningRootCache();

    // Create a temp dir with no projects but a global config
    const os2 = require('os');
    const noProjectDir = fs.mkdtempSync(path.join(os2.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(noProjectDir, '.planning', 'users', 'test-user'), { recursive: true });
    fs.writeFileSync(
      path.join(noProjectDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality' }, null, 2)
    );
    execSync('git init', { cwd: noProjectDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: noProjectDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: noProjectDir, stdio: 'pipe' });
    fs.writeFileSync(
      path.join(noProjectDir, '.planning', 'user-map.json'),
      JSON.stringify({ _schema: 1, 'Test User': 'test-user' }, null, 2) + '\n'
    );

    process.env.GSD_USER = 'test-user';
    clearPlanningRootCache();
    const config = loadConfig(noProjectDir);
    assert.strictEqual(config.model_profile, 'quality', 'should read from global config');
    cleanup(noProjectDir);
  });

  test('nested config keys work across both config files', () => {
    writeGlobalConfig({ workflow: { research: false } });
    writeConfig({ workflow: { plan_check: false } });
    clearPlanningRootCache();
    const config = loadConfig(tmpDir);
    assert.strictEqual(config.research, false, 'research from global workflow section');
    assert.strictEqual(config.plan_checker, false, 'plan_checker from per-project workflow section');
  });
});

// ─── resolveModelInternal ──────────────────────────────────────────────────────

describe('resolveModelInternal', () => {
  let tmpDir;
  let planningRoot;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
  });

  afterEach(() => {
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  function writeConfig(obj) {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'config.json'),
      JSON.stringify(obj, null, 2)
    );
  }

  describe('model profile structural validation', () => {
    test('all known agents resolve to a valid string for each profile', () => {
      const knownAgents = ['gsd-planner', 'gsd-executor', 'gsd-phase-researcher', 'gsd-codebase-mapper'];
      const profiles = ['quality', 'balanced', 'budget'];
      const validValues = ['inherit', 'sonnet', 'haiku', 'opus'];

      for (const profile of profiles) {
        writeConfig({ model_profile: profile });
        clearPlanningRootCache();
        for (const agent of knownAgents) {
          const result = resolveModelInternal(tmpDir, agent);
          assert.ok(
            validValues.includes(result),
            `profile=${profile} agent=${agent} returned unexpected value: ${result}`
          );
        }
      }
    });
  });

  describe('override precedence', () => {
    test('per-agent override takes precedence over profile', () => {
      writeConfig({
        model_profile: 'balanced',
        model_overrides: { 'gsd-executor': 'haiku' },
      });
      assert.strictEqual(resolveModelInternal(tmpDir, 'gsd-executor'), 'haiku');
    });

    test('opus override resolves to inherit', () => {
      writeConfig({
        model_overrides: { 'gsd-executor': 'opus' },
      });
      assert.strictEqual(resolveModelInternal(tmpDir, 'gsd-executor'), 'inherit');
    });

    test('agents not in override fall back to profile', () => {
      writeConfig({
        model_profile: 'quality',
        model_overrides: { 'gsd-executor': 'haiku' },
      });
      // gsd-planner not overridden, should use quality profile -> opus -> inherit
      assert.strictEqual(resolveModelInternal(tmpDir, 'gsd-planner'), 'inherit');
    });
  });

  describe('edge cases', () => {
    test('returns sonnet for unknown agent type', () => {
      writeConfig({ model_profile: 'balanced' });
      assert.strictEqual(resolveModelInternal(tmpDir, 'gsd-nonexistent'), 'sonnet');
    });

    test('defaults to balanced profile when model_profile missing', () => {
      writeConfig({});
      // balanced profile, gsd-planner -> opus -> inherit
      assert.strictEqual(resolveModelInternal(tmpDir, 'gsd-planner'), 'inherit');
    });
  });
});

// ─── escapeRegex ───────────────────────────────────────────────────────────────

describe('escapeRegex', () => {
  test('escapes dots', () => {
    assert.strictEqual(escapeRegex('file.txt'), 'file\\.txt');
  });

  test('escapes all special regex characters', () => {
    const input = '1.0 (alpha) [test] {ok} $100 ^start end$ a+b a*b a?b pipe|or back\\slash';
    const result = escapeRegex(input);
    // Verify each special char is escaped
    assert.ok(result.includes('\\.'));
    assert.ok(result.includes('\\('));
    assert.ok(result.includes('\\)'));
    assert.ok(result.includes('\\['));
    assert.ok(result.includes('\\]'));
    assert.ok(result.includes('\\{'));
    assert.ok(result.includes('\\}'));
    assert.ok(result.includes('\\$'));
    assert.ok(result.includes('\\^'));
    assert.ok(result.includes('\\+'));
    assert.ok(result.includes('\\*'));
    assert.ok(result.includes('\\?'));
    assert.ok(result.includes('\\|'));
    assert.ok(result.includes('\\\\'));
  });

  test('handles empty string', () => {
    assert.strictEqual(escapeRegex(''), '');
  });

  test('returns plain string unchanged', () => {
    assert.strictEqual(escapeRegex('hello'), 'hello');
  });
});

// ─── generateSlugInternal ──────────────────────────────────────────────────────

describe('generateSlugInternal', () => {
  test('converts text to lowercase kebab-case', () => {
    assert.strictEqual(generateSlugInternal('Hello World'), 'hello-world');
  });

  test('removes special characters', () => {
    assert.strictEqual(generateSlugInternal('core.cjs Tests!'), 'core-cjs-tests');
  });

  test('trims leading and trailing hyphens', () => {
    assert.strictEqual(generateSlugInternal('---hello---'), 'hello');
  });

  test('returns null for null input', () => {
    assert.strictEqual(generateSlugInternal(null), null);
  });

  test('returns null for empty string', () => {
    assert.strictEqual(generateSlugInternal(''), null);
  });
});

// ─── normalizePhaseName ────────────────────────────────────────────────────────

describe('normalizePhaseName', () => {
  test('pads single digit', () => {
    assert.strictEqual(normalizePhaseName('1'), '01');
  });

  test('preserves double digit', () => {
    assert.strictEqual(normalizePhaseName('12'), '12');
  });

  test('handles letter suffix', () => {
    assert.strictEqual(normalizePhaseName('1A'), '01A');
  });

  test('handles decimal phases', () => {
    assert.strictEqual(normalizePhaseName('2.1'), '02.1');
  });

  test('handles multi-level decimals', () => {
    assert.strictEqual(normalizePhaseName('1.2.3'), '01.2.3');
  });

  test('returns non-matching input unchanged', () => {
    assert.strictEqual(normalizePhaseName('abc'), 'abc');
  });
});

// ─── comparePhaseNum ───────────────────────────────────────────────────────────

describe('comparePhaseNum', () => {
  test('sorts integer phases numerically', () => {
    assert.ok(comparePhaseNum('1', '2') < 0);
    assert.ok(comparePhaseNum('10', '2') > 0);
  });

  test('sorts letter suffixes', () => {
    assert.ok(comparePhaseNum('12', '12A') < 0);
    assert.ok(comparePhaseNum('12A', '12B') < 0);
  });

  test('sorts decimal phases', () => {
    assert.ok(comparePhaseNum('2', '2.1') < 0);
    assert.ok(comparePhaseNum('2.1', '2.2') < 0);
  });

  test('handles multi-level decimals', () => {
    assert.ok(comparePhaseNum('1.1', '1.1.2') < 0);
    assert.ok(comparePhaseNum('1.1.2', '1.2') < 0);
  });

  test('returns 0 for equal phases', () => {
    assert.strictEqual(comparePhaseNum('1', '1'), 0);
    assert.strictEqual(comparePhaseNum('2.1', '2.1'), 0);
  });
});

// ─── safeReadFile ──────────────────────────────────────────────────────────────

describe('safeReadFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-core-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads existing file', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world');
    assert.strictEqual(safeReadFile(filePath), 'hello world');
  });

  test('returns null for missing file', () => {
    assert.strictEqual(safeReadFile('/nonexistent/path/file.txt'), null);
  });
});

// ─── pathExistsInternal ────────────────────────────────────────────────────────

describe('pathExistsInternal', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-core-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns true for existing path', () => {
    assert.strictEqual(pathExistsInternal(tmpDir, '.planning'), true);
  });

  test('returns false for non-existing path', () => {
    assert.strictEqual(pathExistsInternal(tmpDir, 'nonexistent'), false);
  });

  test('handles absolute paths', () => {
    assert.strictEqual(pathExistsInternal(tmpDir, tmpDir), true);
  });
});

// ─── getMilestoneInfo ──────────────────────────────────────────────────────────

describe('getMilestoneInfo', () => {
  let tmpDir;
  let planningRoot;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
  });

  afterEach(() => {
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  test('extracts version and name from roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '# Roadmap\n\n## Roadmap v1.2: My Cool Project\n\nSome content'
    );
    const info = getMilestoneInfo(tmpDir);
    assert.strictEqual(info.version, 'v1.2');
    assert.strictEqual(info.name, 'My Cool Project');
  });

  test('returns defaults when roadmap missing', () => {
    const info = getMilestoneInfo(tmpDir);
    assert.strictEqual(info.version, 'v1.0');
    assert.strictEqual(info.name, 'milestone');
  });

  test('returns active milestone when shipped milestone is collapsed in details block', () => {
    const roadmap = [
      '# Milestones',
      '',
      '| Version | Status |',
      '|---------|--------|',
      '| v0.1    | Shipped |',
      '| v0.2    | Active |',
      '',
      '<details>',
      '<summary>v0.1 — Legacy Feature Parity (Shipped)</summary>',
      '',
      '## Roadmap v0.1: Legacy Feature Parity',
      '',
      '### Phase 1: Core Setup',
      'Some content about phase 1',
      '',
      '</details>',
      '',
      '## Roadmap v0.2: Dashboard Overhaul',
      '',
      '### Phase 8: New Dashboard Layout',
      'Some content about phase 8',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, planningRoot, 'ROADMAP.md'), roadmap);
    const info = getMilestoneInfo(tmpDir);
    assert.strictEqual(info.version, 'v0.2');
    assert.strictEqual(info.name, 'Dashboard Overhaul');
  });

  test('returns active milestone when multiple shipped milestones exist in details blocks', () => {
    const roadmap = [
      '# Milestones',
      '',
      '| Version | Status |',
      '|---------|--------|',
      '| v0.1    | Shipped |',
      '| v0.2    | Shipped |',
      '| v0.3    | Active |',
      '',
      '<details>',
      '<summary>v0.1 — Initial Release (Shipped)</summary>',
      '',
      '## Roadmap v0.1: Initial Release',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>v0.2 — Feature Expansion (Shipped)</summary>',
      '',
      '## Roadmap v0.2: Feature Expansion',
      '',
      '</details>',
      '',
      '## Roadmap v0.3: Performance Tuning',
      '',
      '### Phase 12: Optimize Queries',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, planningRoot, 'ROADMAP.md'), roadmap);
    const info = getMilestoneInfo(tmpDir);
    assert.strictEqual(info.version, 'v0.3');
    assert.strictEqual(info.name, 'Performance Tuning');
  });

  test('returns defaults when roadmap has no heading matches', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '# Roadmap\n\nSome content without version headings'
    );
    const info = getMilestoneInfo(tmpDir);
    assert.strictEqual(info.version, 'v1.0');
    assert.strictEqual(info.name, 'milestone');
  });
});

// ─── searchPhaseInDir ──────────────────────────────────────────────────────────

describe('searchPhaseInDir', () => {
  let tmpDir;
  let phasesDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-core-test-'));
    phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('finds phase directory by normalized prefix', () => {
    fs.mkdirSync(path.join(phasesDir, '01-foundation'));
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '01');
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.phase_number, '01');
    assert.strictEqual(result.phase_name, 'foundation');
  });

  test('returns plans and summaries', () => {
    const phaseDir = path.join(phasesDir, '01-foundation');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '01');
    assert.ok(result.plans.includes('01-01-PLAN.md'));
    assert.ok(result.summaries.includes('01-01-SUMMARY.md'));
    assert.strictEqual(result.incomplete_plans.length, 0);
  });

  test('identifies incomplete plans', () => {
    const phaseDir = path.join(phasesDir, '01-foundation');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '# Plan 2');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary 1');
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '01');
    assert.strictEqual(result.incomplete_plans.length, 1);
    assert.ok(result.incomplete_plans.includes('01-02-PLAN.md'));
  });

  test('detects research and context files', () => {
    const phaseDir = path.join(phasesDir, '01-foundation');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, '01-RESEARCH.md'), '# Research');
    fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context');
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '01');
    assert.strictEqual(result.has_research, true);
    assert.strictEqual(result.has_context, true);
  });

  test('returns null when phase not found', () => {
    fs.mkdirSync(path.join(phasesDir, '01-foundation'));
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '99');
    assert.strictEqual(result, null);
  });

  test('generates phase_slug from directory name', () => {
    fs.mkdirSync(path.join(phasesDir, '01-core-cjs-tests'));
    const result = searchPhaseInDir(phasesDir, '.planning/users/test-user/test-project/phases', '01');
    assert.strictEqual(result.phase_slug, 'core-cjs-tests');
  });
});

// ─── findPhaseInternal ─────────────────────────────────────────────────────────

describe('findPhaseInternal', () => {
  let tmpDir;
  let planningRoot;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
  });

  afterEach(() => {
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  test('finds phase in current phases directory', () => {
    fs.mkdirSync(path.join(tmpDir, planningRoot, 'phases', '01-foundation'), { recursive: true });
    const result = findPhaseInternal(tmpDir, '1');
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.phase_number, '01');
  });

  test('returns null for non-existent phase', () => {
    const result = findPhaseInternal(tmpDir, '99');
    assert.strictEqual(result, null);
  });

  test('returns null for null phase', () => {
    const result = findPhaseInternal(tmpDir, null);
    assert.strictEqual(result, null);
  });

  test('searches archived milestones when not in current', () => {
    // Create archived milestone structure (no current phase match)
    const archiveDir = path.join(tmpDir, planningRoot, 'milestones', 'v1.0-phases', '01-foundation');
    fs.mkdirSync(archiveDir, { recursive: true });
    const result = findPhaseInternal(tmpDir, '1');
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.archived, 'v1.0');
  });
});

// ─── getRoadmapPhaseInternal ───────────────────────────────────────────────────

describe('getRoadmapPhaseInternal', () => {
  let tmpDir;
  let planningRoot;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
  });

  afterEach(() => {
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  // Bug: getRoadmapPhaseInternal was missing from module.exports
  test('is exported from core.cjs (REG-02)', () => {
    assert.strictEqual(typeof getRoadmapPhaseInternal, 'function');
    // Also verify it works with a real roadmap (note: goal regex expects **Goal:** with colon inside bold)
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 1: Foundation\n**Goal:** Build the base\n'
    );
    const result = getRoadmapPhaseInternal(tmpDir, '1');
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.phase_name, 'Foundation');
    assert.strictEqual(result.goal, 'Build the base');
  });

  test('extracts phase name and goal from roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 2: API Layer\n**Goal:** Create REST endpoints\n**Depends on**: Phase 1\n'
    );
    const result = getRoadmapPhaseInternal(tmpDir, '2');
    assert.strictEqual(result.phase_name, 'API Layer');
    assert.strictEqual(result.goal, 'Create REST endpoints');
  });

  test('returns null goal when Goal uses colon-outside-bold format', () => {
    // Actual ROADMAP.md uses **Goal**: (colon outside bold) which the regex does not match
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 1: Foundation\n**Goal**: Build the base\n'
    );
    const result = getRoadmapPhaseInternal(tmpDir, '1');
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.phase_name, 'Foundation');
    assert.strictEqual(result.goal, null);
  });

  test('returns null when roadmap missing', () => {
    const result = getRoadmapPhaseInternal(tmpDir, '1');
    assert.strictEqual(result, null);
  });

  test('returns null when phase not in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 1: Foundation\n**Goal**: Build the base\n'
    );
    const result = getRoadmapPhaseInternal(tmpDir, '99');
    assert.strictEqual(result, null);
  });

  test('returns null for null phase number', () => {
    const result = getRoadmapPhaseInternal(tmpDir, null);
    assert.strictEqual(result, null);
  });

  test('extracts full section text', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 1: Foundation\n**Goal**: Build the base\n**Requirements**: TEST-01\nSome details here\n\n### Phase 2: API\n**Goal**: REST\n'
    );
    const result = getRoadmapPhaseInternal(tmpDir, '1');
    assert.ok(result.section.includes('Phase 1: Foundation'));
    assert.ok(result.section.includes('Some details here'));
    // Should not include Phase 2 content
    assert.ok(!result.section.includes('Phase 2: API'));
  });
});

// ─── getMilestonePhaseFilter ────────────────────────────────────────────────────

describe('getMilestonePhaseFilter', () => {
  let tmpDir;
  let planningRoot;
  let savedGsdUser;
  let savedGsdProject;

  beforeEach(() => {
    savedGsdUser = process.env.GSD_USER;
    savedGsdProject = process.env.GSD_PROJECT;
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    planningRoot = `.planning/users/${result.userSlug}/${result.projectName}`;
    process.env.GSD_USER = result.userSlug;
    process.env.GSD_PROJECT = result.projectName;
  });

  afterEach(() => {
    cleanup(tmpDir);
    clearPlanningRootCache();
    if (savedGsdUser !== undefined) process.env.GSD_USER = savedGsdUser;
    else delete process.env.GSD_USER;
    if (savedGsdProject !== undefined) process.env.GSD_PROJECT = savedGsdProject;
    else delete process.env.GSD_PROJECT;
  });

  test('filters directories to only current milestone phases', () => {
    // ROADMAP lists only phases 5-7
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      [
        '## Roadmap v2.0: Next Release',
        '',
        '### Phase 5: Auth',
        '**Goal:** Add authentication',
        '',
        '### Phase 6: Dashboard',
        '**Goal:** Build dashboard',
        '',
        '### Phase 7: Polish',
        '**Goal:** Final polish',
      ].join('\n')
    );

    // Create phase dirs 1-7 on disk (leftover from previous milestones)
    for (let i = 1; i <= 7; i++) {
      const padded = String(i).padStart(2, '0');
      fs.mkdirSync(path.join(tmpDir, planningRoot, 'phases', `${padded}-phase-${i}`), { recursive: true });
    }

    const filter = getMilestonePhaseFilter(tmpDir);

    // Only phases 5, 6, 7 should match
    assert.strictEqual(filter('05-auth'), true);
    assert.strictEqual(filter('06-dashboard'), true);
    assert.strictEqual(filter('07-polish'), true);

    // Phases 1-4 should NOT match
    assert.strictEqual(filter('01-phase-1'), false);
    assert.strictEqual(filter('02-phase-2'), false);
    assert.strictEqual(filter('03-phase-3'), false);
    assert.strictEqual(filter('04-phase-4'), false);
  });

  test('returns pass-all filter when ROADMAP.md is missing', () => {
    const filter = getMilestonePhaseFilter(tmpDir);

    assert.strictEqual(filter('01-foundation'), true);
    assert.strictEqual(filter('99-anything'), true);
  });

  test('returns pass-all filter when ROADMAP has no phase headings', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '# Roadmap\n\nSome content without phases.\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);

    assert.strictEqual(filter('01-foundation'), true);
    assert.strictEqual(filter('05-api'), true);
  });

  test('handles letter-suffix phases (e.g. 3A)', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 3A: Sub-feature\n**Goal:** Sub work\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);

    assert.strictEqual(filter('03A-sub-feature'), true);
    assert.strictEqual(filter('03-main'), false);
    assert.strictEqual(filter('04-other'), false);
  });

  test('handles decimal phases (e.g. 5.1)', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 5: Main\n**Goal:** Main work\n\n### Phase 5.1: Patch\n**Goal:** Patch work\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);

    assert.strictEqual(filter('05-main'), true);
    assert.strictEqual(filter('05.1-patch'), true);
    assert.strictEqual(filter('04-other'), false);
  });

  test('returns false for non-phase directory names', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 1: Init\n**Goal:** Start\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);

    assert.strictEqual(filter('not-a-phase'), false);
    assert.strictEqual(filter('.gitkeep'), false);
  });

  test('phaseCount reflects ROADMAP phase count', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '### Phase 5: Auth\n### Phase 6: Dashboard\n### Phase 7: Polish\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);
    assert.strictEqual(filter.phaseCount, 3);
  });

  test('phaseCount is 0 when ROADMAP is missing', () => {
    const filter = getMilestonePhaseFilter(tmpDir);
    assert.strictEqual(filter.phaseCount, 0);
  });

  test('phaseCount is 0 when ROADMAP has no phase headings', () => {
    fs.writeFileSync(
      path.join(tmpDir, planningRoot, 'ROADMAP.md'),
      '# Roadmap\n\nSome content.\n'
    );

    const filter = getMilestonePhaseFilter(tmpDir);
    assert.strictEqual(filter.phaseCount, 0);
  });
});

// ─── getPlanningRoot ────────────────────────────────────────────────────────

describe('getPlanningRoot', () => {
  let tmpDir;
  let savedCI;
  let savedGithubActions;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
    // Restore env vars
    if (savedCI !== undefined) {
      process.env.CI = savedCI;
    } else {
      delete process.env.CI;
    }
    if (savedGithubActions !== undefined) {
      process.env.GITHUB_ACTIONS = savedGithubActions;
    } else {
      delete process.env.GITHUB_ACTIONS;
    }
    clearPlanningRootCache();
  });

  function runSubprocess(script, env = {}) {
    const cleanEnv = { ...process.env };
    // Remove CI-related vars from parent env to avoid false positives
    delete cleanEnv.CI;
    delete cleanEnv.GITHUB_ACTIONS;
    delete cleanEnv.GITLAB_CI;
    delete cleanEnv.JENKINS_URL;
    delete cleanEnv.CIRCLECI;
    delete cleanEnv.TRAVIS;
    delete cleanEnv.GSD_USER;
    delete cleanEnv.GSD_PROJECT;
    Object.assign(cleanEnv, env);

    return execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    });
  }

  test('CI/CD detection: CI=true blocks execution', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); process.stdout.write(core.getPlanningRoot('${dir}'));`;

    try {
      runSubprocess(script, { CI: 'true', GSD_USER: 'test-user' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('CI/CD environment detected'),
        `Expected "CI/CD environment detected" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('CI/CD detection: GITHUB_ACTIONS=true blocks execution', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); process.stdout.write(core.getPlanningRoot('${dir}'));`;

    try {
      runSubprocess(script, { GITHUB_ACTIONS: 'true', GSD_USER: 'test-user' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('CI/CD environment detected'),
        `Expected "CI/CD environment detected" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('old structure detection: PROJECT.md without users/ dir', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-core-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    // No .planning/users/ directory

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); process.stdout.write(core.getPlanningRoot('${dir}'));`;

    try {
      runSubprocess(script, { GSD_USER: 'test-user' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('Legacy .planning/ structure detected'),
        `Expected "Legacy .planning/ structure detected" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('old structure detection: PROJECT.md WITH users/ dir is OK', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    // Create PROJECT.md alongside the users/ dir
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); process.stdout.write(core.getPlanningRoot('${dir}'));`;

    const output = runSubprocess(script, { GSD_USER: 'test-user' });
    assert.strictEqual(output.trim(), '.planning/users/test-user/test-project');
  });

  test('getPlanningRoot: returns user-qualified path', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); process.stdout.write(core.getPlanningRoot('${dir}'));`;

    const output = runSubprocess(script, { GSD_USER: 'test-user' });
    assert.strictEqual(output.trim(), '.planning/users/test-user/test-project');
  });

  test('tryGetPlanningContext: auto-selects single project without .active', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); const r = core.tryGetPlanningContext('${dir}'); process.stdout.write(JSON.stringify(r));`;

    const output = runSubprocess(script, { GSD_USER: 'test-user' });
    const parsed = JSON.parse(output.trim());
    assert.strictEqual(parsed.active_user, 'test-user');
    assert.strictEqual(parsed.active_project, 'test-project', 'LIFE-05: single project auto-selects');
    assert.strictEqual(parsed.planning_root, '.planning/users/test-user/test-project');
  });

  test('tryGetPlanningContext: returns null fields when zero projects', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    // Remove the project dir to create zero-project scenario
    fs.rmSync(path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project'), { recursive: true });

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); const r = core.tryGetPlanningContext('${dir}'); process.stdout.write(JSON.stringify(r));`;

    const output = runSubprocess(script, { GSD_USER: 'test-user' });
    const parsed = JSON.parse(output.trim());
    assert.strictEqual(parsed.active_user, 'test-user');
    assert.strictEqual(parsed.active_project, null);
    assert.strictEqual(parsed.planning_root, null);
  });

  test('tryGetPlanningContext: CI/CD still hard-errors', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); const r = core.tryGetPlanningContext('${dir}'); process.stdout.write(JSON.stringify(r));`;

    try {
      runSubprocess(script, { CI: 'true', GSD_USER: 'test-user' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('CI/CD environment detected'),
        `Expected "CI/CD environment detected" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('tryGetPlanningContext: old structure still hard-errors', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-core-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');

    const corePath = require.resolve('../get-shit-done/bin/lib/core.cjs').replace(/\\/g, '/');
    const dir = tmpDir.replace(/\\/g, '/');
    const script = `const core = require('${corePath}'); const r = core.tryGetPlanningContext('${dir}'); process.stdout.write(JSON.stringify(r));`;

    try {
      runSubprocess(script, { GSD_USER: 'test-user' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        err.stderr.includes('Legacy .planning/ structure detected'),
        `Expected "Legacy .planning/ structure detected" in stderr, got: ${err.stderr}`
      );
    }
  });

  test('clearPlanningRootCache is a callable function', () => {
    assert.strictEqual(typeof clearPlanningRootCache, 'function');
    // Should not throw
    clearPlanningRootCache();
  });
});
