import { describe, expect, it } from "vitest";
import { organizationSlug } from "./slug";

describe("organizationSlug", () => {
  it("lowercases, strips accents and collapses symbols", () => {
    expect(organizationSlug("Águas & Energia, Lda.", "abc12345")).toBe(
      "aguas-energia-lda-abc12345",
    );
  });

  it("adds a random suffix by default so equal names do not collide", () => {
    expect(organizationSlug("ACME")).toMatch(/^acme-[0-9a-f]{8}$/);
    expect(organizationSlug("ACME")).not.toBe(organizationSlug("ACME"));
  });

  it("limits the readable part to 48 characters", () => {
    expect(organizationSlug("a".repeat(80), "x")).toBe(`${"a".repeat(48)}-x`);
  });

  it("rejects names with no usable characters", () => {
    expect(() => organizationSlug("***")).toThrow("cannot form a URL slug");
  });
});
