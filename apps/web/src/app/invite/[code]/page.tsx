"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@repo/auth/client";
import { acceptInvite } from "@/lib/api/rooms";

export default function AcceptInvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function accept() {
    setPending(true);
    setError("");
    try {
      const roomId = await acceptInvite(code);
      router.push(`/room/${roomId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not accept invitation",
      );
      setPending(false);
    }
  }
  const returnTo = `/invite/${encodeURIComponent(code)}`;
  return (
    <main className="auth-grid-bg grid min-h-screen place-items-center p-5 text-[var(--text-primary)]">
      <section className="w-full max-w-[400px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl">
        <h1 className="text-lg font-semibold">Room invitation</h1>
        {isPending ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">Checking your account…</p>
        ) : session?.user ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Accept as {session.user.email}. Invitations are tied to the email
              address chosen by the room owner.
            </p>
            <button
              disabled={pending}
              onClick={() => void accept()}
              className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {pending ? "Joining…" : "Join room"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Sign in or create an account with the invited email address to
              continue. Your verified email must match the invitation.
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
