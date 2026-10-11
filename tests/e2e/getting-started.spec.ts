import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { acceptInvitation, provisionCustomer, signInAs, withDatabase } from "./customer";
import { TENANT_B_EMAIL } from "./tenant-fixtures";

const checklist = (page: Page) => page.getByRole("region", { name: "Getting started" });
const timeout = { timeout: 45_000 };

test("an operator-provisioned owner is guided through setup, and other organizations are unaffected", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const runId = Date.now();
  const organizationName = `E2E Onboarding Checklist ${runId}`;
  const ownerEmail = `playwright-onboarding-checklist-${runId}@example.test`;

  await test.step("a newly provisioned organization sees the checklist", async () => {
    await acceptInvitation(page, provisionCustomer(organizationName, ownerEmail), ownerEmail);

    await expect(checklist(page).getByText("4 steps remaining")).toBeVisible(timeout);
    await expect(checklist(page).getByText("Organization set up")).toBeVisible();
    await expect(checklist(page).getByText("First site added")).toBeVisible();
    await expect(checklist(page).getByRole("button", { name: "Add equipment" })).toBeVisible();
    await expect(checklist(page).getByRole("link", { name: "Add workers" })).toBeVisible();
    await expect(checklist(page).getByRole("button", { name: "Schedule maintenance" })).toBeDisabled();
    await expect(checklist(page).getByRole("link", { name: "Invite team" })).toHaveAttribute(
      "href",
      "/en/members",
    );
  });

  await test.step("adding a member completes the team step", async () => {
    await withDatabase(async (database) => {
      const organization = await database.organization.findFirstOrThrow({
        where: { name: organizationName },
        select: { id: true },
      });
      const user = await database.user.create({
        data: {
          id: `e2e-checklist-user-${runId}`,
          name: "E2E Checklist Colleague",
          email: `playwright-onboarding-checklist-colleague-${runId}@example.test`,
          emailVerified: true,
        },
      });
      await database.member.create({
        data: {
          id: `e2e-checklist-member-${runId}`,
          organizationId: organization.id,
          userId: user.id,
          role: "read_only",
          createdAt: new Date(),
        },
      });
    });

    await page.reload();
    await expect(checklist(page).getByText("3 steps remaining")).toBeVisible(timeout);
    await expect(checklist(page).getByRole("link", { name: "Invite team" })).toHaveCount(0);
    await expect(checklist(page).getByText("Team invited")).toBeVisible();
  });

  await test.step("adding equipment completes the equipment step", async () => {
    await checklist(page).getByRole("button", { name: "Add equipment" }).click();
    await page.getByLabel("Equipment Name").fill(`E2E Checklist Press ${runId}`);
    await page.getByRole("dialog").getByRole("button", { name: "Add Equipment", exact: true }).click();

    await expect(checklist(page).getByText("2 steps remaining")).toBeVisible(timeout);
    await expect(checklist(page).getByRole("button", { name: "Add equipment" })).toHaveCount(0);
    await expect(checklist(page).getByRole("button", { name: "Schedule maintenance" })).toBeDisabled();
  });

  await test.step("adding a worker unlocks scheduling", async () => {
    await checklist(page).getByRole("link", { name: "Add workers" }).click();
    await page.waitForURL(/\/en\/workers$/);
    await page.getByRole("button", { name: "Create worker" }).first().click();
    await page.getByLabel("Name").fill("E2E Checklist Technician");
    await page.getByLabel("Email").fill(`playwright-onboarding-technician-${runId}@example.test`);
    await page.getByRole("dialog").getByRole("button", { name: "Create worker" }).click();
    await expect(page.getByText("E2E Checklist Technician")).toBeVisible(timeout);

    await page.getByRole("link", { name: "Schedule", exact: true }).click();
    await page.waitForURL(/\/en$/);
    await expect(checklist(page).getByText("1 step remaining")).toBeVisible(timeout);
    await expect(checklist(page).getByRole("button", { name: "Schedule maintenance" })).toBeEnabled();
  });

  await test.step("scheduling the first task completes the checklist", async () => {
    await checklist(page).getByRole("button", { name: "Schedule maintenance" }).click();
    await page.getByPlaceholder("e.g., Monthly Inspection").fill("E2E first maintenance");
    await page.getByRole("combobox", { name: "Select workers..." }).click();
    await page.getByRole("option", { name: /E2E Checklist Technician/ }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Schedule", exact: true }).click();

    await expect(checklist(page).getByText("You're all set")).toBeVisible(timeout);
    await expect(checklist(page).getByRole("button", { name: "Dismiss" })).toBeVisible();
  });

  await test.step("other organizations are not affected by this one", async () => {
    // Tenant B has its own data and never dismissed anything: its checklist is still there and unfinished.
    const tenantB = await signInAs(
      browser,
      TENANT_B_EMAIL,
      "playwright-tenant-b-password",
      "E2E Tenant B Organization",
    );
    await expect(checklist(tenantB.page)).toBeVisible(timeout);
    await expect(checklist(tenantB.page).getByText("You're all set")).toHaveCount(0);
    await expect(checklist(tenantB.page).getByText(/steps? remaining/)).toBeVisible();
    await tenantB.context.close();

    // An existing organization that already has data and members is simply complete.
    const existing = await signInAs(
      browser,
      "playwright@example.test",
      "playwright-e2e-password",
      "E2E Playwright Organization",
    );
    await expect(checklist(existing.page).getByText("You're all set")).toBeVisible(timeout);
    await existing.context.close();
  });

  await test.step("dismissing hides the checklist for good, only for this organization", async () => {
    await checklist(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(checklist(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Maintenance Scheduler" })).toBeVisible(timeout);
    await expect(checklist(page)).toHaveCount(0);

    const tenantB = await signInAs(
      browser,
      TENANT_B_EMAIL,
      "playwright-tenant-b-password",
      "E2E Tenant B Organization",
    );
    await expect(checklist(tenantB.page)).toBeVisible(timeout);
    await tenantB.context.close();
  });
});
