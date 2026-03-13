---
name: build-system
output_file: BUILD-SYSTEM.md
description: Build tooling, dependency management, and build configuration for the project
triggers:
  - build system
  - bazel
  - webpack
  - vite
  - esbuild
  - rollup
  - make
  - gradle
  - maven
  - cmake
  - cargo
  - dependencies
  - lockfile
  - monorepo
  - pnpm
  - npm
  - yarn
  - turbo
  - nx
  - lerna
---

<prompt_template>
Project Research — Build System dimension for {DOMAIN}.

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
FOCUS: Build tooling + dependency management + build configuration.
NOT IN SCOPE: CI/CD pipeline configuration (belongs to Deployment type).
NOT IN SCOPE: Code style/formatting rules (belongs to Conventions type).

Research the project's build toolchain end-to-end: tool selection, dependency resolution, build configuration, module systems, and development workflow. Every recommendation MUST reference a specific aspect of the project context. If you cannot connect a recommendation to the project, omit it.
</scope_boundary>

<downstream_consumer>
Your BUILD-SYSTEM.md feeds into roadmap creation and phase planning. Be prescriptive:
- Specific build tools with versions and configuration approach
- Dependency management strategy (lockfiles, version pinning, update workflow)
- Monorepo vs polyrepo build considerations if applicable
- Development workflow (watch mode, hot reload, incremental builds)
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Build System specific
- [ ] Build tool selection justified for project size and language ecosystem
- [ ] Dependency management strategy addresses reproducibility (lockfiles, version pinning)
</quality_gate>
</prompt_template>

<output_template>
# Build System Research

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## Build Tool Selection <!-- REQUIRED -->

| Tool | Version | Purpose | Why Recommended | Confidence |
|------|---------|---------|-----------------|------------|
| [name] | [version] | [what it does in this project] | [why this tool for this project's size/ecosystem] | HIGH/MEDIUM/LOW |
| [name] | [version] | [what it does in this project] | [why this tool for this project's size/ecosystem] | HIGH/MEDIUM/LOW |

### Selection Rationale

[Why this combination of tools fits the project — reference project size, language ecosystem, team constraints. Compare briefly against the 1-2 most relevant alternatives.]

## Dependency Management <!-- REQUIRED -->

### Lockfile Strategy

| Aspect | Recommendation | Rationale |
|--------|---------------|-----------|
| Lockfile format | [format] | [why — reproducibility, compatibility] |
| Version pinning | [strategy: exact, caret, tilde] | [tradeoff: stability vs updates] |
| Update workflow | [how to update safely] | [frequency, automation options] |

### Dependency Security

- [How to audit dependencies for this ecosystem]
- [How to handle vulnerable transitive dependencies]

## Build Configuration <!-- REQUIRED -->

### Entry Points and Output

| Entry Point | Output Target | Module Format | Notes |
|-------------|---------------|---------------|-------|
| [path] | [output path] | [ESM/CJS/UMD] | [purpose] |

### Key Configuration

```
[Example build configuration snippet relevant to the project's tool]
```

### Module Resolution

[How the build tool resolves imports — aliases, path mapping, workspace references]

## Module System <!-- OPTIONAL — omit if project uses single module format -->

### ESM vs CJS Strategy

| Concern | Recommendation | Notes |
|---------|---------------|-------|
| Source format | [ESM/CJS] | [why] |
| Output format | [ESM/CJS/dual] | [compatibility requirements] |
| Interop approach | [strategy] | [gotchas with mixed formats] |

## Build Performance <!-- OPTIONAL — omit if build time is under 30s -->

### Optimization Strategy

| Technique | Expected Impact | Implementation Effort | Priority |
|-----------|----------------|----------------------|----------|
| [technique] | [time saved] | LOW/MEDIUM/HIGH | [order] |

### Caching

[How to configure build caching — local, remote, CI cache warming]

### Incremental Builds

[How to enable and verify incremental rebuilds work correctly]

## Monorepo Patterns <!-- OPTIONAL — omit if single-package project -->

### Workspace Configuration

| Aspect | Approach | Tool |
|--------|----------|------|
| Package discovery | [glob/explicit] | [workspace tool] |
| Cross-package deps | [symlink/protocol] | [resolution mechanism] |
| Task orchestration | [parallel/topological] | [runner tool] |

### Dependency Hoisting

[Strategy for hoisting shared dependencies — tradeoffs between disk space and isolation]

## Development Workflow <!-- REQUIRED -->

### Dev Server Configuration

| Feature | Configuration | Notes |
|---------|--------------|-------|
| Watch mode | [how to enable] | [what triggers rebuilds] |
| Hot reload | [HMR/live reload/full rebuild] | [framework support] |
| Dev port | [default/configurable] | [proxy setup if needed] |

### Common Development Tasks

```bash
# Start development
[command]

# Run single build
[command]

# Clean build artifacts
[command]
```

## Build Artifacts <!-- OPTIONAL — omit if standard output (single bundle or package) -->

### Output Configuration

| Artifact | Format | Destination | Purpose |
|----------|--------|-------------|---------|
| [artifact] | [format] | [path] | [what consumes it] |

### Tree Shaking

[Whether tree shaking is supported, how to verify it works, common issues]

### Code Splitting

[Strategy for code splitting — route-based, component-based, vendor chunks]

## Anti-Patterns <!-- REQUIRED -->

| Anti-Pattern | Why It's Wrong | What To Do Instead |
|-------------|----------------|-------------------|
| [pattern] | [specific problem it causes] | [correct approach] |
| [pattern] | [specific problem it causes] | [correct approach] |
| [pattern] | [specific problem it causes] | [correct approach] |
| [pattern] | [specific problem it causes] | [correct approach] |
| [pattern] | [specific problem it causes] | [correct approach] |

## Sources <!-- REQUIRED -->

- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]

---
*Build System research for: {DOMAIN}*
</output_template>
