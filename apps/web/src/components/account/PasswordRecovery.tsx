"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@repo/auth/client";
import { AuthField } from "../dashboard/AuthField";
import { primaryButton } from "../dashboard/dashboardStyles";
import { ChitranBrand } from "../brand/ChitranLogo";

export function PasswordRecovery({
  mode,
  token,
  invalid = false,
}: {
  mode: "request" | "reset";
  token?: string;
  invalid?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const expired = mode === "reset" && (!token || invalid);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "reset" && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result =
        mode === "request"
          ? await authClient.requestPasswordReset({
              email: email.trim(),
              redirectTo: new URL("/reset-password", window.location.origin)
                .href,
            })
          : await authClient.resetPassword({
              newPassword: password,
              token: token!,
            });
      if (result.error)
        throw new Error(
          result.error.message ??
            "Could not reset your password. Please try again.",
        );
      setComplete(true);
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not reset your password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-grid-bg flex min-h-dvh flex-col text-[var(--text-primary)]">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <ChitranBrand />
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
        >
          Back to sign in
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-4">
        <section className="auth-panel mx-auto w-full max-w-[400px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {expired
              ? "This reset link has expired"
              : complete
                ? mode === "request"
                  ? "Check your email"
                  : "Password updated"
                : mode === "request"
                  ? "Forgot your password?"
                  : "Choose a new password"}
          </h1>
          <p
            className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]"
            role={complete ? "status" : undefined}
          >
            {expired
              ? "Request a new link to reset your password."
              : complete
                ? mode === "request"
                  ? "If an account exists for that email, we’ve sent a password reset link. Check your inbox and spam folder."
                  : "Your password has been changed. Sign in with your new password."
                : mode === "request"
                  ? "Enter your account email and we’ll send you a reset link."
                  : "Use at least 8 characters. This link can only be used once."}
          </p>
          {!complete && !expired && (
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => void submit(event)}
            >
              {mode === "request" ? (
                <AuthField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={setEmail}
                />
              ) : (
                <>
                  <AuthField
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={setPassword}
                  />
                  <AuthField
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmation}
                    onChange={setConfirmation}
                  />
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <button disabled={pending} className={`${primaryButton} w-full`}>
                {pending
                  ? "Please wait…"
                  : mode === "request"
                    ? "Send reset link"
                    : "Reset password"}
              </button>
            </form>
          )}
          <Link
            href={expired ? "/forgot-password" : "/login"}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-4"
          >
            {expired ? "Request a new reset link" : "Back to sign in"}
          </Link>
        </section>
      </div>
    </main>
  );
}
