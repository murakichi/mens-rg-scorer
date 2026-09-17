import { defineConfig } from "vitest/config";

// Node 環境で純粋な採点ロジック（src/scoring/）を検証する。
// UI は対象外（E2E は scoring-test skill を参照）。
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // ランダム生成のテストは1構成あたり0.2〜0.4秒かかるので、既定の5秒では足りない
    // （候補の形が増えるたびに個別の timeout を足すのは追いつかないので、まとめて伸ばす）
    testTimeout: 60_000,
  },
});
