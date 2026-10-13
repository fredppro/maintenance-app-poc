import { render, screen, waitFor } from "@testing-library/react";
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
});
