import { getTranslations } from "next-intl/server";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { getOrganizationSettings } from "@/features/organization/server/settings";
import {
  OrganizationDangerCard,
  OrganizationExportCard,
} from "@/features/organization/ui/organization-data";
import { OrganizationSettingsForm } from "@/features/organization/ui/organization-settings-form";
import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";

export default async function OrganizationPage() {
  const t = await getTranslations("OrganizationSettings");
  const tenant = await getTenantContext("manageOrganization");
  const [settings, exports, tenantSettings] = await Promise.all([
    getOrganizationSettings(),
    tenant.db.tenantExport.findMany({
      where: {
        organizationId: tenant.organizationId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.tenantSettings.findUnique({ where: { organizationId: tenant.organizationId } }),
  ]);

  return (
    <PageBody>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex max-w-2xl flex-col gap-6">
        <OrganizationSettingsForm initial={settings} />
        <OrganizationExportCard
          exports={exports.map((row) => ({
            id: row.id,
            status: row.status,
            size: row.size,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt?.toISOString() ?? null,
          }))}
        />
        <OrganizationDangerCard
          isOwner={tenant.role === "owner"}
          scheduledFor={tenantSettings?.deletionScheduledFor?.toISOString() ?? null}
        />
      </div>
    </PageBody>
  );
}
