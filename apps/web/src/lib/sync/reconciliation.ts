import {
  normalizeElement,
  type Element,
  type NormalizedElement,
  type PresenceParticipant,
  type ServerToClientPresenceMessage,
  type TombstoneMap,
} from "@repo/common";
export function applyPresenceMessage(
  participants: PresenceParticipant[],
  message: ServerToClientPresenceMessage,
): { participants: PresenceParticipant[]; leftConnectionId: string | null } {
  switch (message.type) {
    case "room.access.changed":
      return { participants, leftConnectionId: null };
    case "presence.snapshot":
      return { participants: message.participants, leftConnectionId: null };
    case "presence.joined":
      return {
        participants: participants.some(
          (participant) =>
            participant.connectionId === message.participant.connectionId,
        )
          ? participants.map((participant) =>
              participant.connectionId === message.participant.connectionId
                ? message.participant
                : participant,
            )
          : [...participants, message.participant],
        leftConnectionId: null,
      };
    case "presence.left":
      return {
        participants: participants.filter(
          (participant) => participant.connectionId !== message.connectionId,
        ),
        leftConnectionId: message.connectionId,
      };
    case "pointer.move":
      return {
        participants: participants.map((participant) =>
          participant.connectionId === message.connectionId
            ? { ...participant, pointer: { x: message.x, y: message.y } }
            : participant,
        ),
        leftConnectionId: null,
      };
    case "viewport.update":
      return {
        participants: participants.map((participant) =>
          participant.connectionId === message.connectionId
            ? {
                ...participant,
                viewport: { x: message.x, y: message.y, zoom: message.zoom },
              }
            : participant,
        ),
        leftConnectionId: null,
      };
    case "pointer.leave":
      return {
        participants: participants.map((participant) =>
          participant.connectionId === message.connectionId
            ? { ...participant, pointer: undefined }
            : participant,
        ),
        leftConnectionId: null,
      };
    case "error":
      return { participants, leftConnectionId: null };
  }
}

export function unionTombstones(
  ...maps: Record<
    string,
    | { version: number; versionNonce: number; deletedAt: string }
    | null
    | undefined
  >[]
): TombstoneMap {
  const union: TombstoneMap = {};
  for (const map of maps) {
    for (const [id, entry] of Object.entries(map)) {
      if (!entry) continue;
      const existing = union[id];
      if (
        !existing ||
        entry.version > existing.version ||
        (entry.version === existing.version &&
          entry.versionNonce > existing.versionNonce)
      ) {
        union[id] = { ...entry };
      } else if (existing.deletedAt === "" && entry.deletedAt !== "") {
        union[id] = { ...existing, deletedAt: entry.deletedAt };
      }
    }
  }
  return union;
}

export function normalizeAll(
  elements: readonly Element[],
): NormalizedElement[] {
  const out: NormalizedElement[] = [];
  for (const element of elements) {
    const normalized = normalizeElement(element, {
      strict: false,
      orderFallback: 0,
    });
    if (normalized) out.push(normalized);
  }
  return out;
}
