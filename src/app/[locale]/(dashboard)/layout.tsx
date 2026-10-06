import { redirect } from "next/navigation";
import {
  AuthenticationRequiredError,
  getTenantContext,
  OrganizationRequiredError,
  SiteSelectionRequiredError,
  SiteSetupRequiredError,
} from "@/lib/tenant-context";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    await getTenantContext();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/${locale}/login`);
    }
    if (
      error instanceof OrganizationRequiredError ||
      error instanceof SiteSelectionRequiredError ||
      error instanceof SiteSetupRequiredError
    ) {
      redirect(`/${locale}/onboarding`);
    }
    throw error;
  }

  return children;
}
