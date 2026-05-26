const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCli, checkRuntime } = require('../preflight.cjs');

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
