// Deployed builds always require verification. Local development and tests do not send email.
export function isEmailVerificationRequired(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production";
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
