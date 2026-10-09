import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@repo/db";
import { createCollaborationService } from "./collaboration.js";

const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIntegration = TEST_URL ? describe : describe.skip;

function rect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 2,
    versionNonce: 2,
    ...overrides,
  };
}

describeIntegration("collaboration against a dedicated test database", () => {
  const tag = `sync${Date.now()}`;
  const ownerId = `owner-${tag}`;
  const editorId = `editor-${tag}`;
  const viewerId = `viewer-${tag}`;
  const scenes: string[] = [];
  const rooms: number[] = [];

  async function createRoomScene(
    suffix: string,
    members: { userId: string; role: "editor" | "viewer" }[] = [
      { userId: editorId, role: "editor" },
    ],
  ): Promise<string> {
    const sceneId = `scene-${tag}-${suffix}`;
    await db.orm!.public!.Scene.create({
      id: sceneId,
      ownerId,
      title: "Sync room",
      data: { elements: [], sync: { revision: 0, tombstones: {} } },
    });
    const room = (await db.orm!.public!.Room.create({
      slug: `sync-room-${tag}-${suffix}`,
      adminId: ownerId,
      sceneId,
    })) as { id: number };
    scenes.push(sceneId);
    rooms.push(room.id);
    for (const member of members) {
      await db.orm!.public!.RoomMember.create({
        userId: member.userId,
        roomId: room.id,
        role: member.role,
      });
    }
    return sceneId;
  }

  beforeAll(async () => {
    await db.connect();
    for (const [id, email] of [
      [ownerId, `${ownerId}@example.com`],
      [editorId, `${editorId}@example.com`],
      [viewerId, `${viewerId}@example.com`],
    ] as const) {
      await db.orm!.public!.User.create({
        id,
        email,
        name: id,
        username: id,
        emailVerified: true,
      });
    }
  }, 120_000);

  afterAll(async () => {
    for (const roomId of rooms) {
      await db.orm!.public!.RoomMember.where({ roomId }).delete().catch(() => null);
      await db.orm!.public!.Room.where({ id: roomId }).delete().catch(() => null);
    }
    for (const sceneId of scenes) {
      await db.orm!.public!.Scene.where({ id: sceneId }).delete().catch(() => null);
    }
    for (const id of [ownerId, editorId, viewerId]) {
      await db.orm!.public!.User.where({ id }).delete().catch(() => null);
    }
    await db.close();
  }, 120_000);

  it("preserves disjoint concurrent commits from both writers", async () => {
    const sceneId = await createRoomScene("disjoint");
    const service = createCollaborationService({ store: db });
    const commits = Array.from({ length: 10 }, (_, index) =>
      service.applyCommit({
        sceneId,
        userId: index % 2 === 0 ? ownerId : editorId,
        role: index % 2 === 0 ? "owner" : "editor",
        elements: [rect(`disjoint-${index}`, { versionNonce: 100 + index })],
        mutationId: `disjoint-${tag}-${index}`,
      }),
    );
    const results = await Promise.all(commits);
    expect(results.every((result) => result.saved)).toBe(true);
    const scene = await service.readSyncScene(sceneId);
    expect(scene?.elements).toHaveLength(10);
    // Ten accepted commits bumped the revision exactly ten times: no writer
    // silently lost to a read-modify-write race.
    expect(scene?.revision).toBe(10);
  });

  it("converges concurrent same-element edits deterministically", async () => {
    const sceneId = await createRoomScene("race");
    const service = createCollaborationService({ store: db });
    const [first, second] = await Promise.all([
      service.applyCommit({
        sceneId,
        userId: ownerId,
        role: "owner",
        elements: [rect("race", { version: 6, versionNonce: 10, x: 1 })],
        mutationId: `race-a-${tag}`,
      }),
      service.applyCommit({
        sceneId,
        userId: editorId,
        role: "editor",
        elements: [rect("race", { version: 6, versionNonce: 40, x: 2 })],
        mutationId: `race-b-${tag}`,
      }),
    ]);
    expect(first.saved).toBe(true);
    expect(second.saved).toBe(true);
    const scene = await service.readSyncScene(sceneId);
    const race = scene?.elements.find((element) => element.id === "race");
    // Higher nonce wins on both replicas.
    expect(race).toMatchObject({ version: 6, versionNonce: 40, x: 2 });
    // A stale third writer loses against the settled state and is told so.
    const stale = await service.applyCommit({
      sceneId,
      userId: ownerId,
      role: "owner",
      elements: [rect("race", { version: 5, versionNonce: 1, x: 0 })],
      mutationId: `race-stale-${tag}`,
    });
    expect(stale.saved).toBe(true);
    expect(
      stale.corrected.filter((element) => element.id === "race"),
    ).toHaveLength(1);
    expect(
      (await service.readSyncScene(sceneId))?.elements.find(
        (element) => element.id === "race",
      ),
    ).toMatchObject({ version: 6, versionNonce: 40, x: 2 });
  }, 120_000);

  it("replays the same mutation without duplicating versions", async () => {
    const sceneId = await createRoomScene("replay");
    const service = createCollaborationService({ store: db });
    const input = {
      sceneId,
      userId: ownerId,
      role: "owner" as const,
      elements: [rect("replay", { version: 2, versionNonce: 3 })],
      mutationId: `replay-${tag}`,
    };
    const first = await service.applyCommit(input);
    const second = await service.applyCommit(input);
    expect(second.replayed).toBe(true);
    expect({ ...second, replayed: false }).toEqual({ ...first, replayed: false });
    const scene = await service.readSyncScene(sceneId);
    expect(
      scene?.elements.filter((element) => element.id === "replay"),
    ).toHaveLength(1);
  });

  it("rejects viewer commits against real roles", async () => {
    const sceneId = await createRoomScene("viewer", [
      { userId: viewerId, role: "viewer" },
    ]);
    const service = createCollaborationService({ store: db });
    const result = await service.applyCommit({
      sceneId,
      userId: viewerId,
      role: "viewer",
      elements: [rect("nope")],
      mutationId: `viewer-${tag}`,
    });
    expect(result).toMatchObject({ saved: false, reason: "forbidden" });
  });

  it("survives a service restart: a new instance reads durable commits", async () => {
    const sceneId = await createRoomScene("restart");
    const writer = createCollaborationService({ store: db });
    const saved = await writer.applyCommit({
      sceneId,
      userId: ownerId,
      role: "owner",
      elements: [rect("durable", { version: 2, versionNonce: 8, x: 3 })],
      mutationId: `restart-${tag}`,
    });
    expect(saved.saved).toBe(true);
    // A fresh service (new process) sees the same durable state.
    const reader = createCollaborationService({ store: db });
    const scene = await reader.readSyncScene(sceneId);
    expect(scene?.revision).toBe(saved.revision);
    expect(
      scene?.elements.find((element) => element.id === "durable"),
    ).toMatchObject({ version: 2, versionNonce: 8, x: 3 });
  });

  it("never stores preview or selection frames in scene JSON", async () => {
    const sceneId = await createRoomScene("clean");
    const service = createCollaborationService({ store: db });
    await service.applyCommit({
      sceneId,
      userId: ownerId,
      role: "owner",
      elements: [rect("clean-1")],
      mutationId: `clean-${tag}`,
    });
    const rows = (await db.orm!.public!.SceneRevision.where({ sceneId }).select(
      "data",
    ).all()) as { data: unknown }[];
    expect(rows.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(rows.map((row) => row.data));
    for (const forbidden of [
      "gestureId",
      '"seq"',
      "selection.update",
      "elements.preview",
      "connectionId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }, 120_000);
});
