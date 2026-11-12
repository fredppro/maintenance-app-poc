import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn utility", () => {
  it("merges single and multiple class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional class objects and falsy values", () => {
    expect(cn("base", false && "hidden", null, undefined, "active")).toBe("base active");
    expect(cn({ "bg-red-500": true, "text-white": false })).toBe("bg-red-500");
  });

  it("resolves Tailwind class conflicts properly", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("resolves shared geometry tokens against standard and arbitrary utilities", () => {
    expect(cn("h-control", "size-(--cell-size)")).toBe("size-(--cell-size)");
    expect(cn("size-control", "size-auto", "w-full")).toBe("size-auto w-full");
    expect(cn("pointer-coarse:size-control-lg", "pointer-coarse:size-auto")).toBe("pointer-coarse:size-auto");
    expect(cn("rounded-control", "rounded-control-sm")).toBe("rounded-control-sm");
    expect(cn("rounded-control", "rounded-none")).toBe("rounded-none");
    expect(cn("gap-form", "gap-section")).toBe("gap-section");
    expect(cn("px-control-padding", "px-0")).toBe("px-0");
    expect(cn("tracking-tight", "tracking-ui")).toBe("tracking-ui");
  });
});
