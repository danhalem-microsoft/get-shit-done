---
name: data-model
output_file: DATA-MODEL.md
description: Database modeling, entity relationships, migrations, and API data contracts for the project
triggers:
  - database
  - schema
  - data model
  - migration
  - entity
  - relationship
  - SQL
  - NoSQL
  - MongoDB
  - PostgreSQL
  - MySQL
  - Prisma
  - Drizzle
  - TypeORM
  - Sequelize
  - Zod
  - Pydantic
  - JSON Schema
  - GraphQL schema
  - REST contract
  - ORM
  - query patterns
---

<prompt_template>
Project Research — Data Model dimension for {DOMAIN}.

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
FOCUS: Data shapes — entity definitions, field types, constraints, relationships, serialization formats (Zod, Pydantic, JSON Schema), query patterns.
NOT IN SCOPE: Validation enforcement middleware and error responses (belongs to Architecture type).
NOT IN SCOPE: Field naming conventions and enum casing rules (belongs to Conventions type).
NOT IN SCOPE: Caching layers and general persistence patterns beyond the data model itself.

CLARIFICATION: Data Model owns SHAPES. Architecture owns ENFORCEMENT. Conventions owns NAMING.

Research the project's data layer end-to-end: core entities with field types, entity relationships and cardinality, schema design patterns, database selection, migration strategy, query patterns, and API data contracts (Zod/Pydantic/JSON Schema). Every recommendation MUST reference a specific aspect of the project context. If you cannot connect a recommendation to the project, omit it.
</scope_boundary>

<downstream_consumer>
Your DATA-MODEL.md feeds into roadmap creation and schema implementation phases. Be prescriptive:
- Entity definitions with field types, constraints, and relationship cardinality
- Relationship diagrams showing how entities connect
- Migration strategy for schema evolution and data migration
- API contract schemas using the project's validation library (Zod, Pydantic, JSON Schema, etc.)
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Data Model specific
- [ ] Core entities defined with field types, constraints, and relationships
- [ ] Migration strategy addresses both schema evolution and data migration
- [ ] At least one API data contract example uses project's validation library (Zod, Pydantic, etc.)
</quality_gate>
</prompt_template>

<output_template>
# Data Model Research

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## Core Entities <!-- REQUIRED -->

| Entity | Fields | Type | Constraints | Notes |
|--------|--------|------|-------------|-------|
| [EntityName] | id | UUID/SERIAL/CUID | PRIMARY KEY | [auto-generated strategy] |
| [EntityName] | [field] | [VARCHAR/INT/BOOLEAN/JSON/etc.] | [NOT NULL, UNIQUE, DEFAULT, CHECK] | [purpose or business rule] |
| [EntityName] | [field] | [type] | [constraints] | [notes] |
| [EntityName] | created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | [audit trail] |
| [EntityName] | updated_at | TIMESTAMP | NOT NULL | [updated on every write] |

### Entity Details

**[EntityName]:**
[Business purpose of this entity. What it represents in the domain. Key invariants that must be maintained.]

**[EntityName]:**
[Business purpose. Key invariants.]

## Entity Relationships <!-- REQUIRED -->

### Relationship Diagram

```
[EntityA] 1───────* [EntityB]
    │                   │
    │                   │
    1                   *
    │                   │
[EntityC] *───────* [EntityD]
```

### Relationship Table

| From | To | Type | Cardinality | Cascade | Notes |
|------|----|------|-------------|---------|-------|
| [EntityA] | [EntityB] | [has-many/belongs-to/many-to-many] | [1:N/N:M/1:1] | [CASCADE/SET NULL/RESTRICT] | [foreign key field, join table if M:N] |
| [EntityA] | [EntityC] | [type] | [cardinality] | [cascade behavior] | [notes] |

## Schema Design Patterns <!-- REQUIRED -->

### Patterns Applied

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| [Normalization level: 3NF/BCNF/denormalized] | [which entities] | [why this level for this project's read/write ratio] |
| [Soft deletes] | [which entities] | [why — audit requirements, undo support] |
| [Timestamps (created/updated)] | [all/subset] | [audit trail, cache invalidation] |
| [Polymorphism: STI/MTI/CTI] | [which entities if applicable] | [why this inheritance strategy] |
| [JSON columns] | [which fields] | [when schema-less is appropriate — flexible attributes, metadata] |

### ID Strategy

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Primary key type | [UUID v4/CUID/SERIAL/ULID] | [why — distribution, sortability, collision risk] |
| External IDs | [exposed/internal-only] | [API exposure strategy] |
| Composite keys | [where used, if any] | [why composite vs surrogate] |

## Database Selection <!-- REQUIRED -->

| Database | Version | Purpose | Why Recommended | Confidence |
|----------|---------|---------|-----------------|------------|
| [PostgreSQL/MySQL/MongoDB/SQLite/etc.] | [version] | [primary data store / search / cache / etc.] | [why this database for this project's data patterns] | HIGH/MEDIUM/LOW |

### Selection Rationale

[Why this database fits the project — reference data access patterns, consistency requirements, scale expectations, team familiarity. Compare briefly against 1-2 alternatives.]

## Migration Strategy <!-- REQUIRED -->

### Schema Evolution

| Aspect | Approach | Tool |
|--------|----------|------|
| Migration format | [SQL files / ORM-generated / diff-based] | [Prisma migrate / Alembic / Flyway / Knex / etc.] |
| Version tracking | [sequential numbers / timestamps / content hash] | [how migrations are ordered] |
| Rollback approach | [down migrations / forward-only / point-in-time] | [tradeoffs for this project] |

### Data Migration Patterns

| Scenario | Pattern | Example |
|----------|---------|---------|
| Add column with default | [backfill strategy] | [when to use immediate vs lazy backfill] |
| Rename column | [expand-contract pattern] | [deploy new, migrate data, remove old] |
| Split table | [dual-write strategy] | [how to avoid downtime] |
| Change column type | [migration steps] | [safe type coercion approach] |

### Migration Safety Checklist

- [ ] Migration tested against production-sized dataset
- [ ] Rollback migration tested and verified
- [ ] Migration is backward-compatible with current code
- [ ] No locks held on large tables during migration

## Query Patterns <!-- OPTIONAL — omit if using ORM exclusively with no custom queries -->

### Common Query Patterns

| Pattern | Use Case | Implementation | Notes |
|---------|----------|---------------|-------|
| [Pagination] | [listing entities] | [cursor-based / offset-limit] | [why this pagination for this project's data size] |
| [Eager loading] | [avoiding N+1] | [JOIN / include / populate] | [which relationships to eager load] |
| [Full-text search] | [search features] | [tsvector / LIKE / external engine] | [when to use database vs search service] |
| [Aggregation] | [analytics/dashboard] | [GROUP BY / materialized views] | [performance considerations] |

### Index-Aware Queries

| Query Pattern | Index Required | Index Type | Notes |
|--------------|---------------|-----------|-------|
| [find by email] | [users(email)] | [UNIQUE B-tree] | [login/lookup hot path] |
| [list by date range] | [events(created_at)] | [B-tree] | [dashboard queries] |
| [full-text search] | [posts(content)] | [GIN/GiST] | [search feature] |

## API Data Contracts <!-- REQUIRED -->

### Validation Schema Examples

```
[Example using the project's validation library — Zod, Pydantic, JSON Schema, etc.]

// Example: Zod schema for creating a User
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'user', 'viewer']),
});

// Example: Pydantic model
class CreateUser(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    role: Literal['admin', 'user', 'viewer']
```

### Request/Response Shapes

| Endpoint | Request Schema | Response Schema | Notes |
|----------|---------------|-----------------|-------|
| [POST /users] | [CreateUserSchema] | [UserResponseSchema] | [what's included/excluded in response] |
| [GET /users/:id] | [params: id] | [UserDetailSchema] | [includes related entities?] |
| [PATCH /users/:id] | [UpdateUserSchema (partial)] | [UserResponseSchema] | [which fields are updatable] |

### Schema Versioning

| Aspect | Approach | Notes |
|--------|----------|-------|
| API versioning | [URL path / header / content negotiation] | [how schema changes are versioned] |
| Breaking changes | [deprecation period / migration guide] | [how clients are notified] |
| Contract testing | [tool/approach] | [how schemas are validated against implementations] |

## Data Lifecycle <!-- OPTIONAL — omit if no temporal data concerns -->

### Retention Policy

| Data Type | Retention Period | Archive Strategy | Deletion Method |
|-----------|-----------------|-----------------|-----------------|
| [user data] | [indefinite / 7 years / 90 days] | [cold storage / data warehouse] | [hard delete / anonymize] |
| [logs/events] | [30 days / 1 year] | [archive to S3 / compress] | [TTL / scheduled job] |

### Audit Trail

| Event | What's Captured | Storage | Notes |
|-------|----------------|---------|-------|
| [entity creation] | [who, when, initial values] | [audit table / event log] | [compliance requirement] |
| [entity update] | [who, when, changed fields, old/new values] | [audit table / event log] | [diff tracking] |
| [entity deletion] | [who, when, soft/hard] | [audit table / tombstone record] | [recovery window] |

## Indexing Strategy <!-- OPTIONAL — omit if project has no database or uses fully managed service -->

### Index Recommendations

| Table | Index | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| [users] | [idx_users_email] | [email] | UNIQUE B-tree | [login lookup] |
| [orders] | [idx_orders_user_created] | [user_id, created_at] | B-tree (composite) | [user order history query] |
| [posts] | [idx_posts_content_search] | [title, body] | GIN (full-text) | [search feature] |

### Performance Considerations

| Concern | Approach | Notes |
|---------|----------|-------|
| Index bloat | [REINDEX schedule / autovacuum tuning] | [when to worry about index size] |
| Write performance | [selective indexing / partial indexes] | [tradeoff: read speed vs write speed] |
| Query planner | [EXPLAIN ANALYZE patterns] | [how to verify indexes are used] |

## Anti-Patterns <!-- REQUIRED -->

| Anti-Pattern | Why It's Wrong | What To Do Instead |
|-------------|----------------|-------------------|
| God entity (one table with 50+ columns) | Impossible to maintain, violates SRP, migrations become dangerous | Split into focused entities with clear relationships |
| Missing migrations (manual DDL changes) | No rollback capability, environments drift, onboarding breaks | All schema changes through versioned migration files |
| N+1 query patterns | Exponential database load — 100 items = 101 queries instead of 2 | Use eager loading (JOIN/include) for known relationship traversals |
| Storing derived data without refresh strategy | Stale data, inconsistent reads, debugging nightmares | Either compute on read or implement explicit cache invalidation |
| Using database as message queue | Polling is wasteful, row locks cause contention, doesn't scale | Use purpose-built message queue (Redis Streams, SQS, RabbitMQ) |

## Sources <!-- REQUIRED -->

- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]

---
*Data Model research for: {DOMAIN}*
</output_template>
