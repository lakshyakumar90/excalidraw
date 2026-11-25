import Link from "next/link";
import { useEffect, useRef } from "react";
import { useGuestImport } from "@/hooks/dashboard/useGuestImport";
import type { SavedScene } from "@/lib/api/scenes";

/**
 * Automatically saves any pending guest drawing to the user's account once
 * authenticated and surfaces a minimal, non-intrusive status pill.
 */
export function GuestDrawingOffer({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: (scene: SavedScene) => void;
}) {
  const guest = useGuestImport(userId, onSaved);
  const autoSavedRef = useRef(false);

  useEffect(() => {
    if (guest.drawing && !guest.savedId && !guest.saving && !autoSavedRef.current) {
      autoSavedRef.current = true;
      void guest.save();
    }
  }, [guest]);

  if (!guest.savedId && !guest.error) return null;

  return (
    <div
      role={guest.error ? "alert" : "status"}
      className={`animate-pop-up mb-4 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-xs ${
        guest.error
          ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
      }`}
    >
      {guest.error ? (
        <span>{guest.error}</span>
      ) : (
        <>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Your guest drawing was saved to your account.</span>
          </span>
          <Link
            href={`/canvas/${encodeURIComponent(guest.savedId!)}`}
            className="shrink-0 font-medium text-[var(--text-primary)] underline underline-offset-4"
          >
            Open board
          </Link>
        </>
      )}
    </div>
  );
}
