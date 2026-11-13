import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { MemberAdministration } from "./member-administration";

const mocks = vi.hoisted(() => ({
  inviteOrganizationMember: vi.fn(),
  removeOrganizationMember: vi.fn(),
  revokeOrganizationInvitation: vi.fn(),
  updateOrganizationMemberRole: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/organization/server/member-actions", () => ({
  inviteOrganizationMember: mocks.inviteOrganizationMember,
  removeOrganizationMember: mocks.removeOrganizationMember,
  revokeOrganizationInvitation: mocks.revokeOrganizationInvitation,
  updateOrganizationMemberRole: mocks.updateOrganizationMemberRole,
}));

function renderMembers() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemberAdministration
        actorId="owner-1"
        actorRole="owner"
        members={[
          {
            id: "worker-1",
            name: "Riley Worker",
            email: "riley@example.test",
            role: "read_only",
          },
        ]}
        invitations={[]}
      />
    </NextIntlClientProvider>,
  );
}

describe("MemberAdministration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteOrganizationMember.mockResolvedValue(undefined);
    mocks.removeOrganizationMember.mockResolvedValue(undefined);
    mocks.revokeOrganizationInvitation.mockResolvedValue(undefined);
    mocks.updateOrganizationMemberRole.mockResolvedValue(undefined);
  });

  it("uses the shared alert dialog to confirm member removal", async () => {
    const user = userEvent.setup();
    renderMembers();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent(
      "Remove Riley Worker from this organization?",
    );
    expect(mocks.removeOrganizationMember).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirm" }),
    );
    await waitFor(() => {
      expect(mocks.removeOrganizationMember).toHaveBeenCalledWith({
        memberId: "worker-1",
      });
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the invitation entry point single and close to its form", () => {
    renderMembers();

    expect(
      screen.getByRole("button", { name: "Send invitation" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite someone" })).not.toBeInTheDocument();
  });
});
