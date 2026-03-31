/**
 * GSD Tools Tests - audit-paths.test.cjs
 *
 * PATH-13: Grep audit gate for .planning/ references.
 * Scans all .cjs and .md source files for hardcoded .planning/ references
 * and fails if any unallowlisted references remain.
 *
 * REPORT MODE: This test runs and reports violations but is NOT added to the
 * main test runner (scripts/run-tests.cjs) until Plan 05 activates BLOCKING MODE.
 * Run explicitly: node --test tests/audit-paths.test.cjs
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
        'grep -rn "\\.planning/" --include="*.cjs" .',
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
    const allowlist = [
      'audit-paths.test.cjs', // this test itself
      'helpers.cjs',          // test helper that builds .planning/ directories
      'core.test.cjs',        // already migrated in Plan 01
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
