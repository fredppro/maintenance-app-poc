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

  const organizationSelector = page.getByRole("combobox", {
    name: "Choose an organization",
  });
  if (await organizationSelector.isVisible()) {
    await expect(async () => {
      await organizationSelector.selectOption({
        label: "E2E Playwright Organization",
      });
      await expect(page).toHaveURL(/\/en$/, { timeout: 2000 });
    }).toPass();
  }

  await expect(page).toHaveURL(/\/en$/);

  await expect(
    page.getByRole("heading", { name: "Maintenance Scheduler" }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /^Add a maintenance task for E2E - Playwright Equipment on/,
    })
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
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await expect(
    page.getByText("E2E - Playwright scheduled task"),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
});
