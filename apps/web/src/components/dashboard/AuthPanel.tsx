import { useDashboardAuth } from "@/hooks/dashboard/useDashboardAuth";
import { AuthField } from "./AuthField";
import { primaryButton, secondaryButton, textButton } from "./dashboardStyles";

export function AuthPanel() {
  const auth = useDashboardAuth();
  const title = auth.verificationPending
    ? "Check your email"
    : auth.isSignUp
      ? `Create your account · Step ${auth.signupStep} of 2`
      : "Sign in to your account";
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        {auth.verificationPending
          ? `We sent a verification link to ${auth.email}. Verify your address before signing in.`
          : "Your guest drawing stays in this browser. Sign in to save separate scenes to your account."}
      </p>
      {auth.verificationPending ? (
        <div className="mt-6 space-y-4">
          {auth.verificationSent && (
            <p role="status" className="text-sm text-green-700">
              A new verification link has been sent.
            </p>
          )}
          {auth.error && (
            <p role="alert" className="text-sm text-red-700">
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
          <button onClick={auth.showSignIn} className={`${textButton} w-full`}>
            Return to sign in
          </button>
        </div>
      ) : (
        <>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => void auth.handleAuth(event)}
          >
            {!auth.isSignUp || auth.signupStep === 1 ? (
              <>
                <AuthField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={auth.email}
                  onChange={auth.setEmail}
                  required
                />
                <AuthField
                  label="Password"
                  type="password"
                  autoComplete={
                    auth.isSignUp ? "new-password" : "current-password"
                  }
                  value={auth.password}
                  onChange={auth.setPassword}
                  required
                  minLength={8}
                />
              </>
            ) : (
              <>
                <AuthField
                  label="Display name"
                  value={auth.name}
                  onChange={auth.setName}
                  required
                  minLength={1}
                  maxLength={50}
                  autoComplete="name"
                />
                <AuthField
                  label="Username"
                  value={auth.username}
                  onChange={auth.setUsername}
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_.]+"
                  autoComplete="username"
                  aria-describedby="username-help"
                />
                <p id="username-help" className="text-xs text-neutral-500">
                  3–30 characters: letters, numbers, dots, and underscores.
                  Usernames are unique.
                </p>
              </>
            )}
            {auth.error && (
              <p role="alert" className="text-sm text-red-700">
                {auth.error}
              </p>
            )}
            <div className="flex gap-3">
              {auth.isSignUp && auth.signupStep === 2 && (
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
                  : auth.isSignUp
                    ? auth.signupStep === 1
                      ? "Continue"
                      : "Create account"
                    : "Sign in"}
              </button>
            </div>
          </form>
          <button className={`${textButton} mt-4`} onClick={auth.toggleAuth}>
            {auth.isSignUp
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {auth.googleEnabled && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" />
                or
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              <button
                disabled={auth.submitting}
                type="button"
                onClick={() => void auth.handleGoogleSignIn()}
                className={`${secondaryButton} w-full`}
              >
                Continue with Google
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
