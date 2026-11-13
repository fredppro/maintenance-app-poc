import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getRequestConfig: (factory: unknown) => factory,
}));

import getRequestConfig from "./request";

describe("internationalized request clock", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["en", "pt-pt"])("provides a serializable server clock snapshot for %s hydration", async (locale) => {
    vi.useFakeTimers();
    const now = new Date("2026-10-25T01:30:45.123Z");
    vi.setSystemTime(now);
    const config = await getRequestConfig({ requestLocale: Promise.resolve(locale) });
    expect(config.now).toEqual(now);
    expect(config.locale).toBe(locale);
    expect(config.timeZone).toBe("Europe/Lisbon");
    expect(config.messages).toBeDefined();
  });
});
