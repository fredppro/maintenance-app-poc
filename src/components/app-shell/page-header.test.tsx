import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageBody, PageGrid, PageHeader, PageRegion } from "./page-header";

describe("responsive page layout", () => {
  it("keeps the page fluid and anchored to the shell gutters", () => {
    const { container } = render(
      <PageBody>
        <PageHeader title="Equipment" />
      </PageBody>,
    );
    const body = container.querySelector("[data-slot=page-body]");
    expect(body).toHaveClass("@container/page", "w-full", "min-w-0", "p-page", "sm:p-page-desktop");
    expect(body?.className).not.toMatch(/\b(?:mx-auto|max-w-)/);
    expect(screen.getByRole("heading", { level: 1, name: "Equipment" })).toBeVisible();
  });

  it("preserves the full-height scheduler workspace without changing its gutters", () => {
    const { container } = render(<PageBody layout="workspace">Timeline</PageBody>);
    expect(container.firstElementChild).toHaveClass(
      "h-full", "min-h-0", "overflow-y-auto", "w-full", "p-page", "sm:p-page-desktop",
    );
  });

  it("constrains form regions explicitly without centering them", () => {
    const { container } = render(
      <PageBody>
        <PageRegion width="form">
          <PageHeader title="Organization" />
          <form aria-label="Organization settings" />
        </PageRegion>
      </PageBody>,
    );
    const region = container.querySelector("[data-slot=page-region]");
    expect(region).toHaveAttribute("data-width", "form");
    expect(region).toHaveClass("@container/page", "w-full", "max-w-(--content-width-form)", "gap-section");
    expect(region).not.toHaveClass("mx-auto");
    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("leaves full regions unconstrained", () => {
    const { container } = render(<PageRegion>Inventory</PageRegion>);
    expect(container.firstElementChild?.className).not.toMatch(/\b(?:mx-auto|max-w-)/);
  });

  it("bases panel columns on available container width rather than viewport width", () => {
    const { container } = render(<PageGrid><section>Type</section><section>Status</section></PageGrid>);
    expect(container.firstElementChild).toHaveClass(
      "grid-cols-1", "gap-section", "@2xl/page:grid-cols-2", "@6xl/page:grid-cols-3",
    );
    expect(container.firstElementChild?.className).not.toMatch(/\b(?:sm|md|lg|xl|2xl):grid-cols-/);
  });

  it("keeps compact workspace headings and wrapping actions in the shared header", () => {
    const { container } = render(
      <PageHeader title="Schedule" layout="compact" actions={<button>Schedule maintenance</button>} />,
    );
    expect(container.firstElementChild).toHaveClass("flex-row", "flex-wrap");
    expect(screen.getByRole("button").parentElement).toHaveClass("flex-wrap");
    expect(screen.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  });
});
