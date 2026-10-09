"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@repo/auth/client";
import {
  PRESENCE_THROTTLE_MS,
  type PresenceParticipant,
  type ServerToClientPresenceMessage,
} from "@repo/common";
import { viewportToScene } from "@repo/engine";
import { fetchPresenceTicket } from "@/lib/api/rooms";
import {
  getCurrentViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import {
  PresenceConnection,
  type PresenceConnectionStatus,
} from "@/lib/presence/presenceSocket";
import { setCanvasPresencePublisher } from "@/lib/presence/presencePublisher";
import { createThrottledPublisher } from "@/lib/presence/throttle";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

export interface UsePresenceResult {
  status: PresenceConnectionStatus;
  detail: string | null;
  participants: PresenceParticipant[];
  selfUserId: string | null;
}

function applyServerMessage(
  participants: PresenceParticipant[],
  message: ServerToClientPresenceMessage,
): PresenceParticipant[] {
  switch (message.type) {
    case "presence.snapshot":
      return message.participants;
    case "presence.joined":
      return participants.some(
        (participant) => participant.connectionId === message.participant.connectionId,
      )
        ? participants.map((participant) =>
            participant.connectionId === message.participant.connectionId
              ? message.participant
              : participant,
          )
        : [...participants, message.participant];
    case "presence.left":
      return participants.filter(
        (participant) => participant.connectionId !== message.connectionId,
      );
    case "pointer.move":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? { ...participant, pointer: { x: message.x, y: message.y } }
          : participant,
      );
    case "viewport.update":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? {
              ...participant,
              viewport: { x: message.x, y: message.y, zoom: message.zoom },
            }
          : participant,
      );
    case "pointer.leave":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? { ...participant, pointer: undefined }
          : participant,
      );
    case "error":
      return participants;
  }
}

/**
 * Owns the room presence channel: ticket fetch, connect/reconnect, participant
 * state, and throttled local pointer/viewport publishing. Scene loading and
 * autosave stay on HTTP; two users' edits are not synchronized here.
 */
export function usePresence(roomId: string): UsePresenceResult {
  const { data: session } = authClient.useSession();
  const selfUserId = session?.user?.id ?? null;
  const roomValid = /^\d+$/.test(roomId);
  const [status, setStatus] =
    useState<PresenceConnectionStatus>("connecting");
  const [detail, setDetail] = useState<string | null>(null);
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
  const connectionRef = useRef<PresenceConnection | null>(null);

  useEffect(() => {
    if (!roomValid) return;
    const connection = new PresenceConnection(WS_BASE_URL, roomId, {
      getTicket: () => fetchPresenceTicket(roomId),
      onMessage: (message) => {
        setParticipants((current) => applyServerMessage(current, message));
      },
      onStatus: (next, nextDetail) => {
        setStatus(next);
        setDetail(nextDetail);
        if (next === "reconnecting" || next === "connecting") {
          // Keep the last snapshot visible while re-syncing.
        }
        if (next === "live") {
          setDetail(null);
        }
      },
    });
    connectionRef.current = connection;

    const pointerPublisher = createThrottledPublisher(
      PRESENCE_THROTTLE_MS,
      (point: { x: number; y: number }) => {
        connection.send({ type: "pointer.move", x: point.x, y: point.y });
      },
    );
    const viewportPublisher = createThrottledPublisher(
      PRESENCE_THROTTLE_MS,
      (viewport: { x: number; y: number; zoom: number }) => {
        connection.send({
          type: "viewport.update",
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom,
        });
      },
    );

    const publishViewport = () => {
      const viewport = getCurrentViewport();
      const center = viewportToScene(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        viewport,
      );
      viewportPublisher.push({ x: center.x, y: center.y, zoom: viewport.zoom });
    };

    setCanvasPresencePublisher({
      pointer: (point) => pointerPublisher.push(point),
      leave: () => {
        pointerPublisher.cancel();
        connection.send({ type: "pointer.leave" });
      },
    });
    const unsubscribeViewport = subscribeViewport(publishViewport);

    connection.start();
    publishViewport();

    return () => {
      unsubscribeViewport();
      setCanvasPresencePublisher(null);
      pointerPublisher.cancel();
      viewportPublisher.cancel();
      connection.close();
      connectionRef.current = null;
      setParticipants([]);
    };
  }, [roomId, roomValid, selfUserId]);

  if (!roomValid) {
    return {
      status: "offline",
      detail: "This room link looks invalid, so presence is offline.",
      participants: [],
      selfUserId,
    };
  }
  return { status, detail, participants, selfUserId };
}
