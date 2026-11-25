"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@repo/auth/client";
import { acceptJoinCode } from "@/lib/api/rooms";

export function JoinCodePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function join() {
    setPending(true);
    setError("");
    try {
      const roomId = await acceptJoinCode(code);
      router.replace(`/room/${roomId}/canvas`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not join this room",
      );
      setPending(false);
    }
  }

  const returnTo = `/join/${encodeURIComponent(code)}`;
  return (
    <main className="auth-grid-bg grid min-h-screen place-items-center p-5 text-[var(--text-primary)]">
      <section className="w-full max-w-[400px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl">
        <h1 className="text-lg font-semibold">Join a shared room</h1>
        {isPending ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]" role="status">
            Checking your account…
          </p>
        ) : session?.user ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Join with {session.user.email}. The room owner chose your access
              level for this code.
            </p>
            <button
              disabled={pending}
              onClick={() => void join()}
              className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {pending ? "Joining…" : "Join room"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Sign in or create an account to use this invitation code.
            </p>
            <Link
              className="mt-4 inline-flex w-full justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Sign in to join
            </Link>
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-rose-400">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
