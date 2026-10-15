// Production requires verified emails. REQUIRE_EMAIL_VERIFICATION=false relaxes that for previews without
// an email provider, and is ignored on the Vercel production environment so a mis-scoped variable cannot
// weaken real customers' sign-in.
export function isEmailVerificationRequired(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return false;
  return env.VERCEL_ENV === "production" || env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

export async function resendVerificationOnExistingSignup({
  user,
  request,
  sendVerificationEmail,
  env = process.env,
}: {
  user: { email: string; emailVerified: boolean };
  request?: Request;
  sendVerificationEmail: (body: {
    email: string;
    callbackURL?: string;
  }) => Promise<unknown>;
  env?: NodeJS.ProcessEnv;
}) {
  if (!isEmailVerificationRequired(env) || user.emailVerified) return;

  let callbackURL: string | undefined;
  if (request?.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.clone().json();
    if (
      typeof body === "object" &&
      body !== null &&
      "callbackURL" in body &&
      typeof body.callbackURL === "string"
    ) {
      callbackURL = body.callbackURL;
    }
  }

  await sendVerificationEmail({
    email: user.email,
    ...(callbackURL ? { callbackURL } : {}),
  });
}
