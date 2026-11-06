import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkerManagementPage from "./WorkerManagementPage";

const { getWorkersMock } = vi.hoisted(() => ({
  getWorkersMock: vi.fn(),
}));

vi.mock("../server/actions", () => ({
  deleteWorker: vi.fn(),
  getWorkers: getWorkersMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./CreateUpdateUser", () => ({
  default: () => null,
}));

describe("WorkerManagementPage", () => {
  beforeEach(() => {
    getWorkersMock.mockReset();
  });

  it("shows a recoverable error when loading workers fails", async () => {
    getWorkersMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([]);
    const onWorkersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <WorkerManagementPage
        onBack={vi.fn()}
        onWorkersChange={onWorkersChange}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("failedLoad");

    await user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(screen.getByText("noWorkers")).toBeInTheDocument();
    });
    expect(getWorkersMock).toHaveBeenCalledTimes(2);
    expect(onWorkersChange).toHaveBeenCalledWith([]);
  });

  it("renders a named semantic table and supports opening a row with the keyboard", async () => {
    getWorkersMock.mockResolvedValue([
      {
        id: "worker-1",
        name: "Morgan Lee",
        email: "morgan@example.test",
        phone: null,
        type: "INTERNAL",
        vendorId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    render(
      <WorkerManagementPage
        onWorkersChange={vi.fn()}
      />,
    );

    const table = await screen.findByRole("table", { name: "title" });
    expect(table.querySelector("thead")).toHaveClass("bg-muted");
    expect(table.querySelector("tbody")).toHaveClass("bg-background");
    expect(
      screen.getByRole("columnheader", { name: "columnName" }),
    ).toHaveAttribute("scope", "col");

    await userEvent.click(
      screen.getByRole("button", { name: "openActions" }),
    );
    expect(await screen.findByRole("menuitem", { name: "edit" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    const row = screen.getByRole("row", { name: /Morgan Lee/ });
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
