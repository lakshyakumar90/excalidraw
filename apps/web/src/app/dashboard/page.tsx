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
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-neutral-900">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">Excalidraw</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
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
