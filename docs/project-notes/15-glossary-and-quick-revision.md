# Glossary and quick revision

| Term | Meaning in this application |
|---|---|
| Scene | User-owned drawing document stored as JSON. |
| Room | Collaboration context with members and roles. |
| Revision | Durable accepted scene version. |
| Presence | Temporary participant state such as pointer or viewport. |
| Commit | Proposed durable element update. |
| Preview | Temporary in-progress edit broadcast, not durable. |
| Outbox | Client queue of operations awaiting acknowledgement. |
| Ticket | Short-lived signed credential used to authorize WS room upgrade. |
| Lease | Redis registration for a live participant connection. |
| CAS | Compare-and-swap-like revision advancement check. |
| Reconciliation | Deterministic resolution of local/remote element states. |
| Prisma contract | Typed schema/query contract used by DB package. |
| Retrospective justification | Technical rationale, not proof of historical decision. |

## 30-second pitch

A browser-first collaborative drawing workspace with a custom TypeScript canvas engine. Guests work locally; accounts persist scenes; rooms grant owner/editor/viewer capabilities. Express handles authenticated HTTP APIs, a separate `ws` service handles collaboration/presence, PostgreSQL stores durable data and Redis coordinates room state and snapshot flushing.

## Remember

- PostgreSQL is durable; Redis is live collaboration/queue infrastructure.
- Authentication establishes identity; authorization checks scene/room permissions.
- Login session and short-lived WS room ticket are distinct.
- Presence is ephemeral; commits/revisions are durable.
- Modular monorepo with multiple processes is not automatically microservices.
- TypeScript types do not validate network JSON.
- Do not claim CRDT semantics or exactly-once queue delivery.
- Most technology rationales here are retrospective.

[Architecture](03-architecture-and-design-decisions.md) · [Stack](02-tech-stack-deep-dive.md) · [Features](05-feature-and-code-walkthroughs.md) · [Interview bank](11-interview-questions-and-answers.md) · [Roadmap](14-improvements-and-technical-debt.md)
