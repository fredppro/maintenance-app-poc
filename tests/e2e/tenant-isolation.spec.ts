import { expect, test, type Page } from "@playwright/test";
import {
  TENANT_A_TASK_ID,
  TENANT_B_TASK_ID,
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

async function selectOrganization(page: Page, organizationName: string) {
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);
  const organizationSelector = page.getByRole("combobox", {
    name: "Choose an organization",
  });
  if (await organizationSelector.isVisible()) {
    await organizationSelector.selectOption({ label: organizationName });
  }
}

test("tenant A cannot view tenant B dashboard records or reports", async ({
  page,
}) => {
  await signIn(page, "playwright@example.test", "playwright-e2e-password");
  await selectOrganization(page, "E2E Playwright Organization");
  await expect(
    page.getByRole("heading", { name: "Maintenance Scheduler" }),
  ).toBeVisible();
  await expect(
    page.getByText("E2E - Tenant A private maintenance record"),
  ).toBeVisible();
  await expect(
    page.getByText("E2E - Tenant B confidential maintenance record"),
  ).toHaveCount(0);

  const ownReport = await page.request.get(
    `/api/tasks/${TENANT_A_TASK_ID}/report?mode=download`,
  );
  expect(ownReport.status()).toBe(200);
  expect(ownReport.headers()["content-type"]).toContain("application/pdf");

  const otherTenantReport = await page.request.get(
    `/api/tasks/${TENANT_B_TASK_ID}/report?mode=download`,
  );
  expect(otherTenantReport.status()).toBe(404);
  expect(await otherTenantReport.json()).toEqual({
    message: "Task not found",
  });
});

test("tenant B cannot view tenant A dashboard records or reports", async ({
  page,
}) => {
  await signIn(
    page,
    "playwright-tenant-b@example.test",
    "playwright-tenant-b-password",
  );
  await selectOrganization(page, "E2E Tenant B Organization");
  await expect(
    page.getByRole("heading", { name: "Maintenance Scheduler" }),
  ).toBeVisible();
  await expect(
    page.getByText("E2E - Tenant B confidential maintenance record"),
  ).toBeVisible();
  await expect(
    page.getByText("E2E - Tenant A private maintenance record"),
  ).toHaveCount(0);

  const ownReport = await page.request.get(
    `/api/tasks/${TENANT_B_TASK_ID}/report?mode=download`,
  );
  expect(ownReport.status()).toBe(200);

  const otherTenantReport = await page.request.get(
    `/api/tasks/${TENANT_A_TASK_ID}/report?mode=download`,
  );
  expect(otherTenantReport.status()).toBe(404);
});
