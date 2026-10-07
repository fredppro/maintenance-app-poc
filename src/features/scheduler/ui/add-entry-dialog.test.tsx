import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import {
  SchedulerStoreProvider,
  useSchedulerStore,
} from "../store/scheduler-provider";
import { toast } from "sonner";
import type { Equipment, MaintenanceEntry, Worker } from "../types";
import { AddEntryDialog } from "./add-entry-dialog";

const { createTaskMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
}));

vi.mock("../server/actions", () => ({
  createTask: createTaskMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const equipment: Equipment = {
  id: "equipment-1",
  name: "Workshop Lathe",
  category: "Tools",
  image: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const worker: Worker = {
  id: "worker-1",
  name: "Taylor Worker",
  email: "taylor@example.test",
  phone: null,
  type: "INTERNAL",
  vendorId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const selectedDate = new Date("2026-06-01T08:00:00.000Z");

function EntryCount() {
  const count = useSchedulerStore((state) => state.entries.length);
  return <output aria-label="Scheduled entries">{count}</output>;
}

function renderDialog(entries: MaintenanceEntry[] = []) {
  const onOpenChange = vi.fn();

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider
        initialState={{ equipment: [equipment], workers: [worker], entries }}
      >
        <EntryCount />
        <AddEntryDialog
          open
          onOpenChange={onOpenChange}
          selectedCell={{ date: selectedDate, equipmentId: equipment.id }}
        />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );

  return { onOpenChange };
}

describe("AddEntryDialog", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows required-field errors and does not create an incomplete task", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Schedule" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Select at least one worker")).toBeInTheDocument();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("blocks a task that overlaps another task on the selected equipment", async () => {
    const conflictingEntry: MaintenanceEntry = {
      id: "existing-task",
      title: "Existing maintenance",
      description: null,
      type: "PREVENTIVE",
      startTime: selectedDate,
      endTime: new Date("2026-06-01T09:00:00.000Z"),
      equipmentId: equipment.id,
      status: "scheduled",
      createdAt: selectedDate,
      updatedAt: selectedDate,
    };

    renderDialog([conflictingEntry]);

    expect(
      await screen.findByText(
        "This equipment is already scheduled for maintenance during this time slot",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("creates the valid task, updates the scheduler store, and closes the dialog", async () => {
    const user = userEvent.setup();
    const createdTask: MaintenanceEntry = {
      id: "created-task",
      title: "Replace worn belt",
      description: "",
      type: "PREVENTIVE",
      startTime: selectedDate,
      endTime: new Date("2026-06-01T09:00:00.000Z"),
      equipmentId: equipment.id,
      status: "scheduled",
      assignments: [
        {
          id: "assignment-1",
          taskId: "created-task",
          workerId: worker.id,
          startTime: selectedDate,
          endTime: new Date("2026-06-01T09:00:00.000Z"),
          worker,
        },
      ],
      materials: [],
      createdAt: selectedDate,
      updatedAt: selectedDate,
    };
    createTaskMock.mockResolvedValue(createdTask);
    const { onOpenChange } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Replace worn belt",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Select workers..." }),
    );
    await user.click(screen.getByText("Taylor Worker (taylor@example.test)"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Replace worn belt",
          equipmentId: equipment.id,
          workerIds: [worker.id],
          status: "scheduled",
        }),
      );
    });
    expect(screen.getByLabelText("Scheduled entries")).toHaveTextContent("1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and the store unchanged when task creation fails", async () => {
    const user = userEvent.setup();
    createTaskMock.mockRejectedValue(new Error("Database unavailable"));
    const { onOpenChange } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Replace worn belt",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Select workers..." }),
    );
    await user.click(screen.getByText("Taylor Worker (taylor@example.test)"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to schedule maintenance",
      );
    });
    expect(screen.getByLabelText("Scheduled entries")).toHaveTextContent("0");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
