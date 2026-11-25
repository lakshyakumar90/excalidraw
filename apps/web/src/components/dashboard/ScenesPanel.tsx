import { useDashboardScenes } from "@/hooks/dashboard/useDashboardScenes";
import { primaryButton, secondaryButton } from "./dashboardStyles";
import { GuestDrawingOffer } from "./GuestDrawingOffer";
import { SceneCard } from "./SceneCard";
import { RoomsPanel } from "./RoomsPanel";
import { InvitationsPanel } from "./InvitationsPanel";
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
      <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div>
          <p className="break-words text-sm font-semibold text-[var(--text-primary)]">
            {user.name || user.email}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Saved scenes are separate from your guest canvas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 break-words [overflow-wrap:anywhere]"
        >
          {dashboard.notice}
        </p>
      )}
      {dashboard.error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400"
        >
          {dashboard.error}
        </p>
      )}
      <InvitationsPanel />
      {dashboard.loadingScenes ? (
        <p className="p-4 text-xs text-[var(--text-muted)]">Loading scenes…</p>
      ) : dashboard.scenes.length === 0 ? (
        <section className="mt-4 rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">No saved scenes yet</h2>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            Create a scene here, or keep drawing in guest mode.
          </p>
          <button
            disabled={dashboard.creating}
            onClick={() => void dashboard.handleCreateScene()}
            className={`${primaryButton} mt-4`}
          >
            Create your first scene
          </button>
        </section>
      ) : (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h2>Your scenes</h2>
              <p>Open a drawing or start something new.</p>
            </div>
          </div>
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
        </section>
      )}
      {!dashboard.loadingScenes && <RoomsPanel scenes={dashboard.scenes} />}
    </>
  );
}
