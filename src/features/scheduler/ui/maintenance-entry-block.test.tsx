import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import portuguese from "@/i18n/messages/pt-pt.json";
import type { MaintenanceEntry, ViewMode } from "../types";
import { TASK_STATUSES } from "../task-status";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";
import { MaintenanceStatusBadge } from "./maintenance-status-badge";
import { getTaskStatusPresentation } from "./task-status-presentation";
import { semanticTones } from "@/components/ui/semantic-tones";
import { getTimelineDensity } from "../utils/timeline-grid-layout";
import { TIMELINE_ZOOM_LEVELS } from "../utils/timeline-zoom";

vi.mock("./edit-entry-dialog", () => ({
  EditEntryDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" /> : null,
}));

const date = new Date("2026-06-01T08:00:00.000Z");
const task: MaintenanceEntry = {
  id: "task", title: "Replace bearing", description: null, type: "PREVENTIVE",
  equipmentId: "lathe", maintenancePointId: null, status: "scheduled",
  startTime: date, endTime: null, completedAt: null, createdAt: date, updatedAt: date,
};

type Assignment = NonNullable<MaintenanceEntry["assignments"]>[number];

function assignments(names: string[]): Assignment[] {
  return names.map((name, index): Assignment => ({
    id: `assignment-${index}`,
    taskId: task.id,
    workerId: `worker-${index}`,
    startTime: null,
    endTime: null,
    worker: {
      id: `worker-${index}`,
      name,
      email: `worker-${index}@example.test`,
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: date,
    },
  }));
}

function renderEntry(
  entry: MaintenanceEntry,
  { locale = "en", timeZone = "UTC", viewMode = "week", height }: {
    locale?: "en" | "pt-pt";
    timeZone?: string;
    viewMode?: ViewMode;
    height?: number;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : portuguese} timeZone={timeZone}>
      <MaintenanceEntryBlock entry={entry} onDragStart={vi.fn()} viewMode={viewMode} timeZone={timeZone} style={height === undefined ? undefined : { height }} />
    </NextIntlClientProvider>,
  );
}

describe("responsive scheduler entry information", () => {
  it.each((["day", "week", "month", "year"] as const).flatMap((viewMode) =>
    TIMELINE_ZOOM_LEVELS.flatMap((zoom) => [1, 2].map((tracks) => ({ viewMode, zoom, tracks }))),
  ))("adapts $viewMode entries at $zoom% with $tracks track(s) without losing accessible details", ({ viewMode, zoom, tracks }) => {
    const density = getTimelineDensity(viewMode, zoom);
    const height = tracks === 1 ? density.minRowHeight - density.padding * 2 : density.entryHeight;
    const { container } = renderEntry({
      ...task,
      title: "Inspect the production equipment and replace damaged components before returning the machine to operational service",
      endTime: new Date("2026-06-01T10:30:00Z"),
      assignments: assignments(["Alexandriana Morgan", "Beatriz Lima", "Casey Kim"]),
    }, { viewMode, height });
    const button = screen.getByRole("button");
    const title = container.querySelector("[data-slot=timeline-entry-title]");
    const header = container.querySelector("[data-slot=timeline-entry-header]");
    expect(button).toHaveStyle({ height: `${height}px` });
    expect(button).toHaveAccessibleDescription(/Scheduled duration: 2h 30m.*Alexandriana Morgan, Beatriz Lima, Casey Kim/);
    expect(title).toHaveClass("text-sm", "font-normal");
    expect(Boolean(header)).toBe(height >= 72);
    if (height < 56) {
      expect(title).toHaveClass("line-clamp-1");
      expect(container.querySelector("[data-slot=timeline-entry-footer]")).toHaveClass("hidden");
    }
    if (height >= 90) {
      expect(title).toHaveClass("line-clamp-2");
      expect(title).not.toHaveClass("@[6rem]/task:line-clamp-1");
      expect(title).not.toHaveClass("@[5rem]/task:line-clamp-1");
    }
  });

  it.each([44, 48, 54])("prioritizes readable single-line titles in %ipx zoomed entries", (height) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <MaintenanceEntryBlock entry={task} onDragStart={vi.fn()} viewMode="week" style={{ height }} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("[data-slot=timeline-entry-header]")).toBeNull();
    expect(container.querySelector("[data-slot=timeline-entry-title]")).toHaveClass("line-clamp-1", "text-sm", "font-normal");
    expect(container.querySelector("[data-slot=timeline-entry-footer]")).toHaveClass("hidden");
  });

  it("uses enlarged row space for rich details and two-line titles outside week view", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <MaintenanceEntryBlock entry={task} onDragStart={vi.fn()} viewMode="month" style={{ height: 96 }} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("[data-slot=timeline-entry-header]")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=timeline-entry-title]")).toHaveClass("line-clamp-2");
    expect(container.querySelector("[data-slot=timeline-entry-title]")).not.toHaveClass("@[6rem]/task:line-clamp-1");
  });
  it.each([
    ["PREVENTIVE", "Preventive"],
    ["PREDICTIVE", "Predictive"],
    ["CORRECTIVE", "Corrective"],
  ] as const)("identifies %s without using the maintenance type as the status color", (type, label) => {
    const { container } = renderEntry({ ...task, type });
    const typeIndicator = container.querySelector("[data-slot=timeline-entry-type]");
    expect(typeIndicator).toHaveAttribute("title", label);
    expect(typeIndicator).toHaveTextContent(label);
    expect(screen.getByRole("button")).toHaveClass("[&_[data-icon]]:size-4");
    expect(screen.getByRole("button")).toHaveAccessibleDescription(new RegExp(`^${label}`));
    expect(screen.getByRole("button")).toHaveClass(...getTaskStatusPresentation("scheduled").surface.split(" "));
  });

  it.each([
    ["2026-06-01T08:30:00Z", "30m"],
    ["2026-06-01T10:00:00Z", "2h"],
    ["2026-06-01T10:30:00Z", "2h 30m"],
    ["2026-06-03T08:00:00Z", "48h"],
  ])("shows actual scheduled duration for an end of %s", (end, duration) => {
    const { container } = renderEntry({ ...task, endTime: new Date(end) });
    expect(container.querySelector("[data-slot=timeline-entry-duration]")).toHaveTextContent(duration);
    expect(screen.getByRole("button")).toHaveAccessibleDescription(new RegExp(`Scheduled duration: ${duration}`));
    expect(container.querySelector("time")).toHaveAttribute("dateTime", date.toISOString());
  });

  it.each([
    ["2026-03-29T00:00:00Z", "2026-03-29T23:00:00Z", "23h"],
    ["2026-10-24T23:00:00Z", "2026-10-26T00:00:00Z", "25h"],
  ])("uses elapsed duration rather than calendar days across DST from %s", (start, end, duration) => {
    const { container } = renderEntry({
      ...task, startTime: new Date(start), endTime: new Date(end),
    }, { timeZone: "Europe/Lisbon" });
    expect(container.querySelector("[data-slot=timeline-entry-duration]")).toHaveTextContent(duration);
  });

  it.each([null, date])("does not present a fabricated one-hour duration for an end of %s", (endTime) => {
    const { container } = renderEntry({ ...task, endTime });
    expect(container.querySelector("[data-slot=timeline-entry-duration]")).toBeNull();
    expect(screen.getByRole("button")).not.toHaveAccessibleDescription(/Scheduled duration/);
    expect(container.querySelector("time")).toHaveAttribute("dateTime", date.toISOString());
  });

  it("keeps all assignees accessible while stacking two circular avatars and counting the remainder", () => {
    const workers = ["  Alex   Morgan  ", "Beatriz Lima", "Casey Kim"];
    const { container } = renderEntry({ ...task, assignments: assignments(workers) });
    const assignees = container.querySelector("[data-slot=timeline-entry-assignees]");
    expect(assignees).toHaveAttribute("title", workers.join(", "));
    expect(assignees).toHaveClass("@[6rem]/task:flex");
    expect(assignees?.querySelector("[data-slot=avatar-fallback]")).toHaveTextContent("AM");
    expect(assignees).toHaveTextContent("+1");
    const avatars = assignees?.querySelectorAll("[data-slot=avatar]");
    expect(avatars).toHaveLength(2);
    expect(avatars?.[0]).toHaveAttribute("title", workers[0]);
    expect(avatars?.[1]).toHaveAttribute("title", workers[1]);
    expect(avatars?.[1]).toHaveClass("-ml-2", "@[6.5rem]/task:flex");
    expect(screen.getByRole("button")).toHaveAccessibleDescription(/Beatriz Lima, Casey Kim/);
  });

  it.each([1, 2, 5])("preserves the correct total for %i assigned workers", (count) => {
    const { container } = renderEntry({
      ...task, assignments: assignments(Array.from({ length: count }, (_, index) => `Worker ${index + 1}`)),
    });
    const assignees = container.querySelector("[data-slot=timeline-entry-assignees]");
    expect(assignees?.querySelectorAll("[data-slot=avatar]")).toHaveLength(Math.min(2, count));
    if (count > 2) {
      expect(assignees).toHaveTextContent(`+${count - 2}`);
    } else {
      expect(assignees?.textContent).not.toContain("+");
    }
  });

  it("reserves the additional-worker count when a long lead name is revealed", () => {
    const { container } = renderEntry({
      ...task,
      assignments: assignments(["Alexandriana Catherine Montgomery-Smith da Conceição", "Beatriz Lima", "Casey Kim"]),
    }, { height: 90 });
    const count = container.querySelector("[data-slot=timeline-entry-assignee-count]");
    expect(count).toHaveTextContent("+1");
    expect(count).toHaveClass("shrink-0", "tabular-nums");
    expect(count).not.toHaveClass("truncate");
    expect(count?.previousElementSibling).toHaveClass("min-w-0", "truncate");
  });

  it.each([
    ["en", "At 02:00 AM"],
    ["pt-pt", "Às 02:00"],
  ] as const)("distinguishes a start clock time from duration in %s", (locale, label) => {
    const { container } = renderEntry({
      ...task, startTime: new Date("2026-06-01T02:00:00Z"),
    }, { locale });
    for (const time of container.querySelectorAll("time")) {
      expect(time).toHaveTextContent(label);
    }
    expect(container.querySelector("[data-slot=timeline-entry-duration]")).toBeNull();
  });

  it("only reveals the narrow weekly footer when a labeled clock time fits", () => {
    const { container } = renderEntry(task);
    expect(container.querySelector("[data-slot=timeline-entry-footer]")).toHaveClass("hidden", "@[4.25rem]/task:flex");
  });

  it("does not mislabel associations that were not loaded as unassigned", () => {
    const { rerender } = renderEntry(task);
    expect(screen.getByRole("button")).not.toHaveAccessibleDescription(/Unassigned/);
    rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <MaintenanceEntryBlock entry={{ ...task, assignments: [] }} onDragStart={vi.fn()} timeZone="UTC" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleDescription(/Unassigned/);
  });

  it("localizes type, duration and unassigned information and respects the organization timezone", () => {
    const { container } = renderEntry({
      ...task, endTime: new Date("2026-06-01T10:30:00Z"), assignments: [],
    }, { locale: "pt-pt", timeZone: "Europe/Lisbon" });
    expect(container.querySelector("[data-slot=timeline-entry-type]")).toHaveAttribute("title", "Preventiva");
    expect(screen.getByRole("button")).toHaveAccessibleDescription(/Duração prevista: 2h 30m/);
    expect(screen.getByRole("button")).toHaveAccessibleDescription(/Sem atribuições/);
    expect(container.querySelector("time")).toHaveTextContent("09:00");
  });

  it.each(TASK_STATUSES)("identifies %s without adding interactive controls inside the task button", (status) => {
    const { container } = renderEntry({ ...task, status });
    expect(container.querySelector("[data-slot=timeline-entry-status]")).toHaveAttribute("title", messages.Form.statusTypes[status]);
    expect(screen.getByRole("button")).toHaveAccessibleName(new RegExp(messages.Form.statusTypes[status]));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button").querySelector("button, a, [tabindex]")).toBeNull();
  });

  it.each([
    ["scheduled", "lucide-clock-3"],
    ["in-progress", "lucide-circle-dot"],
    ["completed", "lucide-circle-check"],
    ["cancelled", "lucide-circle-x"],
  ] as const)("uses a distinct, lightweight %s icon in both responsive layouts", (status, iconClass) => {
    const { container } = renderEntry({ ...task, status });
    for (const slot of ["timeline-entry-status", "timeline-entry-compact-status"]) {
      const icon = container.querySelector(`[data-slot=${slot}] svg`);
      expect(icon).toHaveClass(iconClass);
      expect(icon).toHaveAttribute("stroke-width", "1.5");
    }
  });

  it.each(["day", "week", "month", "year"] as const)("uses regular-weight titles, round avatars and no divider in %s", (viewMode) => {
    const { container } = renderEntry({ ...task, assignments: assignments(["Alex Morgan"]) }, { viewMode });
    expect(container.querySelector("[data-slot=timeline-entry-title]")).toHaveClass("text-sm", "font-normal");
    expect(container.querySelector("[data-slot=avatar]")).toHaveClass("size-5", "rounded-full");
    expect(container.querySelector("[data-slot=avatar-fallback]")).toHaveClass("rounded-full");
    expect(container.querySelector("[data-slot=timeline-entry-footer]")?.className).not.toMatch(/border-t/);
    expect(screen.getByRole("button")).toHaveClass("rounded-lg");
    expect(container.querySelectorAll("[data-slot=timeline-entry-header]")).toHaveLength(viewMode === "week" ? 1 : 0);
  });
});

describe("maintenance status presentation", () => {
  it.each(TASK_STATUSES)("colors the task and related badge by %s status, independent of maintenance type", (status) => {
    const presentation = getTaskStatusPresentation(status);
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MaintenanceEntryBlock entry={{ ...task, status }} onDragStart={vi.fn()} />
        <MaintenanceStatusBadge status={status} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-maintenance-status", status);
    expect(button).toHaveClass(...presentation.surface.split(" "));
    expect(button).not.toHaveClass("bg-background", "bg-primary");
    expect(screen.getByText(messages.Form.statusTypes[status], { selector: "[data-slot=badge]" }))
      .toHaveClass(...semanticTones[presentation.tone].badge.split(" "));
    expect(screen.getByText(messages.Form.statusTypes[status], { selector: "[data-slot=badge]" }))
      .toHaveAttribute("data-variant", presentation.tone);
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MaintenanceEntryBlock entry={{ ...task, status, type: "CORRECTIVE" }} onDragStart={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button")).toHaveClass(...presentation.surface.split(" "));
  });

  it("uses a neutral style for an unknown status, never generic primary blue", () => {
    const presentation = getTaskStatusPresentation("unrecognized");
    expect(presentation.surface).toEqual(getTaskStatusPresentation("cancelled").surface);
    expect(presentation.tone).toEqual(getTaskStatusPresentation("cancelled").tone);
    expect(presentation.Icon).not.toBe(getTaskStatusPresentation("cancelled").Icon);
    expect(presentation.surface).not.toContain("bg-primary");
  });

  it("preserves keyboard opening, drag behavior and timeline sizing", async () => {
    const user = userEvent.setup();
    const onDragStart = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MaintenanceEntryBlock
          entry={task} onDragStart={onDragStart}
          style={{ position: "absolute", left: "10%", width: "20%", height: 40 }}
        />
      </NextIntlClientProvider>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("draggable", "true");
    expect(button).toHaveStyle({ left: "10%", width: "20%", height: "40px" });
    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(button, { dataTransfer });
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(dataTransfer.effectAllowed).toBe("move");
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
