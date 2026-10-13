import { expect, test, type Page } from "@playwright/test";
import { acceptInvitation, BASE_URL, provisionCustomer, signInAs, withDatabase } from "./customer";
import { TENANT_B_EMAIL } from "./tenant-fixtures";

// A valid 1x1 PNG; the browser resizes it and the server checks the real file type.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const timeout = { timeout: 45_000 };
const settingsHeading = (page: Page) => page.getByRole("heading", { name: "Organization settings" });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const save = (page: Page) => page.getByRole("button", { name: /Save changes/ });

async function openSettings(page: Page) {
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await page.waitForURL(/\/en\/organization$/);
  await expect(settingsHeading(page)).toBeVisible(timeout);
}

test("owners and admins manage the organization's profile and regional settings, other roles and organizations cannot", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const runId = Date.now();
  const organizationName = `E2E Onboarding Settings ${runId}`;
  const renamed = `E2E Settings Renamed ${runId}`;
  const ownerEmail = `playwright-onboarding-settings-${runId}@example.test`;
  const adminEmail = `playwright-onboarding-settings-admin-${runId}@example.test`;
  const readerEmail = `playwright-onboarding-settings-reader-${runId}@example.test`;
  let organizationId = "";
  let slug = "";
  let logoFileId = "";

  await test.step("a new organization shows its current values and sensible defaults", async () => {
    await acceptInvitation(page, provisionCustomer(organizationName, ownerEmail), ownerEmail);
    ({ id: organizationId, slug } = await withDatabase((db) =>
      db.organization.findFirstOrThrow({ where: { name: organizationName }, select: { id: true, slug: true } }),
    ));

    await openSettings(page);
    await expect(field(page, "Organization name")).toHaveValue(organizationName);
    await expect(field(page, "Contact email")).toHaveValue("");
    await expect(field(page, "Contact phone")).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Time zone" })).toContainText("Europe/Lisbon");
    await expect(page.getByRole("combobox", { name: "Default language" })).toContainText("English");
    await expect(page.getByLabel("No logo")).toBeVisible();
    await expect(save(page)).toBeDisabled();
  });

  await test.step("invalid values are explained and nothing is saved", async () => {
    await field(page, "Organization name").fill("A");
    await field(page, "Contact email").fill("not-an-email");
    await field(page, "Contact phone").fill("call me");
    await save(page).click();

    await expect(page.getByText("Enter at least 2 characters.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Enter a valid phone number, e.g. +351 21 000 0000.")).toBeVisible();
    await expect(page.getByText("Organization settings saved.")).toHaveCount(0);

    await page.reload();
    await expect(field(page, "Organization name")).toHaveValue(organizationName);
  });

  await test.step("saved settings, including the logo, time zone and language, persist across reloads", async () => {
    await field(page, "Organization name").fill(renamed);
    await field(page, "Contact email").fill("Office@Example.TEST");
    await field(page, "Contact phone").fill("+351 21 000 0000");
    await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: `${renamed} logo` })).toBeVisible();

    await page.getByRole("combobox", { name: "Time zone" }).click();
    await page.getByPlaceholder("Search time zones...").fill("Sao_Paulo");
    await page.getByRole("option", { name: "America/Sao_Paulo" }).click();
    await page.getByRole("combobox", { name: "Default language" }).click();
    await page.getByRole("option", { name: "Português (PT)" }).click();

    await save(page).click();
    await expect(page.getByText("Organization settings saved.")).toBeVisible(timeout);

    await page.reload();
    await expect(settingsHeading(page)).toBeVisible(timeout);
    await expect(field(page, "Organization name")).toHaveValue(renamed);
    await expect(field(page, "Contact email")).toHaveValue("office@example.test");
    await expect(field(page, "Contact phone")).toHaveValue("+351 21 000 0000");
    await expect(page.getByRole("combobox", { name: "Time zone" })).toContainText("America/Sao_Paulo");
    await expect(page.getByRole("combobox", { name: "Default language" })).toContainText("Português (PT)");

    const preview = page.getByTestId("organization-logo-preview").locator("img");
    await expect(preview).toBeVisible();
    logoFileId = (await preview.getAttribute("src"))?.replace("/api/files/", "") ?? "";
    expect(logoFileId).not.toBe("");
    // The organization's logo also identifies it in the sidebar.
    await expect(page.locator('[data-slot="sidebar"] img').first()).toHaveAttribute("src", `/api/files/${logoFileId}`);
    const stored = await page.request.get(`/api/files/${logoFileId}`);
    expect(stored.status()).toBe(200);
    expect(stored.headers()["content-type"]).toBe("image/png");
  });

  await test.step("renaming does not change the organization's identity", async () => {
    const after = await withDatabase(async (db) => ({
      organization: await db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      settings: await db.tenantSettings.findUniqueOrThrow({ where: { organizationId } }),
      invitations: await db.invitation.count({ where: { organizationId, status: "accepted" } }),
      audit: await db.organizationAuditEvent.findMany({
        where: { organizationId, action: "organization.settings_updated" },
      }),
    }));
    expect(after.organization.slug).toBe(slug);
    expect(after.organization.name).toBe(renamed);
    expect(after.invitations).toBe(1);
    expect(after.settings).toMatchObject({
      contactEmail: "office@example.test",
      timezone: "America/Sao_Paulo",
      locale: "pt-pt",
      status: "ACTIVE",
      deletionScheduledFor: null,
    });
    expect(after.audit).toHaveLength(1);

    // The session keeps working and the new name is shown across the app.
    await page.goto("/en");
    await expect(page.locator('[data-slot="sidebar"]').getByText(new RegExp(renamed))).toBeVisible(timeout);
  });

  await test.step("another organization cannot see or influence these settings", async () => {
    const tenantB = await signInAs(
      browser,
      TENANT_B_EMAIL,
      "playwright-tenant-b-password",
      "E2E Tenant B Organization",
    );
    await openSettings(tenantB.page);
    await expect(field(tenantB.page, "Organization name")).toHaveValue("E2E Tenant B Organization");
    await expect(field(tenantB.page, "Contact email")).toHaveValue("");
    await expect(tenantB.page.getByLabel("No logo")).toBeVisible();

    // This organization's logo is not readable from another organization.
    expect((await tenantB.page.request.get(`/api/files/${logoFileId}`)).status()).toBe(404);
    await tenantB.context.close();

    const untouched = await withDatabase((db) =>
      db.organization.findFirstOrThrow({ where: { name: "E2E Tenant B Organization" }, select: { name: true } }),
    );
    expect(untouched.name).toBe("E2E Tenant B Organization");
  });

  await test.step("admins can edit, read-only members cannot reach the settings", async () => {
    await withDatabase(async (db) => {
      for (const [email, role] of [
        [adminEmail, "admin"],
        [readerEmail, "read_only"],
      ] as const) {
        // A standalone request context: signing up through the owner's page would replace its session.
        const response = await request.post("/api/auth/sign-up/email", {
          data: { name: `E2E ${role}`, email, password: "playwright-settings-password" },
          headers: { origin: BASE_URL },
        });
        expect(response.ok()).toBeTruthy();
        const user = await db.user.findUniqueOrThrow({ where: { email } });
        await db.member.create({
          data: { id: `e2e-settings-${role}-${runId}`, organizationId, userId: user.id, role, createdAt: new Date() },
        });
      }
    });

    const admin = await signInAs(browser, adminEmail, "playwright-settings-password", renamed);
    await openSettings(admin.page);
    await field(admin.page, "Contact phone").fill("+351 22 111 1111");
    await save(admin.page).click();
    await expect(admin.page.getByText("Organization settings saved.")).toBeVisible(timeout);
    await admin.context.close();

    const reader = await signInAs(browser, readerEmail, "playwright-settings-password", renamed);
    await expect(reader.page.getByRole("link", { name: "Organization", exact: true })).toHaveCount(0);
    await reader.page.goto("/en/organization");
    await expect(settingsHeading(reader.page)).toHaveCount(0);
    await expect(reader.page.getByLabel("Organization name")).toHaveCount(0);
    await reader.context.close();

    const phone = await withDatabase((db) =>
      db.tenantSettings.findUniqueOrThrow({ where: { organizationId }, select: { contactPhone: true } }),
    );
    expect(phone.contactPhone).toBe("+351 22 111 1111");
  });

  await test.step("removing the logo clears it and deletes the file", async () => {
    await page.goto("/en/organization");
    await expect(settingsHeading(page)).toBeVisible(timeout);
    await page.getByRole("button", { name: "Remove logo" }).click();
    await save(page).click();
    await expect(page.getByText("Organization settings saved.")).toBeVisible(timeout);

    await page.reload();
    await expect(page.getByLabel("No logo")).toBeVisible(timeout);
    expect((await page.request.get(`/api/files/${logoFileId}`)).status()).toBe(404);
    const files = await withDatabase((db) => db.storedFile.count({ where: { organizationId } }));
    expect(files).toBe(0);
  });
});

test("a logo that is not an image is rejected without saving", async ({ page }) => {
  test.setTimeout(180_000);
  const runId = Date.now();
  const ownerEmail = `playwright-onboarding-settings-logo-${runId}@example.test`;
  await acceptInvitation(
    page,
    provisionCustomer(`E2E Onboarding Settings Logo ${runId}`, ownerEmail),
    ownerEmail,
  );
  await openSettings(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByText("Choose a PNG, JPEG or WebP image up to 10 MB.")).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await expect(page.getByLabel("No logo")).toBeVisible();
});
