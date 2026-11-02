import { describe, expect, it } from "vitest";
import {
  EXPORT_TEMP_GLOBAL_BUDGET_BYTES,
  EXPORT_TEMP_RESERVATION_BYTES,
  MAX_CONCURRENT_EXPORTS,
  isExportRecoverable,
  STALE_EXPORT_AFTER_MS,
} from "./export-policy";

describe("export temporary storage budget", () => {
  it("matches the reserved capacity per distributed worker slot", () => {
    expect(EXPORT_TEMP_RESERVATION_BYTES).toBe(120 * 1024 * 1024);
    expect(MAX_CONCURRENT_EXPORTS).toBe(4);
    expect(EXPORT_TEMP_GLOBAL_BUDGET_BYTES).toBe(
      EXPORT_TEMP_RESERVATION_BYTES * MAX_CONCURRENT_EXPORTS,
    );
  });
});

describe("isExportRecoverable", () => {
  const now = new Date("2026-11-02T10:00:00.000Z").getTime();

  it("allows pending exports to be rescheduled", () => {
    expect(isExportRecoverable("PENDING", null, now)).toBe(true);
  });

  it("allows running exports with no heartbeat or a stale heartbeat to be reclaimed", () => {
    expect(isExportRecoverable("RUNNING", null, now)).toBe(true);
    expect(
      isExportRecoverable(
        "RUNNING",
        new Date(now - STALE_EXPORT_AFTER_MS),
        now,
      ),
    ).toBe(true);
  });

  it("does not recover a recently heartbeating or terminal export", () => {
    expect(
      isExportRecoverable("RUNNING", new Date(now - 30_000).toISOString(), now),
    ).toBe(false);
    expect(isExportRecoverable("READY", null, now)).toBe(false);
    expect(isExportRecoverable("FAILED", null, now)).toBe(false);
  });
});
