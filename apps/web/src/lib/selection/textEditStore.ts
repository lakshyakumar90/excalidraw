export interface TextEditRequest {
  targetElementId: string;
  text: string;
  editsShapeLabel: boolean;
}

type Listener = () => void;

let request: TextEditRequest | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export const textEditStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): TextEditRequest | null {
    return request;
  },
  open(next: TextEditRequest): void {
    request = next;
    notify();
  },
  close(): void {
    if (!request) return;
    request = null;
    notify();
  },
};
