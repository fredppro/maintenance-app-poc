import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import { AppShell } from "./app-shell";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/workers",
}));
vi.mock("@/features/auth/client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@/features/organization/ui/tenant-context-selector", () => ({
  TenantContextSelector: () => null,
}));
vi.mock("./app-sidebar", () => ({ AppSidebar: () => null }));

describe("AppShell global search", () => {
  it("places the search immediately before the language switcher on non-schedule pages", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SchedulerStoreProvider>
          <AppShell
            user={{ name: "Alex", email: "alex@example.test" }}
            tenantContexts={[{
              organizationId: "org", organizationName: "Workshop",
              siteId: "site", siteName: "Primary workshop and assembly floor", role: "owner",
            }]}
            selectedSiteId="site" canManageMembers defaultSidebarOpen
          >
            <h1>Workers page</h1>
          </AppShell>
        </SchedulerStoreProvider>
      </NextIntlClientProvider>,
    );
    const header = screen.getByRole("banner");
    expect(header).toHaveClass("@container/shell", "px-page", "sm:px-page-desktop");
    const search = within(header).getByRole("button", { name: messages.Grid.searchTasks });
    const language = within(header).getByRole("button", { name: "Change language" });
    expect(search.nextElementSibling).toBe(language);
    expect(search).toHaveAttribute("data-size", "default");
    expect(search).toHaveClass("w-control", "pointer-coarse:min-w-control-lg");
    expect(search).toHaveClass("@xl/shell:w-44", "@2xl/shell:w-56", "@5xl/shell:w-72");
    const siteLabel = within(header).getByText("Primary workshop and assembly floor");
    expect(siteLabel.parentElement).toHaveClass("min-w-0");
    expect(siteLabel.parentElement).not.toHaveClass("shrink-0");
    expect(screen.getByRole("heading", { name: "Workers page" })).toBeVisible();
    await user.click(search);
    expect(screen.getByRole("dialog", { name: "Search maintenance" })).toBeVisible();
    expect(screen.getByText(messages.Grid.noSearchResults)).toBeVisible();
  });
});
