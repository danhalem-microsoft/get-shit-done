'use strict';

const { spawn } = require('node:child_process');

function runRuntime({ command, args = [], cwd, env, timeoutMs = 120000, input }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

    const killGroup = (signal) => {
      try { process.kill(-child.pid, signal); } catch { /* group already gone */ }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => { if (!settled) killGroup('SIGKILL'); }, 5000);
    }, timeoutMs);

    const onClose = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code == null ? -1 : code,
        signal,
        stdout,
        stderr,
        timedOut,
        tail: tailLines(stderr, 50),
      });
    };
    child.on('close', onClose);
    child.on('error', (err) => onClose(-1, null) || (stderr += `\n[spawn error] ${err.message}`));

    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

function tailLines(text, n) {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

module.exports = { runRuntime, tailLines };
