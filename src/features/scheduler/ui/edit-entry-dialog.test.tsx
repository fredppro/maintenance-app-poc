import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import type { Equipment, MaintenanceEntry, Worker } from "../types";
import {
  SchedulerStoreProvider,
  useSchedulerStore,
} from "../store/scheduler-provider";
import { EditEntryDialog } from "./edit-entry-dialog";
import { notifyTaskUpdated } from "../events";
import { toast } from "sonner";

const {
  deleteTaskMock,
  getMaintenancePointsMock,
  previewMaintenanceTaskEmailMock,
  sendMaintenanceTaskEmailMock,
  updateTaskMock,
  fetchMock,
} = vi.hoisted(() => ({
  deleteTaskMock: vi.fn(),
  getMaintenancePointsMock: vi.fn().mockResolvedValue([]),
  previewMaintenanceTaskEmailMock: vi.fn(),
  sendMaintenanceTaskEmailMock: vi.fn(),
  updateTaskMock: vi.fn(),
  fetchMock: vi.fn(),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../server/actions", () => ({
  deleteTask: deleteTaskMock,
  getMaintenancePoints: getMaintenancePointsMock,
  previewMaintenanceTaskEmail: previewMaintenanceTaskEmailMock,
  sendMaintenanceTaskEmail: sendMaintenanceTaskEmailMock,
  updateTask: updateTaskMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const startTime = new Date("2026-06-01T08:00:00.000Z");
const equipment: Equipment = {
  id: "equipment-1",
  name: "Workshop Lathe",
  category: "Tools",
  imageFileId: null,
  sectionId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const entry: MaintenanceEntry = {
  id: "task-1",
  title: "Inspect spindle",
  description: null,
  type: "PREVENTIVE",
  startTime,
  endTime: new Date("2026-06-01T09:00:00.000Z"),
  equipmentId: equipment.id,
  maintenancePointId: null,
  status: "scheduled",
  completedAt: null,
  assignments: [],
  materials: [],
  createdAt: startTime,
  updatedAt: startTime,
};
const notificationWorker: Worker = {
  id: "worker-1",
  name: "Taylor Worker",
  email: "taylor@example.test",
  phone: null,
  type: "INTERNAL",
  vendorId: null,
  createdAt: startTime,
};
const taskWithNotificationAssignment: MaintenanceEntry = {
  ...entry,
  assignments: [
    {
      id: "assignment-1",
      taskId: entry.id,
      workerId: notificationWorker.id,
      startTime,
      endTime: null,
      worker: notificationWorker,
    },
  ],
};

function EntryStatus() {
  const status = useSchedulerStore(
    (state) => state.entries.find(({ id }) => id === entry.id)?.status,
  );
  return <output aria-label="Task status">{status}</output>;
}

function SavedWorkLogCount() {
  const count = useSchedulerStore(
    (state) =>
      state.entries.find(({ id }) => id === entry.id)?.dailyHours?.length ?? 0,
  );
  return <output aria-label="Saved work log count">{count}</output>;
}

function TimeOnlyWorkLogCount() {
  const count = useSchedulerStore(
    (state) =>
      state.entries
        .find(({ id }) => id === entry.id)
        ?.dailyHours?.filter(
          ({ startTime }) =>
            typeof startTime === "string" && /^\d{2}:\d{2}$/.test(startTime),
        ).length ?? 0,
  );
  return <output aria-label="Time-only work log count">{count}</output>;
}

function ConnectedEditEntryDialog({
  entryId,
  open,
  onOpenChange,
}: {
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentEntry = useSchedulerStore((state) =>
    state.entries.find(({ id }) => id === entryId),
  );
  return currentEntry ? (
    <EditEntryDialog
      entry={currentEntry}
      open={open}
      onOpenChange={onOpenChange}
    />
  ) : null;
}

function renderDialog(
  currentEntry: MaintenanceEntry = entry,
  workers: Worker[] = [],
  open = true,
) {
  const onOpenChange = vi.fn();
  const renderTree = (isOpen: boolean) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider
        initialState={{
          equipment: [equipment],
          workers,
          entries: [currentEntry],
          selectedEntry: currentEntry,
        }}
      >
        <EntryStatus />
        <SavedWorkLogCount />
        <TimeOnlyWorkLogCount />
        <ConnectedEditEntryDialog
          entryId={currentEntry.id}
          open={isOpen}
          onOpenChange={onOpenChange}
        />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>
  );
  const view = render(renderTree(open));

  return {
    onOpenChange,
    rerenderOpen: (isOpen: boolean) => view.rerender(renderTree(isOpen)),
  };
}

describe("EditEntryDialog", () => {
  beforeEach(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
    });
    deleteTaskMock.mockReset();
    updateTaskMock.mockReset();
    getMaintenancePointsMock.mockReset().mockResolvedValue([]);
    previewMaintenanceTaskEmailMock.mockReset();
    sendMaintenanceTaskEmailMock.mockReset();
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false, nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture");
    Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
    Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
  });

  it("uses the established colors for each task status", async () => {
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Scheduled" })).toHaveClass(
        "data-[state=on]:bg-chart-1/15",
        "data-[variant=outline]:data-[state=on]:border-input",
      );
    });
    expect(screen.getByRole("radio", { name: "In Progress" })).toHaveClass(
      "data-[state=on]:bg-chart-3/15",
    );
    expect(screen.getByRole("radio", { name: "Completed" })).toHaveClass(
      "data-[state=on]:bg-chart-5/15",
    );
    expect(screen.getByRole("radio", { name: "Cancelled" })).toHaveClass(
      "data-[state=on]:bg-foreground",
    );
  });

  it("explains automatic notifications and distinguishes manual history", async () => {
    const historyReminders = [
      {
        id: "assignment-notice-1",
        workerId: notificationWorker.id,
        notificationType: "ASSIGNMENT",
        status: "SENT",
        scheduledFor: startTime.toISOString(),
        sentAt: startTime.toISOString(),
        attempts: 1,
        lastError: null,
        createdAt: startTime.toISOString(),
        worker: { name: notificationWorker.name },
      },
      {
        id: "manual-notice-1",
        workerId: notificationWorker.id,
        notificationType: "MANUAL",
        status: "PENDING",
        scheduledFor: startTime.toISOString(),
        sentAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date(startTime.getTime() - 1).toISOString(),
        worker: { name: notificationWorker.name },
      },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: historyReminders,
        hasMore: false,
        nextCursor: null,
      }),
    });
    const taskWithNotificationHistory: MaintenanceEntry = {
      ...taskWithNotificationAssignment,
      reminders: [
        {
          id: "assignment-notice-1",
          workerId: notificationWorker.id,
          notificationType: "ASSIGNMENT",
          status: "SENT",
          scheduledFor: startTime,
          sentAt: startTime,
          attempts: 1,
          lastError: null,
          createdAt: startTime,
          worker: { name: notificationWorker.name },
        },
        {
          id: "manual-notice-1",
          workerId: notificationWorker.id,
          notificationType: "MANUAL",
          status: "PENDING",
          scheduledFor: startTime,
          sentAt: null,
          attempts: 0,
          lastError: null,
          createdAt: startTime,
          worker: { name: notificationWorker.name },
        },
      ],
    };
    renderDialog(taskWithNotificationHistory, [notificationWorker]);

    expect(
      screen.getByText(/When a scheduled task is saved, an assignment notice/),
    ).toBeInTheDocument();
    expect(screen.getByText("Notification history")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 4,
        name: "Automatic notifications",
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("Automatic")).toHaveLength(2);
    });
    expect(screen.getByText("Manual", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Assignment notice/)).toBeInTheDocument();
    expect(screen.getByText(/Manual email/)).toBeInTheDocument();
  });

  it("loads older notification pages on demand and keeps them available when collapsed", async () => {
    const user = userEvent.setup();
    const makeReminder = (id: string, createdAt: string) => ({
      id,
      workerId: notificationWorker.id,
      notificationType: "ASSIGNMENT",
      status: "SENT",
      scheduledFor: createdAt,
      sentAt: createdAt,
      attempts: 1,
      lastError: null,
      createdAt,
      worker: { name: `Worker ${id}` },
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 5 }, (_, index) =>
            makeReminder(
              `notice-${index + 1}`,
              new Date(startTime.getTime() - index).toISOString(),
            ),
          ),
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 4).toISOString()}|notice-5`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "older-notice",
              new Date(startTime.getTime() - 10).toISOString(),
            ),
          ],
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 10).toISOString()}|older-notice`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "oldest-notice",
              new Date(startTime.getTime() - 20).toISOString(),
            ),
          ],
          hasMore: false,
          nextCursor: null,
        }),
      });

    renderDialog(taskWithNotificationAssignment);

    await screen.findByText("Worker notice-1");
    expect(screen.queryByText("Worker older-notice")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See more" }));
    expect(await screen.findByText("Worker older-notice")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Notification history" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show less" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "See more" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("Worker older-notice")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See more" }));
    expect(screen.getByText("Worker older-notice")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(
      screen.getByRole("button", { name: "Load older notifications" }),
    );
    expect(await screen.findByText("Worker oldest-notice")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes the newest page after a task update without dropping loaded entries", async () => {
    const firstCreatedAt = new Date(startTime.getTime() - 10).toISOString();
    const newestCreatedAt = new Date(startTime.getTime()).toISOString();
    const makeReminder = (id: string, createdAt: string) => ({
      id,
      workerId: notificationWorker.id,
      notificationType: "ASSIGNMENT",
      status: "SENT",
      scheduledFor: createdAt,
      sentAt: createdAt,
      attempts: 1,
      lastError: null,
      createdAt,
      worker: { name: `Worker ${id}` },
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [makeReminder("existing-notice", firstCreatedAt)],
          hasMore: false,
          nextCursor: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder("new-notice", newestCreatedAt),
            makeReminder("existing-notice", firstCreatedAt),
          ],
          hasMore: false,
          nextCursor: null,
        }),
      });

    renderDialog(taskWithNotificationAssignment);
    await screen.findByText("Worker existing-notice");

    act(() => notifyTaskUpdated(entry.id));

    expect(await screen.findByText("Worker new-notice")).toBeInTheDocument();
    expect(screen.getByText("Worker existing-notice")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a stable cursor after refreshing the latest page", async () => {
    const user = userEvent.setup();
    const makeReminder = (id: string, createdAt: string) => ({
      id,
      workerId: notificationWorker.id,
      notificationType: "ASSIGNMENT",
      status: "SENT",
      scheduledFor: createdAt,
      sentAt: createdAt,
      attempts: 1,
      lastError: null,
      createdAt,
      worker: { name: `Worker ${id}` },
    });
    const initialItems = Array.from({ length: 5 }, (_, index) =>
      makeReminder(
        `notice-${index + 1}`,
        new Date(startTime.getTime() - index).toISOString(),
      ),
    );
    const refreshedCursor = `${new Date(startTime.getTime() - 3).toISOString()}|notice-4`;
    const olderPageItems = Array.from({ length: 5 }, (_, index) =>
      makeReminder(
        `notice-${index + 5}`,
        new Date(startTime.getTime() - 4 - index * 10).toISOString(),
      ),
    );
    const olderPageCursor = `${new Date(startTime.getTime() - 44).toISOString()}|notice-9`;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: initialItems,
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 4).toISOString()}|notice-5`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "new-notice",
              new Date(startTime.getTime() + 1).toISOString(),
            ),
            ...initialItems.slice(0, 4),
          ],
          hasMore: true,
          nextCursor: refreshedCursor,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: olderPageItems,
          hasMore: true,
          nextCursor: olderPageCursor,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "newest-notice",
              new Date(startTime.getTime() + 2).toISOString(),
            ),
            makeReminder(
              "new-notice",
              new Date(startTime.getTime() + 1).toISOString(),
            ),
            ...initialItems.slice(0, 3),
          ],
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 2).toISOString()}|notice-3`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "notice-10",
              new Date(startTime.getTime() - 54).toISOString(),
            ),
          ],
          hasMore: false,
          nextCursor: null,
        }),
      });

    renderDialog(taskWithNotificationAssignment);
    await screen.findByText("Worker notice-1");

    act(() => notifyTaskUpdated(entry.id));
    await screen.findByText("Worker new-notice");

    await user.click(screen.getByRole("button", { name: "See more" }));
    expect(await screen.findByText("Worker notice-9")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/tasks/${entry.id}/notifications?cursor=${encodeURIComponent(refreshedCursor)}`,
    );

    act(() => notifyTaskUpdated(entry.id));
    expect(await screen.findByText("Worker newest-notice")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Load older notifications" }),
    );
    expect(await screen.findByText("Worker notice-10")).toBeInTheDocument();
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      `/api/tasks/${entry.id}/notifications?cursor=${encodeURIComponent(olderPageCursor)}`,
    );
  });

  it("keeps the history keyboard reachable and updates scroll fades at each boundary", async () => {
    const user = userEvent.setup();
    const makeReminder = (id: string, createdAt: string) => ({
      id,
      workerId: notificationWorker.id,
      notificationType: "ASSIGNMENT",
      status: "SENT",
      scheduledFor: createdAt,
      sentAt: createdAt,
      attempts: 1,
      lastError: null,
      createdAt,
      worker: { name: `Worker ${id}` },
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 5 }, (_, index) =>
            makeReminder(
              `notice-${index + 1}`,
              new Date(startTime.getTime() - index).toISOString(),
            ),
          ),
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 4).toISOString()}|notice-5`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "older-notice",
              new Date(startTime.getTime() - 10).toISOString(),
            ),
          ],
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 10).toISOString()}|older-notice`,
        }),
      });

    renderDialog(taskWithNotificationAssignment);
    await screen.findByText("Worker notice-1");
    await user.click(screen.getByRole("button", { name: "See more" }));
    await screen.findByText("Worker older-notice");
    expect(
      screen.getByRole("button", { name: "Load older notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show less" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "See more" }),
    ).not.toBeInTheDocument();

    const region = screen.getByRole("region", {
      name: "Notification history",
    });
    const viewport = region.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const wrapper = region.parentElement;
    expect(viewport).not.toBeNull();
    expect(wrapper).not.toBeNull();
    expect(viewport).toHaveAttribute("tabindex", "0");

    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, get: () => 300 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const hasFade = (edge: "top" | "bottom") =>
      Array.from(wrapper!.children).some(
        (child) =>
          child.getAttribute("aria-hidden") === "true" &&
          child.classList.contains(`${edge}-0`),
      );

    fireEvent.scroll(viewport!);
    await waitFor(() => {
      expect(hasFade("top")).toBe(false);
      expect(hasFade("bottom")).toBe(true);
    });

    viewport!.scrollTop = 50;
    fireEvent.scroll(viewport!);
    await waitFor(() => {
      expect(hasFade("top")).toBe(true);
      expect(hasFade("bottom")).toBe(true);
    });

    viewport!.scrollTop = 100;
    fireEvent.scroll(viewport!);
    await waitFor(() => {
      expect(hasFade("top")).toBe(true);
      expect(hasFade("bottom")).toBe(false);
    });
  });

  it("keeps the history section in view while toggling in a narrow task sheet", async () => {
    const user = userEvent.setup();
    const makeReminder = (id: string, createdAt: string) => ({
      id,
      workerId: notificationWorker.id,
      notificationType: "ASSIGNMENT",
      status: "SENT",
      scheduledFor: createdAt,
      sentAt: createdAt,
      attempts: 1,
      lastError: null,
      createdAt,
      worker: { name: `Worker ${id}` },
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 5 }, (_, index) =>
            makeReminder(
              `notice-${index + 1}`,
              new Date(startTime.getTime() - index).toISOString(),
            ),
          ),
          hasMore: true,
          nextCursor: `${new Date(startTime.getTime() - 4).toISOString()}|notice-5`,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            makeReminder(
              "older-notice",
              new Date(startTime.getTime() - 10).toISOString(),
            ),
          ],
          hasMore: false,
          nextCursor: null,
        }),
      });

    renderDialog(taskWithNotificationAssignment);
    await screen.findByText("Worker notice-1");

    const historyRegion = document.getElementById(
      `notification-history-${entry.id}`,
    );
    const form = historyRegion?.closest("form");
    const section = historyRegion?.closest(
      "[data-notification-history-section]",
    );
    if (!historyRegion || !form || !(section instanceof HTMLElement)) {
      throw new Error("Notification history must be rendered inside its form");
    }

    Object.defineProperty(form, "scrollTop", {
      configurable: true,
      writable: true,
      value: 800,
    });
    vi.spyOn(section, "getBoundingClientRect").mockImplementation(() => {
      const top = 200 - (form.scrollTop - 500);
      return {
        x: 0,
        y: top,
        top,
        right: 100,
        bottom: top + 100,
        left: 0,
        width: 100,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await user.click(screen.getByRole("button", { name: "See more" }));
    await screen.findByText("Worker older-notice");
    expect(section.getBoundingClientRect().top).toBe(0);
    expect(form.scrollTop).toBe(700);
    expect(document.activeElement).toBe(section);

    form.scrollTop = 900;
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("Worker older-notice")).not.toBeInTheDocument();
    expect(section.getBoundingClientRect().top).toBe(0);
    expect(form.scrollTop).toBe(700);
    expect(document.activeElement).toBe(section);
  });

  it("allows retrying notification history after an initial request fails", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "notice-1",
              workerId: notificationWorker.id,
              notificationType: "ASSIGNMENT",
              status: "SENT",
              scheduledFor: startTime.toISOString(),
              sentAt: startTime.toISOString(),
              attempts: 1,
              lastError: null,
              createdAt: startTime.toISOString(),
              worker: { name: "Worker notice-1" },
            },
          ],
          hasMore: false,
          nextCursor: null,
        }),
      });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderDialog(taskWithNotificationAssignment);

    expect(
      await screen.findByText("Could not load notification history."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Worker notice-1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows recipient loading, previews recipients, and sends manually", async () => {
    const user = userEvent.setup();
    const requestId = "00000000-0000-4000-8000-000000000001";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
    let resolvePreview:
      | ((result: {
          taskId: string;
          title: string;
          startTime: Date;
          recipients: {
            workerId: string;
            name: string;
            email: string;
          }[];
          excludedRecipients: { workerId: string; name: string }[];
        }) => void)
      | undefined;
    previewMaintenanceTaskEmailMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    let resolveSend:
      | ((result: { sent: number; failed: number; pending: number }) => void)
      | undefined;
    sendMaintenanceTaskEmailMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    const preview = {
      taskId: entry.id,
      title: entry.title,
      startTime: entry.startTime,
      recipients: [
        {
          workerId: notificationWorker.id,
          name: notificationWorker.name,
          email: notificationWorker.email,
        },
      ],
      excludedRecipients: [],
    };
    renderDialog(taskWithNotificationAssignment, [notificationWorker]);

    await user.click(
      screen.getByRole("button", { name: "Review recipients & send" }),
    );
    const loadingButton = screen.getByRole("button", {
      name: "Loading recipients…",
    });
    expect(loadingButton).toBeDisabled();
    await act(async () => {
      resolvePreview?.(preview);
    });

    expect(
      await screen.findByRole("alertdialog", {
        name: "Confirm email recipients",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Taylor Worker.*taylor@example\.test/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send email" }));

    const sendingButton = await screen.findByRole("button", {
      name: "Sending email…",
    });
    expect(sendingButton).toBeDisabled();
    expect(sendingButton).toHaveAttribute("aria-busy", "true");
    expect(sendMaintenanceTaskEmailMock).toHaveBeenCalledWith({
      taskId: entry.id,
      workerIds: [notificationWorker.id],
      requestId,
    });
    await act(async () => {
      resolveSend?.({ sent: 1, failed: 0, pending: 0 });
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Email sent to 1 worker(s)."),
    );
  });

  it("keeps the send action disabled when the preview has no valid recipients", async () => {
    const user = userEvent.setup();
    previewMaintenanceTaskEmailMock.mockResolvedValue({
      taskId: entry.id,
      title: entry.title,
      startTime: entry.startTime,
      recipients: [],
      excludedRecipients: [
        { workerId: notificationWorker.id, name: notificationWorker.name },
      ],
    });
    renderDialog(taskWithNotificationAssignment, [notificationWorker]);

    await user.click(
      screen.getByRole("button", { name: "Review recipients & send" }),
    );

    expect(
      await screen.findByText("No assigned workers have a valid email address."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "These assigned workers have no usable email address and will not receive the email: Taylor Worker.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled();
    expect(sendMaintenanceTaskEmailMock).not.toHaveBeenCalled();
  });

  it("shows a clear error when the manual email recipient preview fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    previewMaintenanceTaskEmailMock.mockRejectedValue(new Error("preview failed"));
    renderDialog(taskWithNotificationAssignment, [notificationWorker]);

    await user.click(
      screen.getByRole("button", { name: "Review recipients & send" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not load the current email recipients.",
      ),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("reports a manual send failure and keeps the confirmation open", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    previewMaintenanceTaskEmailMock.mockResolvedValue({
      taskId: entry.id,
      title: entry.title,
      startTime: entry.startTime,
      recipients: [
        {
          workerId: notificationWorker.id,
          name: notificationWorker.name,
          email: notificationWorker.email,
        },
      ],
      excludedRecipients: [],
    });
    sendMaintenanceTaskEmailMock.mockRejectedValue(new Error("send failed"));
    renderDialog(taskWithNotificationAssignment, [notificationWorker]);

    await user.click(
      screen.getByRole("button", { name: "Review recipients & send" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "Confirm email recipients",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send email" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not send the maintenance task email.",
      ),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Confirm email recipients",
      }),
    ).toBeInTheDocument();
  });

  it("updates the task and closes the dialog after a successful save", async () => {
    const user = userEvent.setup();
    const updatedEntry = { ...entry, status: "in-progress" };
    updateTaskMock.mockResolvedValue(updatedEntry);
    const { onOpenChange } = renderDialog();

    screen.getByRole("radio", { name: "Scheduled" }).focus();
    await user.keyboard("{ArrowRight}");
    const inProgressRadio = screen.getByRole("radio", {
      name: "In Progress",
    });
    expect(inProgressRadio).toHaveFocus();
    await user.click(inProgressRadio);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({ status: "in-progress" }),
      );
    });

    expect(screen.getByLabelText("Task status")).toHaveTextContent(
      "in-progress",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("Task updated successfully");
  });

  it("keeps the task description within the Details section", async () => {
    renderDialog();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Maintenance point" }),
      ).toBeEnabled(),
    );

    const detailsSection = screen
      .getByRole("heading", { level: 3, name: "Details" })
      .closest("section");

    expect(detailsSection).toContainElement(
      screen.getByRole("textbox", { name: "Description (optional)" }),
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Team" }).closest("section"),
    ).not.toContainElement(
      screen.getByRole("textbox", { name: "Description (optional)" }),
    );
  });

  it("refreshes the available maintenance points when reopened", async () => {
    const user = userEvent.setup();
    getMaintenancePointsMock
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "point-new", name: "Newly added point" }]);
    const { rerenderOpen } = renderDialog(entry, [], false);

    expect(getMaintenancePointsMock).not.toHaveBeenCalled();
    rerenderOpen(true);
    await waitFor(() =>
      expect(getMaintenancePointsMock).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Maintenance point" }),
      ).toBeEnabled(),
    );

    rerenderOpen(false);
    rerenderOpen(true);
    await waitFor(() =>
      expect(getMaintenancePointsMock).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Maintenance point" }),
      ).toBeEnabled(),
    );

    screen.getByRole("combobox", { name: "Maintenance point" }).focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "Newly added point" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("initializes and submits an editable completion timestamp on completion", async () => {
    const user = userEvent.setup();
    const updatedEntry = {
      ...entry,
      status: "completed",
      completedAt: new Date(),
    };
    updateTaskMock.mockResolvedValue(updatedEntry);
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Completed" }));

    expect(
      screen.getByRole("button", { name: "Actual completion date & time" }),
    ).toBeInTheDocument();
    const sectionHeadings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(sectionHeadings.indexOf("When")).toBeLessThan(
      sectionHeadings.indexOf("Completion"),
    );
    const completionInfo = screen.getByRole("button", {
      name: "About actual completion time",
    });
    await user.hover(completionInfo);
    expect(
      await screen.findAllByText(
        "This is when work was actually completed. The planned end time is shown above.",
      ),
    ).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
          startTime: entry.startTime,
          endTime: entry.endTime,
        }),
      );
    });
  });

  it("keeps a historical completion timestamp visible when a task is reopened", async () => {
    const user = userEvent.setup();
    const completedAt = new Date("2026-05-30T16:30:00.000Z");
    const completedEntry = { ...entry, status: "completed", completedAt };
    updateTaskMock.mockResolvedValue({
      ...completedEntry,
      status: "scheduled",
    });
    renderDialog(completedEntry);

    expect(
      screen.getByRole("button", { name: "Actual completion date & time" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Scheduled" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          status: "scheduled",
          completedAt,
        }),
      );
    });
  });

  it("keeps edited values after client-side validation fails", async () => {
    const user = userEvent.setup();
    renderDialog();

    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", "task-title-error");

    await user.type(title, "Updated spindle inspection");
    expect(title).toHaveValue("Updated spindle inspection");
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    expect(updateTaskMock).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic status update when saving fails", async () => {
    const user = userEvent.setup();
    updateTaskMock.mockRejectedValue(new Error("Database unavailable"));
    const { onOpenChange } = renderDialog();

    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Updated spindle inspection",
    );
    await user.click(screen.getByRole("radio", { name: "In Progress" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to update task");
    });
    expect(screen.getByLabelText("Task status")).toHaveTextContent("scheduled");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Updated spindle inspection",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to update task",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("synchronizes checklist templates with the selected maintenance point", async () => {
    const user = userEvent.setup();
    const taskWithChecklist = {
      ...entry,
      maintenancePointId: "point-a",
      checklistItems: [
        {
          id: "task-checklist-a",
          title: "Inspect existing bearing",
          sortOrder: 0,
          isComplete: true,
          sourceItemId: "template-a",
          completedAt: null,
          completedById: null,
          createdAt: startTime,
        },
      ],
    };
    getMaintenancePointsMock.mockResolvedValue([
      {
        id: "point-a",
        name: "Bearing",
        checklistItems: [
          {
            id: "template-a",
            title: "Inspect existing bearing",
            sortOrder: 0,
          },
        ],
      },
      {
        id: "point-b",
        name: "Hydraulics",
        checklistItems: [
          {
            id: "template-b",
            title: "Check hydraulic pressure",
            sortOrder: 0,
          },
        ],
      },
    ]);
    updateTaskMock.mockResolvedValue(taskWithChecklist);
    renderDialog(taskWithChecklist);

    await waitFor(() => {
      expect(getMaintenancePointsMock).toHaveBeenCalledWith(equipment.id);
    });
    await waitFor(() => expect(
      screen.getByRole("combobox", { name: "Maintenance point" }),
    ).toBeEnabled());
    const existingChecklistItem = screen.getByRole("checkbox", {
      name: "Inspect existing bearing",
    });
    expect(existingChecklistItem).toBeChecked();
    await user.click(existingChecklistItem);

    const pointSelect = screen.getByRole("combobox", {
      name: "Maintenance point",
    });
    await user.click(pointSelect);
    await user.click(await screen.findByRole("option", { name: "Hydraulics" }));

    const newChecklistItem = screen.getByRole("checkbox", {
      name: "Check hydraulic pressure",
    });
    expect(newChecklistItem).not.toBeChecked();

    await user.click(pointSelect);
    await user.click(await screen.findByRole("option", { name: "Bearing" }));
    expect(
      screen.getByRole("checkbox", { name: "Inspect existing bearing" }),
    ).not.toBeChecked();

    await user.click(pointSelect);
    await user.click(await screen.findByRole("option", { name: "Hydraulics" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          maintenancePointId: "point-b",
          checklistItems: [
            {
              id: "template-b",
              title: "Check hydraulic pressure",
              sortOrder: 0,
              isComplete: false,
            },
          ],
        }),
      );
    });
  });

  it("preserves an unknown task end time as null", async () => {
    const user = userEvent.setup();
    const taskWithoutEnd = { ...entry, endTime: null };
    updateTaskMock.mockResolvedValue(taskWithoutEnd);
    renderDialog(taskWithoutEnd);

    expect(
      screen.getByRole("checkbox", {
        name: "Planned end date and time are known",
      }),
    ).not.toBeChecked();
    expect(
      screen.queryByLabelText("Planned End Date & Time"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({ endTime: null }),
      );
    });
  });

  it("shows checklist progress while collapsed", async () => {
    const user = userEvent.setup();
    const taskWithChecklist: MaintenanceEntry = {
      ...entry,
      checklistItems: [
        {
          id: "check-1",
          title: "Inspect belt",
          sortOrder: 0,
          isComplete: true,
          createdAt: startTime,
          completedAt: startTime,
          sourceItemId: null,
          completedById: null,
        },
        {
          id: "check-2",
          title: "Check lubrication",
          sortOrder: 1,
          isComplete: false,
          createdAt: startTime,
          completedAt: null,
          sourceItemId: null,
          completedById: null,
        },
      ],
    };
    renderDialog(taskWithChecklist);

    const checklistTrigger = screen.getByRole("button", {
      name: /Checklist items.*1 of 2 complete/,
    });
    await user.click(checklistTrigger);
    expect(checklistTrigger).toHaveAttribute("aria-expanded", "false");
    expect(checklistTrigger).toHaveTextContent("1 of 2 complete");
  });

  it("creates independent work logs for one selected worker and derives the end time", async () => {
    const user = userEvent.setup();
    const assignedWorker: Worker = {
      id: "worker-1",
      name: "Taylor Worker",
      email: "taylor@example.test",
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: startTime,
    };
    const workerEndTime = new Date("2026-06-01T12:00:00.000Z");
    const taskWithWorker = {
      ...entry,
      assignments: [
        {
          id: "assignment-1",
          taskId: entry.id,
          workerId: assignedWorker.id,
          startTime,
          endTime: workerEndTime,
          worker: assignedWorker,
        },
      ],
    };
    updateTaskMock.mockResolvedValue(taskWithWorker);
    renderDialog(taskWithWorker, [assignedWorker]);

    expect(screen.getByRole("heading", { name: "Work logs" })).toBeInTheDocument();
    const logWorkButton = screen.getByRole("button", { name: "Log work" });
    expect(
      screen.queryByLabelText(/Actual (start|end) time for/),
    ).not.toBeInTheDocument();

    await user.click(logWorkButton);
    await user.click(logWorkButton);
    const workerSelectors = screen.getAllByRole("combobox", { name: "Worker" });
    expect(workerSelectors).toHaveLength(2);
    for (const selector of workerSelectors) {
      await user.click(selector);
      await user.click(
        await screen.findByRole("option", { name: "Taylor Worker" }),
      );
    }

    const startPickers = screen.getAllByRole("button", {
      name: "Work date & start time",
    });
    const durationInputs = screen.getAllByLabelText("Duration (hours)");
    await user.click(startPickers[0]);
    const firstStartHour = screen.getByRole("textbox", { name: "Hours" });
    await user.clear(firstStartHour);
    await user.type(firstStartHour, "08");
    await user.keyboard("{Escape}");
    await user.type(durationInputs[0], "2");
    await user.click(startPickers[1]);
    const secondStartHour = screen.getByRole("textbox", { name: "Hours" });
    await user.clear(secondStartHour);
    await user.type(secondStartHour, "10");
    await user.keyboard("{Escape}");
    await user.type(durationInputs[1], "1.5");
    const calculatedEnd = screen
      .getByText("Jun 1, 2026, 11:30 AM")
      .closest("output");
    expect(calculatedEnd).toHaveAttribute("aria-live", "polite");
    expect(calculatedEnd).not.toHaveClass("border");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalled();
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      entry.id,
      expect.objectContaining({
        startTime: entry.startTime,
        endTime: entry.endTime,
        dailyHours: [
          {
            workerId: assignedWorker.id,
            workDate: "2026-06-01",
            startTime: "08:00",
            hours: 2,
          },
          {
            workerId: assignedWorker.id,
            workDate: "2026-06-01",
            startTime: "10:00",
            hours: 1.5,
          },
        ],
        workerLogs: [
          {
            workerId: assignedWorker.id,
            startTime,
            endTime: workerEndTime,
          },
        ],
      }),
    );
  });

  it("edits and removes only the selected work-log entries", async () => {
    const user = userEvent.setup();
    const assignedWorker: Worker = {
      id: "worker-1",
      name: "Taylor Worker",
      email: "taylor@example.test",
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: startTime,
    };
    const taskWithLogs = {
      ...entry,
      assignments: [
        {
          id: "assignment-1",
          taskId: entry.id,
          workerId: assignedWorker.id,
          startTime: null,
          endTime: null,
          worker: assignedWorker,
        },
      ],
      dailyHours: [
        {
          id: "work-log-1",
          workerId: assignedWorker.id,
          workDate: "2026-06-01",
          startTime: new Date("2026-06-01T07:00:00.000Z"),
          hours: 2,
        },
        {
          id: "work-log-2",
          workerId: assignedWorker.id,
          workDate: "2026-06-01",
          startTime: new Date("2026-06-01T09:00:00.000Z"),
          hours: 1.5,
        },
      ],
    };
    updateTaskMock.mockResolvedValue(taskWithLogs);
    renderDialog(taskWithLogs, [assignedWorker]);

    const durations = screen.getAllByLabelText("Duration (hours)");
    await user.clear(durations[0]);
    await user.type(durations[0], "3");
    await user.click(
      screen.getAllByRole("button", { name: "Remove work log" })[1],
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          dailyHours: [
            {
              id: "work-log-1",
              workerId: assignedWorker.id,
              workDate: "2026-06-01",
              startTime: "08:00",
              hours: 3,
            },
          ],
        }),
      );
    });
  });

  it("preserves existing work logs when adding another entry for a worker", async () => {
      const user = userEvent.setup();
      const paulo: Worker = {
        id: "worker-paulo",
        name: "Paulo",
        email: "paulo@example.test",
        phone: null,
        type: "INTERNAL",
        vendorId: null,
        createdAt: startTime,
      };
      const fabio: Worker = {
        id: "worker-fabio",
        name: "Fabio",
        email: "fabio@example.test",
        phone: null,
        type: "INTERNAL",
        vendorId: null,
        createdAt: startTime,
      };
      const existingWorkLogs = [
        {
          id: "work-log-paulo",
          workerId: paulo.id,
          workDate: "2026-06-01",
          startTime: new Date("2026-06-01T07:00:00.000Z"),
          hours: 1,
        },
        {
          id: "work-log-fabio",
          workerId: fabio.id,
          workDate: "2026-06-01",
          startTime: new Date("2026-06-01T08:00:00.000Z"),
          hours: 1,
        },
      ];
      const taskWithWorkLogs = {
        ...entry,
        assignments: [
          {
            id: "assignment-paulo",
            taskId: entry.id,
            workerId: paulo.id,
            startTime: null,
            endTime: null,
            worker: paulo,
          },
          {
            id: "assignment-fabio",
            taskId: entry.id,
            workerId: fabio.id,
            startTime: null,
            endTime: null,
            worker: fabio,
          },
        ],
        dailyHours: existingWorkLogs,
      };
      const savedTask = {
        ...taskWithWorkLogs,
        dailyHours: [
          ...existingWorkLogs,
          {
            id: "work-log-fabio-new",
            workerId: fabio.id,
            workDate: new Date("2026-06-01T00:00:00.000Z"),
            startTime: new Date("2026-06-01T09:00:00.000Z"),
            hours: 2,
          },
        ],
      };
      let resolveUpdateTask!: (value: typeof savedTask) => void;
      const updateTaskPromise = new Promise<typeof savedTask>((resolve) => {
        resolveUpdateTask = resolve;
      });
      updateTaskMock.mockReturnValue(updateTaskPromise);
      renderDialog(taskWithWorkLogs, [paulo, fabio]);

      await user.click(screen.getByRole("button", { name: "Log work" }));
      const workerSelectors = screen.getAllByRole("combobox", {
        name: "Worker",
      });
      await user.click(workerSelectors[2]);
      await user.click(await screen.findByRole("option", { name: "Fabio" }));

      const startPickers = screen.getAllByRole("button", {
        name: "Work date & start time",
      });
      await user.click(startPickers[2]);
      const newStartHour = screen.getByRole("textbox", { name: "Hours" });
      await user.clear(newStartHour);
      await user.type(newStartHour, "10");
      await user.keyboard("{Escape}");

      const durations = screen.getAllByLabelText("Duration (hours)");
      await user.type(durations[2], "2");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(updateTaskMock).toHaveBeenCalled();
      });
      expect(screen.getByLabelText("Saved work log count")).toHaveTextContent(
        "2",
      );
      expect(screen.getByLabelText("Time-only work log count")).toHaveTextContent(
        "0",
      );

      await act(async () => {
        resolveUpdateTask(savedTask);
        await updateTaskPromise;
      });

      await waitFor(() => {
        expect(updateTaskMock).toHaveBeenCalledWith(
          entry.id,
          expect.objectContaining({
            dailyHours: [
              {
                id: "work-log-paulo",
                workerId: paulo.id,
                workDate: "2026-06-01",
                startTime: "08:00",
                hours: 1,
              },
              {
                id: "work-log-fabio",
                workerId: fabio.id,
                workDate: "2026-06-01",
                startTime: "09:00",
                hours: 1,
              },
              {
                workerId: fabio.id,
                workDate: "2026-06-01",
                startTime: "10:00",
                hours: 2,
              },
            ],
          }),
        );
        expect(screen.getByLabelText("Saved work log count")).toHaveTextContent(
          "3",
        );
      });
  });

  it("allows duration-only logs and infers independent times for each worker", async () => {
    const user = userEvent.setup();
    const scheduledStart = new Date("2026-06-01T07:00:00.000Z");
    const paulo: Worker = {
      id: "worker-paulo",
      name: "Paulo",
      email: "paulo@example.test",
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: scheduledStart,
    };
    const fabio: Worker = {
      id: "worker-fabio",
      name: "Fabio",
      email: "fabio@example.test",
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: scheduledStart,
    };
    const existingWorkLog = {
      id: "work-log-fabio",
      workerId: fabio.id,
      workDate: "2026-06-01",
      startTime: scheduledStart,
      hours: 3,
    };
    const taskWithWorkLog = {
      ...entry,
      startTime: scheduledStart,
      assignments: [
        {
          id: "assignment-paulo",
          taskId: entry.id,
          workerId: paulo.id,
          startTime: null,
          endTime: null,
          worker: paulo,
        },
        {
          id: "assignment-fabio",
          taskId: entry.id,
          workerId: fabio.id,
          startTime: null,
          endTime: null,
          worker: fabio,
        },
      ],
      dailyHours: [existingWorkLog],
    };
    updateTaskMock.mockResolvedValue(taskWithWorkLog);
    renderDialog(taskWithWorkLog, [paulo, fabio]);

    await user.click(screen.getByRole("button", { name: "Log work" }));
    const workerSelectors = () =>
      screen.getAllByRole("combobox", { name: "Worker" });
    await user.click(workerSelectors()[1]);
    await user.click(await screen.findByRole("option", { name: "Fabio" }));
    await user.type(screen.getAllByLabelText("Duration (hours)")[1], "2");
    expect(
      screen.getByText(
        "Inferred start: 11:00",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Jun 1, 2026, 1:00 PM")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log work" }));
    await user.click(workerSelectors()[2]);
    await user.click(await screen.findByRole("option", { name: "Paulo" }));
    await user.type(screen.getAllByLabelText("Duration (hours)")[2], "2");
    expect(
      screen.getByText(
        "Inferred start: 08:00",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log work" }));
    await user.click(workerSelectors()[3]);
    await user.click(await screen.findByRole("option", { name: "Paulo" }));
    await user.type(screen.getAllByLabelText("Duration (hours)")[3], "1");
    expect(
      screen.getByText(
        "Inferred start: 10:00",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          dailyHours: [
            {
              id: "work-log-fabio",
              workerId: fabio.id,
              workDate: "2026-06-01",
              startTime: "08:00",
              hours: 3,
            },
            {
              workerId: fabio.id,
              workDate: "2026-06-01",
              startTime: "",
              hours: 2,
            },
            {
              workerId: paulo.id,
              workDate: "2026-06-01",
              startTime: "",
              hours: 2,
            },
            {
              workerId: paulo.id,
              workDate: "2026-06-01",
              startTime: "",
              hours: 1,
            },
          ],
        }),
      );
    });
  });

  it("preserves an unknown historical start time when another field changes", async () => {
      const user = userEvent.setup();
      const assignedWorker: Worker = {
        id: "worker-1",
        name: "Taylor Worker",
        email: "taylor@example.test",
        phone: null,
        type: "INTERNAL",
        vendorId: null,
        createdAt: startTime,
      };
      const taskWithHistoricalLog = {
        ...entry,
        assignments: [
          {
            id: "assignment-1",
            taskId: entry.id,
            workerId: assignedWorker.id,
            startTime: null,
            endTime: null,
            worker: assignedWorker,
          },
        ],
        dailyHours: [
          {
            id: "work-log-legacy",
            workerId: assignedWorker.id,
            workDate: "2026-06-01",
            startTime: null,
            hours: 2,
          },
        ],
      };
      updateTaskMock.mockResolvedValue(taskWithHistoricalLog);
      renderDialog(taskWithHistoricalLog, [assignedWorker]);

      await user.clear(screen.getByLabelText("Duration (hours)"));
      await user.type(screen.getByLabelText("Duration (hours)"), "3");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(updateTaskMock).toHaveBeenCalledWith(
          entry.id,
          expect.objectContaining({
            dailyHours: [
              {
                id: "work-log-legacy",
                workerId: assignedWorker.id,
                workDate: "2026-06-01",
                startTime: "",
                hours: 3,
              },
            ],
          }),
        );
    });
  });
});
