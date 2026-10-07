import { expect, test, type Page } from "@playwright/test";
import {
  TENANT_A_ADMIN_EMAIL,
  TENANT_A_ADMIN_ID,
  TENANT_A_ADMIN_INVITATION_ID,
  TENANT_A_MEMBER_EMAIL,
} from "./tenant-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const signInResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await signInResponse).ok()).toBeTruthy();
}

async function selectOrganization(
  page: Page,
  organizationName: string,
) {
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);
  const organizationSelector = page.getByRole("combobox", {
    name: "Choose an organization",
  });
  if (await organizationSelector.isVisible()) {
    await organizationSelector.selectOption({ label: organizationName });
  }

  const organizationsResponse = await page.request.get(
    "/api/auth/organization/list",
  );
  expect(organizationsResponse.ok()).toBeTruthy();
  const organizations = (await organizationsResponse.json()) as {
    id: string;
    name: string;
  }[];
  const organization = organizations.find(
    (item) => item.name === organizationName,
  );
  if (!organization) throw new Error(`Organization not found: ${organizationName}`);
  const setActive = await page.request.post(
    "/api/auth/organization/set-active",
    {
      data: { organizationId: organization.id },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(setActive.ok()).toBeTruthy();
}

test("organization owners can manage members and revoke pending invitations", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());

  const loginPage = await page.goto("/en/login");
  expect(loginPage?.headers()["x-frame-options"]).toBe("DENY");
  expect(loginPage?.headers()["x-content-type-options"]).toBe("nosniff");
  await signIn(page, "playwright@example.test", "playwright-e2e-password");
  await selectOrganization(page, "E2E Playwright Organization");

  await page.goto("/en/members");
  const memberRole = page.getByRole("combobox", {
    name: "Role for E2E Organization Member",
  });
  await expect(memberRole).toContainText("Read-only");
  await memberRole.click();
  await page.getByRole("option", { name: "Maintenance manager" }).click();
  await expect(memberRole).toContainText("Maintenance manager");

  const pendingInvitation = page
    .locator("li")
    .filter({ hasText: "playwright-pending-invite@example.test" });
  await expect(pendingInvitation).toBeVisible();
  await pendingInvitation
    .getByRole("button", { name: "Revoke invitation" })
    .click();
  await expect(pendingInvitation).toHaveCount(0);

  await page
    .locator("li")
    .filter({ hasText: TENANT_A_MEMBER_EMAIL })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.getByText(TENANT_A_MEMBER_EMAIL)).toHaveCount(0);
});

test("organization admins cannot bypass member-management role boundaries via Better Auth APIs", async ({
  page,
}) => {
  await signIn(page, TENANT_A_ADMIN_EMAIL, "playwright-admin-a-password");
  await selectOrganization(page, "E2E Playwright Organization");

  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = (await sessionResponse.json()) as {
    session?: { activeOrganizationId?: string | null };
  };
  const organizationId = session.session?.activeOrganizationId;
  if (typeof organizationId !== "string") {
    throw new Error("The E2E organization was not selected for the admin session");
  }

  const updateRole = await page.request.post(
    "/api/auth/organization/update-member-role",
    {
      data: {
        memberId: TENANT_A_ADMIN_ID,
        role: "admin",
        organizationId,
      },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(updateRole.status()).toBe(403);

  const removeMember = await page.request.post(
    "/api/auth/organization/remove-member",
    {
      data: {
        memberIdOrEmail: TENANT_A_ADMIN_ID,
        organizationId,
      },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect([401, 403]).toContain(removeMember.status());

  const inviteAdmin = await page.request.post(
    "/api/auth/organization/invite-member",
    {
      data: {
        email: "unauthorized-admin-invite@example.test",
        role: "admin",
        organizationId,
      },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(inviteAdmin.status()).toBe(403);

  const resendAdminInvitation = await page.request.post(
    "/api/auth/organization/invite-member",
    {
      data: {
        email: "playwright-pending-admin-invite@example.test",
        role: "admin",
        organizationId,
        resend: true,
      },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(resendAdminInvitation.status()).toBe(403);

  const revokeAdminInvitation = await page.request.post(
    "/api/auth/organization/cancel-invitation",
    {
      data: { invitationId: TENANT_A_ADMIN_INVITATION_ID },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(revokeAdminInvitation.status()).toBe(403);
});
