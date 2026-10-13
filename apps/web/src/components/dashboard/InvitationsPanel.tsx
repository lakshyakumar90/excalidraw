"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  acceptMyRoomInvitation,
  listMyRoomInvitations,
  rejectMyRoomInvitation,
  type PendingRoomInvitation,
} from "@/lib/api/rooms";
import { primaryButton } from "./dashboardStyles";

export function InvitationsPanel() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<PendingRoomInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const items = await listMyRoomInvitations();
      setInvitations(items);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load invitations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function accept(invite: PendingRoomInvitation) {
    setPending(invite.id);
    setError("");
    try {
      const roomId = await acceptMyRoomInvitation(invite.id);
      router.push(`/room/${roomId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept invitation");
      await refresh();
    } finally {
      setPending("");
    }
  }

  async function reject(invite: PendingRoomInvitation) {
    setPending(invite.id);
    setError("");
    try {
      await rejectMyRoomInvitation(invite.id);
      setInvitations((current) => current.filter((item) => item.id !== invite.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reject invitation");
      await refresh();
    } finally {
      setPending("");
    }
  }

  return (
    <section id="invitations" className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>Invitations</h2>
          <p>Review who invited you before joining a shared room.</p>
        </div>
        {invitations.length > 0 && (
          <span className="dashboard-count" aria-label={`${invitations.length} pending invitations`}>
            {invitations.length}
          </span>
        )}
      </div>
      {loading ? (
        <p className="dashboard-muted" role="status">Checking for invitations…</p>
      ) : invitations.length === 0 ? (
        <p className="dashboard-empty-line">You’re all caught up. New invitations will show up here.</p>
      ) : (
        <ul className="dashboard-invitation-list">
          {invitations.map((invite) => (
            <li key={invite.id}>
              <div className="min-w-0">
                <p className="truncate font-semibold">{invite.roomName}</p>
                <p className="mt-1 text-sm text-neutral-600">
                  Invited by {invite.inviterName}
                  {invite.inviterEmail ? ` · ${invite.inviterEmail}` : ""}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {invite.role} access · Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending === invite.id}
                  onClick={() => void accept(invite)}
                  className={primaryButton}
                >
                  {pending === invite.id ? "Joining…" : "Accept"}
                </button>
                <button
                  type="button"
                  disabled={pending === invite.id}
                  onClick={() => void reject(invite)}
                  className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                >
                  {pending === invite.id ? "Working…" : "Reject"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
