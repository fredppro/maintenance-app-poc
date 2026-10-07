import {
  buildReportResponse,
  ReportTaskNotFoundError,
} from "@/features/report/services/report.service";
import { getValidLocale } from "src/i18n/locale";
import { NextRequest, NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  getTenantContext,
  OrganizationRequiredError,
  PermissionDeniedError,
  SiteSelectionRequiredError,
  SiteSetupRequiredError,
} from "@/lib/tenant-context";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ message: "Missing id" }, { status: 400 });
  }

  const url = new URL(request.url);

  const locale = getValidLocale(url.searchParams.get("locale"));

  const mode =
    url.searchParams.get("mode") === "download" ? "download" : "preview";

  try {
    const tenant = await getTenantContext("viewReports");
    return await buildReportResponse(
      tenant.db,
      id,
      tenant.organizationId,
      tenant.siteId,
      locale,
      mode,
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }
    if (
      error instanceof OrganizationRequiredError ||
      error instanceof SiteSetupRequiredError
    ) {
      return NextResponse.json({ message: "Organization setup required" }, { status: 403 });
    }
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (error instanceof SiteSelectionRequiredError) {
      return NextResponse.json(
        { message: "Select an authorized site" },
        { status: 409 },
      );
    }
    if (error instanceof ReportTaskNotFoundError) {
      return NextResponse.json({ message: "Task not found" }, { status: 404 });
    }
    throw error;
  }
}
