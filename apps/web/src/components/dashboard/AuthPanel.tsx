import Link from "next/link";
import { useDashboardAuth } from "@/hooks/dashboard/useDashboardAuth";
import { AuthField } from "./AuthField";
import { primaryButton, secondaryButton, textButton } from "./dashboardStyles";

export function AuthPanel({
  mode,
  returnTo,
}: {
  mode: "login" | "signup";
  returnTo: string;
}) {
  const isSignUp = mode === "signup";
  const auth = useDashboardAuth(isSignUp);
  const otherMode = isSignUp ? "login" : "signup";
  const modeHref = `/${otherMode}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const title = auth.verificationPending
    ? "Check your email"
    : isSignUp
      ? `Create account · Step ${auth.signupStep} of 2`
      : "Welcome back";
  const subtitle = auth.verificationPending
    ? `We sent a verification link to ${auth.email}. Verify your address before signing in.`
    : isSignUp
      ? "Set up your Chitran workspace."
      : "Sign in to your Chitran workspace.";

  return (
    <section className="auth-panel mx-auto w-full max-w-[400px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl sm:p-7">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-1 break-words text-xs leading-5 text-[var(--text-muted)]">
          {subtitle}
        </p>
      </div>

      {auth.verificationPending ? (
        <div className="space-y-3">
          {auth.verificationSent && (
            <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Verification email sent. Check your inbox and spam folder.
            </p>
          )}
          {auth.error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
              {auth.error}
            </p>
          )}
          <button
            disabled={auth.submitting}
            onClick={() => void auth.handleResendVerification()}
            className={`${secondaryButton} w-full`}
          >
            {auth.submitting ? "Sending…" : "Resend verification email"}
          </button>
          {isSignUp ? (
            <Link href={modeHref} className={`${textButton} w-full`}>
              Return to sign in
            </Link>
          ) : (
            <button
              onClick={auth.showSignIn}
              className={`${textButton} w-full`}
            >
              Back to sign in
            </button>
          )}
        </div>
      ) : (
        <>
          <form
            className="space-y-3.5"
            onSubmit={(event) => void auth.handleAuth(event)}
          >
            {!isSignUp || auth.signupStep === 1 ? (
              <>
                <AuthField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={auth.email}
                  onChange={auth.setEmail}
                  required
                />
                <AuthField
                  label="Password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={auth.password}
                  onChange={auth.setPassword}
                  required
                  minLength={8}
                />
                {!isSignUp && (
                  <div className="flex items-center justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <>
                <AuthField
                  label="Display name"
                  placeholder="Ada Lovelace"
                  value={auth.name}
                  onChange={auth.setName}
                  required
                  minLength={1}
                  maxLength={50}
                  autoComplete="name"
                />
                <AuthField
                  label="Username"
                  placeholder="ada_lovelace"
                  value={auth.username}
                  onChange={auth.setUsername}
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_.]+"
                  autoComplete="username"
                  aria-describedby="username-help"
                />
                <p id="username-help" className="text-[11px] text-[var(--text-muted)]">
                  3–30 characters: letters, numbers, dots, and underscores.
                </p>
              </>
            )}

            {auth.error && (
              <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                {auth.error}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              {isSignUp && auth.signupStep === 2 && (
                <button
                  type="button"
                  onClick={() => auth.setSignupStep(1)}
                  className={secondaryButton}
                >
                  Back
                </button>
              )}
              <button
                disabled={auth.submitting}
                className={`${primaryButton} flex-1`}
              >
                {auth.submitting
                  ? "Please wait…"
                  : isSignUp
                    ? auth.signupStep === 1
                      ? "Continue"
                      : "Create account"
                    : "Continue"}
              </button>
            </div>
          </form>

          {auth.googleEnabled && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                or
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>
              <button
                disabled={auth.submitting}
                type="button"
                onClick={() => void auth.handleGoogleSignIn()}
                className={`${secondaryButton} w-full`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12Z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}

          <p className="mt-5 text-center text-xs text-[var(--text-muted)]">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <Link
              href={modeHref}
              className="font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
            >
              {isSignUp ? "Sign in" : "Create account"}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
