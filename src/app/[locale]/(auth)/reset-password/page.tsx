import { PasswordResetForm } from "@/features/auth/ui/password-reset-form";
import type { AppLocale } from "@/i18n/locale";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <PasswordResetForm locale={locale} token={token} />
    </main>
  );
}
