# Project notes and interview preparation

A repository-grounded guide to understanding, maintaining, explaining and rebuilding this collaborative drawing workspace. It supplements the project README with architecture, implementation traces, database/security analysis, development instructions and interview answers.

Open the responsive documentation portal at `/docs` while running the web app. It provides full-text search, grouped navigation, article contents, and rendered diagrams; these Markdown files remain the source of truth.

## Documentation

- [Project overview](01-project-overview.md) · [Technology stack](02-tech-stack-deep-dive.md) · [Architecture and decisions](03-architecture-and-design-decisions.md)
- [Folder reference](04-folder-and-file-reference.md) · [Tracked file catalog](04-file-catalog.md) · [Feature walkthroughs](05-feature-and-code-walkthroughs.md)
- [Database](06-database-and-data-models.md) · [Authentication and security](07-authentication-and-security.md) · [API and realtime](08-api-and-realtime-workflows.md)
- [Testing](09-testing-and-code-quality.md) · [Development/deployment](10-development-and-deployment-guide.md) · [Interview guide](11-interview-questions-and-answers.md)
- [Build from scratch](12-build-from-scratch-guide.md) · [Performance/scaling](13-scalability-and-performance.md) · [Improvements](14-improvements-and-technical-debt.md) · [Interview-focused improvement proposals](17-improvement-proposals-and-interview-defense.md) · [Glossary](15-glossary-and-quick-revision.md) · [Coverage report](16-coverage-and-validation.md)

## Diagrams

Mermaid source files live in [diagrams/](diagrams/): system, repository, frontend, backend, database ER, auth, API lifecycle, realtime, deployment and room collaboration.

## Reading order

Start with the overview and architecture, then stack and file ownership, feature/data/API flows, security/testing/deployment, and finish with the interview/rebuild/scaling guides.

## Accuracy notes

Claims derive from source, manifests, existing READMEs and configuration. Technology rationales are retrospective unless a decision record proves otherwise. Optional integrations and deployment paths are distinguished from always-on requirements. Tests were not run for this documentation task.
