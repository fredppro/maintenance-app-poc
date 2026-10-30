import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import messages from "@/i18n/messages/en.json";
import { SessionManagement } from "./session-management";

const mocks = vi.hoisted(() => ({
  currentSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  signInEmail: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/features/auth/client", () => ({
  authClient: {
    useSession: mocks.currentSession,
    getSession: mocks.getSession,
    listSessions: mocks.listSessions,
    revokeSession: mocks.revokeSession,
    signIn: { email: mocks.signInEmail },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}));

function makeSession(
  id: string,
  token: string,
  userAgent: string,
) {
  return {
    id,
    token,
    userAgent,
    createdAt: new Date("2026-03-01T10:00:00Z"),
    expiresAt: new Date("2026-04-01T10:00:00Z"),
  };
}

function renderSessionManagement() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionManagement />
    </NextIntlClientProvider>,
  );
}

describe("SessionManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentSession.mockReturnValue({
      data: {
        user: { email: "alex@example.com" },
        session: { id: "current-session" },
      },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "current-session" } },
      error: null,
    });
  });

  it("lists sessions without rendering session tokens and revokes a selected other session", async () => {
    mocks.listSessions.mockResolvedValue({
      data: [
        makeSession(
          "current-session",
          "current-secret-token",
          "Mozilla/5.0 Firefox/124.0",
        ),
        makeSession(
          "other-session",
          "other-secret-token",
          "Mozilla/5.0 Chrome/124.0",
        ),
      ],
      error: null,
    });
    mocks.revokeSession.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();

    renderSessionManagement();

    expect(await screen.findByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Revoke session for Chrome" }),
    );
    await user.click(
      screen.getByRole("button", { name: /^Revoke session$/ }),
    );

    await waitFor(() => {
      expect(mocks.revokeSession).toHaveBeenCalledWith({
        token: "other-secret-token",
      });
    });
    expect(screen.queryByText("Chrome")).not.toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
  });

  it("requires password reauthentication when the session is not fresh", async () => {
    mocks.listSessions
      .mockResolvedValueOnce({
        data: null,
        error: { code: "SESSION_NOT_FRESH" },
      })
      .mockResolvedValueOnce({
        data: [
          makeSession(
            "fresh-session",
            "fresh-secret-token",
            "Mozilla/5.0 Chrome/124.0",
          ),
          makeSession(
            "old-session",
            "old-secret-token",
            "Mozilla/5.0 Firefox/124.0",
          ),
        ],
        error: null,
      });
    mocks.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.getSession.mockResolvedValue({
      data: { session: { id: "fresh-session" } },
      error: null,
    });
    const user = userEvent.setup();

    renderSessionManagement();

    const password = await screen.findByLabelText("Current password");
    await user.type(password, "correct-horse-battery");
    await user.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );

    await waitFor(() => {
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "alex@example.com",
        password: "correct-horse-battery",
      });
    });
    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke session for Firefox" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke session for Chrome" }),
    ).not.toBeInTheDocument();
    expect(mocks.listSessions).toHaveBeenCalledTimes(2);
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it("does not offer revocation while it cannot identify the current session", async () => {
    mocks.currentSession.mockReturnValue({ data: null });
    mocks.listSessions.mockResolvedValue({
      data: [
        makeSession(
          "other-session",
          "other-secret-token",
          "Mozilla/5.0 Chrome/124.0",
        ),
      ],
      error: null,
    });

    renderSessionManagement();

    expect(
      await screen.findByText(
        "The current device could not be identified. Reload before revoking a session.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke session for Chrome" }),
    ).not.toBeInTheDocument();
  });

  it("shows a clear error when revocation fails", async () => {
    mocks.listSessions.mockResolvedValue({
      data: [
        makeSession(
          "other-session",
          "other-secret-token",
          "Mozilla/5.0 Chrome/124.0",
        ),
      ],
      error: null,
    });
    mocks.revokeSession.mockResolvedValue({
      data: null,
      error: { code: "UNKNOWN_ERROR" },
    });
    const user = userEvent.setup();

    renderSessionManagement();
    await user.click(
      await screen.findByRole("button", { name: "Revoke session for Chrome" }),
    );
    await user.click(
      screen.getByRole("button", { name: /^Revoke session$/ }),
    );

    expect(
      await screen.findByText("Could not revoke this session. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
  });
});
