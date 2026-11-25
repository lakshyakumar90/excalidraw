"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RoomActions } from "@/components/rooms/RoomActions";
import { ChitranBrand } from "@/components/brand/ChitranLogo";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import { cacheSavedSceneFiles } from "@/lib/persistence/savedScene";
import {
  createInvite,
  createInviteLink,
  createJoinCode,
  getRoom,
  listInvites,
  listMembers,
  listJoinCodes,
  removeMember,
  revokeInvite,
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
      setDeliveryState("In-app invitation created. A share link is ready if you need it.");
      setInviteEmail(result.email);
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

  async function getInviteLink(invite: RoomInvite) {
    setPendingAction(invite.id);
    setError("");
    try {
      const result = await createInviteLink(roomId, invite.id);
      setInviteUrl(result.inviteUrl);
      setInviteEmail(invite.email);
      setInviteRole(invite.role);
      setDeliveryState("A new share link is ready to copy.");
      setInvites(await listInvites(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create invitation link");
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

  return (
    <main className="dashboard-page room-page min-h-dvh">
      <header className="dashboard-topbar">
        <Link href="/dashboard" className="dashboard-brand">
          <ChitranBrand />
        </Link>
        <nav className="dashboard-topbar-nav" aria-label="Room navigation">
          <Link href="/dashboard">Workspace</Link>
          <Link href="/boards">My Boards</Link>
        </nav>
        {room?.scene ? (
          <Link href={`/room/${roomId}/canvas`} className="dashboard-open-canvas">
            Open canvas
          </Link>
        ) : (
          <Link href="/" className="dashboard-open-canvas">
            Scratch board
          </Link>
        )}
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
          {!room && !error ? (
            <div className="space-y-4" role="status" aria-label="Loading room">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-5 w-44 animate-pulse rounded-md bg-[var(--bg-hover)]" />
                  <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--bg-elevated)]" />
                </div>
                <div className="h-9 w-28 animate-pulse rounded-xl bg-[var(--bg-hover)]" />
              </div>
              <div className="h-24 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
              <div className="h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
            </div>
          ) : !room ? (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link
                    href="/dashboard"
                    aria-label="Back to workspace"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    ←
                  </Link>
                  <div>
                    <h1 className="text-lg font-semibold text-[var(--text-primary)]">{room.name}</h1>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {room.role} · Scene:{" "}
                      {room.scene?.title ?? "No scene attached"}
                    </p>
                  </div>
                </div>
                {room.scene && (
                  <Link
                    href={`/room/${roomId}/canvas`}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
                  >
                    Open canvas
                  </Link>
                )}
              </div>
              {room.role === "owner" && (
                <form
                  className="mt-5 border-t border-[var(--border-subtle)] pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void invite();
                  }}
                >
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Invite people</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                    Enter an account email or username. The invitation appears in their dashboard when they sign in. You can also create a share link.
                  </p>
                  <label htmlFor="invite-email" className="mt-3 block text-xs font-medium text-[var(--text-muted)]">
                    Invite by email or username
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <input
                      id="invite-email"
                      type="text"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com or username"
                      autoComplete="off"
                      className="min-w-60 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-soft)]"
                    />
                    <SelectDropdown
                      ariaLabel="Invitation role"
                      value={inviteRole}
                      onChange={(val) => setInviteRole(val as "editor" | "viewer")}
                      options={[
                        { value: "editor", label: "Editor" },
                        { value: "viewer", label: "Viewer" },
                      ]}
                      className="w-28"
                    />
                    <button
                      disabled={inviting}
                      className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      {inviting ? "Creating…" : "Invite to room"}
                    </button>
                  </div>
                  {inviteUrl && (
                    <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                      <p role="status" className="text-xs font-medium text-[var(--text-primary)]">
                        {deliveryState} {inviteEmail} will see it in their dashboard after signing in.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a className="min-w-0 flex-1 break-all text-xs text-[var(--text-primary)] underline" href={inviteUrl}>
                          Open {inviteRole} invitation link
                        </a>
                      <button
                        type="button"
                        className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                      >Copy link</button>
                      </div>
                    </div>
                  )}
                </form>
              )}
              {room.role === "owner" && (
                <section className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Short join code</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <SelectDropdown
                      ariaLabel="Join code role"
                      value={joinCodeRole}
                      onChange={(val) => setJoinCodeRole(val as "editor" | "viewer")}
                      options={[
                        { value: "editor", label: "Editor" },
                        { value: "viewer", label: "Viewer" },
                      ]}
                      className="w-28"
                    />
                    <button
                      type="button"
                      disabled={pendingAction === "join-code"}
                      onClick={() => void makeJoinCode()}
                      className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      {pendingAction === "join-code" ? "Creating…" : "Create 24-hour code"}
                    </button>
                  </div>
                  {joinCodeLink && (
                    <p role="status" className="mt-3 break-all text-xs text-[var(--text-muted)]">
                      Code <strong className="font-mono text-[var(--text-primary)]">{joinCodeValue}</strong> · Link: <a className="text-[var(--text-primary)] underline" href={joinCodeLink}>{joinCodeLink}</a>
                      <button type="button" className="ml-2 text-[var(--text-primary)] underline" onClick={() => void navigator.clipboard.writeText(joinCodeLink)}>Copy link</button>
                    </p>
                  )}
                  {joinCodes.length > 0 && (
                    <ul className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                      {joinCodes.map((code) => (
                        <li key={code.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span>{code.role} · {code.revokedAt ? "Revoked" : new Date(code.expiresAt) < new Date() ? "Expired" : "Active"} · expires {new Date(code.expiresAt).toLocaleString()}</span>
                          {!code.revokedAt && new Date(code.expiresAt) > new Date() && (
                            <button disabled={pendingAction === code.id} onClick={() => void revokeCode(code.id)} className="text-rose-400 hover:underline">Revoke</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              <section className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Members</h2>
                <ul className="mt-2 space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-primary)]"
                    >
                      <span>
                        {member.name}{member.email ? ` (${member.email})` : ""} · <span className="text-[var(--text-muted)]">{member.role}</span>
                      </span>
                      {room.role === "owner" && member.role !== "owner" && (
                        <div className="flex items-center gap-3">
                          <SelectDropdown
                            ariaLabel={`Role for ${member.name}`}
                            value={member.role}
                            disabled={pendingAction === member.id}
                            onChange={(val) => void changeRole(member.id, val as "editor" | "viewer")}
                            options={[
                              { value: "editor", label: "Editor" },
                              { value: "viewer", label: "Viewer" },
                            ]}
                            className="w-28"
                          />
                        <button
                          disabled={pendingAction === member.id}
                          onClick={() => void remove(member.id)}
                          className="text-rose-400 hover:underline disabled:opacity-60"
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
                <section className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Invitations</h2>
                  {invites.length === 0 ? (
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                      No pending invitations. Accepted and declined invitations are cleared from this list.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {invites.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-primary)]"
                        >
                          <span>
                            {entry.email} · {entry.role} · In-app invitation · Pending
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              disabled={pendingAction === entry.id}
                              onClick={() => void revoke(entry.id)}
                              className="text-rose-400 hover:underline disabled:opacity-60"
                            >
                              Revoke
                            </button>
                            <button
                              disabled={pendingAction === entry.id}
                              onClick={() => void getInviteLink(entry)}
                              className="text-[var(--text-primary)] underline disabled:opacity-60"
                            >Create share link</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              <section className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                <RoomActions roomId={roomId} name={room.name} owner={room.role === "owner"} onComplete={() => router.push("/dashboard")} />
              </section>
              {error && (
                <p role="alert" className="mt-3 text-xs text-rose-400">
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
