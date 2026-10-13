import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const replaceMock = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("src/i18n/routing", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, className }: any) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children, asChild }: any) => {
    if (asChild) {
      return React.cloneElement(children, { type: "button" });
    }
    return <button type="button">{children}</button>;
  },
}));

import LanguageSwitcher from "./language-switcher";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it("renders the available locale options", () => {
    render(<LanguageSwitcher />);

    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Português (PT)")).toBeInTheDocument();
  });

  it("routes to the selected locale on click", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /Português \(PT\)/i }));

    expect(replaceMock).toHaveBeenCalledWith("/dashboard", { locale: "pt-pt" });
  });
});
