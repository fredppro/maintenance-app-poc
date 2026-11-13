import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import portuguese from "@/i18n/messages/pt-pt.json";
import { SchedulerStoreProvider, useSchedulerStore } from "../store/scheduler-provider";
import type { SchedulerInitialState } from "../store/scheduler-store";
import type { Equipment, MaintenanceEntry } from "../types";
import { SchedulerToolbar } from "./scheduler-toolbar";
import { TimelineGrid } from "./timeline-grid";
import { getTimelineMinimumZoom, TIMELINE_ZOOM_LEVELS } from "../utils/timeline-zoom";
import { getTimelineFitZoom } from "../utils/timeline-grid-layout";

const server = vi.hoisted(() => ({ moveTask: vi.fn(), deleteEquipment: vi.fn(), error: vi.fn() }));
vi.mock("../server/actions", () => ({
  moveTask: server.moveTask,
  deleteEquipment: server.deleteEquipment,
}));
vi.mock("sonner", () => ({ toast: { error: server.error } }));
vi.mock("./equipment-dialog", () => ({ EquipmentDialog: () => null }));
vi.mock("./add-entry-dialog", () => ({
  AddEntryDialog: ({ open, selectedCell }: {
    open: boolean;
    selectedCell: { date: Date; equipmentId: string } | null;
  }) => open ? (
    <div role="dialog" aria-label="Create task">
      <output>{selectedCell?.date.toISOString()}</output>
      <output>{selectedCell?.equipmentId}</output>
    </div>
  ) : null,
}));
vi.mock("./edit-entry-dialog", () => ({
  EditEntryDialog: ({ open, entry }: { open: boolean; entry: MaintenanceEntry }) =>
    open ? <div role="dialog" aria-label={entry.title} /> : null,
}));

const now = new Date("2026-10-07T08:30:00Z");
const equipment: Equipment = {
  id: "lathe", name: "Workshop lathe", category: "Tools", sectionId: null,
  imageFileId: null, createdAt: now,
};
const task: MaintenanceEntry = {
  id: "inspection", title: "Inspect motor and replace worn bearings",
  description: null, type: "PREVENTIVE", equipmentId: "lathe",
  maintenancePointId: null, status: "scheduled", completedAt: null,
  startTime: new Date("2026-10-07T08:00:00Z"), endTime: new Date("2026-10-07T10:00:00Z"),
  createdAt: now, updatedAt: now,
};
let viewportWidth = 800;
let weekColumnWidth = 96;

function RefreshTasks() {
  const setEntries = useSchedulerStore((state) => state.setEntries);
  const setLoading = useSchedulerStore((state) => state.setLoading);
  return (
    <>
      <button onClick={() => setEntries([{ ...task, title: "Updated inspection" }])}>Refresh tasks</button>
      <button onClick={() => setLoading(true)}>Start refresh</button>
      <button onClick={() => setLoading(false)}>Finish refresh</button>
    </>
  );
}

function renderTimeline(initialState: SchedulerInitialState = {}, locale = "en", clock = now) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : portuguese}
      timeZone="UTC"
      now={clock}
    >
      <SchedulerStoreProvider initialState={{
        equipment: [equipment], entries: [task], currentDate: now, timeZone: "UTC", ...initialState,
      }}>
        <SchedulerToolbar />
        <TimelineGrid />
        <RefreshTasks />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

function cells(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-slot=timeline-slot-cell]"));
}

function mockTimelineRectangles() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.slot === "timeline-corner") return new DOMRect(0, 0, 200, 64);
    if (this.dataset.slot === "timeline-axis") return new DOMRect(200, 0, parseFloat(this.style.width), 64);
    if (this.firstElementChild?.getAttribute("data-slot") === "timeline-corner") return new DOMRect(0, 0, 800, 64);
    if (this.dataset.slot === "timeline-equipment-row") {
      const grid = this.closest<HTMLElement>("[data-slot=timeline-scroll]")!;
      const rows = Array.from(grid.querySelectorAll<HTMLElement>("[data-slot=timeline-equipment-row]"));
      const height = (row: HTMLElement) => parseFloat(row.querySelector<HTMLElement>("[data-slot=timeline-slot-cell]")!.style.height);
      const precedingHeight = rows.slice(0, rows.indexOf(this)).reduce((sum, row) => sum + height(row), 0);
      return new DOMRect(0, 64 + precedingHeight - grid.scrollTop, 800, height(this));
    }
    return new DOMRect();
  });
}

describe("scheduler calendar refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    server.moveTask.mockReset();
    server.error.mockReset();
    viewportWidth = 800;
    weekColumnWidth = 96;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.slot === "timeline-scroll") return viewportWidth;
      if (this.dataset.slot === "timeline-corner") return 200;
      if (this.dataset.slot === "timeline-axis") {
        const mode = this.closest("[data-view]")?.getAttribute("data-view");
        const widths: Record<string, number> = { day: 80, week: weekColumnWidth, month: 80, year: 96 };
        return this.querySelectorAll("[data-slot=timeline-slot-header]").length * widths[mode ?? "week"];
      }
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(["day", "week", "month", "year"] as const)("zooms %s cells through all allowed presets without changing the view or loading", (viewMode) => {
    const { container } = renderTimeline({ viewMode, zoomLevel: 50 });
    const scroll = container.querySelector("[data-slot=timeline-scroll]");
    const dates = Array.from(container.querySelectorAll("[data-slot=timeline-slot-header]"), (header) => header.getAttribute("aria-label"));
    const minimum = getTimelineMinimumZoom(getTimelineFitZoom(viewMode, dates.length, viewportWidth, 200));
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(Number(scroll?.getAttribute("data-zoom"))).toBeCloseTo(minimum);
    for (const zoom of TIMELINE_ZOOM_LEVELS.filter((level) => level > minimum)) {
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(scroll).toHaveAttribute("data-zoom", String(zoom));
      expect(scroll).toHaveAttribute("data-view", viewMode);
      expect(scroll).toHaveAttribute("aria-busy", "false");
      expect(screen.getByText(`${zoom}%`)).toBeInTheDocument();
      expect(Array.from(container.querySelectorAll("[data-slot=timeline-slot-header]"), (header) => header.getAttribute("aria-label"))).toEqual(dates);
      const header = container.querySelector<HTMLElement>("[data-slot=timeline-slot-header]");
      expect(cells(container)[0].style.minWidth).toBe(header?.style.minWidth);
    }
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(scroll).toHaveAttribute("data-zoom", "175");
  });

  it("supports keyboard zoom without changing the selected period", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { container } = renderTimeline();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    act(() => zoomIn.focus());
    await user.keyboard("{Enter}");
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "125");
    act(() => screen.getByRole("button", { name: "Zoom out" }).focus());
    await user.keyboard(" ");
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "100");
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-view", "week");
  });

  it("preserves the visible time center and equipment offset while zooming both axes", () => {
    mockTimelineRectangles();
    const { container } = renderTimeline({
      zoomLevel: 200,
      equipment: [equipment, { ...equipment, id: "press", name: "Hydraulic press" }],
    });
    const scroll = container.querySelector<HTMLElement>("[data-slot=timeline-scroll]")!;
    scroll.scrollLeft = 250;
    scroll.scrollTop = 205;
    fireEvent.scroll(scroll);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(scroll).toHaveAttribute("data-zoom", "150");
    expect(scroll.scrollLeft).toBeCloseTo(112.5);
    expect(scroll.scrollTop).toBeCloseTo(153.75);
  });

  it("fits the period without blank space before resuming the preset sequence", () => {
    mockTimelineRectangles();
    const { container } = renderTimeline({ zoomLevel: 50 });
    const scroll = container.querySelector<HTMLElement>("[data-slot=timeline-scroll]")!;
    expect(Number(scroll.dataset.zoom)).toBeCloseTo(600 / 672 * 100);
    expect(container.querySelector("[data-slot=timeline-axis]")).toHaveStyle({ width: "600px" });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(scroll).toHaveAttribute("data-zoom", "100");
    expect(scroll.scrollLeft).toBeCloseTo(36);
  });

  it("stops a fluid weekly view at its full available width", () => {
    viewportWidth = 1200;
    const { container } = renderTimeline();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(container.querySelector("[data-slot=timeline-axis]")).toHaveStyle({ width: "1000px" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "125");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "100");
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("lands on an exact fractional fit and returns to the next normal preset", () => {
    const { container } = renderTimeline({ viewMode: "year" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "75");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    const scroll = container.querySelector<HTMLElement>("[data-slot=timeline-scroll]")!;
    expect(Number(scroll.dataset.zoom)).toBeCloseTo(600 / 1152 * 100);
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByTitle("Fit timeline to available width (52.1%)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(container.querySelector("[data-slot=timeline-axis]")).toHaveStyle({ width: "600px" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(scroll).toHaveAttribute("data-zoom", "75");
    expect(scroll).toHaveAttribute("data-view", "year");
    expect(scroll).toHaveAttribute("aria-busy", "false");
  });

  it("localizes the fit label and its actual percentage", () => {
    renderTimeline({ viewMode: "year", zoomLevel: "fit" }, "pt-pt");
    expect(screen.getByText("Ajustar")).toBeInTheDocument();
    expect(screen.getByTitle(/Ajustar a linha temporal à largura disponível \(52,1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diminuir zoom" })).toBeDisabled();
  });

  it("keeps Fit responsive through resizing and view and period changes", () => {
    const { container } = renderTimeline({ viewMode: "year", zoomLevel: "fit" });
    const axis = () => container.querySelector("[data-slot=timeline-axis]");
    expect(axis()).toHaveStyle({ width: "600px" });
    viewportWidth = 1100;
    fireEvent(window, new Event("resize"));
    expect(axis()).toHaveStyle({ width: "900px" });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-zoom", "50");
    viewportWidth = 2100;
    fireEvent(window, new Event("resize"));
    expect(axis()).toHaveStyle({ width: "1900px" });
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(axis()).toHaveStyle({ width: "1900px" });
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=timeline-scroll]")).toHaveAttribute("data-view", "month");
  });

  it.each(([
    ["day", 10, "2026-10-07T10:00:00.000Z"],
    ["week", 3, "2026-10-08T00:00:00.000Z"],
    ["month", 7, "2026-10-08T00:00:00.000Z"],
    ["year", 10, "2026-11-01T00:00:00.000Z"],
  ] as const).flatMap(([viewMode, index, iso]) => ([50, 100, 200] as const).map((zoomLevel) => ({
    viewMode, index, iso, zoomLevel,
  }))))("preserves keyboard creation in $viewMode at $zoomLevel%", async ({ viewMode, index, iso, zoomLevel }) => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { container } = renderTimeline({ viewMode, zoomLevel });
    const cell = cells(container)[index];
    expect(cell).toHaveAttribute("type", "button");
    expect(cell).toHaveAccessibleName(/Add a maintenance task for Workshop lathe/);
    expect(cell).toHaveClass("focus-visible:ring-inset");
    expect(cell.firstElementChild).toHaveClass("pointer-coarse:opacity-100", "group-focus-visible/cell:opacity-100", "rounded-lg");
    cell.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Create task" });
    expect(dialog).toHaveTextContent(iso);
    expect(dialog).toHaveTextContent("lathe");
    expect(server.moveTask).not.toHaveBeenCalled();
  });

  it.each((["month", "year"] as const).flatMap((viewMode) =>
    TIMELINE_ZOOM_LEVELS.flatMap((zoomLevel) => [false, true].map((isLoading) => ({ viewMode, zoomLevel, isLoading }))),
  ))("uses single-edge $viewMode dividers at $zoomLevel%, loading: $isLoading", ({ viewMode, zoomLevel, isLoading }) => {
    const { container } = renderTimeline({ viewMode, zoomLevel, isLoading });
    const dividers = container.querySelectorAll(".border-r-border-strong");
    expect(dividers.length).toBeGreaterThan(0);
    for (const divider of dividers) {
      expect(divider).toHaveClass("border-r");
      expect(divider).not.toHaveClass("border-r-2");
    }
    expect(container.querySelector("[data-slot=timeline-slot-header]")).toHaveClass("border-t-2");
    expect(cells(container)[0]).not.toHaveClass("border-t-2");
  });

  it("matches the blue today header and subtle weekend treatment without adding a weekly cursor or time band", () => {
    const { container } = renderTimeline({ currentDate: new Date("2026-10-10T12:00:00Z") });
    const headers = container.querySelectorAll<HTMLElement>("[data-slot=timeline-slot-header]");
    const rowCells = cells(container);
    expect(headers[2]).toHaveAttribute("aria-current", "date");
    expect(headers[2]).toHaveTextContent("Today");
    expect(headers[2]).toHaveClass("bg-primary-muted/50", "border-t-primary");
    expect(headers[2]).toHaveStyle({ minHeight: "64px" });
    expect(headers[2].querySelector(".bg-foreground")).not.toBeInTheDocument();
    expect(headers[2].querySelector(".text-sm")).toHaveTextContent("7");
    expect(headers[2].firstElementChild).toHaveClass("text-xs", "font-normal");
    expect(within(headers[2]).getByText("Today")).toHaveClass("text-xs", "leading-4");
    expect(within(headers[2]).getByText("Today")).not.toHaveClass("uppercase");
    expect(rowCells[2]).toHaveClass("bg-primary-muted/10");
    expect(rowCells[2]).toHaveAttribute("data-current", "true");
    expect(rowCells[5]).toHaveAttribute("data-weekend", "true");
    expect(rowCells[5]).toHaveClass("bg-muted/15");
    expect(rowCells[5]).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Open Inspect motor/ })).toHaveAttribute("data-maintenance-status", "scheduled");
    expect(container.querySelector("[data-slot=timeline-now-line]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-slot=timeline-now-label]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-slot=timeline-axis]")).not.toHaveClass("pb-6");
  });

  it("keeps a current weekend date legible and interactive", () => {
    vi.setSystemTime("2026-10-10T12:00:00Z");
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC" now={new Date()}>
        <SchedulerStoreProvider initialState={{ equipment: [equipment], currentDate: new Date(), timeZone: "UTC" }}>
          <TimelineGrid />
        </SchedulerStoreProvider>
      </NextIntlClientProvider>,
    );
    const header = container.querySelector("[data-slot=timeline-slot-header][data-current=true]");
    expect(header).toHaveAttribute("data-weekend", "true");
    expect(header).toHaveTextContent("Sat");
    expect(header).toHaveTextContent("Today");
    expect(header).toHaveClass("border-t-primary", "bg-primary-muted/50");
    expect(header?.querySelector(".bg-primary-muted")).toHaveClass("text-primary-text");
    const cell = container.querySelector("[data-slot=timeline-slot-cell][data-current=true]")!;
    fireEvent.click(cell);
    expect(screen.getByRole("dialog")).toHaveTextContent("2026-10-10T00:00:00.000Z");
  });

  it("grows overlapping weekly tracks and uses a full inset plus target only for available cells", () => {
    const { container } = renderTimeline({ entries: [task, { ...task, id: "second", title: "Second inspection" }] });
    const buttons = screen.getAllByRole("button", { name: /^Open .*status:/ });
    expect(buttons[0]).toHaveStyle({ top: "4px", height: "72px" });
    expect(buttons[1]).toHaveStyle({ top: "84px", height: "72px" });
    expect(cells(container)[0]).toHaveStyle({ height: "160px" });
    expect(buttons[0]).toHaveClass("gap-0.5", "py-1");
    expect(within(buttons[0]).getByText(task.title)).toHaveClass("line-clamp-2", "text-sm");
    expect(buttons[0]).toHaveTextContent("08:00");
    expect(cells(container)[0].firstElementChild).toHaveClass("inset-2", "border-dashed", "rounded-lg");
    expect(cells(container)[0]).not.toHaveTextContent("Add task");
    expect(cells(container)[2].firstElementChild).toBeNull();
  });

  it("positions the daily clock in the usable viewport and Today refocuses even on the same date", () => {
    const { container } = renderTimeline({ viewMode: "day" });
    const scroll = container.querySelector("[data-slot=timeline-scroll]")!;
    expect(scroll.scrollLeft).toBeCloseTo(380);
    scroll.scrollLeft = 0;
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(scroll.scrollLeft).toBeCloseTo(380);
  });

  it("keeps the whole current weekly column visible beside the pinned equipment axis on narrow screens", () => {
    viewportWidth = 310;
    weekColumnWidth = 96;
    const { container } = renderTimeline();
    const scroll = container.querySelector("[data-slot=timeline-scroll]")!;
    expect(scroll.scrollLeft).toBeCloseTo(185);
    const columnLeft = 2 * weekColumnWidth - scroll.scrollLeft;
    expect(columnLeft).toBeGreaterThanOrEqual(0);
    expect(columnLeft + weekColumnWidth).toBeLessThanOrEqual(viewportWidth - 200);
  });

  it.each(["day", "week", "month", "year"] as const)("keeps %s empty feedback below the rows without grid or cursor extensions", (viewMode) => {
    const { container } = renderTimeline({ viewMode, entries: [] });
    const empty = screen.getByRole("status");
    const feedback = empty.parentElement!;
    expect(empty).toHaveClass("w-full", "min-w-0");
    expect(empty).toHaveAttribute("data-size", "sm");
    expect(feedback).toHaveAttribute("data-slot", "timeline-feedback");
    expect(feedback).toHaveClass("sticky", "w-[100cqw]");
    expect(feedback).not.toHaveClass("absolute");
    const equipmentRow = cells(container)[0].parentElement!.parentElement!;
    expect(equipmentRow.nextElementSibling).toBe(feedback);
    expect(feedback.querySelector(".border-r, .border-l, .absolute")).toBeNull();
    expect(container.querySelector("[data-slot=timeline-footer]")).toBeNull();
    const lines = container.querySelectorAll("[data-slot=timeline-now-line]");
    expect(lines).toHaveLength(viewMode === "day" ? 1 : 0);
    for (const line of lines) expect(equipmentRow).toContainElement(line as HTMLElement);
  });

  it.each([
    ["day", 72, 64, "min-w-20"],
    ["week", 80, 72, "min-w-24"],
    ["month", 72, 64, "min-w-20"],
    ["year", 72, 64, "min-w-24"],
  ] as const)("uses balanced %s cells with readable titles and no filler grid", (viewMode, rowHeight, taskHeight, widthClass) => {
    const { container } = renderTimeline({ viewMode });
    expect(cells(container)[0]).toHaveStyle({ height: `${rowHeight}px` });
    expect(cells(container)[0]).toHaveClass(widthClass);
    const taskButton = screen.getByRole("button", { name: /Open Inspect motor/ });
    expect(taskButton).toHaveStyle({ height: `${taskHeight}px` });
    expect(within(taskButton).getByText(task.title)).toHaveClass("text-sm");
    if (viewMode === "month" || viewMode === "year") {
      expect(within(taskButton).getByText(task.title)).toHaveClass("line-clamp-2", "whitespace-normal");
    }
    if (viewMode === "day") {
      expect(taskButton).toHaveTextContent("08:00");
      expect(taskButton).toHaveAttribute("data-density", "comfortable");
      expect(within(taskButton).getByText(task.title)).toHaveClass("line-clamp-2", "@[5rem]/task:line-clamp-1");
    }
    if (viewMode !== "week") {
      expect(container.querySelector("[data-slot=timeline-slot-header]")).toHaveStyle({ minHeight: "56px" });
    }
    expect(container.querySelector("[data-slot=timeline-footer]")).toBeNull();
    expect(container.querySelector("[data-slot=timeline-feedback]")).toBeNull();
  });

  it.each([
    ["day", 56],
    ["week", 64],
    ["month", 56],
    ["year", 56],
  ] as const)("uses the same %s header height while loading and loaded", (viewMode, height) => {
    const { container } = renderTimeline({ viewMode });
    expect(container.querySelector("[data-slot=timeline-slot-header]")).toHaveStyle({ minHeight: `${height}px` });
    fireEvent.click(screen.getByRole("button", { name: "Start refresh" }));
    const skeletonHeader = container.querySelector("[data-slot=timeline-skeleton-header]");
    expect(skeletonHeader?.firstElementChild).toHaveStyle({ height: `${height}px` });
  });

  it("updates the clock without recentering on ticks, task changes or a data refresh", () => {
    const { container } = renderTimeline({ viewMode: "day" });
    const scroll = container.querySelector("[data-slot=timeline-scroll]")!;
    const line = container.querySelector<HTMLElement>("[data-slot=timeline-now-line]")!;
    const previousPosition = line.style.left;
    expect(line).toHaveClass("border-primary", "pointer-events-none", "z-10");
    scroll.scrollLeft = 123;
    act(() => vi.advanceTimersByTime(60_000));
    expect(line.style.left).not.toBe(previousPosition);
    expect(parseFloat(line.style.left)).toBeCloseTo(((8 + 31 / 60) / 24) * 100);
    expect(container.querySelector("[data-slot=timeline-now-label]")).not.toBeInTheDocument();
    expect(scroll.scrollLeft).toBe(123);
    fireEvent.click(screen.getByRole("button", { name: "Refresh tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Start refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish refresh" }));
    expect(scroll.scrollLeft).toBe(123);
  });

  it("initially reveals the current date in a compact month, and refocuses after returning", () => {
    const lateMonth = new Date("2026-10-21T08:30:00Z");
    vi.setSystemTime(lateMonth);
    const { container } = renderTimeline({ viewMode: "month", currentDate: lateMonth }, "en", lateMonth);
    const scroll = container.querySelector("[data-slot=timeline-scroll]")!;
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    expect(cells(container)[0]).toHaveClass("min-w-20");
    expect(cells(container)[0]).toHaveStyle({ height: "72px" });
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(container.querySelector("[aria-current=date]")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(container.querySelector("[aria-current=date]")).toHaveTextContent("21");
    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  it("opens a selected day at its first task instead of assuming office hours", () => {
    const earlier = { ...task, startTime: new Date("2026-10-06T14:00:00Z"), endTime: new Date("2026-10-06T15:00:00Z") };
    const { container } = renderTimeline({ entries: [earlier] });
    const header = container.querySelectorAll<HTMLElement>("[data-slot=timeline-slot-header]")[1];
    fireEvent.click(header);
    act(() => vi.advanceTimersByTime(300));
    const scroll = container.querySelector("[data-slot=timeline-scroll]")!;
    expect(scroll).toHaveAttribute("data-view", "day");
    expect(scroll.scrollLeft).toBeCloseTo(820);
    expect(container.querySelector("[data-slot=timeline-now-label]")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Inspect motor/ })).toBeInTheDocument();
  });

  it.each([50, 100, 200] as const)("keeps editing and drag rescheduling intact at %i%%", async (zoomLevel) => {
    const destination = new Date("2026-10-08T00:00:00Z");
    server.moveTask.mockResolvedValue({ ...task, startTime: destination, endTime: new Date("2026-10-08T02:00:00Z"), equipmentId: "press" });
    const { container } = renderTimeline({ zoomLevel, equipment: [equipment, { ...equipment, id: "press", name: "Hydraulic press" }] });
    const button = screen.getByRole("button", { name: /Open Inspect motor/ });
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: task.title })).toBeInTheDocument();
    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(button, { dataTransfer });
    fireEvent.dragOver(cells(container)[10], { dataTransfer });
    await act(async () => fireEvent.drop(cells(container)[10], { dataTransfer }));
    expect(server.moveTask).toHaveBeenCalledExactlyOnceWith("inspection", destination, "press");
    const moved = screen.getByRole("button", { name: /Open Inspect motor/ });
    expect(moved).toHaveAttribute("data-maintenance-status", "scheduled");
    expect(moved).toHaveTextContent("2h");
    expect(moved).toHaveAccessibleDescription(/Scheduled duration: 2h/);
  });

  it("rolls back a failed drag and reports the error", async () => {
    const failure = new Error("Move rejected");
    server.moveTask.mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderTimeline();
    const button = screen.getByRole("button", { name: /Open Inspect motor/ });
    const original = button.getAttribute("style");
    fireEvent.dragStart(button, { dataTransfer: { effectAllowed: "" } });
    await act(async () => fireEvent.drop(cells(container)[4]));
    expect(server.error).toHaveBeenCalledWith("Failed to move task");
    expect(error).toHaveBeenCalledWith("Failed to move task:", failure);
    expect(button.getAttribute("style")).toBe(original);
  });

  it("localizes the existing creation label and stacked today label", () => {
    const { container } = renderTimeline({}, "pt-pt");
    expect(cells(container)[3]).toHaveAccessibleName(/Adicionar tarefa de manutenção/);
    expect(container.querySelector("[aria-current=date]")).toHaveTextContent("Hoje");
  });
});
