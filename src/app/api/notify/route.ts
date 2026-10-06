import { z } from "zod";
import { NextResponse } from "next/server";

const notificationRequestSchema = z.object({
  task: z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
  }),
  worker: z.object({
    id: z.string().trim().min(1),
    email: z.string().trim().email(),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  const parsedBody = notificationRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, message: "Invalid notification request" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { success: false, message: "Notification delivery is not configured" },
    { status: 501 },
  );
}
