import { safeRoomAuthReturnPath } from "@repo/common";
import { AuthPage } from "@/components/dashboard/AuthPage";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const requested = (await searchParams).returnTo;
  return (
    <AuthPage
      mode="login"
      returnTo={safeRoomAuthReturnPath(
        Array.isArray(requested) ? (requested[0] ?? null) : (requested ?? null),
      )}
    />
  );
}
