import { AuthForm } from "@/features/auth/ui/auth-form";
import type { AppLocale } from "@/i18n/locale";
import prisma from "@/lib/prisma";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isEmailVerificationRequired } from "@/features/auth/server/email-verification";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });

  return {
    title: t("signUpPageTitle"),
    description: t("signUpPageDescription"),
  };
}

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ invitationId?: string }>;
}) {
  const [{ locale }, { invitationId }] = await Promise.all([
    params,
    searchParams,
  ]);
  const validInvitationId =
    invitationId &&
    (await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }))
      ? invitationId
      : undefined;

  return (
    <main className="flex min-h-svh items-center bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <AuthForm
          mode="sign-up"
          locale={locale}
          invitationId={validInvitationId}
          emailVerificationEnabled={isEmailVerificationRequired()}
        />
      </div>
    </main>
  );
}
