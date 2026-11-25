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
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session?.user.emailVerified) router.replace(returnTo);
  }, [returnTo, router, session?.user]);

  const switchHref =
    mode === "login"
      ? `/sign-up${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
      : `/sign-in${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <main className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)] grid lg:grid-cols-2">
      {/* Left: Dark interactive sketch preview & product positioning */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-[var(--border-subtle)] bg-[#0B0F17] p-10 text-slate-100">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white shadow-sm">
              E
            </span>
            <span className="text-lg">Excalidraw Studio</span>
          </Link>
          <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">
            Realtime · Slides · AI · MCP
          </span>
        </div>

        {/* Subtle interactive sketch canvas preview */}
        <div className="my-8 rounded-2xl border border-slate-800/90 bg-[#0D1117] p-6 shadow-2xl">
          <svg
            viewBox="0 0 480 250"
            className="w-full h-auto"
            aria-label="Collaborative architecture sketch preview"
          >
            <defs>
              <pattern id="auth-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="rgba(148,163,184,0.22)" />
              </pattern>
            </defs>
            <rect width="480" height="250" rx="12" fill="url(#auth-dots)" />
            <rect x="32" y="42" width="128" height="62" rx="10" fill="rgba(99,102,241,0.14)" stroke="#818CF8" strokeWidth="2" />
            <text x="96" y="78" textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="600">Canvas Client</text>
            <rect x="200" y="42" width="128" height="62" rx="10" fill="rgba(16,185,129,0.14)" stroke="#34D399" strokeWidth="2" />
            <text x="264" y="78" textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="600">Redis Delta CAS</text>
            <rect x="364" y="42" width="90" height="62" rx="10" fill="rgba(245,158,11,0.14)" stroke="#FBBF24" strokeWidth="2" />
            <text x="409" y="78" textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="600">Postgres</text>
            <rect x="112" y="154" width="248" height="58" rx="10" fill="rgba(168,85,247,0.14)" stroke="#C084FC" strokeWidth="2" strokeDasharray="6 4" />
            <text x="236" y="188" textAnchor="middle" fill="#F1F5F9" fontSize="13" fontWeight="600">Streamable HTTP MCP · AI Agents</text>
            <path d="M160 73 L196 73" stroke="#94A3B8" strokeWidth="2" markerEnd="url(#arrow)" />
            <path d="M328 73 L360 73" stroke="#94A3B8" strokeWidth="2" />
            <path d="M236 154 L264 106" stroke="#C084FC" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {mode === "login"
              ? "Sketch fast. Ship architecture together."
              : "Your infinite whiteboard, upgraded."}
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-slate-400">
            Dark &amp; light themes, 4 handcrafted board presets, frame-based Slides,
            live Mermaid diagram code, and built-in MCP agent sync.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-slate-300">
            <span className="rounded-full bg-slate-800/80 px-3 py-1">Black &amp; White</span>
            <span className="rounded-full bg-slate-800/80 px-3 py-1">Excali Font</span>
            <span className="rounded-full bg-slate-800/80 px-3 py-1">Chalk Bold</span>
            <span className="rounded-full bg-slate-800/80 px-3 py-1">Clean Sketch</span>
          </div>
        </div>
      </section>

      {/* Right: Crisp Auth Card */}
      <section className="flex flex-col justify-between p-6 sm:p-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">
              E
            </span>
            <span>Excalidraw</span>
          </Link>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link
              href={switchHref}
              className="font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </Link>
            <Link
              href="/"
              className="rounded-full border border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              Open canvas
            </Link>
          </div>
        </header>

        <div className="mx-auto my-auto w-full max-w-md py-8">
          {session?.user.emailVerified ? (
            <div
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-center text-sm text-[var(--text-muted)]"
              role="status"
            >
              Opening your workspace…
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-xl">
              <AuthPanel mode={mode} returnTo={returnTo} />
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-[var(--text-muted)]">
          Guest drawings stored locally in IndexedDB can be migrated to your cloud workspace after sign-in.
        </footer>
      </section>
    </main>
  );
}
