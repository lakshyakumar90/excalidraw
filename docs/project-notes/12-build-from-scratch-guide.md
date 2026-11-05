# Rebuild the product from scratch

1. **Gather requirements:** guest editing, accounts, saved scenes, rooms/roles, invitations, realtime, import/export, device support, latency, privacy, recovery and retention. Define concurrency semantics and maximum payload/room sizes.
2. **Choose architecture:** TypeScript workspace is defensible when UI, protocol and engine share types. Compare a single API/realtime service or hosted collaboration/auth if operating several processes is too costly.
3. **Bootstrap:** create pnpm workspace, task graph, lint/type/test scripts and app/package ownership. Keep browser-safe packages separate from DB/auth/Redis code.
4. **Model data:** users, scenes, rooms, memberships, claims and revision history. Add unique constraints for identity, membership and commit revision. Decide JSON versioning, cascade/deletion, backup and retention.
5. **Add auth:** use maintained session framework; define cookie/origin/recovery/provider policy. Enforce owner/editor/viewer checks at every API and socket. Hash opaque invite secrets and transactionally claim them.
6. **Build engine/UI:** element model, geometry, tools, selection/history, viewport and renderer. Test transforms, hit tests and pressure/input edge cases. Keep storage adapters outside geometry.
7. **Add API/local persistence:** validate requests and enforce ownership. Preserve guest work locally and provide explicit export/import. Apply route-specific payload limits.
8. **Define protocol:** runtime validators, commit IDs, revision/retry/replay semantics, ephemeral vs durable events, ordering and reconnect. Authenticate WS upgrade and periodically recheck access.
9. **Durable synchronization:** choose direct DB commits, transactional outbox or Redis snapshot queue based on recovery objective. Test duplicate, simultaneous, delayed and failed flushes; do not assume exactly-once.
10. **Verify/deploy/operate:** add unit, route, DB/Redis integration, browser E2E, multi-instance load and security tests. Define migration/rollback, secrets, readiness, logs/metrics/tracing, backups and recovery drills.

## Would I make the same choices today?

Keep TypeScript, relational storage, shared runtime-validated protocol and a custom engine if drawing interaction is core product value. Keep separate worker and realtime service when independent scaling is demonstrated. Re-evaluate Prisma 8 RC stability; reconcile tool versions; add readiness/observability and formal DB/Redis guarantees. Do not add cache, service mesh or another event bus without a measured problem. Managed auth/realtime becomes attractive if operations cost outweighs control.
