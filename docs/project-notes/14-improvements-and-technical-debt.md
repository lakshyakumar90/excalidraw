# Improvements and technical debt

For detailed implementation plans, pros/cons and interview answers—including why each item might reasonably have been deferred—see [Improvement proposals and interview defense](17-improvement-proposals-and-interview-defense.md).

Priorities are provisional because production impact/SLO is unknown.

| Priority | Issue | Evidence | Impact | Recommended fix |
|---|---|---|---|---|
| High | Prisma ORM/runtime is release-candidate version | `packages/db/package.json` pins 8.0.0 RC family | Stability/migration risk | Confirm production policy; use stable compatible release or document/test RC risk. |
| Medium | Package manager metadata conflicts | Root pnpm 11.25.0; web says 10.27.0 | Reproducibility ambiguity | Align/remove nested declaration. |
| Medium | Health is process-only | `/health` returns status without DB/Redis probes | Traffic may route when dependencies fail | Add bounded readiness probes separately from liveness. |
| Medium | Global JSON limit is 50 MB | `express.json({limit:"50mb"})` | Memory/resource abuse exposure | Route-specific size limits, quotas, schema bounds; streaming for large media if needed. |
| Medium | Redis/Postgres durability semantics | Redis snapshot queue plus PG worker and recovery scan | Cross-store crash/retry ambiguity | Define RPO, test crash points, expose lag; consider transactional outbox if needed. |
| Medium | Auth/abuse protection needs deployment review | No global HTTP limiter mounted; invitation limiter and WS budgets exist | Account abuse and origin/CSRF behavior depend on exact config | Add rate limits and end-to-end auth/security matrix tests. |
| Low | Tracked service `output.log` | Listed in tracked files | Artifact/noise or sensitive log risk | Inspect and remove from version control if not intentionally needed. |
| Low | Package usage uncertainty | `@repo/ui` not declared by web; validations package exists | Dependency maintenance overhead | Confirm import graph before removal or integration. |
| Low | No coverage threshold evidence | No top-level coverage threshold found | Regression coverage may drift | Add targeted coverage for authz, concurrency and recovery. |
| Low | Migration workflow complexity | Custom contract/migration/snapshot process | Schema change mistakes | Document production approval, backup and rollback procedures. |

## Roadmap

**Immediate:** align toolchain declarations, inspect log artifact, ensure secrets are not tracked, add readiness checks, verify room authorization matrix.

**Short term:** route-level limits, flush/queue/WS metrics, browser E2E for auth and rooms, DB restore drill, concurrency and failure tests.

**Long term:** benchmark multi-instance collaboration and large scenes; formalize retention/recovery objectives; change storage or process boundaries only when measured requirements justify it.
