---
name: deployment
output_file: DEPLOYMENT.md
description: CI/CD pipelines, deployment targets, environment management, and infrastructure-as-code for the project
triggers:
  - deploy
  - deployment
  - CI/CD pipeline
  - GitHub Actions
  - GitLab CI
  - Jenkins
  - Docker
  - Kubernetes
  - terraform
  - pulumi
  - AWS
  - GCP
  - Azure
  - Vercel
  - Netlify
  - Fly.io
  - Railway
  - environment management
  - staging
  - production
  - rollback
  - infrastructure as code
  - container
---

<prompt_template>
Project Research — Deployment dimension for {DOMAIN}.

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
FOCUS: CI/CD pipelines, deployment targets, environment management, infrastructure-as-code, rollback strategies.
NOT IN SCOPE: Build system tooling and dependency management (belongs to Build System type — focus on pipelines and deployment targets, not build tool configuration).
NOT IN SCOPE: Monitoring, alerting, and observability (future type — focus on getting code deployed and rollback-safe).

Research the project's deployment pipeline end-to-end: CI/CD configuration, deployment targets, environment promotion, secret management, and rollback procedures. Every recommendation MUST reference a specific aspect of the project context. If you cannot connect a recommendation to the project, omit it.
</scope_boundary>

<downstream_consumer>
Your DEPLOYMENT.md feeds into roadmap creation and phase planning. Be prescriptive:
- Pipeline configuration with specific stages and trigger conditions
- Deployment target selection with rationale for the project's scale and domain
- Environment strategy (dev/staging/prod) with promotion workflow
- Secret management approach covering storage, rotation, and access control
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Deployment specific
- [ ] CI/CD pipeline covers at least: build, test, deploy stages
- [ ] Rollback procedure specified with concrete steps (not just "roll back if needed")
- [ ] Secret management strategy addresses at least: storage, rotation, and access control
</quality_gate>
</prompt_template>

<output_template>
# Deployment Research

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## Deployment Architecture <!-- REQUIRED -->

### Deployment Topology

```
[ASCII diagram showing deployment architecture]
[e.g., Developer → CI/CD → Staging → Production]
[Include load balancers, CDN, database connections as relevant]
```

### Target Environments

| Environment | Purpose | URL Pattern | Infrastructure |
|-------------|---------|-------------|----------------|
| [env name] | [what it's for] | [URL or endpoint pattern] | [hosting/platform] |
| [env name] | [what it's for] | [URL or endpoint pattern] | [hosting/platform] |

## CI/CD Pipeline <!-- REQUIRED -->

### Pipeline Stages

| Stage | Trigger | Actions | Artifacts | Failure Behavior |
|-------|---------|---------|-----------|------------------|
| [stage] | [what triggers it] | [what runs] | [what's produced] | [what happens on failure] |
| [stage] | [what triggers it] | [what runs] | [what's produced] | [what happens on failure] |
| [stage] | [what triggers it] | [what runs] | [what's produced] | [what happens on failure] |

### Trigger Conditions

- **On push to main:** [what happens]
- **On pull request:** [what happens]
- **On tag/release:** [what happens]
- **Manual/scheduled:** [what happens]

### Artifact Flow

```
[Source] → [Build artifact] → [Container image / bundle] → [Deploy target]
```

## Environment Strategy <!-- REQUIRED -->

### Environment Definitions

| Environment | Purpose | Data | Access | Promotion From |
|-------------|---------|------|--------|----------------|
| Development | [purpose] | [seed/synthetic/copy] | [who has access] | N/A |
| Staging | [purpose] | [seed/synthetic/copy] | [who has access] | Development |
| Production | [purpose] | [real data] | [who has access] | Staging |

### Promotion Workflow

```
[Dev] → [automated tests pass] → [Staging]
[Staging] → [approval gate / smoke tests] → [Production]
```

- **Dev → Staging:** [promotion criteria]
- **Staging → Production:** [promotion criteria]
- **Hotfix path:** [emergency deployment process]

## Infrastructure as Code <!-- OPTIONAL — omit if deploying to PaaS with no infrastructure management -->

### IaC Tool Selection

| Tool | Version | Purpose | Why Recommended | Confidence |
|------|---------|---------|-----------------|------------|
| [name] | [version] | [what it manages] | [why this tool for this project] | HIGH/MEDIUM/LOW |

### State Management

- **State backend:** [where state is stored]
- **Locking:** [how concurrent modifications are prevented]
- **Environments:** [how IaC handles dev/staging/prod differences]

### Module Structure

```
infra/
  [folder]/     # [purpose]
  [folder]/     # [purpose]
  [file]        # [purpose]
```

## Container Strategy <!-- OPTIONAL — omit if deploying serverless or static files only -->

### Dockerfile Patterns

- **Base image:** [image:tag] — [why this base]
- **Multi-stage:** [yes/no] — [rationale]
- **Layer optimization:** [caching strategy]

### Container Registry

| Registry | Purpose | Access | Retention |
|----------|---------|--------|-----------|
| [registry] | [what it stores] | [who can push/pull] | [image retention policy] |

### Orchestration

- **Platform:** [Kubernetes / ECS / Docker Compose / etc.]
- **Scaling:** [horizontal scaling strategy]
- **Health checks:** [readiness and liveness probe configuration]

## Secret Management <!-- REQUIRED -->

### Secret Storage

| Secret Type | Storage Location | Access Method | Rotation Policy |
|-------------|-----------------|---------------|-----------------|
| [type] | [where stored] | [how accessed at runtime] | [rotation frequency] |
| [type] | [where stored] | [how accessed at runtime] | [rotation frequency] |

### Access Control

- **Principle of least privilege:** [how enforced]
- **Audit logging:** [how secret access is logged]
- **Emergency rotation:** [process for compromised secrets]

### Environment Variable Management

| Variable | Required In | Source | Example |
|----------|-------------|--------|---------|
| [var name] | [which environments] | [where the value comes from] | [example value or format] |

## Rollback Procedures <!-- REQUIRED -->

### Rollback Triggers

- **Automated:** [conditions that trigger automatic rollback]
- **Manual:** [conditions that warrant manual rollback decision]

### Rollback Steps

1. [Concrete step with command or action]
2. [Concrete step with command or action]
3. [Concrete step with command or action]
4. [Verification that rollback succeeded]

### Data Rollback Considerations

- **Database migrations:** [how to handle backward-incompatible schema changes]
- **Feature flags:** [how to disable features without code rollback]
- **Cache invalidation:** [how to handle stale cache after rollback]

## Domain & DNS <!-- OPTIONAL — omit if project has no custom domain requirements -->

### DNS Configuration

| Domain | Target | Type | TTL | Notes |
|--------|--------|------|-----|-------|
| [domain] | [target] | [A/CNAME/etc.] | [TTL] | [notes] |

### SSL/TLS

- **Certificate provider:** [provider]
- **Auto-renewal:** [yes/no, mechanism]
- **Certificate type:** [DV/OV/EV]

### CDN

- **Provider:** [CDN provider if applicable]
- **Caching strategy:** [what's cached, TTLs]
- **Cache invalidation:** [how to purge]

## Anti-Patterns <!-- REQUIRED -->

| Anti-Pattern | Why It's Wrong | What To Do Instead |
|--------------|----------------|---------------------|
| Manual deployments via SSH | Not reproducible, no audit trail, error-prone | Automate with CI/CD pipeline triggered by git events |
| Secrets in source code or environment files committed to git | Secrets exposed in version history, leaked in logs | Use secret manager (Vault, AWS Secrets Manager, platform env vars) |
| No rollback plan | Stuck with broken deployments, extended downtime | Define rollback procedure with concrete steps and test it regularly |
| Single environment (deploy straight to production) | No way to catch issues before users see them | Use at least dev + staging + production with promotion gates |
| Snowflake servers configured manually | Configuration drift, unreproducible environments | Use infrastructure-as-code (Terraform, Pulumi, CDK) for all infra |
| Deploying without health checks | No way to detect failed deployments automatically | Configure readiness/liveness probes, smoke tests post-deploy |

## Sources <!-- REQUIRED -->

- [CI/CD platform documentation URL] — [what was verified]
- [Hosting platform documentation URL] — [what was verified]
- [IaC tool documentation URL] — [what was verified]
- [Other source] — [confidence level]

---
*Deployment research for: {DOMAIN}*
*Researched: {DATE}*
</output_template>
