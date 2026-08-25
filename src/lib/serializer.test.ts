import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { toClientSafe, toNumberOrNull } from "./serializer";

describe("toNumberOrNull", () => {
  test("returns null for null and undefined", () => {
    assert.strictEqual(toNumberOrNull(null), null);
    assert.strictEqual(toNumberOrNull(undefined), null);
  });

  test("handles numbers properly", () => {
    assert.strictEqual(toNumberOrNull(42), 42);
    assert.strictEqual(toNumberOrNull(0), 0);
    assert.strictEqual(toNumberOrNull(-15.75), -15.75);
    assert.strictEqual(toNumberOrNull(NaN), null);
    assert.strictEqual(toNumberOrNull(Infinity), null);
    assert.strictEqual(toNumberOrNull(-Infinity), null);
  });

  test("parses numeric strings", () => {
    assert.strictEqual(toNumberOrNull("123"), 123);
    assert.strictEqual(toNumberOrNull("45.67"), 45.67);
    assert.strictEqual(toNumberOrNull("0"), 0);
    assert.strictEqual(toNumberOrNull("invalid"), null);
    assert.strictEqual(toNumberOrNull(""), 0);
  });

  test("handles objects with toNumber method (Prisma Decimal)", () => {
    const decimalLike = {
      toNumber: () => 99.99,
    };
    assert.strictEqual(toNumberOrNull(decimalLike), 99.99);

    const invalidDecimalLike = {
      toNumber: () => NaN,
    };
    assert.strictEqual(toNumberOrNull(invalidDecimalLike), null);
  });

  test("returns null for other non-numeric types", () => {
    assert.strictEqual(toNumberOrNull({}), null);
    assert.strictEqual(toNumberOrNull([]), null);
    assert.strictEqual(toNumberOrNull(true), null);
  });
});

describe("toClientSafe", () => {
  test("passes through primitives unchanged", () => {
    assert.strictEqual(toClientSafe(null), null);
    assert.strictEqual(toClientSafe(undefined), undefined);
    assert.strictEqual(toClientSafe("hello"), "hello");
    assert.strictEqual(toClientSafe(123), 123);
    assert.strictEqual(toClientSafe(true), true);
    assert.strictEqual(toClientSafe(false), false);
  });

  test("converts BigInt to string", () => {
    assert.strictEqual(toClientSafe(BigInt(9007199254740991)), "9007199254740991");
  });

  test("preserves native Date instances", () => {
    const date = new Date("2026-05-01T12:00:00.000Z");
    const result = toClientSafe(date);
    assert.ok(result instanceof Date);
    assert.strictEqual((result as Date).toISOString(), "2026-05-01T12:00:00.000Z");
  });

  test("converts Prisma Decimal-like objects via toNumber()", () => {
    const decimalObj = { toNumber: () => 49.99 };
    assert.strictEqual(toClientSafe(decimalObj), 49.99);
  });

  test("converts objects with toJSON method", () => {
    const jsonable = {
      toJSON: () => ({ converted: true, value: 10 }),
    };
    assert.deepStrictEqual(toClientSafe(jsonable), { converted: true, value: 10 });
  });

  test("recursively converts arrays", () => {
    const input = [1, "two", BigInt(3), { toNumber: () => 4.5 }];
    assert.deepStrictEqual(toClientSafe(input), [1, "two", "3", 4.5]);
  });

  test("recursively converts plain objects with nested data", () => {
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
    assert.strictEqual(output.id, "task-1");
    assert.strictEqual(output.title, "Pump Repair");
    assert.strictEqual(output.cost, 150.5);
    assert.strictEqual(output.count, "10");
    assert.strictEqual(output.scheduledAt, date);
    assert.deepStrictEqual(output.tags, ["urgent", "mechanical"]);
    assert.deepStrictEqual(output.metadata, {
      vendor: "Acme Corp",
      rate: 75.0,
    });
  });

  test("falls back to String conversion for other non-plain objects", () => {
    class CustomClass {
      toString() {
        return "custom-instance";
      }
    }
    assert.strictEqual(toClientSafe(new CustomClass()), "custom-instance");
  });
});
