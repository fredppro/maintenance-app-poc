import { expect, test } from "@playwright/test";

// Uses its own throwaway organization so it cannot change the shared fixture tenant.
test("owners can add sites after onboarding and duplicates are rejected", async ({
  page,
}) => {
  const runId = Date.now();
  await page.goto("/en/signup");
  await page.getByLabel("Name").fill("E2E Onboarding Sites");
  await page
    .getByLabel("Email")
    .fill(`playwright-onboarding-sites-${runId}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("playwright-onboarding-password");
  const signUpResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-up/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create account" }).click();
  expect((await signUpResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/en\/onboarding$/);

  await page.getByLabel("Organization name").fill(`E2E Onboarding ${runId}`);
  await page.getByLabel("First site name").fill("Initial site");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Maintenance Scheduler" }),
  ).toBeVisible();

  await page.goto("/en/sites");
  const input = page.getByLabel("New site name");
  const add = page.getByRole("button", { name: "Add site" });

  await input.fill("Second site");
  await add.click();
  await expect(page.getByText("Site added.")).toBeVisible();

  // A second site must not break the app or force a re-selection.
  await page.reload();
  await expect(page).toHaveURL(/\/en\/sites$/);
  await expect(page.getByLabel("New site name")).toBeVisible();

  await input.fill("Second site");
  await add.click();
  await expect(page.getByText(/Could not add the site/)).toBeVisible();
});
