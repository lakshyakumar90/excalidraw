import { useDashboardScenes } from "@/hooks/dashboard/useDashboardScenes";
import { primaryButton, secondaryButton } from "./dashboardStyles";
import { GuestDrawingOffer } from "./GuestDrawingOffer";
import { SceneCard } from "./SceneCard";
import { RoomsPanel } from "./RoomsPanel";
import { useEffect, useRef } from "react";
import type { SceneSummary } from "@/lib/api/scenes";

interface DashboardUser {
  id: string;
  name: string;
  email: string;
}

export function ScenesPanel({ user }: { user: DashboardUser }) {
  const dashboard = useDashboardScenes(user.id);
  const list = useRef<HTMLUListElement>(null);
  const newSceneButton = useRef<HTMLButtonElement>(null);
  const focusAfterDelete = useRef(false);

  useEffect(() => {
    if (!focusAfterDelete.current) return;
    focusAfterDelete.current = false;
    const target = list.current?.querySelector<HTMLAnchorElement>("a");
    (target ?? newSceneButton.current)?.focus();
  }, [dashboard.scenes]);

  function handleDeleted(scene: SceneSummary) {
    focusAfterDelete.current = true;
    dashboard.handleDeleted(scene);
  }
  return (
    <>
      <GuestDrawingOffer userId={user.id} onSaved={dashboard.addSavedScene} />
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <p className="break-words font-medium">{user.name || user.email}</p>
          <p className="mt-1 text-sm text-neutral-500">
            Saved scenes are separate from your guest canvas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void dashboard.handleSignOut()}
            className={secondaryButton}
          >
            Sign out
          </button>
          <button
            ref={newSceneButton}
            disabled={dashboard.creating}
            onClick={() => void dashboard.handleCreateScene()}
            className={primaryButton}
          >
            {dashboard.creating ? "Creating…" : "New scene"}
          </button>
        </div>
      </section>
      {dashboard.notice && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 break-words [overflow-wrap:anywhere]"
        >
          {dashboard.notice}
        </p>
      )}
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
        <ul ref={list} className="grid gap-3 sm:grid-cols-2">
          {dashboard.scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onRenamed={dashboard.handleRenamed}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}
      {!dashboard.loadingScenes && <RoomsPanel scenes={dashboard.scenes} />}
    </>
  );
}
