import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { chooseOrganizationIfAsked } from "./organization-selection";

async function signIn(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("playwright@example.test");
  await page.getByLabel("Password", { exact: true }).fill(
    "playwright-e2e-password",
  );
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/sign-in/email") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);
  await chooseOrganizationIfAsked(page, "E2E Playwright Organization");
  await expect(page).toHaveURL(/\/en$/);
}

const pages = [
  { link: "Equipment", path: "/en/equipment" },
  { link: "Sites", path: "/en/sites" },
  { link: "Inventory", path: "/en/inventory" },
  { link: "Metrics", path: "/en/metrics" },
];

test("sidebar navigates between the main areas and marks the active page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);

  for (const { link, path } of pages) {
    await page.getByRole("link", { name: link, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("link", { name: link, exact: true }).first(),
    ).toHaveAttribute("data-active", "true");
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag21a"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("mobile layout opens navigation from a trigger without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  for (const { path } of pages) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await page.getByRole("button", { name: /toggle sidebar/i }).first().click();
  const nav = page.getByRole("dialog");
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Equipment", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/equipment$/);
});
