import type { Element } from "@repo/common";
import type { OutboxEntry, OutboxStore } from "@/lib/persistence/roomDraft";

/**
 * Persistent committed-edit outbox (Phase 15).
 *
 * Entries are written to IndexedDB before relying on socket delivery and
 * replay with the same mutation ID and metadata until durable
 * acknowledgement or authoritative coverage. Storage is injected so tests
 * run deterministically on an in-memory implementation.
 */

export type { OutboxEntry, OutboxStore };

function cloneEntry(entry: OutboxEntry): OutboxEntry {
  return { ...entry, elements: structuredClone(entry.elements) };
}

export class OutboxManager {
  private entries = new Map<string, OutboxEntry>();

  constructor(
    private readonly store: OutboxStore,
    private readonly clock: () => number = Date.now,
  ) {}

  async load(roomKey: string): Promise<void> {
    this.entries.clear();
    for (const entry of await this.store.list(roomKey)) {
      this.entries.set(entry.mutationId, entry);
    }
  }

  all(): OutboxEntry[] {
    return [...this.entries.values()]
      .map(cloneEntry)
      .sort((a, b) => a.createdAt - b.createdAt || (a.mutationId < b.mutationId ? -1 : 1));
  }

  get(mutationId: string): OutboxEntry | undefined {
    const entry = this.entries.get(mutationId);
    return entry ? cloneEntry(entry) : undefined;
  }

  get size(): number {
    return this.entries.size;
  }

  async enqueue(
    roomKey: string,
    elements: Element[],
    baseRevision: number,
  ): Promise<OutboxEntry> {
    const entry: OutboxEntry = {
      mutationId: crypto.randomUUID(),
      roomKey,
      elements: structuredClone(elements),
      baseRevision,
      createdAt: this.clock(),
      attempts: 0,
    };
    this.entries.set(entry.mutationId, cloneEntry(entry));
    await this.store.put(entry);
    return cloneEntry(entry);
  }

  async noteAttempt(mutationId: string): Promise<void> {
    const entry = this.entries.get(mutationId);
    if (!entry) return;
    entry.attempts += 1;
    await this.store.put(cloneEntry(entry));
  }

  async remove(mutationId: string): Promise<void> {
    this.entries.delete(mutationId);
    await this.store.remove(mutationId);
  }

  clear(): void {
    this.entries.clear();
  }
}
