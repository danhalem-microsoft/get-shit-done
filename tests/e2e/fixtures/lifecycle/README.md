# GSD E2E Lifecycle Fixture

Marker: GSD_E2E_FIXTURE_MARKER_8d3c1f7a

A tiny Node project used by the GSD end-to-end lifecycle tests. The `add()`
function in `src/calc.js` is intentionally broken — `/gsd:execute-phase`
should make `node --test tests/calc.test.js` pass.
