---
name: testing
output_file: TESTING.md
description: Test architecture, strategy, framework selection, and coverage patterns for the project
triggers:
  - test strategy
  - testing
  - jest
  - vitest
  - pytest
  - mocha
  - cypress
  - playwright
  - coverage
  - mock
  - fixture
  - e2e testing
  - integration test
  - unit test
  - TDD
  - BDD
  - assertion
  - snapshot testing
---

<prompt_template>
Project Research — Testing dimension for {DOMAIN}.

<milestone_context>
{MILESTONE_CONTEXT}
</milestone_context>

<question>
{RESEARCH_QUESTION}
</question>

<project_context>
{PROJECT_CONTEXT}
</project_context>

<scope_boundary>
FOCUS: PRESCRIPTIVE test architecture — recommend what to test, how to structure tests, which frameworks to use, and what coverage targets to set. This is about what TO DO.
NOT IN SCOPE: Common testing MISTAKES and failure modes (belongs to Pitfalls type — that is the CAUTIONARY authority).
NOT IN SCOPE: Performance benchmarks, load tests, or chaos engineering.
NOT IN SCOPE: Build-time test runner configuration (belongs to Build System type — focus on test code patterns, not build integration).

AUTHORITY SPLIT: Testing = PRESCRIPTIVE (what to do). Pitfalls = CAUTIONARY (what goes wrong).

Research the project's test architecture end-to-end: testing strategy and level definitions, framework selection, test organization, unit/integration/e2e patterns, mocking strategy, fixture management, and coverage targets. Every recommendation MUST reference a specific aspect of the project context. If you cannot connect a recommendation to the project, omit it.
</scope_boundary>

<downstream_consumer>
Your TESTING.md feeds into roadmap creation and test infrastructure phases. Be prescriptive:
- Framework selection with version and rationale tied to the project's stack
- Test organization patterns matching the project's directory structure
- Coverage targets per test level (unit, integration, e2e) with justification
- Mocking strategy distinguishing what to mock vs what to use real implementations for
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Testing specific
- [ ] Test organization matches project structure (co-located vs separate, naming conventions)
- [ ] Coverage strategy specifies targets per test level (unit, integration, e2e)
- [ ] Mocking strategy distinguishes what to mock vs what to use real implementations for
</quality_gate>
</prompt_template>

<output_template>
# Testing Research

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## Test Strategy <!-- REQUIRED -->

### Testing Pyramid/Trophy

```
          ┌─────────┐
          │   E2E   │  [count] tests — [what they verify]
         ┌┴─────────┴┐
         │Integration │  [count] tests — [what they verify]
        ┌┴────────────┴┐
        │  Unit Tests   │  [count] tests — [what they verify]
        └───────────────┘
```

### Test Level Definitions

| Level | What It Tests | Speed | Isolation | When to Write |
|-------|---------------|-------|-----------|---------------|
| Unit | [single function/component in isolation] | [<50ms] | [full — all deps mocked] | [every public function/method] |
| Integration | [module interactions, API routes, DB queries] | [<5s] | [partial — real DB, mocked externals] | [every API endpoint, every DB query pattern] |
| E2E | [full user flow through real UI/API] | [<30s] | [none — full stack running] | [critical user journeys only] |

### When to Use Each Level

| Scenario | Recommended Level | Rationale |
|----------|-------------------|-----------|
| [Pure logic function] | Unit | [no side effects, fast feedback] |
| [API endpoint with DB] | Integration | [needs real query execution to validate] |
| [Multi-step user flow] | E2E | [validates full journey, catches integration gaps] |
| [Error handling] | Unit + Integration | [unit for logic, integration for HTTP status codes] |

## Framework Selection <!-- REQUIRED -->

| Framework | Version | Purpose | Why Recommended | Confidence |
|-----------|---------|---------|-----------------|------------|
| [Jest/Vitest/Pytest/Mocha] | [version] | [primary test runner] | [why for this project's stack — speed, ecosystem, config] | HIGH/MEDIUM/LOW |
| [Testing Library/Enzyme/Cypress] | [version] | [component/E2E testing] | [why for this project's UI framework] | HIGH/MEDIUM/LOW |
| [Supertest/httpx/requests] | [version] | [API testing] | [why for this project's HTTP layer] | HIGH/MEDIUM/LOW |

### Selection Rationale

[Why this combination of test tools fits the project — reference project stack, team size, CI requirements. Compare briefly against 1-2 alternatives for the primary runner.]

## Test Organization <!-- REQUIRED -->

### Directory Structure

```
[project root]/
├── src/
│   ├── [module]/
│   │   ├── [module].ts           # Source
│   │   └── [module].test.ts      # Co-located unit test (if co-located pattern)
│   └── ...
├── tests/                         # Centralized test directory (if separate pattern)
│   ├── unit/
│   │   └── [module].test.ts
│   ├── integration/
│   │   └── [module].integration.test.ts
│   └── e2e/
│       └── [flow].e2e.test.ts
└── test-utils/                    # Shared test utilities
    ├── factories/                 # Data factories
    ├── fixtures/                  # Static test data
    └── helpers/                   # Test helper functions
```

### File Naming Conventions

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit test | [pattern: *.test.ts / test_*.py / *_test.go] | [user-service.test.ts] |
| Integration test | [pattern: *.integration.test.ts] | [auth.integration.test.ts] |
| E2E test | [pattern: *.e2e.test.ts / *.spec.ts] | [checkout.e2e.test.ts] |

### Co-location vs Centralization

| Approach | Recommendation | Rationale |
|----------|---------------|-----------|
| Unit tests | [co-located / centralized] | [why — proximity to source, discoverability] |
| Integration tests | [centralized] | [why — different dependencies, separate concerns] |
| E2E tests | [centralized] | [why — cross-cutting, different tooling] |

## Unit Test Patterns <!-- REQUIRED -->

### Arrangement Pattern

```
[Example using the project's test framework and preferred pattern]

// AAA (Arrange-Act-Assert) pattern
describe('[ModuleName]', () => {
  it('should [expected behavior] when [condition]', () => {
    // Arrange
    const input = createTestInput({ /* ... */ });

    // Act
    const result = moduleFunction(input);

    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

### Assertion Style

| Style | Usage | Example |
|-------|-------|---------|
| [expect/assert/should] | [when to use this style] | [expect(result).toBe(true)] |
| [custom matchers] | [domain-specific assertions] | [expect(response).toBeValidUser()] |

### Isolation Principles

| Dependency | Mock? | Rationale |
|-----------|-------|-----------|
| [Database] | Yes — in unit tests | [unit tests must be fast and isolated] |
| [External API] | Yes — always | [external dependencies are unreliable in tests] |
| [File system] | Yes — in unit tests | [avoid test pollution and speed issues] |
| [Time/Date] | Yes — when time-dependent | [deterministic tests require controlled time] |
| [Internal modules] | No — prefer real | [internal module mocking couples tests to implementation] |

## Integration Test Patterns <!-- REQUIRED -->

### What to Integrate

| Integration | Real or Mock | Rationale |
|-------------|-------------|-----------|
| [Database] | Real (test DB) | [validates actual queries, constraints, migrations] |
| [Internal APIs] | Real | [validates actual request/response contracts] |
| [External APIs] | Mock (recorded) | [external services are unreliable, rate-limited] |
| [Message queues] | Real (test instance) | [validates actual pub/sub behavior] |

### Database Testing Patterns

| Pattern | When to Use | Implementation |
|---------|-------------|---------------|
| [Transaction rollback] | [per-test isolation without cleanup] | [wrap each test in transaction, rollback after] |
| [Database seeding] | [shared fixture data across tests] | [seed script before test suite, cleanup after] |
| [Test containers] | [CI environments needing real DB] | [Docker containers spun up per test suite] |
| [In-memory DB] | [fast integration tests for simple schemas] | [SQLite in-memory for PostgreSQL-compatible queries] |

### API Testing Patterns

```
[Example API integration test using project's HTTP testing library]

describe('POST /api/users', () => {
  it('should create user and return 201', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      email: 'test@example.com',
    });
  });
});
```

## E2E Test Patterns <!-- OPTIONAL — omit if project has no UI or is a library -->

### Page Object Pattern

```
[Example page object using project's E2E framework]

class LoginPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="submit"]');
  }

  async getErrorMessage() {
    return this.page.textContent('[data-testid="error"]');
  }
}
```

### Selector Strategy

| Strategy | Priority | Example | Notes |
|----------|----------|---------|-------|
| data-testid | 1st (preferred) | `[data-testid="submit-btn"]` | [stable, explicit, no style coupling] |
| Accessible role | 2nd | `getByRole('button', { name: 'Submit' })` | [tests accessibility, user-facing] |
| Text content | 3rd | `getByText('Submit Order')` | [user-visible, but brittle with i18n] |
| CSS selector | Last resort | `.btn-primary` | [couples to styling, breaks on redesign] |

### Test Data Management

| Aspect | Approach | Notes |
|--------|----------|-------|
| Test users | [factory-created / seeded / API-created] | [lifecycle: created before suite, cleaned after] |
| Deterministic data | [fixed seeds / snapshot data] | [reproducible tests across runs] |
| Environment isolation | [per-suite / per-test / shared] | [tradeoff: speed vs isolation] |

## Mocking Strategy <!-- REQUIRED -->

### What to Mock

| Dependency Type | Mock? | Strategy | Rationale |
|----------------|-------|----------|-----------|
| External HTTP APIs | Always | [MSW / nock / responses / VCR] | [unreliable, rate-limited, costly in tests] |
| Database | Unit: Yes, Integration: No | [repository pattern / in-memory adapter] | [unit = fast & isolated, integration = real queries] |
| File system | Usually | [memfs / tmp directories] | [avoid test pollution, CI path differences] |
| Time/Date | When time-dependent | [jest.useFakeTimers / freezegun] | [deterministic expiry, scheduling tests] |
| Random/UUID | When deterministic needed | [seeded random / fixed UUID] | [snapshot testing, reproducible IDs] |
| Internal modules | Rarely | Prefer real implementations | [mocking internals couples tests to implementation details] |

### Mock Libraries

| Library | Purpose | When to Use |
|---------|---------|-------------|
| [MSW / nock / responses] | [HTTP request interception] | [any test that calls external APIs] |
| [jest.fn() / unittest.mock / sinon] | [function/method mocking] | [injecting behavior into dependencies] |
| [faker / factory-boy / fishery] | [test data generation] | [creating realistic test entities] |

### When NOT to Mock

| Situation | Why Real is Better |
|-----------|-------------------|
| [Internal pure functions] | [mocking hides bugs in the function being called] |
| [Data transformations] | [real transforms catch edge cases mocks wouldn't] |
| [Configuration loading] | [real config loading catches missing fields] |
| [Serialization/deserialization] | [real serde catches format issues] |

## Fixtures & Factories <!-- OPTIONAL — omit if project has minimal test data needs -->

### Factory Pattern

```
[Example factory using project's preferred factory library]

// Factory for creating test users
const userFactory = createFactory<User>({
  defaults: {
    id: () => randomUUID(),
    email: () => faker.internet.email(),
    name: () => faker.person.fullName(),
    role: 'user',
    createdAt: () => new Date(),
  },
  traits: {
    admin: { role: 'admin' },
    inactive: { status: 'inactive', deactivatedAt: new Date() },
  },
});

// Usage
const user = userFactory.build();
const admin = userFactory.build('admin');
const users = userFactory.buildList(5);
```

### Fixture Management

| Fixture Type | Storage | Refresh Strategy | Notes |
|-------------|---------|-----------------|-------|
| [Static JSON] | [__fixtures__/ directory] | [manual update] | [API response snapshots, config samples] |
| [Database seeds] | [seeds/ directory] | [migration-aware] | [baseline data for integration tests] |
| [Factory defaults] | [factories/ directory] | [updated with schema changes] | [dynamic test data generation] |

## Coverage Strategy <!-- OPTIONAL — omit if project is proof-of-concept with no coverage requirements -->

### Coverage Targets

| Test Level | Target | Rationale | Measurement |
|-----------|--------|-----------|-------------|
| Unit | [80-90%] line coverage | [high coverage for business logic, diminishing returns beyond 90%] | [jest --coverage / pytest-cov] |
| Integration | [not measured by line coverage] | [measured by endpoint/query coverage, not lines] | [custom tracking or manual checklist] |
| E2E | [not measured by line coverage] | [measured by user journey coverage] | [critical path checklist] |
| Overall | [75-85%] combined | [balance between coverage confidence and test maintenance cost] | [CI coverage gate] |

### What Counts as Meaningful Coverage

| Meaningful | Not Meaningful |
|-----------|---------------|
| [Business logic branches tested] | [Getter/setter coverage] |
| [Error paths exercised] | [Framework boilerplate covered] |
| [Edge cases with assertions] | [Lines touched without assertions] |
| [Integration boundaries verified] | [Config file parsing] |

### Coverage Tools

| Tool | Purpose | Configuration |
|------|---------|---------------|
| [jest --coverage / pytest-cov / go test -cover] | [line/branch/function coverage] | [config location, thresholds] |
| [CI coverage gate] | [prevent merging below threshold] | [how to configure in CI pipeline] |

## Sources <!-- REQUIRED -->

- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]

---
*Testing research for: {DOMAIN}*
</output_template>
