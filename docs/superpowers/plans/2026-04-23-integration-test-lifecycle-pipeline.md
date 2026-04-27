# GSD Fork Lifecycle Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full GSD lifecycle integration test that runs every fork feature end-to-end in an isolated sandbox — from project init through verification, covering multi-user resolution, critics, researchers, mistake registry, taste library, and code-search.

**Architecture:** A `createSandbox()` helper builds a self-contained GSD installation in a temp dir by copying the repo's tooling into `.claude/`. A single sequential test file (`gsd-lifecycle.test.cjs`) runs 10 pipeline steps via `runClaudeWithTools()`, each building on the prior step's state. Claude runs from the sandbox cwd with `--add-dir` pointing to the sandbox's `.claude/` so it discovers skills/agents/commands from the repo copy, not `~/.claude/`.

**Tech Stack:** Node.js `node:test`, `node:child_process`, `node:fs`, Bazel `js_test`

---

### Task 1: Add `createSandbox()` to claude-runner.cjs

**Files:**
- Modify: `integration/helpers/claude-runner.cjs`

- [ ] **Step 1: Add the `createSandbox` function after `createTestProject`**

```javascript
/**
 * Create a self-contained GSD sandbox with the repo's tooling installed locally.
 * No dependency on ~/.claude/ for skills/agents/commands — everything is in the sandbox.
 *
 * Structure:
 *   {sandbox}/.claude/get-shit-done/  ← repo's get-shit-done/
 *   {sandbox}/.claude/agents/         ← repo's agents/
 *   {sandbox}/.claude/commands/       ← repo's commands/
 *   {sandbox}/.claude/hooks/          ← repo's hooks/
 *   {sandbox}/.claude/settings.json   ← from ~/.claude/ (known limitation)
 *   {sandbox}/.planning/users/{user}/ ← multi-user structure
 *   {sandbox}/src/index.js            ← dummy source
 *   {sandbox}/package.json
 *   {sandbox}/CLAUDE.md
 *
 * @param {string} name - sandbox directory name
 * @param {object} [opts] - { userSlug: 'test-user' }
 * @returns {string} absolute path to sandbox
 */
function createSandbox(name, opts = {}) {
  const repoRoot = getRepoRoot();
  const userSlug = opts.userSlug || 'test-user';
  const base = process.env.TEST_TMPDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-sandbox-'));
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });

  // 1. Git init
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' });

  // 2. Copy GSD tooling into .claude/
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const copyDirs = [
    ['get-shit-done', 'get-shit-done'],
    ['agents', 'agents'],
    ['commands', 'commands'],
    ['hooks', 'hooks'],
  ];
  for (const [src, dst] of copyDirs) {
    const srcPath = path.join(repoRoot, src);
    const dstPath = path.join(claudeDir, dst);
    if (fs.existsSync(srcPath)) {
      execFileSync('cp', ['-r', srcPath, dstPath], { stdio: 'pipe' });
    }
  }

  // 3. Copy settings.json from ~/.claude/ (known limitation — inherits host config)
  const hostSettings = path.join(process.env.HOME, '.claude', 'settings.json');
  if (fs.existsSync(hostSettings)) {
    fs.copyFileSync(hostSettings, path.join(claudeDir, 'settings.json'));
  } else {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
  }

  // 4. Multi-user structure (no active project yet — /gsd-new-project will set it)
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'users', userSlug), { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'user-map.json'),
    JSON.stringify({ _schema: 1, 'test@test.com': userSlug })
  );

  // 5. Dummy project files
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test-sandbox', version: '1.0.0' }));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), "'use strict';\nmodule.exports = {};\n");
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Test Sandbox\n\nThis is a test project for GSD integration testing.\n');

  // 6. Initial commit
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init: test sandbox'], { cwd: dir, stdio: 'pipe' });

  return dir;
}
```

- [ ] **Step 2: Update `runClaudeWithTools` to accept `addDirs` option**

Add to the args construction in `runClaudeWithTools`, after the `allowedTools` block:

```javascript
  if (opts.addDirs) {
    for (const d of opts.addDirs) {
      args.push('--add-dir', d);
    }
  }
```

- [ ] **Step 3: Update module.exports**

```javascript
module.exports = { runClaude, runClaudeWithTools, runGsdTools, createTestProject, createSandbox, getRepoRoot, CLAUDE_BIN, DEFAULT_TIMEOUT };
```

- [ ] **Step 4: Verify the helper loads**

Run: `node -e "const h = require('./integration/helpers/claude-runner.cjs'); console.log(typeof h.createSandbox);"`
Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add integration/helpers/claude-runner.cjs
git commit -m "feat(integration): add createSandbox helper for isolated GSD testing"
```

---

### Task 2: Add lifecycle test target to BUILD.bazel

**Files:**
- Modify: `integration/BUILD.bazel`

- [ ] **Step 1: Replace the glob-based test generation with explicit targets**

The current glob `[js_test(...) for test_file in glob(["*.test.cjs"])]` would pick up the lifecycle test with the wrong size/timeout. Replace with:

```python
load("@aspect_rules_js//js:defs.bzl", "js_test")

# Fast integration tests — tooling layer, no Claude API calls or cheap calls
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = [
        "//integration/helpers:test_helpers",
    ],
    size = "large",
    tags = ["integration", "local"],
    timeout = "long",
) for test_file in [
    "fork-preservation.test.cjs",
    "gsd-tools-workflow.test.cjs",
    "multi-user-resolution.test.cjs",
]]

# Moderate integration tests — individual skill execution, real API calls
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = [
        "//integration/helpers:test_helpers",
    ],
    size = "large",
    tags = ["integration", "local", "requires-api-key"],
    timeout = "long",
) for test_file in [
    "skill-execution.test.cjs",
]]

# Lifecycle pipeline — full GSD lifecycle, expensive, long-running
js_test(
    name = "gsd-lifecycle",
    entry_point = "gsd-lifecycle.test.cjs",
    data = [
        "//integration/helpers:test_helpers",
    ],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "lifecycle"],
    timeout = "eternal",
)
```

- [ ] **Step 2: Verify build**

Run: `bazel build //integration/...`
Expected: Build succeeds (even though `gsd-lifecycle.test.cjs` doesn't exist yet — Bazel will fail on analysis, so we'll create the file first in Task 3)

- [ ] **Step 3: Commit**

```bash
git add integration/BUILD.bazel
git commit -m "build(integration): add lifecycle test target with eternal timeout"
```

---

### Task 3: Create `gsd-lifecycle.test.cjs` — scaffold and pre-checks

**Files:**
- Create: `integration/gsd-lifecycle.test.cjs`

- [ ] **Step 1: Create the test file with sandbox bootstrap and pre-checks**

```javascript
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, runClaudeWithTools } = require('./helpers/claude-runner.cjs');

/**
 * GSD Lifecycle Pipeline — Full end-to-end integration test.
 *
 * Runs the complete GSD lifecycle in an isolated sandbox:
 * new-project → discuss → plan → critique → execute → mistake → taste → verify → progress → stats
 *
 * Validates all 6 fork features:
 * 1. Multi-user resolution (steps 1, 9)
 * 2. Code-search integration (pre-check)
 * 3. Critic agents (step 4)
 * 4. Dynamic researchers (step 3)
 * 5. Mistake registry (step 6)
 * 6. Taste library (step 7)
 *
 * Cost: ~$50-80 per run. Duration: ~20-30 minutes.
 * Run selectively: bazel test //integration:gsd-lifecycle
 * Exclude: bazel test //integration/... --test_tag_filters=-lifecycle
 */

describe('GSD lifecycle pipeline', () => {
  let sandbox;
  const userSlug = 'test-user';

  // Shared options for all Claude calls in the pipeline
  function claudeOpts(prompt) {
    return {
      cwd: sandbox,
      timeout: 300_000,
      maxBudget: 10,
      addDirs: [path.join(sandbox, '.claude')],
      env: { GSD_USER: userSlug },
    };
  }

  // Helper: run Claude skill in sandbox
  function runSkill(prompt) {
    const opts = claudeOpts();
    return runClaudeWithTools(prompt, opts);
  }

  // Helper: find files matching pattern in directory tree
  function findFiles(dir, pattern) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(d, entry.name));
        else if (pattern.test(entry.name)) results.push(path.join(d, entry.name));
      }
    };
    walk(dir);
    return results;
  }

  // Helper: read YAML frontmatter from a markdown file
  function readFrontmatter(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
  }

  before(() => {
    sandbox = createSandbox('lifecycle');
  });

  // ── Pre-checks: Fork integrity ──────────────────────────────────

  test('pre-check: fork-only modules exist in sandbox', () => {
    const libDir = path.join(sandbox, '.claude', 'get-shit-done', 'bin', 'lib');
    const required = ['identity.cjs', 'context.cjs', 'taste.cjs'];
    for (const mod of required) {
      assert.ok(fs.existsSync(path.join(libDir, mod)),
        `Fork module missing from sandbox: ${mod}`);
    }
  });

  test('pre-check: fork patches intact in sandbox', () => {
    const libDir = path.join(sandbox, '.claude', 'get-shit-done', 'bin', 'lib');
    const core = fs.readFileSync(path.join(libDir, 'core.cjs'), 'utf-8');
    assert.ok(core.includes('tryGetPlanningContext'),
      'core.cjs missing tryGetPlanningContext — fork patch not present in sandbox');
    const init = fs.readFileSync(path.join(libDir, 'init.cjs'), 'utf-8');
    assert.ok(init.includes('active_user') && init.includes('active_project'),
      'init.cjs missing active_user/active_project — fork patch not present in sandbox');
  });

  test('pre-check: critic agents exist in sandbox', () => {
    const agentsDir = path.join(sandbox, '.claude', 'agents');
    const critics = fs.readdirSync(agentsDir).filter(f => f.startsWith('gsd-critic-'));
    assert.ok(critics.length >= 6,
      `Expected >= 6 critic agents, found ${critics.length}: ${critics.join(', ')}`);
  });

  test('pre-check: researcher files exist in sandbox', () => {
    const researchersDir = path.join(sandbox, '.claude', 'get-shit-done', 'researchers');
    const researchers = fs.readdirSync(researchersDir).filter(f => f.endsWith('.md'));
    assert.ok(researchers.length >= 11,
      `Expected >= 11 researchers, found ${researchers.length}`);
  });

  test('pre-check: no raw code-search template markers in agents', () => {
    const agentsDir = path.join(sandbox, '.claude', 'agents');
    for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
      assert.ok(!content.includes('<!-- code-search-tools -->'),
        `Raw code-search marker found in ${file} — template expansion failed`);
    }
  });

  // ── Step 1: /gsd-new-project ────────────────────────────────────

  test('step 1: /gsd-new-project creates project under multi-user path', () => {
    const result = runSkill(
      'Run /gsd-new-project. The project is called "test-widget" — a Node.js CLI tool that generates JSON reports from CSV files. Keep it simple, 2-3 phases max. Answer any questions with reasonable defaults.'
    );
    assert.ok(result.success, `gsd-new-project failed: ${result.error || result.result.slice(0, 500)}`);
    assert.ok(result.turns >= 3, `Expected >= 3 tool turns, got ${result.turns}`);

    // Find the project directory — it should be under .planning/users/test-user/
    const userDir = path.join(sandbox, '.planning', 'users', userSlug);
    const projects = fs.existsSync(userDir)
      ? fs.readdirSync(userDir).filter(f => f !== '.active' && fs.statSync(path.join(userDir, f)).isDirectory())
      : [];
    assert.ok(projects.length >= 1,
      `No project directory created under ${userDir}. Contents: ${fs.readdirSync(userDir).join(', ')}`);

    const projectDir = path.join(userDir, projects[0]);

    // PROJECT.md exists
    const projectMd = findFiles(projectDir, /PROJECT\.md$/);
    assert.ok(projectMd.length >= 1, `PROJECT.md not found in ${projectDir}`);

    // STATE.md exists with frontmatter
    const stateMd = findFiles(projectDir, /STATE\.md$/);
    assert.ok(stateMd.length >= 1, `STATE.md not found in ${projectDir}`);
    const stateFm = readFrontmatter(stateMd[0]);
    assert.ok(stateFm && stateFm.includes('gsd_state_version'),
      'STATE.md missing gsd_state_version in frontmatter');

    // ROADMAP.md exists
    const roadmapMd = findFiles(projectDir, /ROADMAP\.md$/);
    assert.ok(roadmapMd.length >= 1, `ROADMAP.md not found in ${projectDir}`);
    const roadmapContent = fs.readFileSync(roadmapMd[0], 'utf-8');
    assert.ok(roadmapContent.includes('Phase') || roadmapContent.includes('phase'),
      'ROADMAP.md does not mention any phases');
  });

  // ── Step 2: /gsd-discuss-phase --auto ───────────────────────────

  test('step 2: /gsd-discuss-phase --auto creates CONTEXT.md', { skip: !findPhaseDir() && 'Step 1 prerequisite missing' }, () => {
    const result = runSkill(
      'Run /gsd-discuss-phase 1 --auto to discuss the first phase with auto-defaults.'
    );
    assert.ok(result.success, `gsd-discuss-phase failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    assert.ok(phaseDir, 'Phase directory not found after discuss');

    const contextFiles = findFiles(phaseDir, /CONTEXT\.md$/i);
    assert.ok(contextFiles.length >= 1, `CONTEXT.md not found in ${phaseDir}`);
    const content = fs.readFileSync(contextFiles[0], 'utf-8');
    assert.ok(content.includes('decision') || content.includes('Decision') || content.includes('<decisions>'),
      'CONTEXT.md does not contain decisions section');
  });

  // ── Step 3: /gsd-plan-phase ─────────────────────────────────────

  test('step 3: /gsd-plan-phase creates plans with frontmatter', { skip: !findPhaseDir() && 'Step 1 prerequisite missing' }, () => {
    const result = runSkill(
      'Run /gsd-plan-phase 1 to create the implementation plan for phase 1.'
    );
    assert.ok(result.success, `gsd-plan-phase failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const plans = findFiles(phaseDir, /-PLAN\.md$/);
    assert.ok(plans.length >= 1, `No PLAN.md files found in ${phaseDir}`);

    // Check first plan has proper frontmatter
    const planContent = fs.readFileSync(plans[0], 'utf-8');
    const fm = readFrontmatter(plans[0]);
    assert.ok(fm, `Plan ${plans[0]} has no YAML frontmatter`);
    assert.ok(fm.includes('wave'), `Plan frontmatter missing 'wave'`);
    assert.ok(fm.includes('files_modified'), `Plan frontmatter missing 'files_modified'`);
    assert.ok(planContent.includes('## Tasks') || planContent.includes('<task'),
      'Plan has no Tasks section or <task> blocks');

    // Dynamic researchers: check if RESEARCH.md was created
    const research = findFiles(phaseDir, /RESEARCH\.md$/i);
    if (research.length > 0) {
      const researchContent = fs.readFileSync(research[0], 'utf-8');
      assert.ok(researchContent.length > 100,
        'RESEARCH.md exists but has minimal content — researcher may not have produced output');
    }
    // (RESEARCH.md is optional — some phases skip it. Not a failure if missing.)
  });

  // ── Step 4: /gsd-critique ───────────────────────────────────────

  test('step 4: /gsd-critique produces severity-classified findings', { skip: !findPlans() && 'Step 3 prerequisite missing (no plans)' }, () => {
    const result = runSkill(
      'Run /gsd-critique 1 to review the phase 1 plans.'
    );
    assert.ok(result.success, `gsd-critique failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const critiques = findFiles(phaseDir, /CRITIQUE\.md$/i);
    assert.ok(critiques.length >= 1, `CRITIQUE.md not found in ${phaseDir}`);

    const content = fs.readFileSync(critiques[0], 'utf-8');
    // Must contain at least one severity level
    const hasSeverity = content.toLowerCase().includes('critical') ||
                        content.toLowerCase().includes('warning') ||
                        content.toLowerCase().includes('info');
    assert.ok(hasSeverity,
      'CRITIQUE.md does not contain severity classifications (critical/warning/info)');
  });

  // ── Step 5: /gsd-execute-phase ──────────────────────────────────

  test('step 5: /gsd-execute-phase creates summaries and commits', { skip: !findPlans() && 'Step 3 prerequisite missing (no plans)' }, () => {
    const result = runSkill(
      'Run /gsd-execute-phase 1 to execute all plans in phase 1.'
    );
    assert.ok(result.success, `gsd-execute-phase failed: ${result.error || result.result.slice(0, 500)}`);
    assert.ok(result.turns >= 5,
      `Expected >= 5 tool turns for execution, got ${result.turns}`);

    const phaseDir = findPhaseDir();
    const summaries = findFiles(phaseDir, /-SUMMARY\.md$/);
    assert.ok(summaries.length >= 1, `No SUMMARY.md files found in ${phaseDir}`);

    // Check summary has frontmatter with key_files
    const fm = readFrontmatter(summaries[0]);
    assert.ok(fm, `SUMMARY ${summaries[0]} has no frontmatter`);
    assert.ok(fm.includes('key_files') || fm.includes('key-files'),
      'SUMMARY frontmatter missing key_files');

    // Git commits exist from execution
    const { execFileSync } = require('child_process');
    const log = execFileSync('git', ['log', '--oneline', '-20'], {
      cwd: sandbox, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(log.split('\n').length >= 3,
      `Expected multiple commits from execution, git log shows: ${log.slice(0, 300)}`);
  });

  // ── Step 6: /gsd-add-mistake ────────────────────────────────────

  test('step 6: /gsd-add-mistake creates entry with correct format', () => {
    const result = runSkill(
      'Run /gsd-add-mistake. The mistake: "Test assertions were too loose — checking only string length instead of structural correctness, which let broken skills pass silently." Area: testing. Confirm creation when prompted.'
    );
    assert.ok(result.success, `gsd:add-mistake failed: ${result.error || result.result.slice(0, 500)}`);

    // Find mistakes directory
    const mistakeDirs = findFiles(path.join(sandbox, '.planning'), /^mistakes$/);
    let mistakeDir = null;
    // Walk to find the mistakes directory
    const walkForDir = (dir, target) => {
      if (!fs.existsSync(dir)) return null;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === target) return path.join(dir, entry.name);
          const found = walkForDir(path.join(dir, entry.name), target);
          if (found) return found;
        }
      }
      return null;
    };
    mistakeDir = walkForDir(path.join(sandbox, '.planning'), 'mistakes');
    assert.ok(mistakeDir, 'mistakes/ directory not created');

    const entries = fs.readdirSync(mistakeDir).filter(f => f.endsWith('.md'));
    assert.ok(entries.length >= 1, `No mistake entries found in ${mistakeDir}`);

    // Validate format
    const entry = fs.readFileSync(path.join(mistakeDir, entries[0]), 'utf-8');
    assert.ok(entries[0].match(/^\d{3}-/), `Filename should start with NNN-: ${entries[0]}`);
    const fm = readFrontmatter(path.join(mistakeDir, entries[0]));
    assert.ok(fm, 'Mistake entry has no frontmatter');
    assert.ok(fm.includes('id'), 'Mistake frontmatter missing id');
    assert.ok(fm.includes('active'), 'Mistake frontmatter missing status: active');
    assert.ok(entry.includes('## What Happened') || entry.includes('## what happened'),
      'Mistake entry missing "What Happened" section');
  });

  // ── Step 7: /gsd-add-taste ──────────────────────────────────────

  test('step 7: /gsd-add-taste creates entry with correct format', () => {
    const result = runSkill(
      'Run /gsd-add-taste. The preference: "Always use assert.strictEqual over assert.ok for value comparisons. Loose assertions hide bugs and create false confidence." Domain: testing. Confidence: high. Confirm when prompted.'
    );
    assert.ok(result.success, `gsd:add-taste failed: ${result.error || result.result.slice(0, 500)}`);

    // Find taste directory
    const tasteDir = walkForDir(path.join(sandbox, '.planning'), 'taste');
    assert.ok(tasteDir, 'taste/ directory not created');

    const entries = fs.readdirSync(tasteDir).filter(f => f.endsWith('.md'));
    assert.ok(entries.length >= 1, `No taste entries found in ${tasteDir}`);

    // Validate format
    const fm = readFrontmatter(path.join(tasteDir, entries[0]));
    assert.ok(fm, 'Taste entry has no frontmatter');
    assert.ok(fm.includes('id'), 'Taste frontmatter missing id');
    assert.ok(fm.includes('domain'), 'Taste frontmatter missing domain');
    assert.ok(fm.includes('confidence'), 'Taste frontmatter missing confidence');
  });

  // ── Step 8: /gsd-verify-work ────────────────────────────────────

  test('step 8: /gsd-verify-work creates VERIFICATION.md', { skip: !findSummaries() && 'Step 5 prerequisite missing (no summaries)' }, () => {
    const result = runSkill(
      'Run /gsd-verify-work 1 to verify phase 1. Approve any human verification items.'
    );
    assert.ok(result.success, `gsd-verify-work failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const verifications = findFiles(phaseDir, /VERIFICATION\.md$/i);
    assert.ok(verifications.length >= 1, `VERIFICATION.md not found in ${phaseDir}`);

    const fm = readFrontmatter(verifications[0]);
    assert.ok(fm, 'VERIFICATION.md has no frontmatter');
    assert.ok(fm.includes('status'),
      'VERIFICATION.md frontmatter missing status field');
  });

  // ── Step 9: /gsd-progress ───────────────────────────────────────

  test('step 9: /gsd-progress shows project state', () => {
    const result = runSkill('Run /gsd-progress and show the output.');
    assert.ok(result.success, `gsd-progress failed: ${result.error || result.result.slice(0, 500)}`);
    assert.ok(result.turns >= 2, `Expected >= 2 tool turns, got ${result.turns}`);

    const output = result.result.toLowerCase();
    assert.ok(
      output.includes('phase') || output.includes('plan') || output.includes('progress'),
      `Output missing project state markers. Got: ${result.result.slice(0, 500)}`
    );
  });

  // ── Step 10: /gsd-stats ─────────────────────────────────────────

  test('step 10: /gsd-stats shows project metrics', () => {
    const result = runSkill('Run /gsd-stats and show the output.');
    assert.ok(result.success, `gsd-stats failed: ${result.error || result.result.slice(0, 500)}`);
    assert.ok(result.turns >= 2, `Expected >= 2 tool turns, got ${result.turns}`);

    const output = result.result.toLowerCase();
    assert.ok(
      output.includes('phase') || output.includes('plan') || output.includes('commit'),
      `Output missing stats markers. Got: ${result.result.slice(0, 500)}`
    );
  });

  // ── Helpers (defined inside describe for access to `sandbox`) ───

  function findPhaseDir() {
    const userDir = path.join(sandbox, '.planning', 'users', userSlug);
    if (!fs.existsSync(userDir)) return null;
    // Find first project, then first phase directory
    for (const proj of fs.readdirSync(userDir)) {
      if (proj === '.active') continue;
      const phasesDir = path.join(userDir, proj, 'phases');
      if (!fs.existsSync(phasesDir)) continue;
      const phases = fs.readdirSync(phasesDir).filter(f =>
        fs.statSync(path.join(phasesDir, f)).isDirectory()
      );
      if (phases.length > 0) return path.join(phasesDir, phases[0]);
    }
    return null;
  }

  function findPlans() {
    const phaseDir = findPhaseDir();
    if (!phaseDir) return null;
    const plans = findFiles(phaseDir, /-PLAN\.md$/);
    return plans.length > 0 ? plans : null;
  }

  function findSummaries() {
    const phaseDir = findPhaseDir();
    if (!phaseDir) return null;
    const summaries = findFiles(phaseDir, /-SUMMARY\.md$/);
    return summaries.length > 0 ? summaries : null;
  }

  function walkForDir(dir, target) {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === target) return path.join(dir, entry.name);
        const found = walkForDir(path.join(dir, entry.name), target);
        if (found) return found;
      }
    }
    return null;
  }
});
```

- [ ] **Step 2: Verify the file parses**

Run: `node -c integration/gsd-lifecycle.test.cjs`
Expected: No output (valid syntax)

- [ ] **Step 3: Verify Bazel can analyze it**

Run: `bazel build //integration:gsd-lifecycle`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add integration/gsd-lifecycle.test.cjs
git commit -m "feat(integration): add GSD lifecycle pipeline test covering all 6 fork features"
```

---

### Task 4: Create fixtures placeholder directory

**Files:**
- Create: `integration/fixtures/.gitkeep`

- [ ] **Step 1: Create directory with gitkeep**

```bash
mkdir -p integration/fixtures
touch integration/fixtures/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add integration/fixtures/.gitkeep
git commit -m "chore(integration): add fixtures placeholder directory"
```

---

### Task 5: Run the lifecycle test and fix issues

**Files:**
- Possibly modify: `integration/gsd-lifecycle.test.cjs`, `integration/helpers/claude-runner.cjs`

- [ ] **Step 1: Run the lifecycle test**

Run: `bazel test //integration:gsd-lifecycle --test_output=all`

This will take 20-30 minutes and cost $50-80. Watch the output for each step.

- [ ] **Step 2: Fix any failures**

Common issues to watch for:
- `walkForDir` is defined inside `describe` but referenced before declaration in step 7 — move it above the tests or make it a top-level function
- `--add-dir` path issues under Bazel — ensure `sandbox` path is absolute
- Skill skip conditions need to handle the case where `findPhaseDir()` returns null but the test should still attempt (the `{ skip: ... }` syntax evaluates at test registration time, not at run time — may need `before` hooks instead)
- Claude may not name the project exactly "test-widget" — assertions should be flexible on naming

Fix each issue, re-run the failing test, commit each fix.

- [ ] **Step 3: Final full run**

Run: `bazel test //integration/... --cache_test_results=no`
Expected: All tests pass (existing + lifecycle)

- [ ] **Step 4: Commit all fixes**

```bash
git add integration/
git commit -m "fix(integration): resolve lifecycle test issues found during first run"
```

---

### Task 6: Push and verify

- [ ] **Step 1: Push**

```bash
git push origin recovery/upstream-sync
```

- [ ] **Step 2: Verify the full test suite output**

Run: `bazel test //integration/... --test_tag_filters=-lifecycle --cache_test_results=no`
Expected: All non-lifecycle tests pass (fast, < 5 min)

Run: `bazel test //integration:gsd-lifecycle --test_output=all`
Expected: All 15 tests pass (pre-checks + pipeline steps)
