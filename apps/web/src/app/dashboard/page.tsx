"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { safeRoomAuthReturnPath } from "@repo/common";
import { authClient } from "@repo/auth/client";
import { ScenesPanel } from "@/components/dashboard/ScenesPanel";
import { secondaryButton } from "@/components/dashboard/dashboardStyles";
import { ChitranBrand } from "@/components/brand/ChitranLogo";

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
    <main className="dashboard-page min-h-dvh">
      <header className="dashboard-topbar">
        <Link
          href="/dashboard"
          className="dashboard-brand"
          aria-label="Chitran workspace"
        >
          <ChitranBrand />
        </Link>
        <nav className="dashboard-topbar-nav" aria-label="Workspace navigation">
          {session?.user && (
            <>
              <a href="#scenes">Scenes</a>
              <a href="#rooms">Rooms</a>
              <a href="#invitations">Invitations</a>
              <Link href="/boards">My Boards</Link>
            </>
          )}
        </nav>
        <Link href="/" className={`${secondaryButton} dashboard-open-canvas`}>
          Open canvas
        </Link>
      </header>
      <div className="dashboard-main">
        {isPending || !session?.user ? (
          <div
            className="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 py-4"
            role="status"
            aria-label="Loading workspace"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2.5">
                <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bg-hover)]" />
                <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--bg-elevated)]" />
              </div>
              <div className="h-9 w-28 animate-pulse rounded-full bg-[var(--bg-elevated)]" />
            </div>
            <div className="h-24 w-full animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 h-5 w-32 animate-pulse rounded-md bg-[var(--bg-hover)]" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="h-36 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
                <div className="h-36 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
                <div className="h-36 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 h-5 w-28 animate-pulse rounded-md bg-[var(--bg-hover)]" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
                <div className="h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </main>
  );
}
