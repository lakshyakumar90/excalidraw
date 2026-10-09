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
    <main className="min-h-dvh bg-[#faf9f6] px-4 py-6 sm:px-6 sm:py-10 text-neutral-900">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Your scenes
            </h1>
          </div>
          <Link href="/" className={secondaryButton}>
            Open guest canvas
          </Link>
        </header>
        {isPending ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
            Checking your account…
          </div>
        ) : session?.user ? (
          <ScenesPanel key={session.user.id} user={session.user} />
        ) : (
          <AuthPanel />
        )}
      </div>
    </main>
  );
}
