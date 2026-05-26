const test = require('node:test');
const assert = require('node:assert/strict');
const { runRuntime } = require('../runtime-driver.cjs');

test('runRuntime returns stdout/stderr/exitCode for a quick command', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn")'],
    timeoutMs: 5000,
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout, 'ok');
  assert.equal(res.stderr, 'warn');
  assert.equal(res.timedOut, false);
});

test('runRuntime kills process group on timeout and tags timedOut=true', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'setInterval(()=>{}, 1000)'],
    timeoutMs: 250,
  });
  assert.equal(res.timedOut, true);
  assert.notEqual(res.exitCode, 0);
});

test('runRuntime injects env and respects cwd', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'process.stdout.write(process.env.FOO + ":" + process.cwd())'],
    env: { FOO: 'bar' },
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /^bar:/);
});
