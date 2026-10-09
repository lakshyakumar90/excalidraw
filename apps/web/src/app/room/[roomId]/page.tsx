"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cacheSavedSceneFiles } from "@/lib/persistence/savedScene";
import {
  createInvite,
  deleteRoom,
  getRoom,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  type RoomInvite,
  type RoomMember,
} from "@/lib/api/rooms";

type Room = Awaited<ReturnType<typeof getRoom>>;

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [pendingAction, setPendingAction] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getRoom(roomId)
      .then(async (loaded) => {
        await cacheSavedSceneFiles(loaded.scene?.data.files);
        if (!cancelled) setRoom(loaded);
        const [people, pendingInvites] = await Promise.all([
          listMembers(roomId),
          loaded.role === "owner" ? listInvites(roomId) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setMembers(people);
          setInvites(pendingInvites);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Could not open room",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function invite() {
    setInviting(true);
    setError("");
    try {
      const code = await createInvite(roomId, email.trim());
      setInviteUrl(new URL(`/invite/${code}`, window.location.origin).href);
      setInviteEmail(email.trim());
      setInvites(await listInvites(roomId));
      setEmail("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create invitation",
      );
    } finally {
      setInviting(false);
    }
  }

  async function remove(userId: string) {
    setPendingAction(userId);
    setError("");
    try {
      await removeMember(roomId, userId);
      setMembers(await listMembers(roomId));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove member",
      );
    } finally {
      setPendingAction("");
    }
  }

  async function revoke(inviteId: string) {
    setPendingAction(inviteId);
    setError("");
    try {
      await revokeInvite(roomId, inviteId);
      setInvites(await listInvites(roomId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not revoke invitation",
      );
    } finally {
      setPendingAction("");
    }
  }

  async function removeRoom() {
    if (
      !window.confirm(
        "Delete this room? The saved scene will stay in your account.",
      )
    )
      return;
    setPendingAction("room");
    setError("");
    try {
      await deleteRoom(roomId);
      router.push("/dashboard");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not delete room",
      );
      setPendingAction("");
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-6 text-neutral-900">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm font-medium text-violet-700">
          ← Your scenes
        </Link>
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          {!room ? (
            <p role={error ? "alert" : "status"}>
              {error || "Checking room access…"}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold">{room.name}</h1>
                  <p className="text-sm text-neutral-500">
                    {room.role} · Scene:{" "}
                    {room.scene?.title ?? "No scene attached"}
                  </p>
                </div>
                {room.scene && (
                  <Link
                    href={`/room/${roomId}/canvas`}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Open canvas
                  </Link>
                )}
              </div>
              {room.role === "owner" && (
                <form
                  className="mt-5 border-t border-neutral-200 pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void invite();
                  }}
                >
                  <label
                    htmlFor="invite-email"
                    className="block text-sm font-medium"
                  >
                    Invite someone by email
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      id="invite-email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="min-w-60 flex-1 rounded-lg border border-neutral-300 px-3 py-2"
                    />
                    <button
                      disabled={inviting}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {inviting ? "Creating…" : "Create invite link"}
                    </button>
                  </div>
                  {inviteUrl && (
                    <p className="mt-3 text-sm break-all">
                      Share this link with {inviteEmail}:{" "}
                      <a className="text-violet-700 underline" href={inviteUrl}>
                        {inviteUrl}
                      </a>
                    </p>
                  )}
                </form>
              )}
              <section className="mt-5 border-t border-neutral-200 pt-5">
                <h2 className="font-semibold">Members</h2>
                <ul className="mt-2 space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {member.name} ({member.email}) · {member.role}
                      </span>
                      {room.role === "owner" && member.role !== "owner" && (
                        <button
                          disabled={pendingAction === member.id}
                          onClick={() => void remove(member.id)}
                          className="text-red-700 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              {room.role === "owner" && (
                <section className="mt-5 border-t border-neutral-200 pt-5">
                  <h2 className="font-semibold">Invitations</h2>
                  {invites.length === 0 ? (
                    <p className="mt-2 text-sm text-neutral-500">
                      No invitations yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {invites.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {entry.email} ·{" "}
                            {entry.usedAt
                              ? "Used"
                              : new Date(entry.expiresAt) < new Date()
                                ? "Expired"
                                : "Pending"}
                          </span>
                          <button
                            disabled={pendingAction === entry.id}
                            onClick={() => void revoke(entry.id)}
                            className="text-red-700 disabled:opacity-60"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {room.role === "owner" && (
                <section className="mt-5 border-t border-neutral-200 pt-5">
                  <p className="text-sm text-neutral-600">
                    Deleting this room keeps the saved scene in your account.
                  </p>
                  <button
                    disabled={pendingAction === "room"}
                    onClick={() => void removeRoom()}
                    className="mt-2 text-sm font-medium text-red-700 disabled:opacity-60"
                  >
                    Delete room
                  </button>
                </section>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
