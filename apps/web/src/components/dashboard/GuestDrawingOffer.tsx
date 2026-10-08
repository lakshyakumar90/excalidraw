import Link from "next/link";
import { useGuestImport } from "@/hooks/dashboard/useGuestImport";
import { primaryButton, secondaryButton } from "./dashboardStyles";
import type { SavedScene } from "@/lib/api/scenes";

export function GuestDrawingOffer({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: (scene: SavedScene) => void;
}) {
  const guest = useGuestImport(userId, onSaved);
  if (!guest.drawing && !guest.savedId && !guest.error) return null;
  return (
    <section
      className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5"
      aria-label="Guest drawing"
    >
      {guest.savedId ? (
        <div role="status">
          <p className="font-medium">
            Your guest drawing is saved to your account.
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            The original is still available on your guest canvas.
          </p>
          <Link
            href={`/canvas/${encodeURIComponent(guest.savedId)}`}
            className={`${primaryButton} mt-4 inline-flex`}
          >
            Open saved drawing
          </Link>
        </div>
      ) : guest.drawing ? (
        <>
          <h2 className="font-semibold">
            Save your guest drawing to your account
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Copy your drawing, images, and canvas position. Your local guest
            drawing stays intact.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={primaryButton}
              disabled={guest.saving}
              onClick={() => void guest.save()}
            >
              {guest.saving ? "Saving…" : "Save guest drawing"}
            </button>
            <button
              className={secondaryButton}
              disabled={guest.saving}
              onClick={guest.dismiss}
            >
              Not now
            </button>
          </div>
        </>
      ) : null}
      {guest.error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {guest.error}
        </p>
      )}
    </section>
  );
}
