"use client";

import Link from "next/link";
import { authClient } from "@repo/auth/client";

export function AccountLink() {
  const { data: session, isPending } = authClient.useSession();
  const label = isPending ? "Account" : session ? "My boards" : "Sign in";

  return (
    <Link
      href={session ? "/dashboard" : "/login"}
      className="editor-account-link h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 text-center text-xs font-medium text-[var(--text-primary)] shadow-lg backdrop-blur-md transition hover:bg-[var(--bg-hover)]"
    >
      {label}
    </Link>
  );
}
