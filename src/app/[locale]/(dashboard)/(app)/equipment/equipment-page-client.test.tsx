import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import type { Equipment, MaintenanceEntry } from "@/features/scheduler/types";
import { EquipmentPageClient } from "./equipment-page-client";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("@/features/scheduler/ui/equipment-dialog", () => ({
  EquipmentDialog: ({ open, equipment }: { open: boolean; equipment: Equipment | null }) =>
    open ? <div role="dialog">{equipment ? `editing ${equipment.name}` : "creating"}</div> : null,
}));

const equipment = [
  { id: "e1", name: "Press", category: "Machining", sectionId: "sec-1", imageFileId: null },
  { id: "e2", name: "Lathe", category: "Tools", sectionId: null, imageFileId: "img-1" },
] as Equipment[];
const entry = {
  id: "t1",
  equipmentId: "e1",
  status: "scheduled",
  startTime: new Date("2999-01-01"),
  endTime: new Date("2999-01-01"),
} as MaintenanceEntry;

function renderPage(state: object) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={state}>
        <EquipmentPageClient />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("EquipmentPageClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows an empty state with the add action when there is no equipment", () => {
    renderPage({ equipment: [] });
    expect(screen.getByText("No equipment yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add equipment/i })).toBeInTheDocument();
  });

  it("lists equipment with section, unassigned state and upcoming count", () => {
    renderPage({
      equipment,
      entries: [entry],
      sections: [{ id: "sec-1", name: "Dock", siteId: "site-1" }],
    });
    const table = screen.getByRole("table", { name: "Equipment" });
    expect(table.querySelector("thead")).toHaveClass("bg-muted");
    expect(table.querySelector("tbody")).toHaveClass("bg-background");
    expect(
      within(table).getByRole("columnheader", { name: "Actions" }),
    ).toHaveAttribute("scope", "col");
    const press = screen.getByRole("row", { name: /Press/ });
    expect(within(press).getByText("Dock")).toBeInTheDocument();
    expect(within(press).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Lathe/ })).getByText("Unassigned")).toBeInTheDocument();
    const mobileList = screen.getByRole("list", { name: "Equipment" });
    expect(mobileList).toHaveClass("lg:hidden");
    expect(within(mobileList).getByRole("button", { name: "Reorder Press" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Equipment" }).parentElement?.parentElement)
      .toHaveClass("hidden", "lg:block");
  });

  it("shares temporary reordering between equipment cards and the desktop table", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const item = this.closest<HTMLElement>("[data-reorder-id]");
      if (!item?.parentElement) return new DOMRect(0, 0, 800, 400);
      const index = Array.from(item.parentElement.children).indexOf(item);
      return this.tagName === "BUTTON"
        ? new DOMRect(8, index * 64 + 12, 44, 44)
        : new DOMRect(0, index * 64, 800, 64);
    });
    const user = userEvent.setup();
    renderPage({ equipment });
    const mobileList = screen.getByRole("list", { name: "Equipment" });
    const table = screen.getByRole("table", { name: "Equipment" });
    await user.click(within(mobileList).getByRole("button", { name: "Reorder Press" }));
    await user.keyboard(" {ArrowDown} ");
    await waitFor(() => {
      expect(Array.from(mobileList.children).map((row) => row.getAttribute("data-reorder-id")))
        .toEqual(["e2", "e1"]);
      expect(Array.from(table.querySelectorAll("tbody tr")).map((row) => row.getAttribute("data-reorder-id")))
        .toEqual(["e2", "e1"]);
    });
  });

  it("filters by name or category and reports when nothing matches", async () => {
    const user = userEvent.setup();
    renderPage({ equipment });
    const search = screen.getByRole("textbox", { name: /search equipment/i });

    await user.type(search, "tools");
    expect(screen.queryByText("Press")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Equipment" })).getByText("Lathe"))
      .toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(
      within(screen.getByRole("list", { name: "Equipment" }))
        .getByText("No equipment matches your search."),
    ).toBeInTheDocument();
  });

  it("opens the form for a new item or for the selected item", async () => {
    const user = userEvent.setup();
    renderPage({ equipment });

    await user.click(screen.getByRole("button", { name: /add equipment/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("creating");
  });

  it("opens the form pre-filled for the edited equipment", async () => {
    const user = userEvent.setup();
    renderPage({ equipment });
    await user.click(
      within(screen.getByRole("list", { name: "Equipment" }))
        .getByRole("button", { name: /Edit Lathe/ }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("editing Lathe");
  });
});
