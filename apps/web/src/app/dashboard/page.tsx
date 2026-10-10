"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { safeRoomAuthReturnPath } from "@repo/common";
import { authClient } from "@repo/auth/client";
import { AuthPanel } from "@/components/dashboard/AuthPanel";
import { ScenesPanel } from "@/components/dashboard/ScenesPanel";
import { secondaryButton } from "@/components/dashboard/dashboardStyles";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (!session?.user) return;
    const target = safeRoomAuthReturnPath(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    if (target !== "/dashboard") router.replace(target);
  }, [router, session?.user]);
  return (
    <main className="dashboard-page min-h-dvh text-neutral-900">
      <header className="dashboard-topbar">
        <Link href="/dashboard" className="dashboard-brand" aria-label="Excalidraw workspace">
          <span className="dashboard-brand-mark" aria-hidden="true">E</span>
          <span>Excalidraw</span>
        </Link>
        <nav className="dashboard-topbar-nav" aria-label="Workspace navigation">
          {session?.user && (
            <>
              <a href="#scenes">Scenes</a>
              <a href="#rooms">Rooms</a>
              <a href="#invitations">Invitations</a>
            </>
          )}
        </nav>
        <Link href="/" className={`${secondaryButton} dashboard-open-canvas`}>
          Open canvas
        </Link>
      </header>
      <div className="dashboard-main">
        {isPending ? (
          <div className="dashboard-loading" role="status">Checking your account…</div>
        ) : session?.user ? (
          <>
            <div className="dashboard-page-heading">
              <div>
                <h1>Your workspace</h1>
                <p>Scenes, shared rooms, and invitations in one place.</p>
              </div>
              <span className="dashboard-user-chip">{session.user.name || session.user.email}</span>
            </div>
            <div id="scenes">
              <ScenesPanel key={session.user.id} user={session.user} />
            </div>
          </>
        ) : (
          <div className="dashboard-auth-layout">
            <section className="dashboard-auth-intro">
              <h1>Make room for ideas.</h1>
              <p>Sign in to keep your scenes together, share a room, and pick up where your team left off.</p>
              <div className="dashboard-auth-links">
                <span>Save your work</span>
                <span>Invite collaborators</span>
                <span>Draw together live</span>
              </div>
            </section>
            <AuthPanel />
          </div>
        )}
      </div>
    </main>
  );
}
