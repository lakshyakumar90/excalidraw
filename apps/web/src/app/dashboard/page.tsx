"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { safeRoomAuthReturnPath } from "@repo/common";
import { authClient } from "@repo/auth/client";
import { ScenesPanel } from "@/components/dashboard/ScenesPanel";
import { secondaryButton } from "@/components/dashboard/dashboardStyles";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (!session?.user) {
      if (isPending) return;
      const requested = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      const returnTo = safeRoomAuthReturnPath(requested);
      router.replace(
        returnTo === "/dashboard"
          ? "/login"
          : `/login?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    const target = safeRoomAuthReturnPath(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    if (target !== "/dashboard") router.replace(target);
  }, [isPending, router, session?.user]);
  return (
    <main className="dashboard-page min-h-dvh text-neutral-900">
      <header className="dashboard-topbar">
        <Link
          href="/dashboard"
          className="dashboard-brand"
          aria-label="Excalidraw workspace"
        >
          <span className="dashboard-brand-mark" aria-hidden="true">
            E
          </span>
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
          <div className="dashboard-loading" role="status">
            Checking your account…
          </div>
        ) : session?.user ? (
          <>
            <div className="dashboard-page-heading">
              <div>
                <h1>Your workspace</h1>
                <p>Scenes, shared rooms, and invitations in one place.</p>
              </div>
              <span className="dashboard-user-chip">
                {session.user.name || session.user.email}
              </span>
            </div>
            <div id="scenes">
              <ScenesPanel key={session.user.id} user={session.user} />
            </div>
          </>
        ) : (
          <div className="dashboard-loading" role="status">
            Taking you to sign in…
          </div>
        )}
      </div>
    </main>
  );
}
