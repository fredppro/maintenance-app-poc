import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
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
    const press = screen.getByRole("row", { name: /Press/ });
    expect(within(press).getByText("Dock")).toBeInTheDocument();
    expect(within(press).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Lathe/ })).getByText("Unassigned")).toBeInTheDocument();
  });

  it("filters by name or category and reports when nothing matches", async () => {
    const user = userEvent.setup();
    renderPage({ equipment });
    const search = screen.getByRole("textbox", { name: /search equipment/i });

    await user.type(search, "tools");
    expect(screen.queryByText("Press")).not.toBeInTheDocument();
    expect(screen.getByText("Lathe")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No equipment matches your search.")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Edit Lathe/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("editing Lathe");
  });
});
