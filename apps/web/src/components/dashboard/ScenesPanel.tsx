import Link from "next/link";
import { useDashboardScenes } from "@/hooks/dashboard/useDashboardScenes";
import { primaryButton, secondaryButton } from "./dashboardStyles";
import { GuestDrawingOffer } from "./GuestDrawingOffer";

interface DashboardUser {
  id: string;
  name: string;
  email: string;
}

export function ScenesPanel({ user }: { user: DashboardUser }) {
  const dashboard = useDashboardScenes(user.id);
  return (
    <>
      <GuestDrawingOffer userId={user.id} onSaved={dashboard.addSavedScene} />
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <p className="font-medium">{user.name || user.email}</p>
          <p className="mt-1 text-sm text-neutral-500">
            Saved scenes are separate from your guest canvas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void dashboard.handleSignOut()}
            className={secondaryButton}
          >
            Sign out
          </button>
          <button
            disabled={dashboard.creating}
            onClick={() => void dashboard.handleCreateScene()}
            className={primaryButton}
          >
            {dashboard.creating ? "Creating…" : "New scene"}
          </button>
        </div>
      </section>
      {dashboard.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {dashboard.error}
        </p>
      )}
      {dashboard.loadingScenes ? (
        <p className="p-5 text-sm text-neutral-500">Loading scenes…</p>
      ) : dashboard.scenes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">No saved scenes yet</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Create a scene here, or keep drawing in guest mode.
          </p>
          <button
            disabled={dashboard.creating}
            onClick={() => void dashboard.handleCreateScene()}
            className={`${primaryButton} mt-5`}
          >
            Create your first scene
          </button>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {dashboard.scenes.map((scene) => (
            <li key={scene.id}>
              <Link
                href={`/canvas/${encodeURIComponent(scene.id)}`}
                className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <h2 className="font-semibold">{scene.title}</h2>
                <p className="mt-2 text-xs text-neutral-500">
                  Updated {new Date(scene.updatedAt).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
