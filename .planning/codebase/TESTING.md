# Testing Patterns

**Last Updated:** 2026-03-31
**Test Framework:** Node.js native test runner (`node:test`)
**Coverage Tool:** c8

---

## Testing Philosophy

**Principles:**
1. One test file per module (`.test.cjs` extension)
2. Native Node.js test runner — no Jest, Mocha, or external frameworks
3. Integration testing through CLI commands via `runGsdTools()`
4. Temporary filesystem fixtures for isolation
5. Regression tests for all reported bugs
6. 70% minimum line coverage for core library

---

## Test Framework

### Native Node.js Test Runner

```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('feature group', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test('descriptive test name', () => {
    // Test implementation
  });
});
```

**Available APIs:**
- `test(name, fn)` — Define a test case
- `describe(name, fn)` — Group related tests
- `beforeEach(fn)` — Setup before each test
- `afterEach(fn)` — Cleanup after each test
- `before(fn)` — Setup once before all tests (rarely used)
- `after(fn)` — Cleanup once after all tests (rarely used)

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
node --test tests/core.test.cjs

# Run tests matching pattern (via run-tests.cjs)
node scripts/run-tests.cjs
```

---

## Test File Structure

### Standard Layout

```javascript
/**
 * GSD Tools Tests - ModuleName
 *
 * [Optional: Requirements reference, bug tickets, etc.]
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// Import module under test
const {
  functionToTest,
  anotherFunction
} = require('../get-shit-done/bin/lib/module-name.cjs');

// ─── Feature Group 1 ──────────────────────────────────────────────────────────

describe('feature group 1', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('specific behavior', () => {
    // Arrange
    const input = 'test input';

    // Act
    const result = functionToTest(input);

    // Assert
    assert.strictEqual(result, 'expected output');
  });

  test('edge case', () => {
    // Test edge cases and error conditions
  });
});

// ─── Feature Group 2 ──────────────────────────────────────────────────────────

describe('feature group 2', () => {
  // More tests...
});
```

### File Naming

| Module | Test File |
|--------|-----------|
| `get-shit-done/bin/lib/core.cjs` | `tests/core.test.cjs` |
| `get-shit-done/bin/lib/state.cjs` | `tests/state.test.cjs` |
| `get-shit-done/bin/lib/config.cjs` | `tests/config.test.cjs` |
| PATH-13 grep audit gate | `tests/audit-paths.test.cjs` (excluded from main runner until Plan 05) |

---

## Multi-User Test Fixtures (Phase 2+)

### createTempMultiUserProject

For tests that exercise functions using `getPlanningRoot()` / `_resolvePlanningRootSoft()`:

```javascript
const { createTempMultiUserProject, cleanup } = require('./helpers.cjs');
const { clearPlanningRootCache } = require('../get-shit-done/bin/lib/core.cjs');

describe('feature', () => {
  let tmpDir, planningRoot;
  let savedGsdUser, savedGsdProject;

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

  test('reads from multi-user path', () => {
    fs.writeFileSync(path.join(tmpDir, planningRoot, 'ROADMAP.md'), '...');
    const result = someFunction(tmpDir);
    // ...
  });
});
```

**Key requirements:**
- Set `GSD_USER` and `GSD_PROJECT` env vars for in-process resolution
- Call `clearPlanningRootCache()` in afterEach (prevents stale memoized paths)
- Use `planningRoot` variable for file path construction, not hardcoded `.planning/`

---

## Test Helpers

### Helper Module (`tests/helpers.cjs`)

```javascript
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');

/**
 * Run gsd-tools command.
 * @param {string|string[]} args - Command string or array of arguments
 * @param {string} cwd - Working directory
 * @returns {{ success: boolean, output: string, error?: string }}
 */
function runGsdTools(args, cwd = process.cwd()) {
  try {
    let result;
    if (Array.isArray(args)) {
      // Array args: use execFileSync (no shell, safe for special chars)
      result = execFileSync(process.execPath, [TOOLS_PATH, ...args], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // String args: use execSync (shell interpretation)
      result = execSync(`node "${TOOLS_PATH}" ${args}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

/**
 * Create temporary project directory with .planning/phases structure.
 */
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

/**
 * Create temporary project with initialized git repo.
 */
function createTempGitProject() {
  const tmpDir = createTempProject();
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\nTest project.\n'
  );

  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

/**
 * Clean up temporary directory.
 */
function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = { runGsdTools, createTempProject, createTempGitProject, cleanup, TOOLS_PATH };
```

### Usage Patterns

**String args (shell-interpreted):**
```javascript
const result = runGsdTools('config-get model_profile', tmpDir);
```

**Array args (shell-bypassed, safe for special chars):**
```javascript
const result = runGsdTools(['state', 'add-decision', '--summary', 'Use $100 budget'], tmpDir);
```

---

## Assertion Patterns

### Strict Equality

```javascript
// Primitive values
assert.strictEqual(actual, expected, 'message');
assert.strictEqual(typeof value, 'string', 'should be string');
assert.strictEqual(config.model_profile, 'balanced');

// Booleans
assert.strictEqual(result.success, true);
assert.strictEqual(config.commit_docs, false);
```

### Deep Equality

```javascript
// Objects
assert.deepStrictEqual(result, { key: 'value', nested: { field: 123 } });

// Arrays
assert.deepStrictEqual(phases, ['01-foundation', '02-api', '03-frontend']);

// Partial object matching (extract relevant fields first)
const { phase, name } = result;
assert.deepStrictEqual({ phase, name }, { phase: '01', name: 'Foundation' });
```

### Truthiness

```javascript
// Existence checks
assert.ok(result.success, `Command failed: ${result.error}`);
assert.ok(config.workflow && typeof config.workflow === 'object');
assert.ok(fs.existsSync(filePath), 'file should exist');

// Array membership
assert.ok(result.plans.includes('01-01-PLAN.md'));
assert.ok(!result.section.includes('Phase 2'));  // Negation
```

### Negation

```javascript
// Not equal
assert.notStrictEqual(result.exitCode, 0);

// Not deep equal
assert.notDeepStrictEqual(config1, config2);
```

### Error Messages

Always include context in assertion messages:

```javascript
// ✓ Good
assert.ok(result.success, `Command failed: ${result.error}`);
assert.strictEqual(output.current_phase, '03', 'current phase extracted');

// ✗ Bad
assert.ok(result.success);
assert.strictEqual(output.current_phase, '03');
```

---

## Testing Patterns

### Unit Testing (Direct Function Calls)

```javascript
const { normalizePhaseName, comparePhaseNum } = require('../get-shit-done/bin/lib/core.cjs');

test('pads single digit', () => {
  assert.strictEqual(normalizePhaseName('1'), '01');
});

test('preserves double digit', () => {
  assert.strictEqual(normalizePhaseName('12'), '12');
});

test('sorts integer phases numerically', () => {
  assert.ok(comparePhaseNum('1', '2') < 0);
  assert.ok(comparePhaseNum('10', '2') > 0);
});
```

### Integration Testing (CLI Commands)

```javascript
test('creates config.json with expected structure', () => {
  const result = runGsdTools('config-ensure-section', tmpDir);
  assert.ok(result.success, `Command failed: ${result.error}`);

  const output = JSON.parse(result.output);
  assert.strictEqual(output.created, true);

  const config = JSON.parse(fs.readFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    'utf-8'
  ));
  assert.strictEqual(typeof config.model_profile, 'string');
  assert.strictEqual(typeof config.commit_docs, 'boolean');
});
```

### Filesystem Fixtures

```javascript
beforeEach(() => {
  tmpDir = createTempProject();

  // Write test fixtures
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    `# Project State
**Current Phase:** 03
**Status:** In progress`
  );

  // Create directory structure
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'));
});

afterEach(() => {
  cleanup(tmpDir);  // Remove temporary directory
});
```

### Testing JSON Output

```javascript
test('outputs structured JSON', () => {
  const result = runGsdTools('state-snapshot', tmpDir);
  assert.ok(result.success, `Command failed: ${result.error}`);

  // Parse and validate JSON structure
  const output = JSON.parse(result.output);
  assert.strictEqual(output.current_phase, '03');
  assert.strictEqual(typeof output.total_phases, 'number');
  assert.ok(Array.isArray(output.decisions));
});
```

### Testing Raw Output Mode

```javascript
test('supports --raw output mode', () => {
  const result = runGsdTools('config-get model_profile --raw', tmpDir);
  assert.ok(result.success);

  // Raw mode returns plain string, not JSON
  assert.strictEqual(result.output, 'balanced');

  // Should NOT be valid JSON
  assert.throws(() => JSON.parse(result.output));
});
```

### Testing Error Conditions

```javascript
test('returns error for missing STATE.md', () => {
  const result = runGsdTools('state-snapshot', tmpDir);
  assert.ok(result.success, 'command should succeed but return error object');

  const output = JSON.parse(result.output);
  assert.strictEqual(output.error, 'STATE.md not found');
});

test('handles invalid JSON in config gracefully', () => {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    'not valid json {{{{'
  );

  const config = loadConfig(tmpDir);
  assert.strictEqual(config.model_profile, 'balanced', 'should return defaults');
});
```

---

## Test Organization

### Grouping by Feature

```javascript
describe('loadConfig', () => {
  describe('defaults', () => {
    test('returns defaults when config.json is missing', () => {
      // ...
    });

    test('returns defaults when config.json contains invalid JSON', () => {
      // ...
    });
  });

  describe('nested keys', () => {
    test('reads branching_strategy from git section', () => {
      // ...
    });

    test('prefers top-level keys over nested keys', () => {
      // ...
    });
  });

  describe('model_overrides', () => {
    test('returns model_overrides when present (REG-01)', () => {
      // ...
    });

    test('returns model_overrides as null when not in config', () => {
      // ...
    });
  });
});
```

### Edge Cases and Boundaries

```javascript
describe('normalizePhaseName', () => {
  test('pads single digit', () => {
    assert.strictEqual(normalizePhaseName('1'), '01');
  });

  test('handles letter suffix', () => {
    assert.strictEqual(normalizePhaseName('1A'), '01A');
  });

  test('handles decimal phases', () => {
    assert.strictEqual(normalizePhaseName('2.1'), '02.1');
  });

  test('returns non-matching input unchanged', () => {
    assert.strictEqual(normalizePhaseName('abc'), 'abc');
  });
});
```

### Regression Tests

Document bug fixes with REG-XX identifiers:

```javascript
// Bug: loadConfig previously omitted model_overrides from return value
test('returns model_overrides when present (REG-01)', () => {
  writeConfig({ model_overrides: { 'gsd-executor': 'opus' } });
  const config = loadConfig(tmpDir);
  assert.deepStrictEqual(config.model_overrides, { 'gsd-executor': 'opus' });
});

// Bug: getRoadmapPhaseInternal was missing from module.exports
test('is exported from core.cjs (REG-02)', () => {
  assert.strictEqual(typeof getRoadmapPhaseInternal, 'function');
});
```

---

## Mocking & Stubbing

### Filesystem Isolation

**Pattern: Use temporary directories, not mocks**

```javascript
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('reads config from filesystem', () => {
  // Write real file
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({ model_profile: 'quality' })
  );

  // Test reads real file
  const config = loadConfig(tmpDir);
  assert.strictEqual(config.model_profile, 'quality');
});
```

**Why?**
- Simpler than mocking fs module
- Tests actual filesystem behavior
- Cross-platform compatibility verification
- No mock library dependencies

### Environment Variables

```javascript
test('detects Brave Search from environment', () => {
  const originalEnv = process.env.BRAVE_API_KEY;
  process.env.BRAVE_API_KEY = 'test-key-123';

  try {
    const result = runGsdTools('config-ensure-section', tmpDir);
    const config = readConfig(tmpDir);
    assert.strictEqual(config.brave_search, true);
  } finally {
    if (originalEnv) {
      process.env.BRAVE_API_KEY = originalEnv;
    } else {
      delete process.env.BRAVE_API_KEY;
    }
  }
});
```

### Home Directory Files

**Pattern: Save, modify, restore**

```javascript
test('merges user defaults from ~/.gsd/defaults.json', () => {
  const homedir = os.homedir();
  const gsdDir = path.join(homedir, '.gsd');
  const defaultsFile = path.join(gsdDir, 'defaults.json');

  // Save existing defaults
  let existingDefaults = null;
  const gsdDirExisted = fs.existsSync(gsdDir);
  if (fs.existsSync(defaultsFile)) {
    existingDefaults = fs.readFileSync(defaultsFile, 'utf-8');
  }

  try {
    // Test with custom defaults
    if (!gsdDirExisted) {
      fs.mkdirSync(gsdDir, { recursive: true });
    }
    fs.writeFileSync(defaultsFile, JSON.stringify({
      model_profile: 'quality'
    }), 'utf-8');

    // Run test
    const result = runGsdTools('config-ensure-section', tmpDir);
    const config = readConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'quality');

  } finally {
    // Restore original state
    if (existingDefaults !== null) {
      fs.writeFileSync(defaultsFile, existingDefaults, 'utf-8');
    } else {
      try { fs.unlinkSync(defaultsFile); } catch { /* ignore */ }
    }
    if (!gsdDirExisted) {
      try { fs.rmdirSync(gsdDir); } catch { /* ignore if not empty */ }
    }
  }
});
```

### Git Operations

```javascript
test('commits planning docs to git', () => {
  const tmpDir = createTempGitProject();  // Creates initialized repo

  try {
    // Test git operations
    const result = runGsdTools('commit "test message"', tmpDir);
    assert.ok(result.success);

    // Verify commit
    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf-8' });
    assert.ok(log.includes('test message'));
  } finally {
    cleanup(tmpDir);
  }
});
```

---

## Coverage

### Running Coverage Reports

```bash
# Run with coverage (70% minimum threshold)
npm run test:coverage

# Output:
# ✓ Lines: 75.2% (> 70% threshold)
# ✓ All tests passing
```

### Coverage Configuration

```json
{
  "scripts": {
    "test:coverage": "c8 --check-coverage --lines 70 --reporter text --include 'get-shit-done/bin/lib/*.cjs' --exclude 'tests/**' --all node scripts/run-tests.cjs"
  }
}
```

### Coverage Targets

| Metric | Minimum | Current |
|--------|---------|---------|
| **Lines** | 70% | ~75% |
| **Functions** | N/A | N/A |
| **Branches** | N/A | N/A |

**Focus: Line coverage for core library modules only**

---

## Testing Best Practices

### ✅ Do

**Write descriptive test names:**
```javascript
test('extracts version and name from roadmap', () => { });
test('returns defaults when roadmap missing', () => { });
test('handles letter-suffix phases (e.g. 3A)', () => { });
```

**Test edge cases:**
```javascript
test('handles empty string', () => {
  assert.strictEqual(escapeRegex(''), '');
});

test('returns null for null input', () => {
  assert.strictEqual(generateSlugInternal(null), null);
});
```

**Include error context:**
```javascript
assert.ok(result.success, `Command failed: ${result.error}`);
```

**Test both JSON and raw output modes:**
```javascript
test('outputs JSON by default', () => {
  const result = runGsdTools('config-get model_profile', tmpDir);
  const output = JSON.parse(result.output);
  assert.strictEqual(typeof output, 'object');
});

test('supports --raw mode for scripting', () => {
  const result = runGsdTools('config-get model_profile --raw', tmpDir);
  assert.strictEqual(result.output, 'balanced');
});
```

**Clean up after tests:**
```javascript
afterEach(() => {
  cleanup(tmpDir);
});
```

### ❌ Don't

**Don't use external mock libraries:**
```javascript
// ✗ Bad
const sinon = require('sinon');
const stub = sinon.stub(fs, 'readFileSync');

// ✓ Good
const tmpDir = createTempProject();
fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
```

**Don't leave temporary files:**
```javascript
// ✗ Bad
test('reads config', () => {
  fs.writeFileSync('/tmp/test-config.json', '{}');
  // Missing cleanup
});

// ✓ Good
afterEach(() => {
  cleanup(tmpDir);
});
```

**Don't skip error context in assertions:**
```javascript
// ✗ Bad
assert.ok(result.success);

// ✓ Good
assert.ok(result.success, `Command failed: ${result.error}`);
```

**Don't test implementation details:**
```javascript
// ✗ Bad
test('calls fs.readFileSync with UTF-8', () => {
  // Testing how it's done, not what it does
});

// ✓ Good
test('reads config from filesystem', () => {
  // Testing behavior
});
```

---

## Common Test Patterns

### Testing CLI Commands with JSON Output

```javascript
test('returns structured data', () => {
  const result = runGsdTools('state-snapshot', tmpDir);
  assert.ok(result.success, `Command failed: ${result.error}`);

  const output = JSON.parse(result.output);
  assert.strictEqual(output.current_phase, '03');
  assert.strictEqual(typeof output.total_phases, 'number');
});
```

### Testing CLI Commands with Raw Output

```javascript
test('returns plain string in raw mode', () => {
  const result = runGsdTools('generate-slug "Hello World" --raw', tmpDir);
  assert.strictEqual(result.output, 'hello-world');
});
```

### Testing File Mutations

```javascript
test('updates STATE.md field', () => {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '**Current Phase:** 02'
  );

  const result = runGsdTools(['state', 'update', 'Current Phase', '03'], tmpDir);
  assert.ok(result.success);

  const updated = fs.readFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    'utf-8'
  );
  assert.ok(updated.includes('**Current Phase:** 03'));
});
```

### Testing Array Args (Special Characters)

```javascript
test('preserves dollar amounts in decision text', () => {
  // Use array args to bypass shell interpretation
  const result = runGsdTools(
    ['state', 'add-decision', '--summary', 'Budget increased to $5000'],
    tmpDir
  );
  assert.ok(result.success);

  const state = fs.readFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    'utf-8'
  );
  assert.ok(state.includes('$5000'));
});
```

### Testing Error States

```javascript
test('returns error for missing required argument', () => {
  const result = runGsdTools('generate-slug', tmpDir);
  assert.ok(!result.success, 'should fail without text argument');
  assert.ok(result.error.includes('text required'));
});

test('handles missing files gracefully', () => {
  const result = runGsdTools('state-snapshot', tmpDir);
  assert.ok(result.success, 'command should succeed but return error object');

  const output = JSON.parse(result.output);
  assert.strictEqual(output.error, 'STATE.md not found');
});
```

---

## Test Data Fixtures

### Minimal STATE.md

```javascript
const minimalState = `# Project State

**Current Phase:** 01
**Status:** Planning
`;
```

### Complete STATE.md

```javascript
const completeState = `# Project State

**Current Phase:** 03
**Current Phase Name:** API Layer
**Total Phases:** 6
**Current Plan:** 03-02
**Total Plans in Phase:** 3
**Status:** In progress
**Progress:** [████████░░] 45%
**Last Activity:** 2024-01-15

## Decisions

- [Phase 01]: Use Prisma for database
- [Phase 02]: JWT for authentication

## Blockers

- Waiting for API credentials

## Session

**Last Date:** 2024-01-15
**Stopped At:** Phase 3, Plan 2, Task 1
**Resume File:** .planning/phases/03-api/03-02-PLAN.md
`;
```

### Config Fixtures

```javascript
function writeConfig(tmpDir, overrides = {}) {
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    branching_strategy: 'none',
  };
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({ ...defaults, ...overrides }, null, 2)
  );
}
```

### Roadmap Fixtures

```javascript
const roadmap = `# Roadmap

## Roadmap v1.0: Foundation

### Phase 1: Core Setup
**Goal:** Initialize project structure
**Depends on:** None
**Provides:** Base infrastructure

### Phase 2: API Layer
**Goal:** Build REST endpoints
**Depends on:** Phase 1
**Provides:** API foundation
`;
```

---

## Debugging Tests

### Running Single Tests

```bash
# Run specific test file
node --test tests/core.test.cjs

# Run with inspect
node --inspect --test tests/core.test.cjs
```

### Verbose Output

```javascript
test('debug output', () => {
  const result = runGsdTools('state-snapshot', tmpDir);
  console.log('Result:', result);
  console.log('Output:', result.output);
  console.log('Error:', result.error);
});
```

### Preserving Temp Directories

```javascript
afterEach(() => {
  // Comment out cleanup to inspect filesystem state
  // cleanup(tmpDir);
  console.log('Temp directory:', tmpDir);
});
```

---

## Test Runner Implementation

### Cross-Platform Test Execution

```javascript
#!/usr/bin/env node
// scripts/run-tests.cjs

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testDir = join(__dirname, '..', 'tests');
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => join('tests', f));

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

try {
  execFileSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  process.exit(err.status || 1);
}
```

**Why this approach?**
- Resolves globs via Node.js (not shell)
- Works on Windows PowerShell/cmd
- Propagates exit codes correctly
- Compatible with c8 coverage tool

---

## Summary: Testing Checklist

### For Every Module

- [ ] One test file per module (`.test.cjs`)
- [ ] Tests grouped by feature using `describe()`
- [ ] Setup/teardown with `beforeEach()`/`afterEach()`
- [ ] Use temporary directories, not mocks
- [ ] Test both success and error cases
- [ ] Test edge cases and boundaries
- [ ] Include descriptive test names
- [ ] Add error context to assertions
- [ ] Clean up temporary resources

### For CLI Commands

- [ ] Test JSON output (default)
- [ ] Test raw output (`--raw` flag)
- [ ] Test with string args (shell-interpreted)
- [ ] Test with array args (shell-bypassed)
- [ ] Test error messages
- [ ] Test file mutations
- [ ] Test with special characters ($, quotes, etc.)

### For Bug Fixes

- [ ] Add regression test with REG-XX identifier
- [ ] Document bug in test comment
- [ ] Verify fix with failing test first
- [ ] Ensure test passes after fix

### Coverage

- [ ] Aim for 70%+ line coverage
- [ ] Focus on core library modules
- [ ] Run `npm run test:coverage` before commit
- [ ] Add tests for uncovered branches
