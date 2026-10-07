import { expect, test } from "@playwright/test";

test("a new user can create an account and set up an organization and site", async ({
  page,
}) => {
  const runId = Date.now();
  await page.goto("/en/signup");
  await page.getByLabel("Name").fill("E2E Onboarding");
  await page
    .getByLabel("Email")
    .fill(`playwright-onboarding-${runId}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("playwright-onboarding-password");

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

  const session = await page.evaluate(async () =>
    (await fetch("/api/auth/get-session")).json(),
  );
  expect(session?.session?.activeOrganizationId).toBeTruthy();
});
