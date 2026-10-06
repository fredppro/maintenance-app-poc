import { AuthForm } from "@/features/auth/ui/auth-form";
import type { AppLocale } from "@/i18n/locale";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ invitationId?: string }>;
}) {
  const [{ locale }, { invitationId }] = await Promise.all([params, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <AuthForm
        mode="sign-in"
        locale={locale}
        invitationId={invitationId}
        emailVerificationEnabled={process.env.NODE_ENV === "production"}
      />
    </main>
  );
}
