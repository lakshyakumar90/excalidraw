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
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f6] p-5 text-neutral-900">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Room invitation</h1>
        {isPending ? (
          <p className="mt-3">Checking your account…</p>
        ) : session?.user ? (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              Accept as {session.user.email}. Invitations are tied to the email
              address chosen by the room owner.
            </p>
            <button
              disabled={pending}
              onClick={() => void accept()}
              className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Joining…" : "Join room"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm">
            Sign in or create an account with the invited email address on{" "}
            <Link className="text-violet-700 underline" href="/dashboard">
              your dashboard
            </Link>
            , then return to this link.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
