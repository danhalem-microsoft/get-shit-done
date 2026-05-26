const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkCli, checkRuntime, defaultAuthCheck } = require('../preflight.cjs');

test('checkCli reports available when the binary exists on PATH', async () => {
  const res = await checkCli('node');
  assert.equal(res.available, true);
  assert.match(res.reason, /node\b/);
});

test('checkCli reports unavailable for a missing binary', async () => {
  const res = await checkCli('this-binary-does-not-exist-1234');
  assert.equal(res.available, false);
  assert.match(res.reason, /not found|missing|ENOENT/i);
});

test('checkRuntime composes cli+auth+model results', async () => {
  const res = await checkRuntime('copilot', {
    cliCheck: async () => ({ available: true, reason: 'cli ok' }),
    authCheck: async () => ({ available: false, reason: 'no GH_TOKEN' }),
    modelCheck: async () => ({ available: true, reason: 'default' }),
  });
  assert.equal(res.available, false);
  assert.match(res.reason, /no GH_TOKEN/);
  assert.deepEqual(res.parts.map((p) => p.kind), ['cli', 'auth', 'model']);
});

// Auth detection — file-based vs env-based. We isolate by overriding
// XDG_CONFIG_HOME / XDG_DATA_HOME so the test never reads (or writes)
// the developer's real config.
function withSandboxedXDG(env, fn) {
  const saved = {
    GH_TOKEN: process.env.GH_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    HOME: process.env.HOME,
  };
  for (const k of Object.keys(saved)) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v == null) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test('defaultAuthCheck(copilot) accepts env GH_TOKEN', () => {
  withSandboxedXDG({ GH_TOKEN: 'ghp_dummy', HOME: '/nonexistent' }, () => {
    const r = defaultAuthCheck('copilot');
    assert.equal(r.available, true);
    assert.match(r.reason, /GH_TOKEN/);
  });
});

test('defaultAuthCheck(copilot) accepts gh hosts.yml with oauth_token', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-pref-'));
  fs.mkdirSync(path.join(tmp, 'gh'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'gh', 'hosts.yml'),
    'github.com:\n  oauth_token: gho_xxx\n  user: alice\n');
  withSandboxedXDG({ XDG_CONFIG_HOME: tmp, HOME: tmp }, () => {
    const r = defaultAuthCheck('copilot');
    assert.equal(r.available, true);
    assert.match(r.reason, /gh auth ok/);
  });
});

test('defaultAuthCheck(copilot) rejects gh hosts.yml without oauth_token', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-pref-'));
  fs.mkdirSync(path.join(tmp, 'gh'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'gh', 'hosts.yml'), 'github.com:\n  user: alice\n');
  withSandboxedXDG({ XDG_CONFIG_HOME: tmp, HOME: tmp }, () => {
    const r = defaultAuthCheck('copilot');
    assert.equal(r.available, false);
  });
});

test('defaultAuthCheck(opencode) accepts env ANTHROPIC_API_KEY', () => {
  withSandboxedXDG({ ANTHROPIC_API_KEY: 'sk-dummy', HOME: '/nonexistent' }, () => {
    const r = defaultAuthCheck('opencode');
    assert.equal(r.available, true);
    assert.match(r.reason, /provider key/);
  });
});

test('defaultAuthCheck(opencode) accepts opencode auth.json with content', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-pref-'));
  fs.mkdirSync(path.join(tmp, 'opencode'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'opencode', 'auth.json'),
    JSON.stringify({ anthropic: { type: 'oauth', refresh: 'r', access: 'a' } }));
  withSandboxedXDG({ XDG_DATA_HOME: tmp, HOME: tmp }, () => {
    const r = defaultAuthCheck('opencode');
    assert.equal(r.available, true);
    assert.match(r.reason, /opencode auth ok/);
  });
});

test('defaultAuthCheck(opencode) rejects empty/missing auth.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-pref-'));
  fs.mkdirSync(path.join(tmp, 'opencode'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'opencode', 'auth.json'), '{}');
  withSandboxedXDG({ XDG_DATA_HOME: tmp, HOME: tmp }, () => {
    const r = defaultAuthCheck('opencode');
    assert.equal(r.available, false);
  });
});
