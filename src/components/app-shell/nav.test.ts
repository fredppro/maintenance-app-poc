import { describe, expect, it } from "vitest";
import { findNavItem, isNavItemActive, NAV_GROUPS } from "./nav";

const item = (id: string) =>
  NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === id)!;

describe("navigation", () => {
  it("only marks Schedule active on the exact root path", () => {
    expect(isNavItemActive(item("schedule"), "/")).toBe(true);
    expect(isNavItemActive(item("schedule"), "/equipment")).toBe(false);
  });

  it("marks nested routes active without matching look-alike prefixes", () => {
    expect(isNavItemActive(item("equipment"), "/equipment")).toBe(true);
    expect(isNavItemActive(item("equipment"), "/equipment/abc")).toBe(true);
    expect(isNavItemActive(item("equipment"), "/equipment-old")).toBe(false);
  });

  it("resolves the group and item for breadcrumbs", () => {
    expect(findNavItem("/workers")?.group.id).toBe("people");
    expect(findNavItem("/workers")?.item.id).toBe("workers");
    expect(findNavItem("/unknown")).toBeNull();
  });

  it("gives every item a unique route", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
