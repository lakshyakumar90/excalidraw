//The store keeps selected element IDs outside React. Later, the selection outline can subscribe to it.

type Listener = () => void;

let selectedIds: ReadonlySet<string> = new Set();
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export const selectionStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): ReadonlySet<string> {
    return selectedIds;
  },

  set(ids: Iterable<string>): void {
    const next = new Set(ids);

    const unchanged =
      next.size === selectedIds.size &&
      [...next].every((id) => selectedIds.has(id));

    if (unchanged) return;

    selectedIds = next;
    notify();
  },

  clear(): void {
    this.set([]);
  },

  toggle(id: string): void {
    const next = new Set(selectedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    this.set(next);
  },
};
