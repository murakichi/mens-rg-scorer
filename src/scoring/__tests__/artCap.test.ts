import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const routine = [S({ kind: "throw" }, { kind: "catch" })];

// §3.5.6.4 欠点テーブルと §7.4.1 の自動判定の整合：
// 深い運動・柔軟は「徒手系の種類・組み合わせの多様性」、手具操作の多様性チェックは「さまざまな操作」に属するので、
// 手入力ぶんと合わせて項目の上限（各1.00）で頭打ちにする。
describe("欠点テーブルの項目上限と自動判定の整合", () => {
  it("未入力なら自動判定ぶんだけ引かれ、上限内なら調整なし", () => {
    const r = computeScore(routine, "stick");
    const hv = r.artItemTotals.find((t) => t.id === "handVariety")!;
    const av = r.artItemTotals.find((t) => t.id === "appVariety")!;
    expect(hv.auto).toBeCloseTo(0.3, 5); // 深い運動2部位 0.2 + 柔軟 0.1
    expect(av.auto).toBeCloseTo(0.7, 5); // スティック：操作チェック3件 0.3 + 身体を離れる操作4回不足 0.4
    expect(r.artCapExcess).toBe(0);
  });

  it("手入力と自動判定の合計が項目の上限を超えた分はA減点に入れない", () => {
    const base = computeScore(routine, "stick");
    const r = computeScore(routine, "stick", { artDeductions: { handVariety: 1.0, appVariety: 1.0 } });
    const hv = r.artItemTotals.find((t) => t.id === "handVariety")!;
    const av = r.artItemTotals.find((t) => t.id === "appVariety")!;
    expect(hv.total).toBeCloseTo(1.0, 5);
    expect(av.total).toBeCloseTo(1.0, 5);
    expect(r.artCapExcess).toBeCloseTo(0.3 + 0.7, 5);
    // 手入力で足した 2.0 のうち、上限まで残っていた 0.7＋0.3 だけ A減点が増える
    expect(r.aDeduction - base.aDeduction).toBeCloseTo(1.0, 5);
  });

  it("上限ちょうどまでは手入力がそのまま効く", () => {
    const base = computeScore(routine, "stick");
    const r = computeScore(routine, "stick", { artDeductions: { appVariety: 0.3 } });
    expect(r.artCapExcess).toBe(0);
    expect(r.aDeduction - base.aDeduction).toBeCloseTo(0.3, 5);
  });
});
