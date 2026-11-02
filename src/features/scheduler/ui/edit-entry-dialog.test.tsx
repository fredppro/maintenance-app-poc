import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        <EditEntryDialog
          entry={currentEntry}
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
    deleteTaskMock.mockReset();
    updateTaskMock.mockReset();
    getMaintenancePointsMock.mockReset().mockResolvedValue([]);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("updates the task and closes the dialog after a successful save", async () => {
    const user = userEvent.setup();
    const updatedEntry = { ...entry, status: "in-progress" };
    updateTaskMock.mockResolvedValue(updatedEntry);
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "In Progress" }));
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

    rerenderOpen(false);
    rerenderOpen(true);
    await waitFor(() =>
      expect(getMaintenancePointsMock).toHaveBeenCalledTimes(2),
    );

    screen.getByRole("combobox", { name: "Maintenance point" }).focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "Newly added point" }),
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(
      screen.getByRole("button", { name: "Actual completion date & time" }),
    ).toBeInTheDocument();
    const sectionHeadings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(sectionHeadings.indexOf("When")).toBeLessThan(
      sectionHeadings.indexOf("Completion"),
    );
    expect(
      screen.getByText(
        "This is when work was actually completed. The planned end time is shown above.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
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
    await user.click(screen.getByRole("button", { name: "Scheduled" }));
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

  it("rolls back the optimistic status update when saving fails", async () => {
    const user = userEvent.setup();
    updateTaskMock.mockRejectedValue(new Error("Database unavailable"));
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "In Progress" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to update task");
    });
    expect(screen.getByLabelText("Task status")).toHaveTextContent("scheduled");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
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

  it("uses daily worker entries without duplicate worker start/end fields", async () => {
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

    expect(
      screen.getByRole("heading", { name: "Worker hours by day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add work day" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Actual (start|end) time for/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalled();
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      entry.id,
      expect.objectContaining({
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
});
