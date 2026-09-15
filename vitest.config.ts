import { defineConfig } from "vitest/config";

// Node 環境で純粋な採点ロジック（src/scoring/）を検証する。
// UI は対象外（E2E は scoring-test skill を参照）。
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 生成器（generate / autoThrows / autoTumblings）のランダムテストは1件で数秒かかる。
    // 既定の5秒だとローカルでもCIでも境界で落ちるため余裕を持たせる（遅さ自体の改善は別issue）。
    testTimeout: 30000,
  },
});
