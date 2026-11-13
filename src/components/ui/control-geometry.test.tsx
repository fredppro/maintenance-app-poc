import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { Card } from "./card";
import { Input } from "./input";
import { InputGroup, InputGroupInput } from "./input-group";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Textarea } from "./textarea";

describe("shared control geometry", () => {
  it("uses shared control tokens while keeping structural surfaces restrained", () => {
    render(
      <>
        <Input aria-label="Default input" />
        <Select><SelectTrigger aria-label="Default select"><SelectValue /></SelectTrigger></Select>
        <Button>Default button</Button>
        <InputGroup><InputGroupInput aria-label="Search input" /></InputGroup>
        <Textarea aria-label="Notes" />
        <Card data-testid="card">Content</Card>
      </>,
    );
    for (const control of [
      screen.getByRole("textbox", { name: "Default input" }),
      screen.getByRole("combobox", { name: "Default select" }),
      screen.getByRole("button", { name: "Default button" }),
    ]) {
      expect(control).toHaveClass("rounded-control");
    }
    expect(screen.getByRole("textbox", { name: "Default input" })).toHaveClass("h-control");
    expect(screen.getByRole("textbox", { name: "Search input" }).parentElement).toHaveClass("h-control", "rounded-control");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveClass("rounded-control-sm", "min-h-20");
    expect(screen.getByTestId("card")).toHaveClass("rounded-xl");
    expect(screen.getByTestId("card")).not.toHaveClass("rounded-control");
  });

  it("exposes explicit compact variants without leaking custom attributes to the DOM", () => {
    render(
      <>
        <Input aria-label="Compact input" controlSize="sm" />
        <Button size="sm">Compact button</Button>
        <InputGroup controlSize="sm"><InputGroupInput aria-label="Compact search" controlSize="sm" /></InputGroup>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Compact input" })).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("textbox", { name: "Compact input" })).not.toHaveAttribute("controlSize");
    expect(screen.getByRole("button", { name: "Compact button" })).toHaveClass("h-control-sm", "rounded-control-sm");
    expect(screen.getByRole("textbox", { name: "Compact search" }).parentElement).toHaveAttribute("data-size", "sm");
  });

  it("keeps rounded ends on grouped controls and concentric tab radii", () => {
    render(
      <>
        <ButtonGroup aria-label="Navigation"><Button>Previous</Button><Button>Today</Button><Button>Next</Button></ButtonGroup>
        <Tabs defaultValue="details"><TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="execution">Execution</TabsTrigger></TabsList></Tabs>
      </>,
    );
    expect(screen.getByRole("group", { name: "Navigation" })).toHaveClass("rounded-control");
    expect(screen.getByRole("tablist")).toHaveClass("rounded-control", "p-1", "h-control");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveClass("rounded-control-inner");
  });
});
