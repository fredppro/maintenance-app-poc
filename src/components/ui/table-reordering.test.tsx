import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import portuguese from "@/i18n/messages/pt-pt.json";
import { mergeVisibleReorder, Reorderable, ReorderableHandle, ReorderableItem } from "./reorderable";
import { Table, TableBody, TableCell, TableDragHandle, TableRow, TableSurface } from "./table";

function Fixture({
  enabled = false,
  list = false,
  onReorder = vi.fn(),
  onOpen = vi.fn(),
}: {
  enabled?: boolean;
  list?: boolean;
  onReorder?: (items: string[]) => void;
  onOpen?: () => void;
}) {
  const [items, setItems] = useState(["Alpha", "Beta", "Gamma"]);
  const reordering = {
    enabled,
    items,
    getItemLabel: (id: string) => id,
    onReorder: (ids: string[]) => { setItems(ids); onReorder(ids); },
  };
  if (list) {
    return (
      <Reorderable {...reordering}>
        <ul aria-label="Roster">
          {items.map((id) => (
            <ReorderableItem key={id} id={id}>
              <li><ReorderableHandle /><button onClick={onOpen}>{id}</button></li>
            </ReorderableItem>
          ))}
        </ul>
      </Reorderable>
    );
  }
  return (
    <TableSurface>
      <Table aria-label="Roster" reordering={reordering}>
        <TableBody>
          {items.map((id) => (
            <TableRow key={id} reorderId={id} onClick={onOpen}>
              <TableCell><TableDragHandle /></TableCell><TableCell>{id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableSurface>
  );
}

function renderFixture(props: React.ComponentProps<typeof Fixture>, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : portuguese}>
      <Fixture {...props} />
    </NextIntlClientProvider>,
  );
}

function order() {
  return Array.from(screen.getByRole("table").querySelectorAll("tbody tr"))
    .map((row) => row.getAttribute("data-reorder-id"));
}

describe("optional shared row reordering", () => {
  it("merges filtered reorders without moving hidden rows or retaining removed IDs", () => {
    expect(
      mergeVisibleReorder(
        ["a", "b", "c", "d", "new"],
        ["d", "a", "removed", "b", "c"],
        ["c", "a"],
      ),
    ).toEqual(["d", "c", "b", "a", "new"]);
  });

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const item = this.closest<HTMLElement>("[data-reorder-id]");
      if (!item?.parentElement) return new DOMRect(0, 0, 600, 400);
      const index = Array.from(item.parentElement.children).indexOf(item);
      return this.tagName === "BUTTON"
        ? new DOMRect(8, index * 60 + 10, 36, 36)
        : new DOMRect(0, index * 60, 600, 60);
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    // dnd-kit removes its document-level click suppression 50ms after a pointer drop.
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  it("is off by default and can be toggled without replacing table semantics", () => {
    const view = renderFixture({});
    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><Fixture enabled /></NextIntlClientProvider>);
    expect(screen.getAllByRole("button", { name: /Reorder/ })).toHaveLength(3);
    expect(screen.getByRole("table").querySelector("tbody > tr > td")).not.toBeNull();
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><Fixture /></NextIntlClientProvider>);
    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
  });

  it("composes caller refs with sortable row and handle refs", async () => {
    const user = userEvent.setup();
    const rowRef = createRef<HTMLTableRowElement>();
    const handleRef = createRef<HTMLButtonElement>();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Table reordering={{ enabled: true, items: ["Alpha"], getItemLabel: (id) => id, onReorder: vi.fn() }}>
          <TableBody>
            <TableRow reorderId="Alpha" ref={rowRef}>
              <TableCell><TableDragHandle ref={handleRef} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </NextIntlClientProvider>,
    );
    expect(rowRef.current).toBe(screen.getByRole("row"));
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    expect(handleRef.current).toBe(handle);
    await user.click(handle);
    await user.keyboard(" ");
    expect(handleRef.current).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Escape}");
  });

  it.each([" ", "{Enter}"])("reorders by keyboard using %s and preserves handle focus", async (key) => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const onOpen = vi.fn();
    renderFixture({ enabled: true, onReorder, onOpen });
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    await user.click(handle);
    expect(onOpen).not.toHaveBeenCalled();
    await user.keyboard(key);
    expect(handle).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Alpha moved to position 2 of 3."));
    await user.keyboard(key);
    await waitFor(() => expect(order()).toEqual(["Beta", "Alpha", "Gamma"]));
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(["Beta", "Alpha", "Gamma"]);
    expect(screen.getByRole("status")).toHaveTextContent("Alpha dropped at position 2 of 3.");
    expect(handle).toHaveFocus();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cancels keyboard movement and leaves the original order intact", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderFixture({ enabled: true, onReorder });
    await user.click(screen.getByRole("button", { name: "Reorder Alpha" }));
    await user.keyboard(" {ArrowDown}{Escape}");
    expect(order()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Reordering Alpha cancelled.");
  });

  it("can disable reordering during a gesture without committing it", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const view = renderFixture({ enabled: true, onReorder });
    await user.click(screen.getByRole("button", { name: "Reorder Alpha" }));
    await user.keyboard(" {ArrowDown}");
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><Fixture onReorder={onReorder} /></NextIntlClientProvider>);
    await user.keyboard(" ");
    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
    expect(order()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not commit a drag after its region unmounts", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const view = renderFixture({ enabled: true, onReorder });
    await user.click(screen.getByRole("button", { name: "Reorder Alpha" }));
    await user.keyboard(" {ArrowDown}");
    view.unmount();
    await user.keyboard(" ");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not reorder past the first or last item or commit a no-op drop", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderFixture({ enabled: true, onReorder });
    await user.click(screen.getByRole("button", { name: "Reorder Alpha" }));
    await user.keyboard(" {ArrowUp} ");
    await user.click(screen.getByRole("button", { name: "Reorder Gamma" }));
    await user.keyboard(" {ArrowDown} ");
    expect(order()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("reorders by mouse from the handle, without activating the row", async () => {
    const onReorder = vi.fn();
    const onOpen = vi.fn();
    renderFixture({ enabled: true, onReorder, onOpen });
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    fireEvent.mouseDown(handle, { clientX: 20, clientY: 28, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 36, buttons: 1 });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.mouseMove(document, { clientX: 20, clientY: 88, buttons: 1 });
    fireEvent.mouseUp(document);
    await waitFor(() => expect(order()).toEqual(["Beta", "Alpha", "Gamma"]));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledOnce();
  });

  it("does not start dragging for a small pointer movement on the handle", () => {
    const onReorder = vi.fn();
    renderFixture({ enabled: true, onReorder });
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    fireEvent.mouseDown(handle, { clientX: 20, clientY: 28, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 31, buttons: 1 });
    fireEvent.mouseUp(document);
    expect(handle).not.toHaveAttribute("aria-pressed", "true");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("keeps ordinary row interaction from activating drag sensors", async () => {
    const onReorder = vi.fn();
    const onOpen = vi.fn();
    renderFixture({ enabled: true, onReorder, onOpen });
    const cell = screen.getByRole("cell", { name: "Alpha" });
    fireEvent.mouseDown(cell, { clientX: 100, clientY: 28, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 88, buttons: 1 });
    fireEvent.mouseUp(document);
    await userEvent.click(cell);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("uses the same controlled reordering for list items and supports touch handles", async () => {
    const onReorder = vi.fn();
    const onOpen = vi.fn();
    renderFixture({ enabled: true, list: true, onReorder, onOpen });
    const handle = screen.getByRole("button", { name: "Reorder Alpha" });
    const touch = (y: number) => ({ identifier: 1, clientX: 20, clientY: y, target: handle });
    expect(handle).toHaveClass("touch-none", "pointer-coarse:size-control-lg");
    fireEvent.touchStart(handle, { touches: [touch(28)] });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.touchMove(handle, { touches: [touch(88)] });
    fireEvent.touchEnd(handle, { touches: [], changedTouches: [touch(88)] });
    await waitFor(() => expect(onReorder).toHaveBeenCalledExactlyOnceWith(["Beta", "Alpha", "Gamma"]));
    expect(within(screen.getByRole("list")).getAllByRole("listitem").map((row) => row.getAttribute("data-reorder-id")))
      .toEqual(["Beta", "Alpha", "Gamma"]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("localizes drag handles, instructions and announcements", async () => {
    const user = userEvent.setup();
    renderFixture({ enabled: true }, "pt-pt");
    const handle = screen.getByRole("button", { name: "Reordenar Alpha" });
    expect(handle).toHaveAccessibleDescription(portuguese.Reordering.instructions);
    await user.click(handle);
    await user.keyboard(" ");
    expect(screen.getByRole("status")).toHaveTextContent("Alpha selecionado para reordenar.");
    await user.keyboard("{Escape}");
  });
});
