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
    const mdDirs = [
      'get-shit-done/workflows',
      'get-shit-done/templates',
      'agents',
    ];

    let grepOutput = '';
    for (const dir of mdDirs) {
      try {
        const result = execSync(
          `grep -rn "\\.planning/" --include="*.md" "${dir}"`,
          { cwd: repoRoot, encoding: 'utf-8' }
        ).trim();
        if (result) {
          grepOutput += (grepOutput ? '\n' : '') + result;
        }
      } catch (err) {
        // grep returns exit code 1 when no matches found — that's fine
        if (err.status !== 1) throw err;
      }
    }

    if (!grepOutput) return; // No references — pass

    // Allowlist: files that may legitimately reference .planning/ in documentation
    const allowlist = [
      'audit-paths.test.cjs', // this test itself
      'team-status.md',       // user-facing display text explaining .planning/users/ structure
    ];

    const violations = grepOutput.split('\n').filter(line => {
      for (const allowed of allowlist) {
        if (line.includes(allowed + ':')) return false;
      }
      return true;
    });

    if (violations.length > 0) {
      console.log(`\n=== .planning/ reference violations in .md files (${violations.length}) ===`);
      // Show first 20 to avoid overwhelming output
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
      `Found ${violations.length} unallowed .planning/ references in .md files:\n${violations.slice(0, 10).join('\n')}${violations.length > 10 ? '\n...' : ''}`);
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
