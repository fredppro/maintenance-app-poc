import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function TabsFixture({ animated = true }: { animated?: boolean }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Sections" animated={animated}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="history">History panel</TabsContent>
      <TabsContent value="settings">Settings panel</TabsContent>
    </Tabs>
  );
}

describe("shared animated tabs", () => {
  it("moves one shared active indicator while retaining Radix selection and panels", async () => {
    const user = userEvent.setup();
    render(<TabsFixture />);

    expect(screen.getAllByRole("tab").filter((tab) => tab.getAttribute("aria-selected") === "true"))
      .toHaveLength(1);
    const list = screen.getByRole("tablist", { name: "Sections" });
    const initialIndicator = list.querySelector('[data-slot="tabs-active-indicator"]');
    expect(initialIndicator?.parentElement).toBe(screen.getByRole("tab", { name: "Overview" }));

    await user.click(screen.getByRole("tab", { name: "History" }));

    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("History panel")).toBeVisible();
    const indicator = list.querySelector('[data-slot="tabs-active-indicator"]');
    expect(indicator).toBeInTheDocument();
    expect(indicator?.parentElement).toBe(screen.getByRole("tab", { name: "History" }));
    expect(list.querySelectorAll('[data-slot="tabs-active-indicator"]')).toHaveLength(1);
  });

  it("keeps a static active treatment when animation is disabled", async () => {
    const user = userEvent.setup();
    render(<TabsFixture animated={false} />);
    const list = screen.getByRole("tablist", { name: "Sections" });

    expect(list.querySelector('[data-slot="tabs-active-indicator"]')).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" }))
      .toHaveClass("data-[state=active]:bg-background", "transition-none");

    await user.click(screen.getByRole("tab", { name: "Settings" }));

    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
    expect(list.querySelector('[data-slot="tabs-active-indicator"]')).not.toBeInTheDocument();
  });
});
