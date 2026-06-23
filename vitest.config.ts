import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    // es-module-lexer, bundled in the Astro worker, fires a top-level
    // WebAssembly.compile() that Miniflare's test context rejects. The call
    // is fire-and-forget so it never surfaces as a test failure -- only as
    // an unhandled rejection that would otherwise set exit code 1.
    onUnhandledError(error) {
      if ("message" in error && error.message.includes("Wasm code generation disallowed")) {
        return false;
      }
    },
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" }, main: "./dist/server/entry.mjs" })],
        test: {
          name: "workers",
          include: ["tests/integration/api/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["./tests/unit/_setup.ts"],
        },
      },
    ],
  },
});
