import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import messages from "@/i18n/messages/en.json";
import { AppSidebar } from "./app-sidebar";

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...props
  }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/",
}));

describe("AppSidebar account menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens account security from the user menu", async () => {
    const onAccount = vi.fn();
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SidebarProvider>
          <AppSidebar
            user={{ name: "Alex Example", email: "alex@example.com" }}
            canManageMembers
            contextLabel="Example organization"
            onAccount={onAccount}
            onSignOut={vi.fn()}
          />
        </SidebarProvider>
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Account" }));

    expect(onAccount).toHaveBeenCalledOnce();
  });
});
