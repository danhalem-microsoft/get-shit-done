'use strict';

function classify(gap) {
  const { kind, detail = '' } = gap;
  if (kind === 'missing-file' && /gsd-critic-/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'check install-manifest.json critic mapping' };
  }
  if (kind === 'missing-file' && /researchers\//.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'researcher copy step in bin/install.js' };
  }
  if (kind === 'missing-file' && /(add-mistake|list-mistakes|gsd-tools\.cjs)/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'mistake-registry triad' };
  }
  if (kind === 'missing-file' && /(add-taste|extract-taste|taste\.cjs)/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'taste-library triad' };
  }
  if (kind === 'install-error') {
    return { category: 'parity-deferred', fixable: false, hint: detail };
  }
  if (kind === 'lifecycle-failure') {
    return { category: 'lifecycle-blocker', fixable: true, hint: detail };
  }
  return { category: 'unknown', fixable: false, hint: detail };
}

class FixBudget {
  constructor({ cap = 8 } = {}) { this.cap = cap; this.consumed = new Map(); }
  canConsume(runtime) { return (this.consumed.get(runtime) || 0) < this.cap; }
  consume(runtime, label) {
    const n = (this.consumed.get(runtime) || 0) + 1;
    this.consumed.set(runtime, n);
    return { runtime, label, count: n, withinBudget: n <= this.cap };
  }
  remaining(runtime) { return Math.max(0, this.cap - (this.consumed.get(runtime) || 0)); }
}

module.exports = { classify, FixBudget };
