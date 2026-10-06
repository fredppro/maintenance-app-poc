import { AuthForm } from "@/features/auth/ui/auth-form";
import type { AppLocale } from "@/i18n/locale";
import prisma from "@/lib/prisma";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ invitationId?: string }>;
}) {
  const [{ locale }, { invitationId }] = await Promise.all([params, searchParams]);
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
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <AuthForm
        mode="sign-up"
        locale={locale}
        invitationId={validInvitationId}
        emailVerificationEnabled={process.env.NODE_ENV === "production"}
      />
    </main>
  );
}
