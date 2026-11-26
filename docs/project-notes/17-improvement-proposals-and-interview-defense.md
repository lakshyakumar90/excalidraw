# Improvement proposals and interview defense

This page turns repository evidence into proposals you can defend in an interview. It describes **reasonable engineering decisions**, not historical facts about why the team did or did not do something. When the repository does not record a reason, say so instead of inventing one.

## The 60-second answer

> “The first thing I would improve is the durability boundary between Redis live state and PostgreSQL revisions: the code already has dirty-room recovery, but the guarantee is not written down or failure-tested. Second, I would separate process liveness from dependency readiness so deploys stop routing to an instance that cannot serve requests. Third, I would align the pnpm declarations and evaluate the Prisma release-candidate dependency before upgrading. Each has a measurable first step: failure-injection tests plus flush-lag metrics, a bounded readiness probe, and a clean-database migration check. I would sequence them against the product’s data-loss tolerance and deployment needs, and I would not claim a reason for deferral that the repository does not support.”

## How to choose an improvement

Use four questions in order. If you cannot answer them, you are proposing a preference rather than an improvement.

| Question | What to look for | Good evidence |
|---|---|---|
| Is there a real user or operational risk? | A failure mode, not just a stylistic preference | Crash window, failed request, slow path, ambiguity |
| Can I point to the code? | A concrete file and behavior | `src/app.ts`, `packages/redis/src/index.ts`, `apps/flush-worker/src/index.ts` |
| What is the smallest useful first step? | Something reviewable in days | Test, metric, probe, documented decision |
| How do I know it worked? | A measurable signal | Lag metric, probe behavior, migration on a clean DB, E2E smoke pass |

State the current behaviour before the proposal, give the trade-off after it, and keep the “why deferred” answer honest.

## Evidence map

| Area | Where it lives | What is already there |
|---|---|---|
| Collaboration durability | `packages/redis/src/index.ts`, `packages/backend-common/src/collaboration.ts`, `apps/flush-worker/src/index.ts` | Redis snapshots, dedup, queue, dirty-room recovery scan, versioned PG revisions |
| Health | `apps/http-server/src/app.ts`, `apps/ws-server/src/server.ts` | Process status plus startup DB/Redis checks |
| Toolchain | root `package.json`, `apps/web/package.json`, `packages/db/package.json` | Root pnpm 11.25 / TypeScript 7, nested web pnpm declaration, Prisma 8 RC family |
| API limits | `apps/http-server/src/app.ts` | Global JSON parser ceiling; route-specific auth and invite throttling |
| Authz | protected HTTP routers, WS ticket/origin/role checks | Meaningful controls; deployment-specific cookie/CSRF behaviour still needs verification |
| Testing | package test scripts, route and engine tests | Fast unit/route coverage; no established browser E2E suite |

## Priority shortlist

| Priority | Proposal | Smallest first step | Success signal |
|---|---|---|---|
| High | Make Redis → PostgreSQL durability explicit | Document crash windows and add failure-injection tests | Agreed RPO; flush-lag metric with an alert |
| High | Separate liveness from readiness | Add a bounded `/ready` probe; keep `/health` cheap | Deploy stops routing only when dependencies are unavailable |
| High | Align toolchain declarations | Pin pnpm/Node/TypeScript/Prisma in one place | One reproducible install and clean migration on a disposable DB |
| Medium | Right-size request limits per route | Inventory payloads, then cap small endpoints | No 413 regressions for valid scenes/files |
| Medium | Add critical-journey browser tests | Two-client room commit smoke test | CI catches auth + socket wiring regressions |
| Medium | Formalize backup and restore drills | Write RPO/RTO and run a restore into an isolated DB | Timed, recorded restore exercise |
| Low | Measure multi-instance realtime scaling | Instrument sockets, fanout and event-loop delay | Capacity numbers tied to a realistic workload |

## Proposal details

### 1. Define the collaboration durability guarantee

**Current state:** Redis holds live snapshots and the flush queue; the worker writes versioned revisions to PostgreSQL and rescans dirty rooms. Unique `(sceneId, revision)` prevents duplicate snapshot writes.

**Risk:** An acknowledgement can mean “in Redis” while the user assumes “durable”. The crash windows between live write, enqueue, DB insert and ACK are not documented or tested.

**How I would implement it:**

1. Write the expected behaviour for process crash, Redis outage, duplicate job, stale snapshot, DB outage and concurrent commit.
2. Define the RPO and which ACK counts as durable.
3. Add failure-injection tests at each boundary.
4. Export dirty-room count, oldest dirty age, flush attempts/failures, retries and DB revision lag; alert on sustained lag.
5. Only if the required RPO cannot be met, evaluate a transactional outbox or durable log.

**Trade-off:** Tests and metrics cost time; an outbox adds schema and latency. The benefit is a guarantee you can state and debug.

**Interview line:** “I’d validate the boundary before changing the architecture. The recovery scan already exists; I’d prove it with failure tests and make lag visible, then decide whether a stronger mechanism is worth its cost.”

### 2. Separate liveness from dependency readiness

**Current state:** `/health` reports process status; startup checks DB and Redis. A failing dependency can leave the process alive while it cannot serve traffic.

**How I would implement it:**

1. Keep `/health` cheap and dependency-free for orchestration liveness.
2. Add a readiness endpoint with bounded DB and Redis checks.
3. Return no connection strings, SQL errors or topology details.
4. Configure probes so a transient DB blip stops routing rather than restarting every instance.
5. Test slow and failing dependencies and record probe latency.

**Trade-off:** Probes add load; a shared dependency outage makes every instance unready. A too-aggressive restart policy is worse than no readiness probe.

**Interview line:** “Liveness and readiness answer different questions. I’d keep liveness local, make readiness dependency-aware with timeouts, and let the load balancer drain traffic instead of restarting a healthy process.”

### 3. Stabilize and align the toolchain

**Current state:** Root declares pnpm 11.25.0 and TypeScript 7.0.2; the web package declares its own pnpm version. `packages/db` uses the Prisma 8 RC family.

**How I would implement it:**

1. Document one supported Node/pnpm/TypeScript/Prisma version set.
2. Align or remove the nested pnpm declaration.
3. Check Prisma stable compatibility against the contract, migration graph and a disposable database.
4. Upgrade in a branch, regenerate the contract, review generated diffs and migration plans.
5. Add CI that verifies pinned versions and runs migrations on a clean DB.

**Trade-off:** Upgrades can change generated output and migration semantics; CI adds time. The benefit is reproducible installs and safer dependency updates.

**Interview line:** “I would not blindly bump the RC dependency. I’d align the declared versions first, then prove schema and migration compatibility on a fresh database and an upgrade path.”

### 4. Right-size API resource limits

**Current state:** A global 50 MB JSON ceiling covers every route, while scene/file workflows may legitimately need large bodies.

**How I would implement it:**

1. Measure normal and worst-case payload sizes per route.
2. Apply smaller caps to auth, invite and metadata endpoints; keep bounded larger caps only where transfer requires them.
3. Add field-level counts, depth and type validation.
4. Return a consistent 413 and test boundary values.
5. Evaluate streamed object-storage uploads instead of raising JSON limits further.

**Trade-off:** Caps can reject valid large drawings unless based on measurement; changing transfer format affects clients.

**Interview line:** “The global limit is simple but generous for small endpoints. I’d measure first, cap per route, and make sure the largest supported drawing still imports.”

### 5. Add browser smoke coverage for critical journeys

**Current state:** Unit and route tests exist; responsive and device checks are documented as manual.

**How I would implement it:**

1. Pick a small smoke set: guest draw/reload, sign-in, create/save scene, invite/join room, two clients observe a commit, revoked member loses access.
2. Use isolated Postgres/Redis and deterministic reset.
3. Run in CI for desktop and a couple of viewport classes; capture traces on failure.
4. Keep pen/touch/screen-reader verification as a real-device checklist.

**Trade-off:** Browser tests are slower and need stable infrastructure; they complement, not replace, fast engine unit tests.

**Interview line:** “I’d automate the cross-boundary journeys most likely to regress, especially two-client room sync, and leave hardware-specific behaviour to real devices.”

## How to defend deferred work

| Interviewer follow-up | Strong answer shape |
|---|---|
| “Why wasn’t this implemented?” | “The repository does not record the reason. It may have been out of scope or deliberately postponed until usage and operational targets were known. I’d validate that with the team before claiming history.” |
| “What would you do first in week one?” | “One measurable step: a failure-injection test, a readiness probe, or a version-alignment change with a clean-database check.” |
| “How would you know it worked?” | “A named signal: flush lag under threshold, probe behaviour during dependency failure, passing migration on a disposable DB, or a green two-client smoke test.” |
| “What would you not change?” | “I would not rewrite the store, reimplement auth-library protections, or shard WebSockets before measurements justify it.” |
| “How do you balance speed and safety?” | “Sequence by reversibility and risk: tests, metrics and documentation first; schema/protocol changes only after evidence.” |

## 30 / 60 / 90 day sequence

- **Days 1–30:** document the durability boundary, add flush-lag metrics, add `/ready`, align package-manager declarations, inventory payload sizes.
- **Days 31–60:** failure-injection tests, per-route limits with boundary tests, critical-journey browser smoke tests, rollback runbook.
- **Days 61–90:** backup/restore drill with recorded RPO/RTO, multi-instance realtime measurements, then decide whether outbox/sharding/storage changes are justified.

## Do not overclaim

- Recent revision retention is **not** a database backup.
- A process health response is **not** dependency readiness.
- Redis-backed coordination is **not** proof of horizontal scale without load results.
- Existing auth controls are **not** the same as a fully verified deployment matrix.
- A proposal is **not** evidence of a known bug.

## Related notes

[Findings and technical debt](14-improvements-and-technical-debt.md) · [scalability](13-scalability-and-performance.md) · [security](07-authentication-and-security.md) · [testing](09-testing-and-code-quality.md) · [interview guide](11-interview-questions-and-answers.md) · [coverage and validation](16-coverage-and-validation.md)
