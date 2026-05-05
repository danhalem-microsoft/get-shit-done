---
phase: 99-fixture-phase
plan: 02
type: execute
wave: 2
depends_on: [1]
files_modified:
  - src/example.ts
  - tests/example.test.ts
autonomous: false
requirements: [STUB-02]
must_haves:
  truths:
    - "Example feature is tested"
  artifacts:
    - path: tests/example.test.ts
      provides: "Tests for the example feature"
  key_links:
    - from: tests/example.test.ts
      to: src/example.ts
      via: "import"
      pattern: "import.*example"
---

<objective>
Add tests for the stub feature.
</objective>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write tests</name>
  <files>tests/example.test.ts</files>
  <read_first>
    - src/example.ts
  </read_first>
  <action>Write 1 test.</action>
  <verify>
    <automated>npm test -- example</automated>
  </verify>
  <acceptance_criteria>
    - Test file exists.
  </acceptance_criteria>
  <done>Tests pass.</done>
</task>

</tasks>
