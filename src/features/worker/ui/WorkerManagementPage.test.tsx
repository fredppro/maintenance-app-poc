import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.restoreAllMocks());

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
    expect(
      screen.getByRole("button", {
        name: /Morgan Lee.*morgan@example\.test/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(table.querySelector("thead")).toHaveClass("bg-muted");
    expect(table.querySelector("tbody")).toHaveClass("bg-background");
    expect(
      screen.getByRole("columnheader", { name: "columnName" }),
    ).toHaveAttribute("scope", "col");

    await userEvent.click(
      within(table).getByRole("button", { name: "openActions" }),
    );
    expect(await screen.findByRole("menuitem", { name: "edit" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    const row = screen.getByRole("row", { name: /Morgan Lee/ });
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shares handle-only reordering between desktop and mobile without changing worker data", async () => {
    getWorkersMock.mockResolvedValue(["Morgan Lee", "Taylor Kim"].map((name, index) => ({
      id: `worker-${index + 1}`,
      name,
      email: `worker${index + 1}@example.test`,
      phone: null,
      type: "INTERNAL",
      vendorId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const item = this.closest<HTMLElement>("[data-reorder-id]");
      if (!item?.parentElement) return new DOMRect(0, 0, 800, 400);
      const index = Array.from(item.parentElement.children).indexOf(item);
      return new DOMRect(0, index * 60, 800, 60);
    });
    const user = userEvent.setup();
    const onWorkersChange = vi.fn();
    render(<WorkerManagementPage onWorkersChange={onWorkersChange} />);
    const table = await screen.findByRole("table", { name: "title" });
    const list = screen.getByRole("list");
    const rowIds = (root: HTMLElement, selector: string) =>
      Array.from(root.querySelectorAll(selector)).map((row) => row.getAttribute("data-reorder-id"));

    await user.click(within(table).getAllByRole("button", { name: "handle" })[0]);
    await user.keyboard(" {ArrowDown} ");
    await waitFor(() => expect(rowIds(table, "tbody tr")).toEqual(["worker-2", "worker-1"]));
    expect(rowIds(list, "li")).toEqual(["worker-2", "worker-1"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(list).getAllByRole("button", { name: "handle" })[0]);
    await user.keyboard(" {ArrowDown}{Escape}");
    expect(rowIds(list, "li")).toEqual(["worker-2", "worker-1"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard(" {ArrowDown} ");
    await waitFor(() => expect(rowIds(list, "li")).toEqual(["worker-1", "worker-2"]));
    expect(rowIds(table, "tbody tr")).toEqual(["worker-1", "worker-2"]);
    expect(getWorkersMock).toHaveBeenCalledOnce();
    expect(onWorkersChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: /Taylor Kim.*worker2@example\.test/ }));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
});
