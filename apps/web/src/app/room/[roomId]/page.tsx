"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cacheSavedSceneFiles } from "@/lib/persistence/savedScene";
import {
  createInvite,
  createJoinCode,
  deleteRoom,
  getRoom,
  listInvites,
  listMembers,
  listJoinCodes,
  removeMember,
  revokeInvite,
  resendInvite,
  revokeJoinCode,
  updateMemberRole,
  type RoomInvite,
  type RoomJoinCode,
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
  const [joinCodes, setJoinCodes] = useState<RoomJoinCode[]>([]);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [joinCodeRole, setJoinCodeRole] = useState<"editor" | "viewer">("editor");
  const [joinCodeLink, setJoinCodeLink] = useState("");
  const [joinCodeValue, setJoinCodeValue] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [pendingAction, setPendingAction] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getRoom(roomId)
      .then(async (loaded) => {
        await cacheSavedSceneFiles(loaded.scene?.data.files);
        if (!cancelled) setRoom(loaded);
        const [people, pendingInvites] = await Promise.all([
          listMembers(roomId),
          loaded.role === "owner"
            ? Promise.all([listInvites(roomId), listJoinCodes(roomId)])
            : Promise.resolve([[], []] as [RoomInvite[], RoomJoinCode[]]),
        ]);
        if (!cancelled) {
          setMembers(people);
          if (loaded.role === "owner") {
            setInvites((pendingInvites as [RoomInvite[], RoomJoinCode[]])[0]);
            setJoinCodes((pendingInvites as [RoomInvite[], RoomJoinCode[]])[1]);
          }
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
      const result = await createInvite(roomId, email.trim(), inviteRole);
      setInviteUrl(result.inviteUrl);
      setDeliveryState(
        result.delivery === "sent"
          ? "Invitation email sent."
          : result.delivery === "failed"
            ? "Invite created, but email delivery failed. Copy and send this link manually."
            : "Email is not configured. Copy and send this invitation link manually.",
      );
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

  async function makeJoinCode() {
    setPendingAction("join-code");
    setError("");
    try {
      const result = await createJoinCode(roomId, joinCodeRole);
      setJoinCodeValue(result.code);
      setJoinCodeLink(result.url);
      setJoinCodes(await listJoinCodes(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create join code");
    } finally {
      setPendingAction("");
    }
  }

  async function changeRole(userId: string, role: "editor" | "viewer") {
    setPendingAction(userId);
    setError("");
    try {
      await updateMemberRole(roomId, userId, role);
      setMembers(await listMembers(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update member role");
    } finally {
      setPendingAction("");
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

  async function resend(inviteId: string) {
    setPendingAction(inviteId);
    setError("");
    try {
      const result = await resendInvite(roomId, inviteId);
      setInviteUrl(result.inviteUrl);
      setDeliveryState(
        result.delivery === "sent"
          ? "Invitation email sent."
          : result.delivery === "failed"
            ? "Email delivery failed. Copy and send this link manually."
            : "Email is not configured. Copy and send this link manually.",
      );
      setInvites(await listInvites(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend invitation");
    } finally {
      setPendingAction("");
    }
  }

  async function revokeCode(codeId: string) {
    setPendingAction(codeId);
    setError("");
    try {
      await revokeJoinCode(roomId, codeId);
      setJoinCodes(await listJoinCodes(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not revoke join code");
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
    <main className="dashboard-page room-page min-h-dvh bg-[#faf9f6] px-4 py-5 text-neutral-900 sm:px-6 sm:py-8">
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
                  className="mt-6 border-t border-neutral-200 pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void invite();
                  }}
                >
                  <h2 className="text-lg font-semibold">Invite people</h2>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    They’ll get an email and can accept from their dashboard. A direct link is available to copy too.
                  </p>
                  <label htmlFor="invite-email" className="mt-4 block text-sm font-medium">
                    Invite by email or username
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      id="invite-email"
                      type="text"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com or username"
                      autoComplete="email"
                      className="min-w-60 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-base"
                    />
                    <select
                      aria-label="Invitation role"
                      value={inviteRole}
                      onChange={(event) =>
                        setInviteRole(event.target.value as "editor" | "viewer")
                      }
                      className="rounded-lg border border-neutral-300 px-3 py-2"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      disabled={inviting}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {inviting ? "Sending…" : "Send invitation"}
                    </button>
                  </div>
                  {inviteUrl && (
                    <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                      <p role="status" className="text-sm font-medium text-neutral-800">
                        {deliveryState} {inviteEmail} will also see this in their dashboard.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a className="min-w-0 flex-1 break-all text-sm text-violet-700 underline" href={inviteUrl}>
                          Open {inviteRole} invitation link
                        </a>
                      <button
                        type="button"
                        className="min-h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-100"
                        onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                      >Copy link</button>
                      </div>
                    </div>
                  )}
                </form>
              )}
              {room.role === "owner" && (
                <section className="mt-5 border-t border-neutral-200 pt-5">
                  <h2 className="font-semibold">Short join code</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      aria-label="Join code role"
                      value={joinCodeRole}
                      onChange={(event) =>
                        setJoinCodeRole(event.target.value as "editor" | "viewer")
                      }
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="button"
                      disabled={pendingAction === "join-code"}
                      onClick={() => void makeJoinCode()}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {pendingAction === "join-code" ? "Creating…" : "Create 24-hour code"}
                    </button>
                  </div>
                  {joinCodeLink && (
                    <p role="status" className="mt-3 break-all text-sm">
                      Code <strong className="font-mono">{joinCodeValue}</strong> · Link: <a className="text-violet-700 underline" href={joinCodeLink}>{joinCodeLink}</a>
                      <button type="button" className="ml-2 text-violet-700 underline" onClick={() => void navigator.clipboard.writeText(joinCodeLink)}>Copy link</button>
                    </p>
                  )}
                  {joinCodes.length > 0 && (
                    <ul className="mt-3 space-y-2 text-sm">
                      {joinCodes.map((code) => (
                        <li key={code.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span>{code.role} · {code.revokedAt ? "Revoked" : new Date(code.expiresAt) < new Date() ? "Expired" : "Active"} · expires {new Date(code.expiresAt).toLocaleString()}</span>
                          {!code.revokedAt && new Date(code.expiresAt) > new Date() && (
                            <button disabled={pendingAction === code.id} onClick={() => void revokeCode(code.id)} className="text-red-700">Revoke</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
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
                        {member.name}{member.email ? ` (${member.email})` : ""} · {member.role}
                      </span>
                      {room.role === "owner" && member.role !== "owner" && (
                        <div className="flex items-center gap-3">
                          <select
                            aria-label={`Role for ${member.name}`}
                            value={member.role}
                            disabled={pendingAction === member.id}
                            onChange={(event) => void changeRole(member.id, event.target.value as "editor" | "viewer")}
                            className="rounded border border-neutral-300 px-2 py-1"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        <button
                          disabled={pendingAction === member.id}
                          onClick={() => void remove(member.id)}
                          className="text-red-700 disabled:opacity-60"
                        >
                          Remove
                        </button>
                        </div>
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
                            {entry.email} · {entry.role} · {entry.deliveryError === "not-configured" ? "Manual link" : entry.deliveryError ? "Email failed" : entry.sentAt ? "Email sent" : "Preparing email"} ·{" "}
                            {entry.usedAt
                              ? "Used"
                              : entry.revokedAt
                                ? "Revoked"
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
                          {!entry.usedAt && !entry.revokedAt &&
                            new Date(entry.expiresAt) > new Date() &&
                            (!entry.sentAt || entry.deliveryError) && (
                              <button
                                disabled={pendingAction === entry.id}
                                onClick={() => void resend(entry.id)}
                                className="text-violet-700 disabled:opacity-60"
                              >Resend</button>
                            )}
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
