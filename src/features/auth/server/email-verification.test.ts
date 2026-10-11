import { describe, expect, it } from "vitest";
import { isEmailVerificationRequired } from "./email-verification";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("isEmailVerificationRequired", () => {
  it("is off outside production builds", () => {
    expect(isEmailVerificationRequired(env({ NODE_ENV: "development" }))).toBe(false);
    expect(isEmailVerificationRequired(env({ NODE_ENV: "test" }))).toBe(false);
  });

  it("is on in production by default", () => {
    expect(isEmailVerificationRequired(env({ NODE_ENV: "production" }))).toBe(true);
    expect(isEmailVerificationRequired(env({ NODE_ENV: "production", VERCEL_ENV: "preview" }))).toBe(true);
  });

  it("can be relaxed with REQUIRE_EMAIL_VERIFICATION=false on previews", () => {
    expect(
      isEmailVerificationRequired(env({ NODE_ENV: "production", VERCEL_ENV: "preview", REQUIRE_EMAIL_VERIFICATION: "false" })),
    ).toBe(false);
  });

  it("cannot be relaxed on the Vercel production environment", () => {
    expect(
      isEmailVerificationRequired(env({ NODE_ENV: "production", VERCEL_ENV: "production", REQUIRE_EMAIL_VERIFICATION: "false" })),
    ).toBe(true);
  });
});
