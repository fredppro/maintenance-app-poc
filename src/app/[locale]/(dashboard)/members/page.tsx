import { notFound } from "next/navigation";
import { MemberAdministration } from "@/features/organization/ui/member-administration";
import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";
import { localeSchema, type AppLocale } from "@/i18n/locale";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  if (!localeSchema.safeParse(locale).success) notFound();
  const tenant = await getTenantContext("manageMembers");
  const members = await prisma.member.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });
  const invitations = await prisma.invitation.findMany({
    where: { organizationId: tenant.organizationId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-muted/40 p-6">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold">Organization members</h1>
      </div>
      <MemberAdministration
        actorId={tenant.userId}
        actorRole={tenant.role}
        members={members.map((member) => ({
          id: member.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
        }))}
        invitations={invitations}
      />
    </main>
  );
}
