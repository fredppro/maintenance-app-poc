import { describe, expect, it } from "vitest";
import {
  isEmailVerificationRequired,
  resendVerificationOnExistingSignup,
} from "./email-verification";

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

describe("resendVerificationOnExistingSignup", () => {
  const productionEnv = env({ NODE_ENV: "production" });
  const user = { email: "alex@example.com", emailVerified: false };

  it("sends a verification email for an existing unverified account", async () => {
    const sent: Array<{ email: string; callbackURL?: string }> = [];
    const request = new Request("https://app.example.com/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callbackURL: "/en/onboarding" }),
    });

    await resendVerificationOnExistingSignup({
      user,
      request,
      env: productionEnv,
      sendVerificationEmail: async (body) => {
        sent.push(body);
      },
    });

    expect(sent).toEqual([
      { email: "alex@example.com", callbackURL: "/en/onboarding" },
    ]);
  });

  it("does not send for verified accounts or when verification is disabled", async () => {
    const sent: Array<{ email: string; callbackURL?: string }> = [];
    const sendVerificationEmail = async (body: {
      email: string;
      callbackURL?: string;
    }) => {
      sent.push(body);
    };

    await resendVerificationOnExistingSignup({
      user: { ...user, emailVerified: true },
      env: productionEnv,
      sendVerificationEmail,
    });
    await resendVerificationOnExistingSignup({
      user,
      env: env({ NODE_ENV: "development" }),
      sendVerificationEmail,
    });

    expect(sent).toEqual([]);
  });
});
