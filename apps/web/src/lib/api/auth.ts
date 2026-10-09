import { authClient } from "@repo/auth/client";

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  username: string;
}

function dashboardCallbackURL(): string {
  return new URL("/dashboard", window.location.origin).href;
}

export function signUpWithEmail(input: SignUpInput) {
  return authClient.signUp.email({
    ...input,
    callbackURL: dashboardCallbackURL(),
  });
}

export function signInWithEmail(email: string, password: string) {
  return authClient.signIn.email({ email, password });
}

export function signInWithGoogle() {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: dashboardCallbackURL(),
  });
}

export function resendVerification(email: string) {
  return authClient.sendVerificationEmail({
    email,
    callbackURL: dashboardCallbackURL(),
  });
}
