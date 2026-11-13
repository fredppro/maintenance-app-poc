import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { BASE_URL } from "./customer";
import { chooseOrganizationIfAsked } from "./organization-selection";

test("schedule a task from the dashboard with accessible form controls", async ({
  page,
  browser,
}) => {
  await page.goto("/en/login");
  await expect(
    page.getByRole("heading", { name: "Sign in", level: 1 }),
  ).toBeVisible();
  const loginContrast = await new AxeBuilder({ page })
    .include("p.text-center")
    .withRules(["color-contrast"])
    .analyze();
  expect(loginContrast.violations).toEqual([]);

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

  await chooseOrganizationIfAsked(page, "E2E Playwright Organization");

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
    .getByRole("combobox", { name: "Assigned Workers" })
    .click();
  await page.getByRole("option", { name: /E2E Playwright Worker/ }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await expect(
    page.getByText("E2E - Playwright scheduled task"),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();

  const scheduledTask = page.getByRole("button", {
    name: "E2E - Playwright scheduled task",
  });
  const taskDialog = page.getByRole("dialog");

  await scheduledTask.focus();
  await page.keyboard.press("Space");
  await expect(taskDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(taskDialog).not.toBeVisible();

  await scheduledTask.focus();
  await page.keyboard.press("Enter");
  await expect(taskDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(taskDialog).not.toBeVisible();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  try {
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/en`);
    await expect(
      mobilePage.getByText(
        "Tap a cell to schedule; tap a task to edit its schedule; swipe the timeline for more dates",
      ),
    ).toBeVisible();
    expect(await mobilePage.evaluate(() => document.documentElement.scrollWidth))
      .toBe(390);

    const mobileTask = mobilePage.getByRole("button", {
      name: "E2E - Playwright scheduled task",
    });
    await mobileTask.scrollIntoViewIfNeeded();
    await mobileTask.tap();
    const mobileDialog = mobilePage.getByRole("dialog");
    await expect(mobileDialog).toBeVisible();
    await mobilePage.keyboard.press("Escape");
    await expect(mobileDialog).not.toBeVisible();
  } finally {
    await mobileContext.close();
  }
});

test("authentication routes expose a primary heading", async ({ page }) => {
  for (const [path, title] of [
    ["/en/login", "Sign in"],
    ["/en/signup", "Create your account"],
    ["/en/reset-password", "Forgot your password?"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
  }
});
