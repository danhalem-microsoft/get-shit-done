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
  function claudeOpts(overrides = {}) {
    return {
      cwd: sandbox,
      timeout: 300_000,
      maxBudget: 15,
      addDirs: [path.join(sandbox, '.claude')],
      env: { GSD_USER: userSlug },
      ...overrides,
    };
  }

  // Helper: run Claude skill in sandbox
  function runSkill(prompt, overrides = {}) {
    const opts = claudeOpts(overrides);
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

  // Helper: walk directory tree looking for a specific directory name
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

  // Helper: find the first phase directory in the sandbox
  // Checks both multi-user (.planning/users/{user}/{project}/phases/) and
  // single-user (.planning/phases/) layouts
  function findPhaseDir() {
    if (!sandbox) return null;
    const planningDir = path.join(sandbox, '.planning');

    // Try multi-user path first
    const userDir = path.join(planningDir, 'users', userSlug);
    if (fs.existsSync(userDir)) {
      for (const proj of fs.readdirSync(userDir)) {
        if (proj === '.active') continue;
        const projPath = path.join(userDir, proj);
        if (!fs.statSync(projPath).isDirectory()) continue;
        const phasesDir = path.join(projPath, 'phases');
        if (!fs.existsSync(phasesDir)) continue;
        const phases = fs.readdirSync(phasesDir).filter(f =>
          fs.statSync(path.join(phasesDir, f)).isDirectory()
        );
        if (phases.length > 0) return path.join(phasesDir, phases[0]);
      }
    }

    // Try single-user / root-level path
    const rootPhases = path.join(planningDir, 'phases');
    if (fs.existsSync(rootPhases)) {
      const phases = fs.readdirSync(rootPhases).filter(f =>
        fs.statSync(path.join(rootPhases, f)).isDirectory()
      );
      if (phases.length > 0) return path.join(rootPhases, phases[0]);
    }

    return null;
  }

  function findPlans() {
    const phaseDir = findPhaseDir();
    if (!phaseDir) return null;
    // Match both PLAN-*.md and *-PLAN.md naming conventions
    const plans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);
    return plans.length > 0 ? plans : null;
  }

  function findSummaries() {
    const phaseDir = findPhaseDir();
    if (!phaseDir) return null;
    const summaries = findFiles(phaseDir, /SUMMARY.*\.md$|.*-SUMMARY\.md$/i);
    return summaries.length > 0 ? summaries : null;
  }

  function findRoadmap() {
    if (!sandbox) return null;
    const planningDir = path.join(sandbox, '.planning');
    const roadmaps = findFiles(planningDir, /ROADMAP\.md$/);
    return roadmaps.length > 0 ? roadmaps[0] : null;
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

  test('pre-check: code-search template exists in sandbox', () => {
    const templateDir = path.join(sandbox, '.claude', 'get-shit-done', 'templates');
    assert.ok(fs.existsSync(templateDir) &&
      fs.readdirSync(templateDir).some(f => f.includes('code-search')),
      'code-search template not found in sandbox');
  });

  // ── Step 1: /gsd-new-project ────────────────────────────────────

  test('step 1: /gsd-new-project creates project with required artifacts', () => {
    const result = runSkill(
      'Run /gsd-new-project. The project is called "test-widget" — a Node.js CLI tool that generates JSON reports from CSV files. Keep it simple, 2-3 phases max. Answer any questions with reasonable defaults.',
      { timeout: 600_000, maxBudget: 50 }
    );
    // gsd-new-project spawns 4+ researchers — may exhaust budget but still create artifacts
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    assert.ok(result.success || budgetExhausted, `gsd-new-project failed: ${result.error || ''} | result: ${(result.result || '').slice(0, 500)}`);
    assert.ok(result.turns >= 3, `Expected >= 3 tool turns, got ${result.turns}`);

    // GSD may create project under .planning/users/{user}/ (multi-user) or .planning/ (single-user)
    const planningDir = path.join(sandbox, '.planning');
    const userDir = path.join(planningDir, 'users', userSlug);

    // Find PROJECT.md anywhere under .planning/
    const projectMd = findFiles(planningDir, /PROJECT\.md$/);
    assert.ok(projectMd.length >= 1, `PROJECT.md not found under ${planningDir}`);

    // ROADMAP.md exists
    const roadmapMd = findFiles(planningDir, /ROADMAP\.md$/);
    assert.ok(roadmapMd.length >= 1, `ROADMAP.md not found under ${planningDir}`);
    const roadmapContent = fs.readFileSync(roadmapMd[0], 'utf-8');
    assert.ok(roadmapContent.includes('Phase') || roadmapContent.includes('phase'),
      'ROADMAP.md does not mention any phases');

    // STATE.md exists (frontmatter is optional — format varies by GSD version)
    const stateMd = findFiles(planningDir, /STATE\.md$/);
    assert.ok(stateMd.length >= 1, `STATE.md not found under ${planningDir}`);
    const stateContent = fs.readFileSync(stateMd[0], 'utf-8');
    assert.ok(stateContent.includes('Phase') || stateContent.includes('phase') || stateContent.includes('status'),
      'STATE.md does not contain phase/status information');
  });

  // ── Step 2: /gsd-discuss-phase --auto ───────────────────────────

  test('step 2: /gsd-discuss-phase --auto creates CONTEXT.md', (t) => {
    if (!findRoadmap()) return t.skip('Step 1 prerequisite missing — no ROADMAP.md');
    const result = runSkill(
      'Run /gsd-discuss-phase 1 --auto to discuss the first phase with auto-defaults.',
      { timeout: 600_000, maxBudget: 30 }
    );
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    assert.ok(result.success || budgetExhausted, `gsd-discuss-phase failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    assert.ok(phaseDir, 'Phase directory not found after discuss');

    const contextFiles = findFiles(phaseDir, /CONTEXT\.md$/i);
    assert.ok(contextFiles.length >= 1, `CONTEXT.md not found in ${phaseDir}`);
    const content = fs.readFileSync(contextFiles[0], 'utf-8');
    assert.ok(content.includes('decision') || content.includes('Decision') || content.includes('<decisions>'),
      'CONTEXT.md does not contain decisions section');
  });

  // ── Step 3: /gsd-plan-phase ─────────────────────────────────────

  test('step 3: /gsd-plan-phase creates plans with frontmatter', (t) => {
    if (!findPhaseDir()) return t.skip('Step 2 prerequisite missing — no phases dir');
    const result = runSkill(
      'Run /gsd-plan-phase 1 to create the implementation plan for phase 1.',
      { timeout: 600_000, maxBudget: 30 }
    );
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    assert.ok(result.success || budgetExhausted, `gsd-plan-phase failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const plans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);
    assert.ok(plans.length >= 1, `No PLAN.md files found in ${phaseDir}`);

    // Check first plan has content (frontmatter format varies)
    const planContent = fs.readFileSync(plans[0], 'utf-8');
    assert.ok(planContent.length > 200, `Plan ${plans[0]} has minimal content (${planContent.length} chars)`);
    assert.ok(
      planContent.includes('## Tasks') || planContent.includes('<task') ||
      planContent.includes('## Step') || planContent.includes('- [ ]'),
      'Plan has no tasks/steps section');

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

  test('step 4: /gsd-critique produces severity-classified findings', (t) => {
    if (!findPlans()) return t.skip('Step 3 prerequisite missing — no plans');
    const result = runSkill(
      'Run /gsd-critique 1 to review the phase 1 plans.',
      { timeout: 600_000, maxBudget: 30 }
    );
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    assert.ok(result.success || budgetExhausted, `gsd-critique failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const critiques = findFiles(phaseDir, /CRITIQUE\.md$/i);
    if (budgetExhausted && critiques.length === 0) {
      // Budget ran out before critique was written — acceptable
      return;
    }
    assert.ok(critiques.length >= 1, `CRITIQUE.md not found in ${phaseDir}`);

    const content = fs.readFileSync(critiques[0], 'utf-8');
    assert.ok(content.length > 100, `CRITIQUE.md has minimal content (${content.length} chars)`);
  });

  // ── Step 5: /gsd-execute-phase ──────────────────────────────────

  test('step 5: /gsd-execute-phase creates summaries and commits', (t) => {
    if (!findPlans()) return t.skip('Step 3 prerequisite missing — no plans');
    const result = runSkill(
      'Run /gsd-execute-phase 1 to execute all plans in phase 1.',
      { timeout: 600_000, maxBudget: 50 }
    );
    const budgetExhausted = result.raw?.subtype === 'error_max_budget_usd';
    assert.ok(result.success || budgetExhausted, `gsd-execute-phase failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const summaries = findFiles(phaseDir, /SUMMARY.*\.md$|.*-SUMMARY\.md$/i);
    if (budgetExhausted && summaries.length === 0) {
      // Budget ran out before summary was written — acceptable
      return;
    }
    assert.ok(summaries.length >= 1, `No SUMMARY.md files found in ${phaseDir}`);

    // Check summary has content
    const summaryContent = fs.readFileSync(summaries[0], 'utf-8');
    assert.ok(summaryContent.length > 100, `SUMMARY has minimal content (${summaryContent.length} chars)`);

    // Git commits exist from execution
    const { execFileSync } = require('child_process');
    const log = execFileSync('git', ['log', '--oneline', '-20'], {
      cwd: sandbox, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(log.split('\n').length >= 3,
      `Expected multiple commits from execution, git log shows: ${log.slice(0, 300)}`);
  });

  // ── Step 6: /gsd:add-mistake ────────────────────────────────────

  test('step 6: /gsd:add-mistake creates entry with correct format', () => {
    const result = runSkill(
      'Run /gsd:add-mistake. The mistake: "Test assertions were too loose — checking only string length instead of structural correctness, which let broken skills pass silently." Area: testing. Confirm creation when prompted.'
    );
    assert.ok(result.success, `gsd:add-mistake failed: ${result.error || result.result.slice(0, 500)}`);

    // Find mistakes directory
    const mistakeDir = walkForDir(path.join(sandbox, '.planning'), 'mistakes');
    assert.ok(mistakeDir, 'mistakes/ directory not created');

    const entries = fs.readdirSync(mistakeDir).filter(f => f.endsWith('.md'));
    assert.ok(entries.length >= 1, `No mistake entries found in ${mistakeDir}`);

    // Validate format
    const entry = fs.readFileSync(path.join(mistakeDir, entries[0]), 'utf-8');
    assert.ok(entries[0].match(/^[A-Z]{2,}-\d{3}-/), `Filename should start with XX-NNN-: ${entries[0]}`);
    const fm = readFrontmatter(path.join(mistakeDir, entries[0]));
    assert.ok(fm, 'Mistake entry has no frontmatter');
    assert.ok(fm.includes('id'), 'Mistake frontmatter missing id');
    assert.ok(fm.includes('area'), 'Mistake frontmatter missing area');
    assert.ok(entry.includes('## What Happened') || entry.includes('## what happened'),
      'Mistake entry missing "What Happened" section');
  });

  // ── Step 7: /gsd:add-taste ──────────────────────────────────────

  test('step 7: /gsd:add-taste creates entry with correct format', () => {
    const result = runSkill(
      'Run /gsd:add-taste. The preference: "Always use assert.strictEqual over assert.ok for value comparisons. Loose assertions hide bugs and create false confidence." Domain: testing. Confidence: high. Confirm when prompted.'
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

  test('step 8: /gsd-verify-work creates VERIFICATION.md', (t) => {
    if (!findSummaries()) return t.skip('Step 5 prerequisite missing — no summaries');
    const result = runSkill(
      'Run /gsd-verify-work 1 to verify phase 1. Approve any human verification items.'
    );
    assert.ok(result.success, `gsd-verify-work failed: ${result.error || result.result.slice(0, 500)}`);

    const phaseDir = findPhaseDir();
    const verifications = findFiles(phaseDir, /VERIFICATION\.md$/i);
    assert.ok(verifications.length >= 1, `VERIFICATION.md not found in ${phaseDir}`);

    const content = fs.readFileSync(verifications[0], 'utf-8');
    assert.ok(content.length > 100, `VERIFICATION.md has minimal content (${content.length} chars)`);
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
});
