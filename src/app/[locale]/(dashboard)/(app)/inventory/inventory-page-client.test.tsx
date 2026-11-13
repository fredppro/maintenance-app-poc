import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import type { MaintenanceEntry } from "@/features/scheduler/types";
import { InventoryPageClient } from "./inventory-page-client";

const { getInventoryItemsMock, createInventoryItemMock, receiveInventoryMock } = vi.hoisted(() => ({
  getInventoryItemsMock: vi.fn(),
  createInventoryItemMock: vi.fn(),
  receiveInventoryMock: vi.fn(),
}));

vi.mock("@/features/scheduler/server/actions", () => ({
  getInventoryItems: getInventoryItemsMock,
  getMaintenanceSuppliers: vi.fn().mockResolvedValue([]),
  createInventoryItem: createInventoryItemMock,
  receiveInventory: receiveInventoryMock,
  consumeInventory: vi.fn(),
}));

const stockItem = {
  id: "stock-1", name: "Bearing", reference: null, unit: "PC",
  onHand: 5, reorderPoint: 1, vendor: null,
};
const secondStockItem = {
  id: "stock-2", name: "Oil", reference: "O-12", unit: "L",
  onHand: 2, reorderPoint: 3, vendor: { id: "supplier-1", name: "Acme" },
};

const material = (name: string, quantity: number) =>
  ({ name, reference: null, unit: "L", quantity, price: null }) as never;
const entries = [
  { id: "t1", materials: [material("Oil", 2), material("Grease", 1)] },
  { id: "t2", materials: [material("Oil", 3)] },
] as unknown as MaintenanceEntry[];

function renderPage(state: object) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={state}>
        <InventoryPageClient />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("InventoryPageClient", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    getInventoryItemsMock.mockReset().mockResolvedValue([]);
    createInventoryItemMock.mockReset().mockResolvedValue({ id: "created-item" });
    receiveInventoryMock.mockReset().mockResolvedValue(undefined);
  });

  it("keeps one shared search toolbar stable and filters both tabs, including empty results", async () => {
    getInventoryItemsMock.mockResolvedValue([stockItem, secondStockItem]);
    const user = userEvent.setup();
    const { container } = renderPage({ entries: [] });
    const toolbar = container.querySelector('[data-slot="inventory-toolbar"]');
    const search = screen.getByRole("textbox", { name: "Search materials…" });
    const stockList = await screen.findByRole("list", { name: "Stock catalog" });

    expect(toolbar).toContainElement(search);
    expect(within(toolbar as HTMLElement).getByRole("button", { name: "Add stock item" }))
      .toBeInTheDocument();
    await user.type(search, "acme");
    expect(within(stockList).getByText("Oil")).toBeInTheDocument();
    expect(within(stockList).queryByText("Bearing")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Planned materials" }));
    expect(container.querySelector('[data-slot="inventory-toolbar"]')).toBe(toolbar);
    expect(screen.getByRole("textbox", { name: "Search materials…" })).toHaveValue("acme");
    expect(toolbar?.querySelector("button")).toHaveAttribute("aria-hidden", "true");
    expect(toolbar?.querySelector("button")).toBeDisabled();
    expect(
      within(screen.getByRole("list", { name: "Planned materials" }))
        .getByText("No results match your search."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add stock item" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Search materials…" }));
    expect(screen.getByText("No materials yet")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search materials…" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add stock item" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Stock catalog" }));
    expect(screen.getByRole("button", { name: "Add stock item" })).toBeInTheDocument();
  });

  it("uses the shared scrolling body and anchored actions when creating stock", async () => {
    const user = userEvent.setup();
    renderPage({ entries: [] });
    await user.click(screen.getByRole("button", { name: "Add stock item" }));
    const dialog = screen.getByRole("dialog", { name: "Add stock item" });
    const save = within(dialog).getByRole("button", { name: "Save item" });
    expect(dialog).toHaveClass("sm:rounded-sheet", "overflow-hidden");
    expect(dialog.querySelector("[data-slot=sheet-body]")).not.toContainElement(save);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "New bearing");
    await user.click(save);
    await waitFor(() => expect(createInventoryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New bearing", unit: "PC", openingStock: 0 }),
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["Receive stock", "Record consumption"])(
    "uses the same panel and contained scrolling for %s",
    async (action) => {
      getInventoryItemsMock.mockResolvedValue([stockItem]);
      const user = userEvent.setup();
      renderPage({ entries: [] });
      const stockList = await screen.findByRole("list", { name: "Stock catalog" });
      await user.click(await within(stockList).findByRole("button", { name: action }));
      const dialog = screen.getByRole("dialog", { name: action });
      const body = dialog.querySelector("[data-slot=sheet-body]");
      expect(dialog).toHaveAttribute("data-variant", "inset");
      expect(body).toHaveClass("overflow-y-auto", "min-h-0");
      expect(body).not.toContainElement(within(dialog).getByRole("button", { name: "Cancel" }));
      await user.type(within(dialog).getByLabelText("Quantity"), "2");
      if (action === "Receive stock") {
        await user.click(within(dialog).getByRole("button", { name: "Record receipt" }));
        await waitFor(() => expect(receiveInventoryMock).toHaveBeenCalledWith("stock-1", { quantity: 2, note: null }));
      } else {
        expect(within(dialog).getByRole("button", { name: "Record consumption" })).toBeDisabled();
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    },
  );

  it("shares temporary stock reordering between mobile cards and the desktop table", async () => {
    getInventoryItemsMock.mockResolvedValue([stockItem, secondStockItem]);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const item = this.closest<HTMLElement>("[data-reorder-id]");
      if (!item?.parentElement) return new DOMRect(0, 0, 800, 400);
      const index = Array.from(item.parentElement.children).indexOf(item);
      return this.tagName === "BUTTON"
        ? new DOMRect(8, index * 64 + 12, 44, 44)
        : new DOMRect(0, index * 64, 800, 64);
    });
    const user = userEvent.setup();
    renderPage({ entries: [] });
    const mobileList = await screen.findByRole("list", { name: "Stock catalog" });
    const table = await screen.findByRole("table", { name: "Stock catalog" });
    expect(within(mobileList).getByText("Acme")).toBeInTheDocument();
    expect(within(mobileList).getByText("Reorder")).toBeInTheDocument();
    await user.click(within(mobileList).getByRole("button", { name: "Reorder Bearing" }));
    await user.keyboard(" {ArrowDown} ");
    await waitFor(() => {
      expect(Array.from(mobileList.children).map((row) => row.getAttribute("data-reorder-id")))
        .toEqual(["stock-2", "stock-1"]);
      expect(Array.from(table.querySelectorAll("tbody tr")).map((row) => row.getAttribute("data-reorder-id")))
        .toEqual(["stock-2", "stock-1"]);
    });
  });

  it("shows the planned-materials empty state on its own tab", async () => {
    const user = userEvent.setup();
    renderPage({ entries: [] });
    await user.click(screen.getByRole("tab", { name: "Planned materials" }));
    expect(screen.getByText("No materials yet")).toBeInTheDocument();
  });

  it("totals the same material across tasks", async () => {
    const user = userEvent.setup();
    renderPage({ entries });
    await user.click(screen.getByRole("tab", { name: "Planned materials" }));
    const table = screen.getByRole("table", { name: "Planned materials" });
    const mobileList = screen.getByRole("list", { name: "Planned materials" });
    expect(table.querySelector("tbody")).toHaveClass("bg-background");
    expect(mobileList).toHaveClass("lg:hidden");
    const oilRow = within(mobileList).getByText("Oil").closest("li");
    expect(oilRow).not.toBeNull();
    expect(within(oilRow as HTMLElement).getByText(/Tasks:/)).toHaveTextContent("2");
    expect(within(mobileList).queryByRole("button", { name: /reorder/i })).not.toBeInTheDocument();
    const oil = screen.getByRole("row", { name: /Oil/ });
    expect(oil).toHaveTextContent("5");
    expect(oil).toHaveTextContent("2");
  });

  it("filters materials by name", async () => {
    const user = userEvent.setup();
    renderPage({ entries });
    await user.click(screen.getByRole("tab", { name: "Planned materials" }));
    await user.type(screen.getByRole("textbox", { name: /search materials/i }), "grea");
    const mobileList = screen.getByRole("list", { name: "Planned materials" });
    expect(within(mobileList).queryByText("Oil")).not.toBeInTheDocument();
    expect(within(mobileList).getByText("Grease")).toBeInTheDocument();
  });
});
