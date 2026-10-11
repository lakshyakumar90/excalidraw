import { safeRoomAuthReturnPath } from "@repo/common";
import { AuthPage } from "@/components/dashboard/AuthPage";

type SignupPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const requested = (await searchParams).returnTo;
  return (
    <AuthPage
      mode="signup"
      returnTo={safeRoomAuthReturnPath(
        Array.isArray(requested) ? (requested[0] ?? null) : (requested ?? null),
      )}
    />
  );
}
