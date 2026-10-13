import { expect, type Page } from "@playwright/test";

/** Picks an organization on the onboarding page, if it is shown, and waits for the dashboard. */
export async function chooseOrganizationIfAsked(page: Page, organizationName: string) {
  await expect(page).toHaveURL(/\/en(?:\/onboarding)?$/);
  const selector = page.getByRole("combobox", { name: "Choose an organization" });
  if (!(await selector.isVisible())) return;

  await expect(async () => {
    if (!(await selector.isVisible())) return;
    if (await selector.isDisabled()) {
      // A selection is already being applied (the dev server may still be compiling the dashboard):
      // wait for it instead of clicking a disabled control.
      await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
      return;
    }
    await selector.click();
    await page.getByRole("option", { name: organizationName, exact: true }).click();
    await expect(page).toHaveURL(/\/en$/, { timeout: 8000 });
  }).toPass();
}
