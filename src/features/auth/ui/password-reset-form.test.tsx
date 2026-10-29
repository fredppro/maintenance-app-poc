import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { PasswordResetForm } from "./password-reset-form";

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/features/auth/client", () => ({
  authClient: {
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
  },
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

function renderForm(token?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PasswordResetForm locale="en" token={token} />
    </NextIntlClientProvider>,
  );
}

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    mocks.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("uses a generic completion message for password reset requests", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "person@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "person@example.test",
      redirectTo: `${window.location.origin}/en/reset-password`,
    });
    expect(await screen.findByText(messages.Auth.resetPasswordComplete)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("submits a new password with the reset token", async () => {
    const user = userEvent.setup();
    renderForm("valid-reset-token");

    await user.type(screen.getByLabelText("New password"), "another-secure-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(mocks.resetPassword).toHaveBeenCalledWith({
      token: "valid-reset-token",
      newPassword: "another-secure-password",
    });
    expect(await screen.findByText(messages.Auth.resetPasswordComplete)).toBeInTheDocument();
  });

  it("shows a generic error when the reset token is rejected", async () => {
    const user = userEvent.setup();
    mocks.resetPassword.mockResolvedValue({ data: null, error: { status: 400 } });
    renderForm("expired-reset-token");

    await user.type(screen.getByLabelText("New password"), "another-secure-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText(messages.Auth.error)).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});
