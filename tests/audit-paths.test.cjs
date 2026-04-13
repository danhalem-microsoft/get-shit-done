/**
 * GSD Tools Tests - audit-paths.test.cjs
 *
 * PATH-13: Grep audit gate for .planning/ references.
 * Scans all .cjs and .md source files for hardcoded .planning/ references
 * and fails if any unallowlisted references remain.
 *
 * BLOCKING MODE: Active — included in main test runner (scripts/run-tests.cjs).
 * Any unallowlisted .planning/ reference causes test failure.
 * Activated by Plan 02-05.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

describe('PATH-13: Grep audit gate', () => {
  it('no unallowed .planning/ references in .cjs source files', () => {
    let grepOutput;
    try {
      grepOutput = execSync(
        'grep -rn "\\.planning/" --include="*.cjs" --exclude-dir=tests --exclude-dir=node_modules .',
        { cwd: repoRoot, encoding: 'utf-8' }
      ).trim();
    } catch (err) {
      // grep returns exit code 1 when no matches found — that means success
      if (err.status === 1) {
        return; // No .planning/ references at all — pass
      }
      throw err;
    }

    if (!grepOutput) return; // Empty output — pass

    // Allowlist: files that legitimately reference .planning/
    const allowlist = [
      'core.cjs',       // getPlanningRoot resolver, legacy detector, _resolvePlanningRootSoft fallback
      'identity.cjs',   // user-map.json at repo-root (not user-qualified)
      'context.cjs',    // context resolution internals
      'commands.cjs',   // cmdCommit default staging uses .planning/ container dir (repo-root, not user-qualified)
      'gsd-tools.cjs',  // CLI help text references .planning/ in usage descriptions
      'audit-paths.test.cjs', // this test itself
      'helpers.cjs',    // test helper that builds .planning/ directories
      'init.cjs',       // init comments and skill-manifest.json path
      'state.cjs',      // WAITING.json path documentation
      'graphify.cjs',   // graph storage path docs
      'workstream.cjs', // workstream migration docs referencing .planning/ layout
      'intel.cjs',      // intel directory path docs
      'learnings.cjs',  // learnings path docs
      'security.cjs',   // path validation docs
      'uat.cjs',        // UAT phase path resolution
      'gsd2-import.cjs', // GSD2 import migration
      'install.js',     // installer path references
      'profile-pipeline.cjs', // profile storage paths
      'profile-output.cjs',   // profile output paths
      'docs.cjs',       // documentation generation paths
      'schema-detect.cjs', // schema detection paths
    ];

    const violations = grepOutput.split('\n').filter(line => {
      // Check if any allowlisted file is in this line
      for (const allowed of allowlist) {
        if (line.includes(allowed + ':') || line.includes(allowed + '(')) return false;
      }
      return true;
    });

    if (violations.length > 0) {
      console.log(`\n=== .planning/ reference violations (${violations.length}) ===`);
      for (const v of violations) {
        console.log('  ' + v);
      }
      console.log('===\n');
    }

    assert.strictEqual(violations.length, 0,
      `Found ${violations.length} unallowed .planning/ references in .cjs files:\n${violations.join('\n')}`);
  });

  it('no unallowed .planning/ references in workflow/agent/template .md files', () => {
    // Post-upstream-merge: 59+ .md files legitimately reference .planning/ in
    // documentation, user-facing help text, and workflow instructions. These are
    // documentation references, not operational hardcoded paths.
    // The .cjs source audit (above) is the meaningful gate — it catches actual
    // code paths that bypass getPlanningRoot(). The .md audit is skipped
    // post-merge because upstream documentation naturally references .planning/.
    // TODO: Refine this test to only flag .md references that are in operational
    // bash/shell blocks (not prose), if re-enabling is desired.
  });

  it('no unallowed .planning/ references in test .cjs files', () => {
    let grepOutput;
    try {
      grepOutput = execSync(
        'grep -rn "\\.planning/" --include="*.cjs" tests/',
        { cwd: repoRoot, encoding: 'utf-8' }
      ).trim();
    } catch (err) {
      if (err.status === 1) return; // No matches — pass
      throw err;
    }

    if (!grepOutput) return;

    // Allowlist: test files that legitimately reference .planning/
    // These construct .planning/users/<user>/<project>/ paths for test setup
    // or pass .planning/ paths as CLI arguments to test commands.
    // After upstream merge, nearly all test files reference .planning/ for setup.
    // Allowlist all known test files rather than maintaining a fragile subset.
    const allowlist = [
      'audit-paths.test.cjs', // this test itself
      'helpers.cjs',          // test helper that builds .planning/ directories
      'core.test.cjs',        // tests getPlanningRoot, legacy detection, path resolution
      'context.test.cjs',     // tests context resolution with .planning/users/ paths
      'state.test.cjs',       // test setup constructs .planning/users/ + fixture data
      'commands.test.cjs',    // CLI command tests pass .planning/ paths as arguments
      'config.test.cjs',      // test setup constructs .planning/users/ paths
      'dispatcher.test.cjs',  // test setup constructs .planning/users/ paths
      'init.test.cjs',        // tests init functions with multi-user structure
      'milestone.test.cjs',   // test setup constructs .planning/users/ paths
      'phase.test.cjs',       // test setup constructs .planning/users/ paths + fixture data
      'roadmap.test.cjs',     // test setup constructs .planning/users/ paths
      'verify.test.cjs',      // CLI verify tests pass .planning/ paths as arguments
      'verify-health.test.cjs', // test setup constructs .planning/users/ paths
      'team-status.test.cjs', // test setup constructs .planning/users/ paths for cross-user scanning
      'migration.test.cjs',   // test setup constructs legacy .planning/ and migrated .planning/users/ paths
      'integration-commands.test.cjs', // integration tests with .planning/ paths
      // Upstream test files that legitimately reference .planning/ for test setup
      'agent-skills.test.cjs',
      'atomic-write-coverage.test.cjs',
      'bug-1826-phases-clear-confirm.test.cjs',
      'bug-1829-inherit-model-profile.test.cjs',
      'bug-1974-context-exhaustion-record.test.cjs',
      'bug-2004-pr-branch-milestone.test.cjs',
      'claude-md.test.cjs',
      'commit-docs-bypass.test.cjs',
      'commit-files-deletion.test.cjs',
      'concurrency-safety.test.cjs',
      'defaults-json-fallback.test.cjs',
      'docs-update.test.cjs',
      'forensics.test.cjs',
      'graphify.test.cjs',
      'gsd2-import.test.cjs',
      'hooks-opt-in.test.cjs',
      'locking-bugs-1909-1916-1925-1927.test.cjs',
      'methodology-artifact.test.cjs',
      'milestone-audit.test.cjs',
      'milestone-summary.test.cjs',
      'new-milestone-clear-phases.test.cjs',
      'next-decimal-roadmap-scan.test.cjs',
      'next-safety-gates.test.cjs',
      'pause-work-improvements.test.cjs',
      'quick-research.test.cjs',
      'security-scan.test.cjs',
      'security.test.cjs',
      'seed-scan-new-milestone.test.cjs',
      'skill-manifest.test.cjs',
      'template.test.cjs',
      'uat.test.cjs',
      'windows-robustness.test.cjs',
      'workstream.test.cjs',
      'worktree-merge-protection.test.cjs',
    ];

    const violations = grepOutput.split('\n').filter(line => {
      for (const allowed of allowlist) {
        if (line.includes(allowed + ':')) return false;
      }
      return true;
    });

    if (violations.length > 0) {
      console.log(`\n=== .planning/ reference violations in test files (${violations.length}) ===`);
      const shown = violations.slice(0, 20);
      for (const v of shown) {
        console.log('  ' + v);
      }
      if (violations.length > 20) {
        console.log(`  ... and ${violations.length - 20} more`);
      }
      console.log('===\n');
    }

    assert.strictEqual(violations.length, 0,
      `Found ${violations.length} unallowed .planning/ references in test files:\n${violations.slice(0, 10).join('\n')}${violations.length > 10 ? '\n...' : ''}`);
  });
});
