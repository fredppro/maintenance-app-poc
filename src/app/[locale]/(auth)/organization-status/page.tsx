import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/features/auth/server/auth";
import { OrganizationDangerCard } from "@/features/organization/ui/organization-data";
import prisma from "@/lib/prisma";

export default async function OrganizationStatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) redirect(`/${locale}`);

  const [settings, membership] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { organizationId } }),
    prisma.member.findFirst({
      where: { organizationId, userId: session.user.id },
      select: { role: true },
    }),
  ]);
  if (!settings || settings.status === "ACTIVE") redirect(`/${locale}`);

  const t = await getTranslations("OrganizationStatus");
  const format = await getFormatter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {settings.status === "SUSPENDED" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("suspended")}
          </p>
        ) : (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {t("pendingDeletion", {
                date: settings.deletionScheduledFor
                  ? format.dateTime(settings.deletionScheduledFor, { dateStyle: "long" })
                  : "",
              })}
            </p>
            <OrganizationDangerCard
              isOwner={membership?.role === "owner"}
              scheduledFor={settings.deletionScheduledFor?.toISOString() ?? null}
            />
          </>
        )}
      </div>
    </main>
  );
}
