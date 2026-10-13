import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "dist"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      src: fileURLToPath(new URL("./src", import.meta.url)),
      "next/navigation": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next/navigation.js": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next/link": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next/link.js": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next/headers": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next/headers.js": fileURLToPath(new URL("./vitest/next-stubs.ts", import.meta.url)),
      "next-intl/navigation": fileURLToPath(
        new URL("./vitest/next-intl-navigation.ts", import.meta.url),
      ),
    },
  },
});
