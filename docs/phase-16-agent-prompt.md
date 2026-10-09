# Prompt for the Phase 16 implementing agent

Implement Phase 16, Redis and the write-behind queue, end to end. Read `docs/phase-16-redis-write-behind-agent-instructions.md` completely, inspect current code and applicable `AGENTS.md` files, and follow the handoff as the task specification.

Move live room commits and initial sync into Redis while retaining the exact Phase 15 reconciliation, ordering, tombstone, preview, image and authentication behavior. Add one standalone BullMQ flush worker with a fixed pending job ID per room, a real quiet-period debounce, a 30-second maximum wait, global last-disconnect flush and guarded idle expiry. Make writes idempotent, retain the latest configurable snapshots, support two WS instances through Redis pub/sub and missed-event resync, and add aggregated useful instrumentation.

Keep Prisma and all PostgreSQL initialization/queries in `packages/db`, auth in `packages/auth`, browser-safe contracts in `packages/common`, shared backend policy/orchestration in `packages/backend-common`, and Redis infrastructure in a dedicated backend-only Redis package. HTTP room writers must use the same authority as WS. Do not add app-local database clients or raw SQL. Preserve the working environment/build setup and correct ellipse/status behavior.

Distinguish an edit accepted by Redis from a snapshot persisted to PostgreSQL. Retain the local committed outbox until persistence is confirmed. Handle queue-insertion gaps, active-job races, generation loss, Redis/DB failures, crashed WS connection leases and pub/sub reconnects as specified. Inspect official documentation for the pinned BullMQ/Redis versions; repeated fixed job IDs alone do not reset delayed jobs.

Write the Phase 16 architecture decisions and verification record. Implement the ordered slices in small coherent commits with focused tests. Run only the basic affected checks once and one short two-browser/different-WS-node smoke check. Use time limits; diagnose stalled commands instead of repeatedly running broad suites. Once relevant checks pass, stop testing and complete delivery.

Push all intended commits to GitHub using the repository's branch workflow. Do not squash the phase into one commit, commit secrets/generated Redis data, merge/deploy without authorization, or begin Phase 17. Finish with a concise report of behavior, verification evidence, commit IDs, branch/PR link and actual limitations.
