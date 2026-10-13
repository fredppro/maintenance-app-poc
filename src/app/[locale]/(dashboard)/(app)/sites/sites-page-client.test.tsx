import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import type { Equipment } from "@/features/scheduler/types";
import { SitesPageClient } from "./sites-page-client";

const actions = vi.hoisted(() => ({
  createSite: vi.fn(),
  createSection: vi.fn(),
  renameSection: vi.fn(),
  deleteSection: vi.fn(),
}));
vi.mock("@/features/scheduler/server/actions", () => actions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const sites = [
  { id: "site-1", name: "Plant", current: true },
  { id: "site-2", name: "Depot", current: false },
];
const sections = [{ id: "sec-1", name: "Dock", siteId: "site-1" }];
const equipment = [
  { id: "e1", name: "Press", sectionId: "sec-1" },
  { id: "e2", name: "Lathe", sectionId: "sec-1" },
  { id: "e3", name: "Saw", sectionId: null },
] as Equipment[];

function renderPage(state: object = { sites, sections, equipment }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={state}>
        <SitesPageClient />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("SitesPageClient", () => {
  beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset()));

  it("adds a site at any time, including when none exist", async () => {
    actions.createSite.mockResolvedValue({ id: "site-3", name: "Warehouse" });
    renderPage({ sites: [] });
    await userEvent.type(screen.getByLabelText("New site name"), "Warehouse");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));
    expect(actions.createSite).toHaveBeenCalledWith("Warehouse");
    expect(await screen.findByText("Warehouse")).toBeInTheDocument();
  });

  it("shows an empty state when there are no sites", () => {
    renderPage({ sites: [] });
    expect(screen.getByText("No sites")).toBeInTheDocument();
  });

  it("lists sections per site with their equipment counts", () => {
    renderPage();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Dock")).toBeInTheDocument();
    expect(screen.getAllByText("2 equipment").length).toBeGreaterThan(0);
    expect(screen.getByText("No sections yet.")).toBeInTheDocument();
  });

  it("adds a section to the chosen site and clears the field", async () => {
    const user = userEvent.setup();
    actions.createSection.mockResolvedValue({ id: "sec-2", name: "Yard", siteId: "site-2" });
    renderPage();

    const cards = screen.getAllByRole("textbox", { name: "New section name" });
    await user.type(cards[1], "Yard");
    await user.click(screen.getAllByRole("button", { name: /add section/i })[1]);

    expect(actions.createSection).toHaveBeenCalledWith("site-2", "Yard");
    expect(await screen.findByText("Yard")).toBeInTheDocument();
    expect(cards[1]).toHaveValue("");
  });

  it("does not submit a blank section name", async () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /add section/i })[0]).toBeDisabled();
  });

  it("renames a section", async () => {
    const user = userEvent.setup();
    actions.renameSection.mockResolvedValue({ id: "sec-1", name: "Loading Dock", siteId: "site-1" });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Rename Dock" }));
    const input = screen.getByRole("textbox", { name: "Rename" });
    await user.clear(input);
    await user.type(input, "Loading Dock");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(actions.renameSection).toHaveBeenCalledWith("sec-1", "Loading Dock");
    expect(await screen.findByText("Loading Dock")).toBeInTheDocument();
  });

  it("deletes a section only after confirmation", async () => {
    const user = userEvent.setup();
    actions.deleteSection.mockResolvedValue(undefined);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Delete Dock" }));
    expect(actions.deleteSection).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(actions.deleteSection).toHaveBeenCalledWith("sec-1"));
    await waitFor(() => expect(screen.queryByText("Dock")).not.toBeInTheDocument());
  });

  it("keeps the section and reports an error when deletion fails", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    actions.deleteSection.mockRejectedValue(new Error("forbidden"));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Delete Dock" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText("Dock")).toBeInTheDocument();
  });
});
