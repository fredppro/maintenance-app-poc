import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

vi.mock("@/features/auth/client", () => ({
  authClient: {
    signIn: { email: mocks.signInEmail },
    signUp: { email: mocks.signUpEmail },
    sendVerificationEmail: mocks.sendVerificationEmail,
  },
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

function renderSignUpForm(invitationId?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AuthForm
        mode="sign-up"
        locale="en"
        invitationId={invitationId}
        emailVerificationEnabled
      />
    </NextIntlClientProvider>,
  );
}

function renderSignInForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AuthForm mode="sign-in" locale="en" emailVerificationEnabled />
    </NextIntlClientProvider>,
  );
}

async function completeSignUp(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Alex Example");
  await user.type(screen.getByLabelText("Email"), "operations@isosist.com");
  await user.type(screen.getByLabelText("Password"), "secure-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByRole("button", { name: "Resend verification email" });
}

describe("AuthForm email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUpEmail.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.sendVerificationEmail.mockResolvedValue({
      data: { status: true },
      error: null,
    });
  });

  it("resends a verification email to the address used for signup", async () => {
    const user = userEvent.setup();
    renderSignUpForm();

    await completeSignUp(user);
    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );

    await waitFor(() => {
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
        email: "operations@isosist.com",
        callbackURL: "/en/onboarding",
      });
    });
    expect(
      await screen.findByText(
        "If your account is still awaiting verification, a new link has been sent.",
      ),
    ).toBeInTheDocument();
  });

  it("preserves the invitation callback through signup and verification", async () => {
    const user = userEvent.setup();
    renderSignUpForm("invite-1");

    await completeSignUp(user);

    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      name: "Alex Example",
      email: "operations@isosist.com",
      password: "secure-password",
      callbackURL: "/en/accept-invitation?id=invite-1",
    });
    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      email: "operations@isosist.com",
      callbackURL: "/en/accept-invitation?id=invite-1",
    });
  });

  it("shows an error when the resend request fails", async () => {
    const user = userEvent.setup();
    mocks.sendVerificationEmail.mockResolvedValue({
      data: null,
      error: { status: 403 },
    });
    renderSignUpForm();

    await completeSignUp(user);
    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );

    expect(
      await screen.findByText(
        "Could not resend the verification email. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("lets an existing unverified user request a link from sign-in", async () => {
    const user = userEvent.setup();
    renderSignInForm();

    await user.type(
      screen.getByLabelText("Email"),
      "operations@isosist.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );

    await waitFor(() => {
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
        email: "operations@isosist.com",
        callbackURL: "/en/onboarding",
      });
    });
    expect(
      await screen.findByText(
        "If your account is still awaiting verification, a new link has been sent.",
      ),
    ).toBeInTheDocument();
  });
});
