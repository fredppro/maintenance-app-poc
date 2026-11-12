import type { AnchorHTMLAttributes } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "../store/scheduler-provider";
import type { Equipment, MaintenanceEntry } from "../types";
import { SchedulerDashboard } from "./scheduler-dashboard";

const navigation = vi.hoisted(() => ({
  query: "",
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => navigation.router,
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./scheduler-toolbar", () => ({ SchedulerToolbar: () => null }));
vi.mock("./timeline-grid", () => ({
  TimelineGrid: ({ searchQuery }: { searchQuery: string }) => (
    <output aria-label="Timeline search">{searchQuery}</output>
  ),
}));
vi.mock("./add-entry-dialog", () => ({
  AddEntryDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Schedule Maintenance" /> : null,
}));
vi.mock("./edit-entry-dialog", () => ({
  EditEntryDialog: ({
    entry,
    open,
    onOpenChange,
  }: {
    entry: MaintenanceEntry;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => open ? (
    <div role="dialog" aria-label={entry.title}>
      <button onClick={() => onOpenChange(false)}>Close task</button>
    </div>
  ) : null,
}));

const equipment: Equipment = {
  id: "equipment-1",
  name: "Workshop Lathe",
  category: "Tools",
  imageFileId: null,
  sectionId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function task(
  id: string,
  title: string,
  startTime: Date,
): MaintenanceEntry {
  return {
    id,
    title,
    description: null,
    type: "PREVENTIVE",
    startTime,
    endTime: null,
    equipmentId: equipment.id,
    maintenancePointId: null,
    status: "scheduled",
    completedAt: null,
    assignments: [],
    materials: [],
    createdAt: startTime,
    updatedAt: startTime,
  };
}

function renderDashboard(
  entries: MaintenanceEntry[] = [],
  equipmentItems: Equipment[] = [equipment],
  searchQuery = "",
) {
  const renderTree = () => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={{ equipment: equipmentItems, entries, searchQuery }}>
        <SchedulerDashboard />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>
  );
  const view = render(renderTree());
  return {
    ...view,
    selectTask: (id: string) => {
      navigation.query = `taskId=${encodeURIComponent(id)}`;
      view.rerender(renderTree());
    },
  };
}

describe("SchedulerDashboard maintenance alerts", () => {
  beforeEach(() => {
    navigation.query = "";
    navigation.router.replace.mockReset();
  });

  it("uses the shared header search query without rendering a second search system", () => {
    renderDashboard([
      task("upcoming-1", "Annual service", new Date("2099-01-01T09:00:00.000Z")),
    ], [equipment], "annual");
    expect(screen.getByLabelText("Timeline search")).toHaveTextContent("annual");
    expect(screen.queryByRole("textbox", {
      name: "Search tasks, equipment or workers…",
    })).not.toBeInTheDocument();
  });
  it("opens a linked task even when the current search excludes it", async () => {
    const user = userEvent.setup();
    const { selectTask } = renderDashboard([
      task("upcoming-1", "Annual service", new Date("2099-01-01T09:00:00.000Z")),
      task("overdue-1", "Bearing replacement", new Date("2020-01-01T09:00:00.000Z")),
    ], [equipment], "annual");

    selectTask("overdue-1");

    expect(screen.getByRole("dialog", { name: "Bearing replacement" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline search")).toHaveTextContent("annual");

    await user.click(screen.getByRole("button", { name: "Close task" }));
    expect(navigation.router.replace).toHaveBeenCalledWith("/");
  });

  it("makes scheduling available without requiring an empty timeline cell", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "Schedule Maintenance" }));
    expect(screen.getByRole("dialog", { name: "Schedule Maintenance" })).toBeInTheDocument();
  });

  it("uses shadcn alert composition and gives task links a clear action label", () => {
    renderDashboard([
      task("overdue-1", "TEST EMAIL", new Date("2020-01-01T09:00:00.000Z")),
      task("overdue-2", "Second inspection", new Date("2021-01-01T09:00:00.000Z")),
      task("upcoming-1", "Annual service", new Date("2099-01-01T09:00:00.000Z")),
    ]);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].querySelector(":scope > svg")).toBeInTheDocument();
    expect(
      within(alerts[0]).getByRole("heading", {
        level: 2,
        name: "Overdue maintenance",
      }),
    ).toBeInTheDocument();
    expect(within(alerts[0]).getByText("2 scheduled tasks are overdue")).toBeInTheDocument();

    expect(within(alerts[0]).queryByText("TEST EMAIL")).not.toBeInTheDocument();
    const overdueLink = within(alerts[0]).getByRole("link", {
      name: "Open oldest task",
    });
    expect(overdueLink).toHaveTextContent("Open oldest task");
    expect(overdueLink).not.toHaveTextContent("TEST EMAIL");
    expect(overdueLink).toHaveAttribute("data-slot", "button");
    expect(alerts[0]).toHaveTextContent("Workshop Lathe");
    expect(alerts[0]).not.toHaveTextContent("8:00");

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Next maintenance",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Annual service")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Review task: Annual service",
      }),
    ).toHaveAttribute("href", "/?taskId=upcoming-1");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("keeps the alert compact and omits the task title while preserving equipment context", () => {
    const longTitle = "Inspect the production line motor and replace worn components";
    const longEquipmentName =
      "Packaging line motor assembly in the north production building";
    const longEquipment = {
      ...equipment,
      id: "long-equipment",
      name: longEquipmentName,
    };
    renderDashboard([
      {
        ...task("overdue-1", longTitle, new Date("2020-01-01T09:00:00.000Z")),
        equipmentId: "long-equipment",
      },
    ], [longEquipment]);

    const region = screen.getByRole("region", { name: "Maintenance summary" });
    const alert = within(region).getAllByRole("alert")[0];
    expect(within(alert).queryByText(longTitle)).not.toBeInTheDocument();
    expect(alert.textContent).toContain(longEquipmentName);
    expect(within(alert).getByRole("link", { name: "Review task" })).toHaveAttribute(
      "href",
      "/?taskId=overdue-1",
    );
  });

  it("shows a clear empty state without offering an irrelevant action", () => {
    renderDashboard();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Next maintenance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
