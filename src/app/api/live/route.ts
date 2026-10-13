import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness only: the process is up. It must not touch the database, so a database outage
// does not make the platform restart healthy instances. Readiness is /api/health.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
