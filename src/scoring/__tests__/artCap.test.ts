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
    expect(hv.auto).toBeCloseTo(0.6, 5); // 深い運動2部位まったく無し 0.4 + 柔軟なし 0.2（明確に欠ける）
    // スティック：左右のバランス0.2・上肢以外0.2・2部位0.2・特性0.1 + 手離し4回不足 4×0.05
    expect(av.auto).toBeCloseTo(0.9, 5);
    expect(r.artCapExcess).toBe(0);
  });

  it("手入力と自動判定の合計が項目の上限を超えた分はA減点に入れない", () => {
    const base = computeScore(routine, "stick");
    const r = computeScore(routine, "stick", { artDeductions: { handVariety: 1.0, appVariety: 1.0 } });
    const hv = r.artItemTotals.find((t) => t.id === "handVariety")!;
    const av = r.artItemTotals.find((t) => t.id === "appVariety")!;
    expect(hv.total).toBeCloseTo(1.0, 5);
    expect(av.total).toBeCloseTo(1.0, 5);
    expect(r.artCapExcess).toBeCloseTo(0.6 + 0.9, 5);
    // 手入力で足した 2.0 のうち、上限まで残っていた 0.4＋0.1 だけ A減点が増える
    expect(r.aDeduction - base.aDeduction).toBeCloseTo(0.5, 5);
  });

  it("上限ちょうどまでは手入力がそのまま効く", () => {
    const base = computeScore(routine, "stick");
    const r = computeScore(routine, "stick", { artDeductions: { appVariety: 0.1 } });
    expect(r.artCapExcess).toBe(0);
    expect(r.aDeduction - base.aDeduction).toBeCloseTo(0.1, 5);
  });

  // 研修資料（2026）の細目：転回系の多様性 0.50 ＝ 種類0.2＋宙返りの連続0.2＋つなぎ0.1
  it("転回系の多様性は宙返りの連続・つなぎの自動判定と手入力を合わせて0.50まで", () => {
    const base = computeScore(routine, "stick");
    const tv = base.artItemTotals.find((t) => t.id === "tumVariety")!;
    expect(tv.auto).toBeCloseTo(0.3, 5); // 宙返りの連続なし0.2 + つなぎ技なし0.1
    const r = computeScore(routine, "stick", { artDeductions: { tumVariety: 0.5 } });
    expect(r.artItemTotals.find((t) => t.id === "tumVariety")!.total).toBeCloseTo(0.5, 5);
    expect(r.aDeduction - base.aDeduction).toBeCloseTo(0.2, 5);
  });

  // 転回中の手具操作（0〜0.40）は、手具操作なしの自動判定と手入力の大きいほう（足し合わせない）
  it("転回中の操作は手具操作なしの自動判定と手入力の大きいほう＋2種類以上で0.50まで", () => {
    const noOp = [S({ kind: "skill", skillId: "c_back15" }, { kind: "skill", skillId: "b_front" })];
    const base = computeScore(noOp, "stick", { handOpCounts: { tumOpKinds: 2 } });
    expect(base.noApparatusDeduction).toBeCloseTo(0.2, 5);
    expect(base.tumOpKindsDeduction).toBe(0);
    // 手入力0.3 → 大きいほう0.3（0.2＋0.3＝0.5 にはしない）
    const r3 = computeScore(noOp, "stick", { handOpCounts: { tumOpKinds: 2 }, artDeductions: { appInTumbling: 0.3 } });
    expect(r3.artItemTotals.find((t) => t.id === "appInTumbling")!.total).toBeCloseTo(0.3, 5);
    expect(r3.aDeduction - base.aDeduction).toBeCloseTo(0.1, 5);
    // 手入力が自動判定より小さければ増えない
    const r1 = computeScore(noOp, "stick", { handOpCounts: { tumOpKinds: 2 }, artDeductions: { appInTumbling: 0.1 } });
    expect(r1.aDeduction).toBeCloseTo(base.aDeduction, 5);
    // 前の細目は0.40まで、2種類未満の0.1と合わせて0.50
    const max = computeScore(noOp, "stick", { artDeductions: { appInTumbling: 0.5 } });
    expect(max.artItemTotals.find((t) => t.id === "appInTumbling")!.total).toBeCloseTo(0.5, 5);
  });
});
