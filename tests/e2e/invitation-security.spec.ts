import { expect, test } from "@playwright/test";
import { acceptInvitation, BASE_URL, provisionCustomer, signInAs, withDatabase } from "./customer";
import { TENANT_B_EMAIL } from "./tenant-fixtures";

test("an owner invitation can only be used by the person it was issued to, and only while valid", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const runId = Date.now();
  const ownerEmail = `playwright-onboarding-invite-${runId}@example.test`;
  const organizationName = `E2E Onboarding Invite ${runId}`;
  const link = provisionCustomer(organizationName, ownerEmail);
  const invitationId = new URL(link).searchParams.get("id") ?? "";
  expect(invitationId).not.toBe("");

  await test.step("another signed-in user cannot open or accept it", async () => {
    const stranger = await signInAs(
      browser,
      TENANT_B_EMAIL,
      "playwright-tenant-b-password",
      "E2E Tenant B Organization",
    );
    const opened = await stranger.page.goto(link);
    expect(opened?.status()).toBe(404);

    const accepted = await stranger.page.request.post("/api/auth/organization/accept-invitation", {
      data: { invitationId },
      headers: { origin: BASE_URL },
    });
    expect(accepted.ok()).toBe(false);
    await stranger.context.close();

    const state = await withDatabase(async (db) => {
      const invitation = await db.invitation.findUniqueOrThrow({ where: { id: invitationId } });
      const members = await db.member.count({
        where: { organizationId: invitation.organizationId, user: { email: TENANT_B_EMAIL } },
      });
      return { status: invitation.status, role: invitation.role, members };
    });
    expect(state).toEqual({ status: "pending", role: "owner", members: 0 });
  });

  await test.step("the invited person can accept it and becomes the owner of that organization only", async () => {
    await acceptInvitation(page, link, ownerEmail);

    const result = await withDatabase(async (db) => {
      const memberships = await db.member.findMany({
        where: { user: { email: ownerEmail } },
        select: { role: true, organization: { select: { name: true } } },
      });
      const invitation = await db.invitation.findUniqueOrThrow({ where: { id: invitationId } });
      return { memberships, status: invitation.status };
    });
    expect(result.status).toBe("accepted");
    expect(result.memberships).toEqual([{ role: "owner", organization: { name: organizationName } }]);
  });

  await test.step("an expired invitation cannot be accepted", async () => {
    const expiredOwner = `playwright-onboarding-invite-expired-${runId}@example.test`;
    const expiredLink = provisionCustomer(`${organizationName} Expired`, expiredOwner);
    const expiredId = new URL(expiredLink).searchParams.get("id") ?? "";
    await withDatabase((db) =>
      db.invitation.update({ where: { id: expiredId }, data: { expiresAt: new Date(Date.now() - 60_000) } }),
    );

    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const expiredPage = await fresh.newPage();
    await expiredPage.goto(expiredLink);
    await expiredPage.waitForURL(/\/signup\?invitationId=/);
    await expiredPage.getByLabel("Name").fill("E2E Late Owner");
    await expiredPage.getByLabel("Email").fill(expiredOwner);
    await expiredPage.getByLabel("Password", { exact: true }).fill("playwright-customer-password");
    await expiredPage.getByRole("button", { name: "Create account" }).click();
    // Signup does not carry an expired invitation forward, so the new account lands on onboarding.
    await expiredPage.waitForURL(/\/onboarding$/);

    const opened = await expiredPage.goto(expiredLink);
    expect(opened?.status()).toBe(404);
    await expect(expiredPage.getByText("Page not found")).toBeVisible({ timeout: 45_000 });
    await expect(expiredPage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

    const accepted = await expiredPage.request.post("/api/auth/organization/accept-invitation", {
      data: { invitationId: expiredId },
      headers: { origin: BASE_URL },
    });
    expect(accepted.ok()).toBe(false);
    const members = await withDatabase((db) => db.member.count({ where: { user: { email: expiredOwner } } }));
    expect(members).toBe(0);
    await fresh.close();
  });
});
