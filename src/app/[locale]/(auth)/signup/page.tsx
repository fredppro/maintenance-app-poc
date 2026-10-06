import { AuthForm } from "@/features/auth/ui/auth-form";
import type { AppLocale } from "@/i18n/locale";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <AuthForm mode="sign-up" locale={locale} />
    </main>
  );
}
