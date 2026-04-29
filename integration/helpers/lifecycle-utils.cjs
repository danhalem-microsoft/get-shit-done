'use strict';

/**
 * Shared lifecycle test utilities (TEST-04).
 *
 * Extracted verbatim from integration/gsd-lifecycle.test.cjs lines 50-137 as part
 * of the Wave 0 lifecycle decomposition (Plan 01-02). Closure-captured variables
 * (`sandbox`, `userSlug`) have been converted to explicit parameters so each step
 * file can require these helpers directly.
 *
 * Functions:
 *   findFiles(dir, pattern)              — recursive file scan
 *   readFrontmatter(filePath)            — extract YAML frontmatter from .md
 *   walkForDir(dir, target)              — find directory by name (recursive)
 *   findPhaseDir(sandbox, userSlug)      — locate first phase dir (multi-user or root)
 *   findPlans(sandbox, userSlug)         — list PLAN.md / *-PLAN.md files in phase dir
 *   findSummaries(sandbox)               — list SUMMARY.md / *-SUMMARY.md under .planning
 *   findRoadmap(sandbox)                 — locate ROADMAP.md under .planning
 */

const fs = require('node:fs');
const path = require('node:path');

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
function findPhaseDir(sandbox, userSlug) {
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

function findPlans(sandbox, userSlug) {
  const phaseDir = findPhaseDir(sandbox, userSlug);
  if (!phaseDir) return null;
  // Match both PLAN-*.md and *-PLAN.md naming conventions
  const plans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);
  return plans.length > 0 ? plans : null;
}

function findSummaries(sandbox) {
  if (!sandbox) return null;
  const summaries = findFiles(path.join(sandbox, '.planning'), /SUMMARY.*\.md$|.*-SUMMARY\.md$/i);
  return summaries.length > 0 ? summaries : null;
}

function findRoadmap(sandbox) {
  if (!sandbox) return null;
  const planningDir = path.join(sandbox, '.planning');
  const roadmaps = findFiles(planningDir, /ROADMAP\.md$/);
  return roadmaps.length > 0 ? roadmaps[0] : null;
}

module.exports = { findFiles, readFrontmatter, walkForDir, findPhaseDir, findPlans, findSummaries, findRoadmap };
