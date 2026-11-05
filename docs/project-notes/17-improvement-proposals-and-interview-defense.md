# Improvement proposals and interview defense

This guide turns the repository findings into concrete proposals you can discuss in an interview. The codebase does not document why these ideas were deferred, so the suggested answers describe reasonable engineering trade-offs—not historical facts about the team.

## How to frame improvements in an interview

Start with the current behavior and evidence. Name the user or operational risk, then propose a change with a validation plan. Acknowledge its cost and explain why it may not be the next priority. Avoid presenting an optional enhancement as a known bug, or claiming the project lacked a control without checking the relevant library configuration.

## Ranked proposals

| Priority | Proposal | Current evidence | Main benefit | Main cost |
|---|---|---|---|---|
| High | Reconcile Prisma RC and workspace tool versions | Prisma 8 RC family; root pnpm 11.25 vs web 10.27 | More predictable installs, migrations and upgrades | Upgrade work, generated contract changes and regression risk |
| High | Define and test collaboration durability guarantees | Redis live snapshots/queue plus PostgreSQL revisions and recovery scan | Clear recovery point and fewer ambiguous failure cases | More integration/failure tests; possibly an outbox or protocol changes |
| High | Add dependency-aware readiness and operational metrics | `/health` is process-only; worker logs failures and optionally emits Redis metrics | Better deployments and incident diagnosis | Probe/metrics design, monitoring cost and alert maintenance |
| Medium | Tighten API resource limits | Express JSON parser has a 50 MB limit | Lower memory/abuse risk and predictable latency | Route-by-route limits and import/file UX changes |
| Medium | Expand auth and authorization verification | Protected routes and WS checks exist; full deployed cookie/CSRF/throttle behavior needs confirmation | Fewer access-control regressions | Test fixtures, service setup and keeping tests aligned with auth library behavior |
| Medium | Add browser end-to-end tests for key user journeys | Unit/route tests are present; repository docs call for manual responsive/device checks | Catch integration regressions across UI, auth, API and sockets | Browser-test infrastructure and maintenance; physical device behavior still needs real devices |
| Medium | Formalize backup, restore and revision retention operations | Revision pruning exists; repository evidence does not show restore runbooks or drills | Recoverability and known RPO/RTO | Storage cost, operational ownership and periodic exercises |
| Medium | Improve hot-room scaling evidence | One WS process model, Redis coordination, no load results/SLOs documented | Evidence-based capacity and scale plan | Load environment, instrumentation and potentially architectural work |
| Low | Review tracked runtime artifacts and dependency usage | `apps/http-server/output.log` tracked; `@repo/ui` not declared by web | Less repository noise and dependency confusion | Audit first; may turn out intentional or used indirectly |

## Proposal details

### 1. Stabilize and align the toolchain

**Evidence:** Root declares pnpm 11.25.0 and TypeScript 7.0.2; the web package has its own pnpm 10.27.0 declaration. `packages/db` uses the Prisma 8 release-candidate CLI/runtime family.

**How I would implement it:**

1. Decide and document the supported Node, pnpm, TypeScript, Prisma CLI and runtime versions in one place.
2. Resolve whether the workspace should use the root pnpm version; remove or align the nested declaration.
3. Check Prisma stable-version compatibility with the current contract, migration graph and database before upgrading.
4. Upgrade in a branch, regenerate the contract using the documented command, review generated diffs and migration plans, then run DB/package checks against a disposable database.
5. Add CI that checks the pinned toolchain and runs migrations against a clean test database.

**Pros:** Fewer environment-dependent failures; safer dependency/security updates; clearer onboarding. **Cons:** Version upgrades can change generated output, runtime behavior and migration semantics; checking every workspace adds CI time.

**Interview answer:** “I would first align the declared package-manager versions and then assess the Prisma release-candidate dependency. The benefit is reproducible builds and lower upgrade risk. I would not blindly bump it: I’d verify schema and migration compatibility, regenerate the contract, and test both a fresh database and an upgrade path.”

**Why not already?** “The repository does not record the historical reason. It may have been a deliberate early-stage trade-off to use a required Prisma capability, or version metadata may simply have drifted. I would confirm compatibility and release constraints before changing it because migrations are production-sensitive.”

### 2. Make collaboration durability guarantees explicit

**Evidence:** Live state and flush queue use Redis; durable revisions are in PostgreSQL. Worker startup/periodic dirty-room scans are described as recovery for the Redis-write/queue-enqueue gap. The revision table enforces unique `(sceneId, revision)` and the worker skips snapshots already represented by the DB head.

**How I would implement it:**

1. Write down expected behavior for process crash, Redis outage, duplicate job, stale snapshot, DB outage and simultaneous commit.
2. Define an RPO (maximum acknowledged work that could be lost) and which acknowledgement means “durable.”
3. Add integration tests that inject failures between live-state write, queue scheduling, database insert and acknowledgement.
4. Export metrics for dirty-room count, oldest dirty age, flush attempts/failures, retries and DB revision lag; alert on sustained lag.
5. If the required guarantee cannot be met with recovery scanning, consider a transactional outbox in PostgreSQL or another durable log. Make this a measured architecture change, not an automatic rewrite.

**Pros:** Clearer user expectations, debuggable recovery, evidence for data-loss risk. **Cons:** Failure-injection tests and metrics take effort; an outbox increases schema and worker complexity and may add latency/write load.

**Interview answer:** “I’d validate the durability boundary before changing the design. Redis is used for responsive live state, while PostgreSQL owns revisions; the worker and dirty-room scan provide recovery behavior. I’d test every crash window and define when an ACK is considered durable. If the required RPO is stricter than the current mechanism supports, I’d evaluate a transactional outbox.”

**Why not already?** “The code already includes a recovery mechanism, so this is an assurance and observability improvement unless testing finds a concrete gap. A stronger guarantee has cost. I’d prioritize it based on the product’s acceptable data-loss window and operational requirements.”

### 3. Separate liveness from dependency readiness

**Evidence:** HTTP `/health` in `apps/http-server/src/app.ts` returns `{status: "ok"}` without checking Postgres or Redis. Startup does check DB/Redis connectivity.

**How I would implement it:**

1. Keep a cheap liveness endpoint that only indicates the process/event loop is running.
2. Add a readiness endpoint with bounded-time checks for dependencies required to serve traffic.
3. Avoid exposing connection strings, SQL errors or internal topology in the response.
4. Configure deployment probes to stop routing traffic when not ready, without repeatedly restarting a live process during a transient DB blip.
5. Test slow and failing dependencies, and record probe latency/failure metrics.

**Pros:** Better rollout behavior and fewer requests sent to a broken instance. **Cons:** Dependency probes can add load; a shared DB outage can make every instance unready and complicate recovery if probe policy is too aggressive.

**Interview answer:** “The existing health route is liveness-like, not readiness. I’d separate those meanings: liveness should not depend on the database, while readiness should use bounded checks for required dependencies. Then the load balancer can stop routing to an instance that cannot serve requests without turning a transient dependency issue into a restart storm.”

**Why not already?** “A process-only endpoint is simple and sufficient for local development. Production orchestration needs stronger readiness semantics. I’d add it when connecting the service to deployment probes, using the actual service dependencies and timeout behavior.”

### 4. Apply resource limits by endpoint

**Evidence:** Express uses a global JSON parser limit of 50 MB. Drawing and image/library workflows may carry large JSON data; not every API route needs that ceiling.

**How I would implement it:**

1. Inventory route payload shapes and measure normal/large requests.
2. Set smaller limits on account, invite and metadata endpoints; permit larger bounded bodies only where scene/file transfer requires it.
3. Add field-level limits, count/depth checks and image/data validation as appropriate.
4. Return a consistent 413 response and test boundary values.
5. If large binary assets become a real use case, evaluate streamed/object storage uploads rather than raising JSON limits.

**Pros:** Limits memory spikes and abusive requests; improves predictable API latency. **Cons:** Limits can reject legitimate large drawings unless based on real usage; endpoint-specific configuration adds complexity; changing transfer format affects clients.

**Interview answer:** “I’d measure payloads first. The current global 50 MB ceiling may be needed for file-related workflows, but it gives small endpoints a much larger budget than they need. I’d apply per-route caps and structural validation, then test the largest supported drawing so the security limit does not break valid work.”

**Why not already?** “A single global limit is easy to configure and may have been chosen to support large scene payloads. Fine-grained limits should follow an inventory of valid use cases and payload sizes; otherwise we risk breaking imports.”

### 5. Expand security regression tests

**Evidence:** HTTP protected routers use `requireAuth`; room authorization and WS ticket/origin/access checks are implemented, with several route, permission and ticket tests. This inspection did not establish all production cookie, CSRF, throttling and provider behaviors.

**How I would implement it:**

1. Build an authorization matrix: anonymous, owner, editor, viewer, unrelated user, revoked member and expired/reused invitation.
2. Exercise each sensitive HTTP operation and WS upgrade/message against the matrix.
3. Test session expiry/logout, invalid origins, invalid/expired tickets and role downgrade.
4. Verify Better Auth configuration for the pinned version (cookie flags, trusted origins, CSRF behavior and rate limits) rather than reimplementing library protections.
5. Keep secrets in test fixtures/environment injection and never assert by printing them.

**Pros:** Prevents regressions at security boundaries and documents intended role behavior. **Cons:** Test matrix can grow quickly; DB-backed auth setup is slower; library upgrades may require fixture changes.

**Interview answer:** “The app already has meaningful controls, so I’d extend the tests around the authorization matrix rather than claim security is absent. I’d verify the exact Better Auth configuration and test both HTTP and WebSocket paths, especially revocation and role changes after a socket is open.”

**Why not already?** “Some of this coverage exists, and the rest depends on the exact deployed auth config. I’d prioritize high-impact boundaries and avoid duplicating behavior already guaranteed by the auth library. The repository alone does not tell me whether every deployment has the same settings.”

### 6. Add browser end-to-end coverage for critical journeys

**Evidence:** Unit/route tests are present; root README recommends manual checks across screen sizes and real devices for pen/touch/accessibility. No complete browser E2E suite was established in this review.

**How I would implement it:**

1. Select a small smoke set: guest draw/reload, sign-up/sign-in, create/save scene, invite/join room, two clients see a commit, revoked member loses access.
2. Use isolated test DB/Redis and deterministic reset/seeding; avoid production services.
3. Automate browser navigation, keyboard basics and viewport classes in CI, with trace/screenshot capture on failure.
4. Keep physical pen/touch/screen-reader checks in a separate device checklist; browser automation cannot prove hardware behavior.

**Pros:** Catches wiring errors across frontend/API/auth/WS and supports confident refactors. **Cons:** Browser tests can be slower/flaky and need stable infrastructure/data reset; they complement rather than replace unit tests or real devices.

**Interview answer:** “I’d add a few critical-path browser tests across the boundaries most likely to regress, especially two-client room sync. I would not try to automate every editor gesture first; deterministic engine unit tests remain faster, and touch/pen behavior still requires actual devices.”

**Why not already?** “The project has focused unit and route tests, which are fast and useful while core workflows change. End-to-end infrastructure has a maintenance cost. I’d add the small smoke set once the test environment can isolate Postgres, Redis and multiple browser clients reliably.”

### 7. Define backups, restore drills and revision retention

**Evidence:** Worker code retains a configured number of recent scene revisions. The inspected repository does not establish a production backup schedule, restore drill, RPO/RTO or disaster-recovery owner.

**How I would implement it:**

1. Agree on RPO/RTO and whether point-in-time recovery is needed.
2. Configure managed database backups/PITR or a documented self-managed equivalent; encrypt and restrict backup access.
3. Document restore order for DB, Redis (if needed), app secrets and deployment config. Treat Redis as rebuildable only if that matches the durability guarantee.
4. Run a restore exercise into an isolated environment and record timings/data validation.
5. Review `ROOM_SNAPSHOT_KEEP` against product recovery needs and storage cost; do not equate recent revisions with database backups.

**Pros:** Recovery is rehearsed rather than assumed; clear operational expectations. **Cons:** Storage/operations cost, compliance work and periodic exercise time; a larger retention window increases storage.

**Interview answer:** “The worker keeps recent revisions, but that is not a backup strategy. I’d define the acceptable recovery point and time, use the database provider’s backup/PITR capability if available, and run restore drills. I’d keep Redis recovery separate from PostgreSQL because they have different roles.”

**Why not already?** “Backup configuration often lives in the hosting platform and may not be represented in application code. I can’t conclude it is absent in production from this repo. I would verify the platform configuration and make the restore procedure reviewable here.”

### 8. Measure horizontal realtime scaling

**Evidence:** WebSocket server keeps connection state in process and uses Redis-backed leases/pub-sub abstractions; no load-test results or capacity target were found.

**How I would implement it:**

1. Define target concurrent sockets, rooms, room size, message rate and latency.
2. Instrument active connections, fanout duration, per-room message rate, Redis operations and event-loop delay.
3. Run load tests with multiple WS instances and verify cross-instance messages, disconnect cleanup, lease expiry and role revocation.
4. Confirm proxy upgrade, draining, reconnect backoff and hot-room behavior.
5. Scale instances or shard rooms based on measured bottlenecks; revisit Redis topology only if metrics require it.

**Pros:** Finds limits before production and makes infrastructure decisions evidence-based. **Cons:** Load environments cost money and can produce misleading results if traffic shape is unrealistic; hot rooms may need larger architectural changes.

**Interview answer:** “I would not claim it scales to an arbitrary number of users. I’d first set a target, then test multi-instance WebSocket fanout because sockets are long-lived and room traffic can be skewed. The Redis abstraction is a scaling aid, but its actual throughput and failure behavior need measurements.”

**Why not already?** “Capacity work needs a target workload. Without an SLO or traffic profile, premature sharding can add complexity without improving user experience. I’d add metrics early and run realistic load tests before changing topology.”

## Interview answer: “What would you improve, and why wasn’t it implemented?”

> “I’d prioritize three things: first, make the Redis-to-PostgreSQL collaboration durability guarantee explicit with failure-injection tests and flush-lag metrics; second, separate process liveness from database/Redis readiness; and third, align the pnpm declarations and evaluate the Prisma release-candidate dependency. Those proposals are grounded in the current implementation: it already has dirty-room recovery, a process-only health route, and inconsistent version metadata. Each change has a cost—more tests/monitoring, probe policy, or migration validation—so I would sequence them against the product’s data-loss tolerance and deployment requirements. The repository does not record why they were deferred, so I would not invent a historical reason. They may have been out of scope or intentionally postponed until usage and operational targets were known.”

## Short answer formula

For each improvement, use this order:

1. **Current state:** “Today, the code does …”
2. **Evidence:** “I see that in …”
3. **Impact:** “At higher load / during failure, that means …”
4. **Change:** “I would implement … in these steps …”
5. **Trade-off:** “The benefit is …; the cost/risk is …”
6. **Why deferred:** “I do not know the original reason. A reasonable sequencing argument is …; I would validate it with …”

## Related notes

[Existing findings/roadmap](14-improvements-and-technical-debt.md) · [scalability](13-scalability-and-performance.md) · [security](07-authentication-and-security.md) · [testing](09-testing-and-code-quality.md) · [interview guide](11-interview-questions-and-answers.md)
