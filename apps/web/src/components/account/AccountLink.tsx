"use client";

import Link from "next/link";
import { authClient } from "@repo/auth/client";

export function AccountLink() {
  const { data: session, isPending } = authClient.useSession();
  const label = isPending ? "Account" : session ? "My scenes" : "Sign in";

  return (
    <Link
      href="/dashboard"
      className="editor-account-link fixed right-4 top-4 z-40 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-neutral-950"
    >
      {label}
    </Link>
  );
}
