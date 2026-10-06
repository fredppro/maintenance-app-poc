import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("schedule a task from the dashboard with accessible form controls", async ({
  page,
}) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("playwright@example.test");
  await page.getByLabel("Password").fill("playwright-e2e-password");
  const signInResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await signInResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);

  await page.goto("/en");

  await expect(
    page.getByRole("heading", { name: "Maintenance Scheduler" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /^E2E - Playwright Equipment,/ })
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: "Schedule Maintenance" });
  await expect(dialog).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag21a", "wcag22a"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByPlaceholder("e.g., Monthly Inspection").fill(
    "E2E - Playwright scheduled task",
  );
  await page
    .getByRole("combobox", { name: "Select workers..." })
    .click();
  await page.getByRole("option", { name: /E2E Playwright Worker/ }).click();
  await page.getByRole("button", { name: "Schedule" }).click();

  await expect(
    page.getByText("E2E - Playwright scheduled task"),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
});
