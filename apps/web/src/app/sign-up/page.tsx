import { safeRoomAuthReturnPath } from "@repo/common";
import { AuthPage } from "@/components/dashboard/AuthPage";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeRoomAuthReturnPath(params.returnTo ?? "/boards");
  return <AuthPage mode="signup" returnTo={returnTo} />;
}
