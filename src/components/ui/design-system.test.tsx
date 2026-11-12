import { fireEvent, render, screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Empty, EmptyTitle } from "./empty";
import { Input } from "./input";
import { Progress } from "./progress";
import { semanticTones } from "./semantic-tones";
import { Table, TableBody, TableCell, TableEmptyRow, TableHead, TableHeader, TableRow, TableSurface } from "./table";

describe("design-system contracts", () => {
  it.each(["default", "secondary", "outline", "destructive", "success", "warning", "info", "danger", "neutral"] as const)(
    "keeps badge geometry independent of the %s variant",
    (variant) => {
      render(<Badge variant={variant}><Check />Status</Badge>);
      const badge = screen.getByText("Status");
      expect(badge).toHaveAttribute("data-variant", variant);
      expect(badge).toHaveClass("min-h-badge", "rounded-md", "px-2", "py-0.5", "text-xs", "leading-4", "font-medium", "tracking-ui", "gap-1");
    },
  );

  it("uses the same semantic tones for badges and chart indicators", () => {
    render(<><Badge variant="success">Completed</Badge><Progress aria-label="Completed work" value={50} tone="success" /></>);
    expect(screen.getByText("Completed")).toHaveClass(...semanticTones.success.badge.split(" "));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass(semanticTones.success.indicator);
  });

  it("exposes compact and flexible actions without local geometry overrides", () => {
    render(<><Button size="icon-xs" aria-label="Help"><Check /></Button><Button size="row">Open worker</Button><Input aria-label="Checklist item" variant="inline" controlSize="sm" /></>);
    expect(screen.getByRole("button", { name: "Help" })).toHaveClass("size-control-xs", "pointer-coarse:size-control-lg");
    expect(screen.getByRole("button", { name: "Open worker" })).toHaveClass("h-auto", "min-h-control", "rounded-md");
    expect(screen.getByRole("textbox")).toHaveAttribute("data-variant", "inline");
    expect(screen.getByRole("textbox")).toHaveClass("focus-visible:ring-[3px]");
  });

  it("retains default card geometry and gives dense panels explicit variants", () => {
    const { container } = render(<Card density="compact" layout="sectioned"><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent>Notifications</CardContent></Card>);
    const card = container.querySelector("[data-slot=card]");
    expect(card).toHaveAttribute("data-density", "compact");
    expect(card).toHaveAttribute("data-layout", "sectioned");
    expect(card).toHaveClass("rounded-xl", "gap-0", "py-0");
    expect(card).not.toHaveClass("py-6", "gap-section");
  });

  it("keeps table semantics, numeric alignment, empty rows and row activation intact", () => {
    const onOpen = vi.fn();
    render(<TableSurface><Table aria-label="Parts"><TableHeader><TableRow><TableHead>Part</TableHead><TableHead numeric>Quantity</TableHead></TableRow></TableHeader><TableBody><TableRow onClick={onOpen}><TableCell>Bearing</TableCell><TableCell numeric>12</TableCell></TableRow><TableEmptyRow colSpan={2}>No more parts</TableEmptyRow></TableBody></Table></TableSurface>);
    expect(screen.getByRole("columnheader", { name: "Quantity" })).toHaveClass("text-right", "tabular-nums");
    expect(screen.getByRole("cell", { name: "12" })).toHaveClass("text-right", "px-table-cell", "py-2");
    expect(screen.getByRole("row", { name: "Bearing 12" })).toHaveClass("h-table-row");
    expect(screen.getByRole("cell", { name: "No more parts" })).toHaveAttribute("colspan", "2");
    fireEvent.click(screen.getByRole("row", { name: "Bearing 12" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("table").closest("[data-slot=table-surface]")).toHaveClass("rounded-lg");
  });

  it("distinguishes page and inline empty states without ad-hoc styling", () => {
    render(<><Empty variant="surface"><EmptyTitle>No equipment</EmptyTitle></Empty><Empty variant="inline"><EmptyTitle>No stock</EmptyTitle></Empty></>);
    expect(screen.getByText("No equipment").parentElement).toHaveAttribute("data-variant", "surface");
    expect(screen.getByText("No stock").parentElement).toHaveClass("flex-row", "p-3", "md:p-3");
  });
});
