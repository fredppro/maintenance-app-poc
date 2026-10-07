import "@testing-library/jest-dom/vitest";

process.env.BETTER_AUTH_SECRET ??=
  "vitest-secret-that-is-at-least-thirty-two-characters-long";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/maintenance_app_test";

// Keep the DOM environment stable across feature tests.
if (typeof window !== "undefined") {
  window.matchMedia ??= (() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any;
}
