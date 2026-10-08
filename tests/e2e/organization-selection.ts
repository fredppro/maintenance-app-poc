import { expect, type Page } from "@playwright/test";

/** Picks an organization on the onboarding page, if it is shown, and waits for the dashboard. */
export async function chooseOrganizationIfAsked(page: Page, organizationName: string) {
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);
  const selector = page.getByRole("combobox", { name: "Choose an organization" });
  if (!(await selector.isVisible())) return;

  await expect(async () => {
    if (!(await selector.isVisible())) return;
    await selector.click();
    await page.getByRole("option", { name: organizationName, exact: true }).click();
    await expect(page).toHaveURL(/\/en$/, { timeout: 8000 });
  }).toPass();
}
