import { act, render, screen, waitFor } from "@testing-library/react";
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
import { toast } from "sonner";

const { deleteTaskMock, getMaintenancePointsMock, updateTaskMock } = vi.hoisted(() => ({
  deleteTaskMock: vi.fn(),
  getMaintenancePointsMock: vi.fn().mockResolvedValue([]),
  updateTaskMock: vi.fn(),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../server/actions", () => ({
  deleteTask: deleteTaskMock,
  getMaintenancePoints: getMaintenancePointsMock,
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
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
