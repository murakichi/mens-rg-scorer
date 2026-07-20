import { defineConfig } from "vitest/config";

// Node 環境で純粋な採点ロジック（src/scoring/）を検証する。
// UI は対象外（E2E は scoring-test skill を参照）。
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
