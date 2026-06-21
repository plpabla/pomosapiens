import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: {
          name: "workers",
          include: ["tests/integration/api/**/*.test.ts"],
        },
      },
      // Phase 2 jsdom project -- append here when adding unit/component tests:
      // {
      //   test: {
      //     name: "jsdom",
      //     environment: "jsdom",
      //     include: ["tests/unit/**/*.test.ts"],
      //   },
      // },
    ],
  },
});
