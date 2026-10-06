import { OrganizationSetupForm } from "@/features/organization/ui/organization-setup-form";
import { auth } from "@/features/auth/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

export default async function OrganizationOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  if (!session.session.activeOrganizationId) {
    const organizations = await auth.api.listOrganizations({
      headers: await headers(),
    });
    const firstOrganization = organizations[0];

    if (firstOrganization) {
      const site = await prisma.site.findFirst({
        where: { organizationId: firstOrganization.id },
        select: { id: true },
      });
      if (site) {
        await auth.api.setActiveOrganization({
          headers: await headers(),
          body: { organizationId: firstOrganization.id },
        });
        redirect(`/${locale}`);
      }

      return (
        <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
          <OrganizationSetupForm activeOrganizationId={firstOrganization.id} />
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <OrganizationSetupForm />
      </main>
    );
  }

  const site = await prisma.site.findFirst({
    where: { organizationId: session.session.activeOrganizationId },
    select: { id: true },
  });
  if (site) {
    redirect(`/${locale}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <OrganizationSetupForm />
    </main>
  );
}
