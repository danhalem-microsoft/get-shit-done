'use strict';

const { spawn } = require('node:child_process');

function which(bin) {
  return new Promise((resolve) => {
    const child = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.on('close', (code) => resolve(code === 0 ? out.trim() : ''));
    child.on('error', () => resolve(''));
  });
}

async function checkCli(bin) {
  const p = await which(bin);
  if (p) return { kind: 'cli', available: true, reason: `${bin} at ${p}` };
  return { kind: 'cli', available: false, reason: `${bin} not found on PATH (ENOENT)` };
}

async function checkRuntime(name, { cliCheck, authCheck, modelCheck }) {
  const parts = [];
  let available = true;
  let reason;

  const cli = await cliCheck(name);
  parts.push({ kind: 'cli', ...cli });
  if (!cli.available) {
    available = false;
    reason = cli.reason;
  }

  const auth = await authCheck(name);
  parts.push({ kind: 'auth', ...auth });
  if (!auth.available && available) {
    available = false;
    reason = auth.reason;
  }

  const model = await modelCheck(name);
  parts.push({ kind: 'model', ...model });
  if (!model.available && available) {
    available = false;
    reason = model.reason;
  }

  if (available) {
    reason = 'all checks ok';
  }

  return { runtime: name, available, reason, parts };
}

function defaultAuthCheck(name) {
  if (name === 'copilot') {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      return { available: true, reason: 'GH_TOKEN/GITHUB_TOKEN present' };
    }
    return { available: false, reason: 'GH_TOKEN/GITHUB_TOKEN not set' };
  }
  if (name === 'opencode') {
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      return { available: true, reason: 'provider key present' };
    }
    return { available: false, reason: 'no provider API key' };
  }
  return { available: false, reason: `unknown runtime ${name}` };
}

function defaultModelCheck() {
  return { available: true, reason: `model=${process.env.GSD_E2E_MODEL || 'default'}` };
}

module.exports = { which, checkCli, checkRuntime, defaultAuthCheck, defaultModelCheck };
