"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@repo/auth/client";
import { AuthPanel } from "./AuthPanel";

export function AuthPage({
  mode,
  returnTo,
}: {
  mode: "login" | "signup";
  returnTo: string;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session?.user) router.replace(returnTo);
  }, [returnTo, router, session?.user]);

  return (
    <main className="dashboard-page auth-page min-h-dvh text-neutral-900">
      <header className="dashboard-topbar auth-topbar">
        <Link href="/" className="dashboard-brand" aria-label="Excalidraw home">
          <span className="dashboard-brand-mark" aria-hidden="true">
            E
          </span>
          <span>Excalidraw</span>
        </Link>
        <nav className="dashboard-topbar-nav" aria-label="Account navigation">
          <Link
            href={
              mode === "login"
                ? `/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
                : `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
            }
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </Link>
        </nav>
        <Link href="/" className="dashboard-open-canvas dashboard-quiet-link">
          Open canvas
        </Link>
      </header>
      <div className="dashboard-main auth-main">
        {isPending || session?.user ? (
          <div className="dashboard-loading" role="status">
            {session?.user
              ? "Opening your workspace…"
              : "Checking your account…"}
          </div>
        ) : (
          <div className="dashboard-auth-layout">
            <section className="dashboard-auth-intro">
              <h1>
                {mode === "login"
                  ? "Make room for ideas."
                  : "Give your ideas a home."}
              </h1>
              <p>
                {mode === "login"
                  ? "Sign in to keep your scenes together, share a room, and pick up where your team left off."
                  : "Create your workspace account to save scenes and draw with your team."}
              </p>
              <div className="dashboard-auth-links">
                <span>Save your work</span>
                <span>Invite collaborators</span>
                <span>Draw together live</span>
              </div>
            </section>
            <AuthPanel mode={mode} returnTo={returnTo} />
          </div>
        )}
      </div>
    </main>
  );
}
