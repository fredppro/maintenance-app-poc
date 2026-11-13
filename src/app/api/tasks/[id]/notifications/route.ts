import {
  getTaskNotificationHistoryPage,
  TaskNotificationHistoryNotFoundError,
} from "@/features/scheduler/server/notification-history";
import {
  AuthenticationRequiredError,
  getTenantContext,
  OrganizationRequiredError,
  PermissionDeniedError,
  SiteSelectionRequiredError,
  SiteSetupRequiredError,
  TenantInactiveError,
} from "@/lib/tenant-context";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const cursorTimestampSchema = z.string().datetime();
const cursorIdSchema = z.string().min(1).max(191);

function parseCursor(value: string | null) {
  if (value === null) return { valid: true as const, cursor: null };
  if (value.length > 255) return { valid: false as const };

  const separator = value.lastIndexOf("|");
  if (separator <= 0 || separator === value.length - 1) {
    return { valid: false as const };
  }

  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (
    !cursorTimestampSchema.safeParse(createdAt).success ||
    !cursorIdSchema.safeParse(id).success
  ) {
    return { valid: false as const };
  }

  return {
    valid: true as const,
    cursor: { createdAt: new Date(createdAt), id },
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "Missing id" }, { status: 400 });
  }

  const cursorParam = new URL(request.url).searchParams.get("cursor");
  const parsedCursor = parseCursor(cursorParam);
  if (!parsedCursor.valid) {
    return NextResponse.json(
      { message: "Invalid notification history cursor" },
      { status: 400 },
    );
  }

  try {
    const tenant = await getTenantContext("viewMaintenance");
    const page = await getTaskNotificationHistoryPage(tenant.db, {
      taskId: id,
      organizationId: tenant.organizationId,
      siteId: tenant.siteId,
      cursor: parsedCursor.cursor,
    });

    return NextResponse.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }
    if (
      error instanceof OrganizationRequiredError ||
      error instanceof SiteSetupRequiredError ||
      error instanceof TenantInactiveError ||
      error instanceof PermissionDeniedError
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (error instanceof SiteSelectionRequiredError) {
      return NextResponse.json(
        { message: "Select an authorized site" },
        { status: 409 },
      );
    }
    if (error instanceof TaskNotificationHistoryNotFoundError) {
      return NextResponse.json({ message: "Task not found" }, { status: 404 });
    }
    throw error;
  }
}
