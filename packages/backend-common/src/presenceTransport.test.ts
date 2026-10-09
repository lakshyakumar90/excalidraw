import { describe, expect, it } from "vitest";
import {
  isOriginAllowed,
  parseRoomIdFromPath,
  parseTicketFromProtocols,
} from "./presenceTransport.js";

describe("parseTicketFromProtocols", () => {
  it("extracts the ticket from the auth.* protocol entry", () => {
    expect(
      parseTicketFromProtocols("excalidraw-presence.v1, auth.abc.def"),
    ).toBe("abc.def");
    expect(parseTicketFromProtocols(["auth.ticket-here"])).toBe("ticket-here");
  });

  it("returns null when no ticket protocol is offered", () => {
    expect(parseTicketFromProtocols("excalidraw-presence.v1")).toBeNull();
    expect(parseTicketFromProtocols(undefined)).toBeNull();
    expect(parseTicketFromProtocols("auth.")).toBeNull();
  });
});

describe("parseRoomIdFromPath", () => {
  it("parses /room/:roomId routing hints", () => {
    expect(parseRoomIdFromPath("/room/12")).toBe(12);
    expect(parseRoomIdFromPath("/room/12/")).toBe(12);
  });

  it("rejects non-numeric or out-of-scope paths", () => {
    expect(parseRoomIdFromPath("/room/abc")).toBeNull();
    expect(parseRoomIdFromPath("/room/0")).toBeNull();
    expect(parseRoomIdFromPath("/rooms/12")).toBeNull();
    expect(parseRoomIdFromPath(null)).toBeNull();
  });
});

describe("isOriginAllowed", () => {
  it("allows missing origins and configured web origins", () => {
    expect(isOriginAllowed(undefined, ["http://localhost:3000"])).toBe(true);
    expect(
      isOriginAllowed("http://localhost:3000", ["http://localhost:3000"]),
    ).toBe(true);
  });

  it("rejects unlisted origins when an allowlist is configured", () => {
    expect(isOriginAllowed("https://evil.example", ["http://localhost:3000"])).toBe(
      false,
    );
  });
});
