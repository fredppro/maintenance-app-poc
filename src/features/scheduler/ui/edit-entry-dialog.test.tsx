import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import type { Equipment, MaintenanceEntry } from "../types";
import {
  SchedulerStoreProvider,
  useSchedulerStore,
} from "../store/scheduler-provider";
import { deleteTask, updateTask } from "../server/actions";
import { EditEntryDialog } from "./edit-entry-dialog";
import { toast } from "sonner";

const { deleteTaskMock, updateTaskMock } = vi.hoisted(() => ({
  deleteTaskMock: vi.fn(),
  updateTaskMock: vi.fn(),
}));

vi.mock("../server/actions", () => ({
  deleteTask: deleteTaskMock,
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
  status: "scheduled",
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

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider
        initialState={{
          equipment: [equipment],
          entries: [entry],
          selectedEntry: entry,
        }}
      >
        <EntryStatus />
        <EditEntryDialog
          entry={entry}
          open
          onOpenChange={onOpenChange}
        />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );

  return { onOpenChange };
}

describe("EditEntryDialog", () => {
  beforeEach(() => {
    deleteTaskMock.mockReset();
    updateTaskMock.mockReset();
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
});
