'use strict';

/**
 * TEST-04 structural enforcement (static).
 *
 * Verifies that:
 *   1. Each integration/lifecycle-steps/step-N-<name>.cjs exports {name, run, assertArtifacts}.
 *   2. The composer (integration/gsd-lifecycle.test.cjs) requires every step file.
 *   3. The post-cull shape JSON has 9 step entries (no step-10 stats).
 *   4. Step file names align with the shape JSON `expected_steps[i].name`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STEPS_DIR = path.join(ROOT, 'integration', 'lifecycle-steps');
const COMPOSER = path.join(ROOT, 'integration', 'gsd-lifecycle.test.cjs');
const SHAPE_JSON = path.join(ROOT, 'integration', 'test-fixtures', 'lifecycle-shapes', 'post-cull.json');

const stepFiles = fs.readdirSync(STEPS_DIR)
  .filter((f) => /^step-\d+-[a-z-]+\.cjs$/.test(f))
  .sort((a, b) => {
    const an = parseInt(a.match(/^step-(\d+)/)[1], 10);
    const bn = parseInt(b.match(/^step-(\d+)/)[1], 10);
    return an - bn;
  });

describe('TEST-04: lifecycle decomposition structure', () => {
  test('exactly 9 step files (no step-10 stats post-cull)', () => {
    assert.strictEqual(stepFiles.length, 9,
      `Expected 9 step files (post-cull), found ${stepFiles.length}: ${stepFiles.join(', ')}`);
    assert.ok(!stepFiles.some((f) => f.startsWith('step-10-')),
      'step-10-* must not exist post-cull (gsd-stats is in deletion list)');
  });

  for (const file of stepFiles) {
    test(`${file} exports {name, run, assertArtifacts}`, () => {
      const step = require(path.join(STEPS_DIR, file));
      assert.strictEqual(typeof step.name, 'string', `${file}: name must be string`);
      assert.strictEqual(typeof step.run, 'function', `${file}: run must be function`);
      assert.strictEqual(typeof step.assertArtifacts, 'function', `${file}: assertArtifacts must be function`);
    });
  }

  test('composer requires every step file', () => {
    const composer = fs.readFileSync(COMPOSER, 'utf-8');
    for (const file of stepFiles) {
      const expectedRequire = `./lifecycle-steps/${file.replace(/\.cjs$/, '')}`;
      assert.ok(composer.includes(file) || composer.includes(expectedRequire),
        `gsd-lifecycle.test.cjs must require lifecycle-steps/${file}`);
    }
  });

  test('post-cull shape JSON has 9 expected_steps and no step-10', () => {
    const shape = JSON.parse(fs.readFileSync(SHAPE_JSON, 'utf-8'));
    assert.strictEqual(shape.expected_steps.length, 9);
    assert.ok(!shape.expected_steps.some((s) => s.step_num === 10),
      'shape JSON must not contain step_num: 10');
    assert.strictEqual(shape.expected_steps[3].name, 'review-critique',
      'step 4 must be "review-critique" (post-cull rename from "critique")');
  });

  test('step file names align with shape JSON entries', () => {
    const shape = JSON.parse(fs.readFileSync(SHAPE_JSON, 'utf-8'));
    for (const expected of shape.expected_steps) {
      const fileForStep = stepFiles.find((f) => f.startsWith(`step-${expected.step_num}-`));
      assert.ok(fileForStep, `no step file for step_num ${expected.step_num}`);
      const step = require(path.join(STEPS_DIR, fileForStep));
      assert.strictEqual(step.name, expected.name,
        `${fileForStep}: STEP.name "${step.name}" must match shape "${expected.name}"`);
    }
  });
});
