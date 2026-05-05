---
phase: 99-fixture-phase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/example.ts
autonomous: true
requirements: [STUB-01]
must_haves:
  truths:
    - "User can do X"
  artifacts:
    - path: src/example.ts
      provides: "Example feature"
  key_links: []
---

<objective>
Stub plan used by Phase 2 critic live tests. Deliberately seeded with mild defects (vague action, missing acceptance, ambiguous truth) so the 6 critics have something to find without being overwhelmed.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Implement example feature</name>
  <files>src/example.ts</files>
  <action>Add the feature.</action>
  <verify>It works.</verify>
  <done>Done.</done>
</task>

</tasks>
