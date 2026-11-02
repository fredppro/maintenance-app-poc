import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "../store/scheduler-provider";
import type { Equipment } from "../types";
import { EquipmentDialog } from "./equipment-dialog";
import { toast } from "sonner";

const {
  addEquipmentMock,
  createSectionMock,
  getEquipmentRelocationsMock,
  getMaintenancePointsMock,
  relocateEquipmentMock,
  saveMaintenancePointMock,
  updateEquipmentMock,
} = vi.hoisted(() => ({
  addEquipmentMock: vi.fn(),
  createSectionMock: vi.fn(),
  getEquipmentRelocationsMock: vi.fn(),
  getMaintenancePointsMock: vi.fn(),
  relocateEquipmentMock: vi.fn(),
  saveMaintenancePointMock: vi.fn(),
  updateEquipmentMock: vi.fn(),
}));

vi.mock("../server/actions", () => ({
  addEquipment: addEquipmentMock,
  createSection: createSectionMock,
  getEquipmentRelocations: getEquipmentRelocationsMock,
  getMaintenancePoints: getMaintenancePointsMock,
  relocateEquipment: relocateEquipmentMock,
  saveMaintenancePoint: saveMaintenancePointMock,
  updateEquipment: updateEquipmentMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./equipment-image-field", () => ({
  EquipmentImageField: () => null,
  uploadEquipmentImage: vi.fn(),
}));

const equipment: Equipment = {
  id: "equipment-1",
  name: "Workshop Lathe",
  category: "Tools",
  imageFileId: null,
  sectionId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider
        initialState={{
          equipment: [equipment],
          sites: [{ id: "site-1", name: "Workshop", current: true }],
          sections: [],
        }}
      >
        <EquipmentDialog
          open
          onOpenChange={onOpenChange}
          equipment={equipment}
          categories={["Tools"]}
        />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange };
}

describe("EquipmentDialog maintenance-point editing", () => {
  beforeEach(() => {
    getEquipmentRelocationsMock.mockResolvedValue([]);
    getMaintenancePointsMock.mockResolvedValue([]);
    updateEquipmentMock.mockClear();
    saveMaintenancePointMock.mockClear();
    saveMaintenancePointMock.mockResolvedValue({
      id: "point-1",
      name: "Hydraulic line",
      description: null,
      checklistItems: [],
    });
    updateEquipmentMock.mockResolvedValue(equipment);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("saves a staged maintenance point only when the equipment form is saved", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await screen.findByText("No maintenance points have been added.");
    await user.type(screen.getByLabelText("Point name"), "Hydraulic line");

    expect(
      screen.queryByRole("button", { name: /add point|save point/i }),
    ).not.toBeInTheDocument();
    expect(saveMaintenancePointMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(saveMaintenancePointMock).toHaveBeenCalledWith(
        equipment.id,
        expect.objectContaining({
          id: null,
          name: "Hydraulic line",
          checklistItems: [],
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not save point details without a point name", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText("Description"),
      "Inspect for leaks",
    );
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Enter a point name before saving its details.",
    );
    expect(updateEquipmentMock).not.toHaveBeenCalled();
    expect(saveMaintenancePointMock).not.toHaveBeenCalled();
  });
});
