import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

describe("shared sheet contract", () => {
  it.each(["right", "left", "top", "bottom"] as const)(
    "defaults to the same inset surface on the %s side",
    (side) => {
      render(
        <Sheet defaultOpen>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Edit details</SheetTitle>
              <SheetDescription>Update the selected item.</SheetDescription>
            </SheetHeader>
            <SheetBody>Fields</SheetBody>
            <SheetFooter><button>Save</button></SheetFooter>
          </SheetContent>
        </Sheet>,
      );
      const dialog = screen.getByRole("dialog", { name: "Edit details" });
      expect(dialog).toHaveAttribute("data-variant", "inset");
      expect(dialog).toHaveAttribute("data-side", side);
      expect(dialog).toHaveClass("overflow-hidden", "gap-0", "sm:rounded-sheet", "sm:border", `sm:${side}-sheet-inset`);
      expect(dialog).not.toHaveClass("overflow-y-auto");
      expect(dialog.querySelector("[data-slot=sheet-header]")).toHaveClass("shrink-0", "px-page", "sm:px-page-desktop");
      expect(dialog.querySelector("[data-slot=sheet-body]")).toHaveClass("relative", "min-h-0", "flex-1", "overflow-y-auto", "overscroll-contain", "px-page", "sm:px-page-desktop");
      expect(dialog.querySelector("[data-slot=sheet-footer]")).toHaveClass("shrink-0", "flex-wrap", "justify-end");
      expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    },
  );

  it("preserves an explicit edge-attached variant for mobile navigation", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent side="left" variant="default">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Application navigation</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("data-variant", "default");
    expect(dialog).toHaveClass("inset-y-0", "left-0", "h-dvh");
    expect(dialog).not.toHaveClass("sm:rounded-sheet", "sm:inset-y-sheet-inset");
  });

  it("supports a scrolling native form without an extra wrapper or losing submission", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New item</SheetTitle>
            <SheetDescription>Enter its name.</SheetDescription>
          </SheetHeader>
          <SheetBody asChild>
            <form id="new-item" onSubmit={submit}>
              <input aria-label="Name" required />
            </form>
          </SheetBody>
          <SheetFooter><button type="submit" form="new-item">Save</button></SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    const form = screen.getByRole("dialog").querySelector("form");
    expect(form).toHaveAttribute("data-slot", "sheet-body");
    expect(form).toHaveClass("overflow-y-auto");
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Bearing");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("preserves Escape, localized close labels and trigger focus return", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open editor</SheetTrigger>
        <SheetContent closeLabel="Fechar">
          <SheetTitle>Editor</SheetTitle>
          <SheetDescription>Update details</SheetDescription>
          <SheetBody><input aria-label="Name" /></SheetBody>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Open editor" }));
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open editor" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Open editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
