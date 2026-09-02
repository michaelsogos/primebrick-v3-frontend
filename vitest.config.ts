import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  server: {
    fs: {
      // Allow Vite to serve files from the workspace root (pnpm hoists
      // @testing-library/svelte to the workspace node_modules, which is
      // outside the project root). Without this, the svelteTesting() plugin's
      // auto-cleanup setup file fails with "Cannot find module '/@fs/...'".
      allow: ['..'],
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["vitest-setup.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,svelte}"],
      exclude: ["src/**/*.test.ts", "src/lib/__tests__/**", "src/**/*.d.ts"],
    },
  },
});
