# Phase 15 architecture decisions: element synchronization

**Status:** Accepted for Phase 15. This extends (not replaces) the Phase 14
presence channel: the same room WebSocket now also carries explicitly typed
element messages, and the old presence-only restrictions are updated wherever
they forbid element payloads. Presence behavior (cursors, avatars, heartbeat,
ticket auth, membership checks) is preserved.

## 1. Persistence authority

PostgreSQL `Scene.data` is the single durable authority for room scenes.
`Scene.data` keeps its existing shape (`elements`, `appState`, `files`) and
gains an optional `sync` block:

```text
sync: {
  revision: number,            // +1 per accepted commit, any writer
  tombstones: {                // compact deletion metadata, survives pruning
    [elementId]: { version, versionNonce, deletedAt }
  }
}
```

No Prisma model change is required (all inside `Jsonb`); legacy scenes
normalize on read to `revision: 0` with no tombstones. Personal scenes and
the guest canvas keep their existing whole-document paths and never touch
`sync`.

## 2. Commit boundary

- The engine distinguishes **transient** mutations (mid-gesture geometry,
  keystrokes, hover) from **committed** records. Exactly one engine API,
  `Scene.commitChanges(ids, origin)`, assigns `version = max(current,
  observed) + 1` with a fresh `versionNonce` and `updated`, and emits one
  commit event carrying cloned complete records for exactly the changed IDs.
- Gesture paths (selection move/resize/point edits, bound-element syncs,
  text keystrokes) mutate without version bumps; the gesture end (pointerup,
  text commit, Enter/double-click commit, discrete action wrapper) calls
  `commitChanges`. Autosave and the committed outbox are suppressed while a
  capture is active so a drag never persists halfway.
- Remote application (`Scene.applyRemote`) writes exact remote
  version/nonce/updated, never bumps, never broadcasts, never creates undo
  steps. Undo/redo produce new local versioned commits and never restore
  stale metadata.
- A lost connection never discards a local gesture: its commit enters the
  persistent outbox and replays later with the same mutation ID and metadata.

## 3. Reconciliation rule (user-specified)

Per element ID, implemented identically in `packages/common` for browser,
HTTP, and WS: missing local accepts remote; higher `version` wins; equal
`version` goes to higher `versionNonce`; equal `(version, nonce)` with
identical canonical bodies means no change; equal `(version, nonce)` with
different bodies resolves to the lexicographically smaller canonical body so
every replica converges deterministically (this case indicates nonce reuse
and is also rejected at durable acceptance). Arrival time, participant
identity, and `updated` never decide. Deletion is an ordinary versioned
record and does not auto-win against a higher-version edit. Reconciliation
is pure, linear via a map, idempotent, and never mutates its inputs.
Complete records (never field patches) cross the wire for changed IDs only.

Legacy normalization (deterministic, no randomness at load/reconcile):
`version = 1`, `versionNonce = 0`, `isDeleted = false`, `updated = 0`,
`orderKey` assigned from authoritative array position. New local elements get
complete metadata once at creation; the creation commit bumps version as
usual (new elements therefore commit at version 2 — monotonic and harmless).

## 4. Ordering representation

Every element carries a fractional `orderKey` (new optional field on
`BaseElement`, backward compatible). Render order is `orderKey`, then
element ID as the final tie-break — never ID alone. Creation appends
`max + 1`; bring-to-front uses `max + 1`, send-to-back `min - 1`,
forward/backward use fractional midpoints; reordered elements are
version-bumped. Legacy arrays normalize to positional keys from the
authoritative initial scene and persist them. Midpoints that collapse below
`1e-9` trigger a full integer rebalance (a rare large commit, documented in
code). Concurrent equal keys converge via the ID tie-break.

## 5. Tombstone policy

Deletion/erase/undo-of-creation emit versioned `isDeleted: true` records;
absence from a delta is never deletion. Deleted bodies are excluded from
drawing, hit-testing, and export but retained for reconciliation. At save
time the authority prunes bodies whose server-side `deletedAt` exceeds
**7 days**, keeping the compact `{version, versionNonce, deletedAt}` entry.
Reconciliation rejects older stale live records against this metadata; a
higher-version undelete wins and removes the entry atomically in the same
write. Client wall clocks are never trusted for expiry. Tombstone metadata
is unbounded by design (documented residual storage cost) because capping it
would let stale drafts resurrect deletions. Pruning never touches the active
gesture or undo data.

## 6. Protocol version and limits

- Subprotocol `excalidraw-collab.v1` (new); the server still accepts
  `excalidraw-presence.v1` for presence-only clients. All presence variants
  are retained. Added variants: `scene.sync.request`, `scene.sync.snapshot`
  (+ `scene.sync.chunk` for large scenes), `elements.commit`,
  `elements.committed`, `elements.ack`, `elements.preview`,
  `elements.preview.end`, `selection.update`. Full scenes travel only in
  sync snapshots; deltas carry changed complete records with stable client
  mutation IDs; previews carry bounded temporary geometry with gesture ID
  and monotonic sequence and never bump versions.
- Identity/room always come from the authenticated connection; client fields
  cannot spoof them. Snapshots are the only full-scene messages.
- Limits: scene ≤ 5000 elements; commit ≤ 200 elements and ≤ 256 KiB;
  snapshot chunked at ~128 KiB up to 1 MiB total; text ≤ 20000 chars;
  points ≤ 5000 per element; IDs ≤ 64 chars; version 1..2^31, nonce
  0..2^31-1, finite geometry; selection ≤ 500 IDs; preview ≤ 200 elements
  and ≤ 64 KiB. WS `maxPayload` rises to 256 KiB. Rate budgets: ephemeral
  (cursor/preview/selection) ~90/s with preview coalescing under
  backpressure; commits ~20/s, never silently dropped (acknowledged/retried
  or resync). Chunk assembly and queues are bounded.

## 7. Durable merge and concurrency

One shared merge service (`packages/backend-common`, queries in
`packages/db`) serves both WS commits and all room-backed HTTP writes; the
old whole-scene room autosave path is retired. Each accepted commit:
authorizes editor role (viewers rejected, rechecked per mutation),
reconciles only changed records against the latest stored scene, prunes
tombstones, and appends exactly one `SceneRevision` row (the durable
`sync.revision` lives on the row; the JSON copy mirrors it for portable
snapshots). `@@unique([sceneId, revision])`
makes concurrent appends atomic — losers get a 23505 conflict and retry
within a bound (≤ 32 attempts with backoff) — because the ORM's conditional
update is read-then-write and cannot serialize writers (verified
empirically via SQL logging). The `Scene.syncRevision` column stays reserved
infrastructure and is not on the write path.
Read-modify-write without CAS is banned: read-committed alone and
per-process mutexes cannot coordinate the separate HTTP/WS services.
Duplicate mutation IDs and replays are idempotent with no version increment.
DB failure reports `saved: false` and the client keeps its outbox.
Acknowledgement follows the durable write; fan-out carries the authoritative
winners to every other connection including same-user tabs. Corrections for
lost conflicts ride on the ack; missed fan-out is recovered by
snapshot reconciliation on reconnect.

## 8. Files

Element metadata travels over WS; image bytes stay on HTTP. Clients upload
image bytes to the room scene before committing the referencing element;
the authority only reports `saved: true` when referenced files are durably
present, otherwise lists `missingFiles` and the client uploads then
re-commits idempotently. Previews never carry blobs or data URLs, and file
data is preserved across merges.

## 9. Client durability

Room drafts and the committed outbox live in IndexedDB scoped by
`account:room:scene`, migrated without touching the guest `current` scene
or personal scenes. Every connection requests an authoritative snapshot,
merges it with the local draft via `reconcileElements` (never blind
replace), buffers deltas during assembly, then replays pending commits.
Outbox entries complete only on durable ack or authoritative confirmation.
Presence `live`, scene `syncing`, and `saved` stay distinct: an open socket
never implies durability. Remote geometry for an actively dragged element is
deferred, retained (highest wins), and reconciled at gesture end; the local
commit uses `max(base, observed) + 1`. Whole-element last-write-wins is
accepted; field-level merging is explicitly not promised.

## 10. Rendering

Remote previews live in a separate render layer keyed by
`(connectionId, gestureId)` with sequence/base-version staleness checks and
timeouts; they clear on commit, end/cancel, leave, disconnect, and reconnect.
Remote selections render as faint outlines in the participant's cursor color
without touching styles, selection, or history. All existing tools, history,
image rendering, and Phase 14 presence keep working.
