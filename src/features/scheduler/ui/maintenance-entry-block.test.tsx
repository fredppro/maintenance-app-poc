import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import type { MaintenanceEntry } from "../types";
import { TASK_STATUSES } from "../task-status";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";
import { MaintenanceStatusBadge } from "./maintenance-status-badge";
import { getTaskStatusPresentation } from "./task-status-presentation";
import { semanticTones } from "@/components/ui/semantic-tones";

vi.mock("./edit-entry-dialog", () => ({
  EditEntryDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" /> : null,
}));

const date = new Date("2026-06-01T08:00:00.000Z");
const task: MaintenanceEntry = {
  id: "task", title: "Replace bearing", description: null, type: "PREVENTIVE",
  equipmentId: "lathe", maintenancePointId: null, status: "scheduled",
  startTime: date, endTime: null, completedAt: null, createdAt: date, updatedAt: date,
};

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
    expect(presentation).toEqual(getTaskStatusPresentation("cancelled"));
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
