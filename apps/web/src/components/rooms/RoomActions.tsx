"use client";

import { useRef, useState } from "react";
import { deleteRoom, leaveRoom } from "@/lib/api/rooms";
import { secondaryButton } from "../dashboard/dashboardStyles";

export function RoomActions({
  roomId,
  name,
  owner,
  onComplete,
}: {
  roomId: string;
  name: string;
  owner: boolean;
  onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const action = owner ? "Delete room" : "Leave room";

  async function confirm() {
    setPending(true);
    setError("");
    try {
      await (owner ? deleteRoom(roomId) : leaveRoom(roomId));
      dialog.current?.close();
      onComplete();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : `Could not ${action.toLowerCase()}.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-blue-600"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
        aria-label={`${action}: ${name}`}
      >
        {action}
      </button>
      <dialog
        ref={dialog}
        className="dashboard-dialog room-confirm-dialog"
        aria-labelledby={`room-action-${roomId}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="room-confirm-content">
          <h2 id={`room-action-${roomId}`}>
            {owner ? "Delete" : "Leave"} {name}?
          </h2>
          <p>
            {owner
              ? "The room and its invitations will be removed. Your saved canvas stays in your account."
              : "You will lose access to this room. The room and everyone else’s access will stay unchanged."}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="dashboard-dialog-actions">
            <button
              type="button"
              className={secondaryButton}
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending ? (owner ? "Deleting…" : "Leaving…") : action}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
