import { describe, expect, it, vi, afterEach } from "vitest";
import {
  COLLAB_WS_PROTOCOL,
  PRESENCE_WS_PROTOCOL,
  type ServerToClientCollabMessage,
  type ServerToClientPresenceMessage,
} from "@repo/common";
import {
  PresenceConnection,
  computeBackoff,
  isPermanentTicketError,
  type PresenceConnectionStatus,
} from "./presenceSocket";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FakeCloseEvent {
  code: number;
}

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  static reset() {
    FakeWebSocket.instances = [];
  }
  readonly url: string;
  readonly protocols: string[];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: FakeCloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  receive(message: ServerToClientPresenceMessage | ServerToClientCollabMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  peerClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}

vi.stubGlobal("WebSocket", FakeWebSocket);

afterEach(() => {
  FakeWebSocket.reset();
  vi.unstubAllGlobals();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

function trackStatuses() {
  const statuses: PresenceConnectionStatus[] = [];
  const details: (string | null)[] = [];
  return {
    statuses,
    details,
    onStatus: (status: PresenceConnectionStatus, detail: string | null) => {
      statuses.push(status);
      details.push(detail);
    },
  };
}

describe("computeBackoff", () => {
  it("grows exponentially with jitter inside a bounded range", () => {
    const first = computeBackoff(0, 500, 15_000);
    expect(first).toBeGreaterThanOrEqual(500);
    expect(first).toBeLessThanOrEqual(600);
    const third = computeBackoff(2, 500, 15_000);
    expect(third).toBeGreaterThanOrEqual(2000);
    expect(third).toBeLessThanOrEqual(2400);
  });

  it("caps runaway attempts", () => {
    expect(computeBackoff(100, 500, 15_000)).toBeLessThanOrEqual(18_000);
  });
});

describe("isPermanentTicketError", () => {
  it("stops retries for 401/403/404 ticket failures", () => {
    expect(isPermanentTicketError(Object.assign(new Error("x"), { status: 401 }))).toBe(true);
    expect(isPermanentTicketError(Object.assign(new Error("x"), { status: 403 }))).toBe(true);
    expect(isPermanentTicketError(Object.assign(new Error("x"), { status: 404 }))).toBe(true);
    expect(isPermanentTicketError(Object.assign(new Error("x"), { status: 500 }))).toBe(false);
    expect(isPermanentTicketError(new Error("network down"))).toBe(false);
  });
});

describe("PresenceConnection", () => {
  it("opens with the stable protocol plus a fresh ticket", async () => {
    const tracker = trackStatuses();
    const messages: ServerToClientPresenceMessage[] = [];
    const connection = new PresenceConnection("ws://local:8080", "7", {
      getTicket: async () => "ticket-1",
      onMessage: (message) => messages.push(message),
      onCollabMessage: () => {},
      onStatus: tracker.onStatus,
    });
    connection.start();
    await sleep(10);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe("ws://local:8080/room/7");
    expect(socket.protocols).toEqual([
      COLLAB_WS_PROTOCOL,
      PRESENCE_WS_PROTOCOL,
      "auth.ticket-1",
    ]);
    expect(tracker.statuses).toContain("connecting");

    socket.open();
    expect(tracker.statuses).toContain("live");
    socket.receive({ type: "presence.snapshot", participants: [] });
    expect(messages).toHaveLength(1);
    connection.close();
    expect(tracker.statuses.at(-1)).toBe("offline");
  });

  it("routes collaboration messages to the collab handler", async () => {
    const tracker = trackStatuses();
    const collab: ServerToClientCollabMessage[] = [];
    const connection = new PresenceConnection("ws://local:8080", "7", {
      getTicket: async () => "ticket-1",
      onMessage: () => {},
      onCollabMessage: (message) => collab.push(message),
      onStatus: tracker.onStatus,
    });
    connection.start();
    await sleep(10);
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      type: "elements.ack",
      mutationId: "m1",
      revision: 2,
      saved: true,
    });
    expect(collab).toHaveLength(1);
    connection.close();
  });

  it("refetches a ticket and reconnects after an abnormal close", async () => {
    const tracker = trackStatuses();
    let tickets = 0;
    const connection = new PresenceConnection(
      "ws://local:8080",
      "7",
      {
        getTicket: async () => `ticket-${(tickets += 1)}`,
        onCollabMessage: () => {},
        onMessage: () => {},
        onStatus: tracker.onStatus,
      },
      { baseBackoffMs: 5, maxBackoffMs: 10, stableResetMs: 5_000 },
    );
    connection.start();
    await sleep(10);
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.peerClose(1006);
    expect(tracker.statuses).toContain("reconnecting");
    await sleep(60);
    // A fresh ticket proves every reconnect.
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]!.protocols[2]).toBe("auth.ticket-2");
    connection.close();
  });

  it("stops retrying after authentication failures and surfaces a message", async () => {
    const tracker = trackStatuses();
    const connection = new PresenceConnection(
      "ws://local:8080",
      "7",
      {
        getTicket: async () => "ticket-1",
        onCollabMessage: () => {},
        onMessage: () => {},
        onStatus: tracker.onStatus,
      },
      { baseBackoffMs: 5, maxBackoffMs: 10 },
    );
    connection.start();
    await sleep(10);
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.peerClose(4403);
    await sleep(30);
    expect(tracker.statuses.at(-1)).toBe("offline");
    expect(tracker.details.at(-1)).toMatch(/access/i);
    expect(FakeWebSocket.instances).toHaveLength(1);
    connection.close();
  });

  it("stops retrying when the ticket endpoint reports a missing room", async () => {
    const tracker = trackStatuses();
    const connection = new PresenceConnection(
      "ws://local:8080",
      "7",
      {
        getTicket: async () => {
          throw Object.assign(new Error("Room not found"), { status: 404 });
        },
        onCollabMessage: () => {},
        onMessage: () => {},
        onStatus: tracker.onStatus,
      },
      { baseBackoffMs: 5, maxBackoffMs: 10 },
    );
    connection.start();
    await sleep(30);
    expect(tracker.statuses.at(-1)).toBe("offline");
    expect(tracker.details.at(-1)).toMatch(/sign-in|access/i);
    expect(FakeWebSocket.instances).toHaveLength(0);
    connection.close();
  });
});
