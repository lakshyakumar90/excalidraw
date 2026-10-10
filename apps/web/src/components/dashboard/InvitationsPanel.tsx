"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  acceptMyRoomInvitation,
  listMyRoomInvitations,
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

  return (
    <section id="invitations" className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>Invitations</h2>
          <p>Room invitations sent to your account appear here.</p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
