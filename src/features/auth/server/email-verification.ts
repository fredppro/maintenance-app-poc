// Production requires verified emails. REQUIRE_EMAIL_VERIFICATION=false relaxes that for previews without
// an email provider, and is ignored on the Vercel production environment so a mis-scoped variable cannot
// weaken real customers' sign-in.
export function isEmailVerificationRequired(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return false;
  return env.VERCEL_ENV === "production" || env.REQUIRE_EMAIL_VERIFICATION !== "false";
}
