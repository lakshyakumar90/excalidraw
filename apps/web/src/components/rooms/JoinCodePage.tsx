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
    <main className="grid min-h-screen place-items-center bg-[#faf9f6] p-5 text-neutral-900">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Join a shared room</h1>
        {isPending ? (
          <p className="mt-3" role="status">Checking your account…</p>
        ) : session?.user ? (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              Join with {session.user.email}. The room owner chose your access
              level for this code.
            </p>
            <button
              disabled={pending}
              onClick={() => void join()}
              className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Joining…" : "Join room"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              Sign in or create an account to use this invitation code.
            </p>
            <Link
              className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
              href={`/dashboard?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Sign in to join
            </Link>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
}
