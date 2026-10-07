// Production requires verified emails unless REQUIRE_EMAIL_VERIFICATION is explicitly "false"
// (for previews without an email provider). Never relaxed outside production's own opt-out.
export function isEmailVerificationRequired(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" && env.REQUIRE_EMAIL_VERIFICATION !== "false";
}
