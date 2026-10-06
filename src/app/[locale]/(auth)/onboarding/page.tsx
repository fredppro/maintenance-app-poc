import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/features/auth/server/auth";
import { OrganizationSetupForm } from "@/features/organization/ui/organization-setup-form";
import { TenantContextSelector } from "@/features/organization/ui/tenant-context-selector";
import { getAvailableTenantContexts } from "@/lib/tenant-context";
import { ACTIVE_SITE_COOKIE } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";
import { OrganizationSelector } from "@/features/organization/ui/organization-selector";

export default async function OrganizationOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/${locale}/login`);

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const activeOrganizationId = session.session.activeOrganizationId;

  if (activeOrganizationId) {
    const membership = await prisma.member.findFirst({
      where: { organizationId: activeOrganizationId, userId: session.user.id },
      select: { role: true },
    });
    const sites = await prisma.site.findMany({
      where: { organizationId: activeOrganizationId },
      orderBy: { name: "asc" },
      select: { id: true },
    });

    if (sites.length === 0) {
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        return (
          <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
            <p role="status">
              Your organization has no site configured. Contact an organization
              owner or admin.
            </p>
          </main>
        );
      }
      return (
        <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
          <OrganizationSetupForm activeOrganizationId={activeOrganizationId} />
        </main>
      );
    }

    if (sites.length === 1) {
      redirect(`/${locale}`);
    }
  } else if (organizations.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <OrganizationSetupForm />
      </main>
    );
  }

  const contexts = await getAvailableTenantContexts();
  if (!activeOrganizationId && organizations.length > 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <OrganizationSelector
          organizations={organizations.map(({ id, name }) => ({ id, name }))}
        />
      </main>
    );
  }
  if (contexts.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <p role="status">No organization site is available to this account.</p>
      </main>
    );
  }

  const selectedSiteId = (await cookies()).get(ACTIVE_SITE_COOKIE)?.value;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-6">
      <h1 className="text-xl font-semibold">Choose your organization and site</h1>
      <TenantContextSelector
        options={contexts}
        selectedSiteId={selectedSiteId}
        label="Organization and site"
      />
    </main>
  );
}
