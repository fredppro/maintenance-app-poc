import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider, useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import type { Equipment, MaintenanceEntry, Worker } from "@/features/scheduler/types";
import { MaintenanceSearch } from "./maintenance-search";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/routing", () => ({ useRouter: () => router }));

const date = new Date("2026-06-01T08:00:00.000Z");
const equipment: Equipment = {
  id: "lathe", name: "Workshop Lathe", category: "Tools",
  imageFileId: null, sectionId: null, createdAt: date,
};
const worker: Worker = {
  id: "worker", name: "Taylor Worker", email: "taylor@example.test",
  phone: null, type: "INTERNAL", vendorId: null, createdAt: date,
};
const task: MaintenanceEntry = {
  id: "bearing / replacement", title: "Replace bearing", description: null, type: "PREVENTIVE",
  equipmentId: equipment.id, maintenancePointId: null, status: "scheduled",
  startTime: date, endTime: null, completedAt: null, createdAt: date, updatedAt: date,
  assignments: [{ id: "assignment", taskId: "bearing", workerId: worker.id, startTime: date, endTime: null, worker }],
};

function SearchState() {
  const query = useSchedulerStore((state) => state.searchQuery);
  return <output aria-label="Shared schedule filter">{query}</output>;
}

function renderSearch(entries = [task]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <SchedulerStoreProvider initialState={{ entries, equipment: [equipment] }}>
        <MaintenanceSearch />
        <SearchState />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("MaintenanceSearch", () => {
  beforeEach(() => {
    router.push.mockReset();
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens with input focus, closes with Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderSearch();
    const trigger = screen.getByRole("button", { name: messages.Grid.searchTasks });
    expect(trigger).toHaveAttribute("aria-keyshortcuts", "Meta+K");
    expect(trigger).toHaveTextContent("⌘K");
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Search maintenance" })).toHaveAccessibleDescription(messages.Search.description);
    expect(screen.getByRole("combobox", { name: messages.Grid.searchTasks })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["MacIntel", "Meta+K", true, false, "⌘K"],
    ["Win32", "Control+K", false, true, "Ctrl+K"],
  ])("toggles with the platform shortcut on %s", async (platform, shortcut, metaKey, ctrlKey, hint) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    renderSearch();
    const trigger = screen.getByRole("button", { name: messages.Grid.searchTasks });
    expect(trigger).toHaveAttribute("aria-keyshortcuts", shortcut);
    expect(trigger).toHaveTextContent(hint);
    fireEvent.keyDown(document, { key: "k", metaKey, ctrlKey });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "K", metaKey, ctrlKey });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["bearing", "WORKSHOP", "tools", "Taylor Worker", "taylor@example.test"])(
    "retains existing search matching for %s and synchronizes the timeline filter",
    async (query) => {
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole("button", { name: messages.Grid.searchTasks }));
      await user.type(screen.getByRole("combobox", { name: messages.Grid.searchTasks }), query);
      expect(screen.getByRole("option", { name: /Replace bearing/ })).toHaveTextContent("Workshop Lathe");
      expect(screen.getByLabelText("Shared schedule filter")).toHaveTextContent(query);
      await user.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: messages.Grid.searchTasks })).toHaveTextContent(query);
    },
  );

  it("provides an empty state and clears both the query and timeline filter without losing focus", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: messages.Grid.searchTasks }));
    const input = screen.getByRole("combobox", { name: messages.Grid.searchTasks });
    await user.type(input, "unmatched");
    expect(screen.getByText(messages.Grid.noSearchResults)).toBeVisible();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: messages.Grid.clearSearch }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByLabelText("Shared schedule filter")).toBeEmptyDOMElement();
    expect(screen.getByRole("option", { name: /Replace bearing/ })).toBeVisible();
  });

  it("selects search results with the keyboard and preserves encoded task routing", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: messages.Grid.searchTasks }));
    await user.type(screen.getByRole("combobox", { name: messages.Grid.searchTasks }), "bearing");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(router.push).toHaveBeenCalledWith("/?taskId=bearing%20%2F%20replacement");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not stack a palette over an active editing dialog", () => {
    const { container } = renderSearch();
    const editor = document.createElement("div");
    editor.setAttribute("role", "dialog");
    editor.setAttribute("data-state", "open");
    container.append(editor);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("removes its shortcut listener on unmount", () => {
    const { unmount } = renderSearch();
    unmount();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
