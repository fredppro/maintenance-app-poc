import { render, screen, waitFor, within } from "@testing-library/react";
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

const { createTaskMock, getMaintenancePointsMock, pushMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
  getMaintenancePointsMock: vi.fn().mockResolvedValue([]),
  pushMock: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../server/actions", () => ({
  createTask: createTaskMock,
  getMaintenancePoints: getMaintenancePointsMock,
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
  imageFileId: null,
  sectionId: null,
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

function renderDialog(entries: MaintenanceEntry[] = [], open = true) {
  const onOpenChange = vi.fn();

  const renderTree = (isOpen: boolean) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider
        initialState={{ equipment: [equipment], workers: [worker], entries }}
      >
        <EntryCount />
        <AddEntryDialog
          open={isOpen}
          onOpenChange={onOpenChange}
          selectedCell={{ date: selectedDate, equipmentId: equipment.id }}
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

describe("AddEntryDialog", () => {
  beforeEach(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
    });
    createTaskMock.mockReset();
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

  it("offers an Add worker action that closes the dialog and opens the workers page", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("combobox", { name: /worker/i }));
    await user.click(await screen.findByRole("button", { name: /add worker/i }));

    expect(pushMock).toHaveBeenCalledWith("/workers");
    expect(onOpenChange).toHaveBeenCalledWith(false);
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

  it("shows task and work-log validation errors and blocks incomplete submission", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByRole("button", { name: "Log work" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Additional details" }));
    await user.click(screen.getByRole("button", { name: "Log work" }));
    expect(
      screen.getByRole("heading", { level: 4, name: "#1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute(
      "aria-describedby",
      "task-title-error",
    );
    expect(screen.getByText("Select at least one worker")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Assigned Workers" }),
    ).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Select a worker for this work log.")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "A start time could not be inferred. Enter one to continue.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter a duration from 0.25 to 24 hours in 0.25-hour increments.",
      ),
    ).toBeInTheDocument();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("clears validation messages when the create sheet is dismissed", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select at least one worker"),
    ).not.toBeInTheDocument();
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
      maintenancePointId: null,
      status: "scheduled",
      completedAt: null,
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

  it("reloads maintenance points whenever the dialog is reopened", async () => {
    const user = userEvent.setup();
    getMaintenancePointsMock
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "point-new", name: "Newly added point" }]);
    const { rerenderOpen } = renderDialog([], false);

    expect(getMaintenancePointsMock).not.toHaveBeenCalled();
    rerenderOpen(true);
    await waitFor(() => expect(getMaintenancePointsMock).toHaveBeenCalledTimes(1));

    rerenderOpen(false);
    rerenderOpen(true);
    await waitFor(() => expect(getMaintenancePointsMock).toHaveBeenCalledTimes(2));

    screen.getByRole("combobox", { name: "Maintenance point" }).focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "Newly added point" }),
    ).toBeInTheDocument();
  });

  it("previews the selected maintenance point checklist when scheduling", async () => {
    const user = userEvent.setup();
    getMaintenancePointsMock.mockResolvedValue([
      {
        id: "point-spindle",
        name: "Spindle",
        checklistItems: [
          {
            id: "template-spindle",
            title: "Check spindle lubrication",
            sortOrder: 0,
          },
        ],
      },
    ]);
    renderDialog();

    await waitFor(() => {
      expect(getMaintenancePointsMock).toHaveBeenCalledWith(equipment.id);
    });
    const pointSelect = screen.getByRole("combobox", {
      name: "Maintenance point",
    });
    await waitFor(() => expect(pointSelect).toBeEnabled());
    await user.click(pointSelect);
    await user.click(await screen.findByRole("option", { name: "Spindle" }));
    await user.click(
      screen.getByRole("button", { name: /Checklist items/i }),
    );

    expect(
      screen.getByRole("checkbox", { name: "Check spindle lubrication" }),
    ).toBeDisabled();
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
      maintenancePointId: null,
      status: "scheduled",
      completedAt: null,
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

    expect(
      screen.getByRole("checkbox", {
        name: "Planned end date and time are known",
      }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText("End Date & Time")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Duration" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Replace worn belt",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Assigned Workers" }),
    );
    await user.click(screen.getByText("Taylor Worker (taylor@example.test)"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Additional details" }));
    await user.click(screen.getByRole("button", { name: "Log work" }));
    await user.click(screen.getByRole("combobox", { name: "Worker" }));
    await user.click(
      await screen.findByRole("option", { name: "Taylor Worker" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Work date & start time" }),
    );
    const startHour = screen.getByRole("textbox", { name: "Hours" });
    await user.clear(startHour);
    await user.type(startHour, "08");
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("Duration (hours)"), "2");
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Replace worn belt",
          equipmentId: equipment.id,
          endTime: null,
          workerIds: [worker.id],
          status: "scheduled",
          dailyHours: [
            {
              workerId: worker.id,
              workDate: "2026-06-01",
              startTime: "08:00",
              hours: 2,
            },
          ],
        }),
      );
    });
    expect(screen.getByLabelText("Scheduled entries")).toHaveTextContent("1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the shared end date/time picker only when its checkbox is enabled", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Planned end date and time are known",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Planned end date and time are known",
      }),
    ).toBeChecked();
    expect(screen.getByLabelText("Planned End Date & Time")).toBeInTheDocument();
  });

  it("restores duration presets and applies the selected duration from task start", async () => {
    const user = userEvent.setup();
    createTaskMock.mockResolvedValue({
      id: "created-task",
      startTime: selectedDate,
      endTime: new Date(selectedDate.getTime() + 2 * 60 * 60 * 1000),
      status: "scheduled",
    });
    renderDialog();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Planned end date and time are known",
      }),
    );

    expect(screen.getByRole("group", { name: "Duration" })).toBeInTheDocument();
    const durationPresets = screen.getByRole("group", { name: "Duration" });
    expect(
      within(durationPresets).getByRole("radio", { name: "30 min" }),
    ).toBeInTheDocument();
    expect(
      within(durationPresets).getByRole("radio", { name: "8 h" }),
    ).toBeInTheDocument();
    expect(
      within(durationPresets).getByRole("radio", { name: "1 d" }),
    ).toBeInTheDocument();
    await user.click(
      within(durationPresets).getByRole("radio", { name: "2 h" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Replace worn belt",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Assigned Workers" }),
    );
    await user.click(screen.getByText("Taylor Worker (taylor@example.test)"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: selectedDate,
          endTime: new Date(selectedDate.getTime() + 2 * 60 * 60 * 1000),
        }),
      );
    });
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
      screen.getByRole("combobox", { name: "Assigned Workers" }),
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
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Replace worn belt",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to schedule maintenance",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
