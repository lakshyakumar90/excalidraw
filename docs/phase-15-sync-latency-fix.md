# Completed-element latency fix

Finished element records are relayed as validated, authorized `elements.pending` frames before the durable database write. Receivers render the actual final styles in a temporary overlay, outside the scene, IndexedDB and history. Authoritative delivery replaces the overlay; failed/replayed saves clear it. Existing leave, reconnect and timeout cleanup also applies. The last drag frame is retained during the handoff. Revision compaction runs in coalesced background work instead of delaying acknowledgement and fan-out.

Verified once with focused checks:

- Browser room synchronization: 15 tests passed, including pending-overlay isolation and authoritative replacement.
- WebSocket collaboration: 10 tests passed, including a held database write proving final geometry reaches the peer before durable acknowledgement.
- Backend collaboration: 15 tests passed, including acknowledgement independent of revision cleanup.
- Shared common/backend package builds, frontend and WS type checks, targeted frontend lint, and diff whitespace check passed.

No manual signed-in two-browser check was performed in this fix. The automatic transport test uses real WS clients. Restart the existing development services together to load the updated shared package builds. Pre-existing Phase 15 work remains in the working tree; these checks do not certify all of that work.

Do not repeat these successful suites for documentation-only changes. The Phase 15 handoff and prompt now require basic focused verification with time limits and a stopping point.
