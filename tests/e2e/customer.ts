import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Browser, Page } from "@playwright/test";
import { PrismaClient } from "../../prisma/generated/prisma/client";
import { chooseOrganizationIfAsked } from "./organization-selection";

export const BASE_URL = "http://127.0.0.1:3000";

/** Creates a customer the way an operator does, and returns the owner's invitation link. */
export function provisionCustomer(name: string, ownerEmail: string) {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required");
  const output = execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
      "scripts/ops/tenant-admin.ts",
      "create",
      name,
      ownerEmail,
      "Head office",
      "--no-email",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl, BETTER_AUTH_URL: BASE_URL },
    },
  );
  const link = output.match(/https?:\/\/\S+\/accept-invitation\?id=\S+/)?.[0];
  if (!link) throw new Error(`No invitation link in operator output:\n${output}`);
  return link;
}

/** Opens the owner's invitation, signs up and accepts it. Ends on the dashboard. */
export async function acceptInvitation(page: Page, link: string, ownerEmail: string) {
  await page.goto(link);
  await page.waitForURL(/\/signup\?invitationId=/);
  await page.getByLabel("Name").fill("E2E Customer Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill("playwright-customer-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/accept-invitation/);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.waitForURL(/\/en$/);
}

/** Signs in in a fresh browser context and picks the organization if asked. */
export async function signInAs(browser: Browser, email: string, password: string, organization: string) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await chooseOrganizationIfAsked(page, organization);
  return { page, context };
}

/** Direct database access with the owner role, for arranging and checking test data. */
export async function withDatabase<T>(fn: (database: PrismaClient) => Promise<T>) {
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.E2E_DATABASE_URL }),
  });
  try {
    return await fn(database);
  } finally {
    await database.$disconnect();
  }
}
