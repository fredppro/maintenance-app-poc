import type { AnchorHTMLAttributes } from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "../store/scheduler-provider";
import type { Equipment, MaintenanceEntry } from "../types";
import { SchedulerDashboard } from "./scheduler-dashboard";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: vi.fn() }),
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
vi.mock("./timeline-grid", () => ({ TimelineGrid: () => null }));

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
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={{ equipment: equipmentItems, entries }}>
        <SchedulerDashboard />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("SchedulerDashboard maintenance alerts", () => {
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
      name: "Review task",
    });
    expect(overdueLink).toHaveTextContent("Review task");
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
