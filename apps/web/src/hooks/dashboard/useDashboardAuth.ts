import { useState, type FormEvent } from "react";
import {
  resendVerification,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/errors";

export function useDashboardAuth() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState("");
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSignUp && signupStep === 1) {
      setSignupStep(2);
      setError("");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = isSignUp
        ? await signUpWithEmail({ email, password, name, username })
        : await signInWithEmail(email, password);
      if (result.error) {
        if (!isSignUp && result.error.code === "EMAIL_NOT_VERIFIED") {
          setVerificationPending(true);
          return;
        }
        throw new Error(result.error.message ?? "Authentication failed");
      }
      if (isSignUp) setVerificationPending(true);
    } catch (error: unknown) {
      setError(errorMessage(error, "Authentication failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError("");
    try {
      const result = await signInWithGoogle();
      if (result.error)
        throw new Error(result.error.message ?? "Google sign-in failed");
    } catch (error: unknown) {
      setError(errorMessage(error, "Google sign-in failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setSubmitting(true);
    setError("");
    setVerificationSent(false);
    try {
      const result = await resendVerification(email);
      if (result.error)
        throw new Error(
          result.error.message ?? "Could not resend the verification email",
        );
      setVerificationSent(true);
    } catch (error: unknown) {
      setError(errorMessage(error, "Could not resend the verification email"));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleAuth() {
    setIsSignUp((value) => !value);
    setSignupStep(1);
    setError("");
    setVerificationSent(false);
  }

  function showSignIn() {
    setVerificationPending(false);
    setVerificationSent(false);
    setIsSignUp(false);
    setError("");
  }

  return {
    email,
    setEmail,
    name,
    setName,
    username,
    setUsername,
    password,
    setPassword,
    isSignUp,
    signupStep,
    setSignupStep,
    submitting,
    verificationPending,
    verificationSent,
    googleEnabled,
    error,
    handleAuth,
    handleGoogleSignIn,
    handleResendVerification,
    toggleAuth,
    showSignIn,
  };
}
