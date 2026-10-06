import "@testing-library/jest-dom/vitest";

class ResizeObserverStub implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}

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
