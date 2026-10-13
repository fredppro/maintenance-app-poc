import prisma from "@/lib/prisma";
import { LEGACY_ORGANIZATION_SLUG } from "@/lib/tenant-constants";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.RESEND_API_KEY ||
      !process.env.AUTH_EMAIL_FROM)
  ) {
    console.error(
      JSON.stringify({
        event: "readiness_configuration_incomplete",
        timestamp: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.PILOT_BOOTSTRAP_EMAIL &&
      (await prisma.organization.count({
        where: { slug: { not: LEGACY_ORGANIZATION_SLUG } },
      })) === 0
    ) {
      return NextResponse.json({ status: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    console.error(
      JSON.stringify({
        event: "readiness_check_failed",
        timestamp: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
