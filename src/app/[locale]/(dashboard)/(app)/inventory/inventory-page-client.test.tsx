import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import type { MaintenanceEntry } from "@/features/scheduler/types";
import { InventoryPageClient } from "./inventory-page-client";

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
  it("shows an empty state when no task uses materials", () => {
    renderPage({ entries: [] });
    expect(screen.getByText("No materials yet")).toBeInTheDocument();
  });

  it("totals the same material across tasks", () => {
    renderPage({ entries });
    const oil = screen.getByRole("row", { name: /Oil/ });
    expect(oil).toHaveTextContent("5");
    expect(oil).toHaveTextContent("2");
  });

  it("filters materials by name", async () => {
    const user = userEvent.setup();
    renderPage({ entries });
    await user.type(screen.getByRole("textbox", { name: /search materials/i }), "grea");
    expect(screen.queryByText("Oil")).not.toBeInTheDocument();
    expect(screen.getByText("Grease")).toBeInTheDocument();
  });
});
