import { SYNC_SNAPSHOT_CHUNK_BYTES, type NormalizedElement } from "./sync.js";

export function chunkElementsForSnapshot(
  elements: readonly NormalizedElement[],
  maxBytes: number = SYNC_SNAPSHOT_CHUNK_BYTES,
): NormalizedElement[][] {
  const chunks: NormalizedElement[][] = [[]];
  let bytes = 2; // surrounding brackets
  for (const element of elements) {
    const size = JSON.stringify(element)?.length ?? 0;
    const current = chunks[chunks.length - 1]!;
    const nextBytes = bytes + (current.length > 0 ? 1 : 0) + size;
    if (current.length > 0 && nextBytes > maxBytes) {
      chunks.push([element]);
      bytes = 2 + size;
    } else {
      current.push(element);
      bytes = nextBytes;
    }
  }
  return chunks;
}
