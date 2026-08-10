import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Falls back to Home, not Inbox — and `next` is still honoured, so a deep link
  // that bounced through login still lands where the user was headed.
  const next = params.next ?? "/home";
  const error = Boolean(params.error);

  return <LoginForm next={next} error={error} />;
}
