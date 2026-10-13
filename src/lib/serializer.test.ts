import { describe, expect, it } from "vitest";
import { toClientSafe, toNumberOrNull } from "./serializer";

describe("toNumberOrNull", () => {
  it("returns null for null and undefined", () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it("handles numbers properly", () => {
    expect(toNumberOrNull(42)).toBe(42);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull(-15.75)).toBe(-15.75);
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
    expect(toNumberOrNull(-Infinity)).toBeNull();
  });

  it("parses numeric strings", () => {
    expect(toNumberOrNull("123")).toBe(123);
    expect(toNumberOrNull("45.67")).toBe(45.67);
    expect(toNumberOrNull("0")).toBe(0);
    expect(toNumberOrNull("invalid")).toBeNull();
    expect(toNumberOrNull("")).toBe(0);
  });

  it("handles objects with toNumber method (Prisma Decimal)", () => {
    const decimalLike = {
      toNumber: () => 99.99,
    };
    expect(toNumberOrNull(decimalLike)).toBe(99.99);

    const invalidDecimalLike = {
      toNumber: () => NaN,
    };
    expect(toNumberOrNull(invalidDecimalLike)).toBeNull();
  });

  it("returns null for other non-numeric types", () => {
    expect(toNumberOrNull({})).toBeNull();
    expect(toNumberOrNull([])).toBeNull();
    expect(toNumberOrNull(true)).toBeNull();
  });
});

describe("toClientSafe", () => {
  it("passes through primitives unchanged", () => {
    expect(toClientSafe(null)).toBeNull();
    expect(toClientSafe(undefined)).toBeUndefined();
    expect(toClientSafe("hello")).toBe("hello");
    expect(toClientSafe(123)).toBe(123);
    expect(toClientSafe(true)).toBe(true);
    expect(toClientSafe(false)).toBe(false);
  });

  it("converts BigInt to string", () => {
    expect(toClientSafe(BigInt(9007199254740991))).toBe("9007199254740991");
  });

  it("preserves native Date instances", () => {
    const date = new Date("2026-05-01T12:00:00.000Z");
    const result = toClientSafe(date);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-05-01T12:00:00.000Z");
  });

  it("converts Prisma Decimal-like objects via toNumber()", () => {
    const decimalObj = { toNumber: () => 49.99 };
    expect(toClientSafe(decimalObj)).toBe(49.99);
  });

  it("converts objects with toJSON method", () => {
    const jsonable = {
      toJSON: () => ({ converted: true, value: 10 }),
    };
    expect(toClientSafe(jsonable)).toEqual({ converted: true, value: 10 });
  });

  it("recursively converts arrays", () => {
    const input = [1, "two", BigInt(3), { toNumber: () => 4.5 }];
    expect(toClientSafe(input)).toEqual([1, "two", "3", 4.5]);
  });

  it("recursively converts plain objects with nested data", () => {
    const date = new Date("2026-08-01T09:00:00.000Z");
    const input = {
      id: "task-1",
      title: "Pump Repair",
      cost: { toNumber: () => 150.5 },
      count: BigInt(10),
      scheduledAt: date,
      tags: ["urgent", "mechanical"],
      metadata: {
        vendor: "Acme Corp",
        rate: { toNumber: () => 75.0 },
      },
    };

    const output = toClientSafe(input) as Record<string, unknown>;
    expect(output.id).toBe("task-1");
    expect(output.title).toBe("Pump Repair");
    expect(output.cost).toBe(150.5);
    expect(output.count).toBe("10");
    expect(output.scheduledAt).toBe(date);
    expect(output.tags).toEqual(["urgent", "mechanical"]);
    expect(output.metadata).toEqual({
      vendor: "Acme Corp",
      rate: 75.0,
    });
  });

  it("falls back to String conversion for other non-plain objects", () => {
    class CustomClass {
      toString() {
        return "custom-instance";
      }
    }
    expect(toClientSafe(new CustomClass())).toBe("custom-instance");
  });
});
