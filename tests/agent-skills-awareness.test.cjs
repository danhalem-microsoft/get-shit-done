'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');

function readAgent(name) {
  return fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
}

describe('project skills awareness', () => {
  // Phase 1 cull (Plan 08) removed gsd-debugger, gsd-nyquist-auditor,
  // gsd-codebase-mapper, gsd-eval-auditor, gsd-intel-updater, gsd-doc-writer.
  // The skills-awareness contract still applies to surviving agents.
  const agentsRequiringSkills = [
    'gsd-integration-checker',
    'gsd-security-auditor',
    'gsd-roadmapper',
  ];

  for (const agentName of agentsRequiringSkills) {
    test(`${agentName} has Project skills block`, () => {
      const content = readAgent(agentName);
      assert.ok(content.includes('Project skills'), `${agentName} missing Project skills block`);
    });

    test(`${agentName} does not load full AGENTS.md`, () => {
      const content = readAgent(agentName);
      assert.ok(
        !content.includes('Read AGENTS.md') && !content.includes('load AGENTS.md'),
        `${agentName} should not instruct loading full AGENTS.md`
      );
    });
  }
});
