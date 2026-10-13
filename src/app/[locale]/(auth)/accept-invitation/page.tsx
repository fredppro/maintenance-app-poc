import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AcceptInvitation } from "@/features/organization/ui/accept-invitation";
import { auth } from "@/features/auth/server/auth";
import prisma from "@/lib/prisma";
import type { AppLocale } from "@/i18n/locale";

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const [{ locale }, { id }] = await Promise.all([params, searchParams]);
  if (!id) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/${locale}/signup?invitationId=${encodeURIComponent(id)}`);
  }

  const invitation = await prisma.invitation.findFirst({
    where: {
      id,
      email: session.user.email.toLowerCase(),
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: {
      organizationId: true,
      organization: { select: { name: true } },
    },
  });

  if (!invitation) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <AcceptInvitation
        invitationId={id}
        organizationId={invitation.organizationId}
        organizationName={invitation.organization.name}
        locale={locale}
      />
    </main>
  );
}
