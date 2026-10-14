import { describe, it, expect } from "vitest";
import { aRows, dRows, nonZero } from "./scoreRows";
import { computeScore } from "../scoring/score";
import { ART_DEDUCTION_ITEMS, VIOLATION_OPTIONS } from "../scoring/constants";
import type { Item, Series } from "../scoring/types";

const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });

const routines: { name: string; series: Series[] }[] = [
  {
    name: "投げとタンブリング",
    series: [
      {
        executionDeduction: 0,
        items: [
          { kind: "throw", throwTypes: ["noview"], reqTypes: ["lefthand"] },
          { kind: "motion", motionId: "chene", count: 3 },
          { kind: "catch", catchTypes: ["nonhand"] },
        ],
      },
      { executionDeduction: 0, items: [skill("a_roundoff"), skill("c_back15"), skill("b_front")] },
    ],
  },
  { name: "最小", series: [{ executionDeduction: 0, items: [skill("a_roundoff"), skill("b_backsalto")] }] },
  { name: "空", series: [{ executionDeduction: 0, items: [] }] },
];

describe("内訳の行が合計と一致する", () => {
  routines.forEach(({ name, series }) => {
    it(`D内訳の合計が dScore と一致する: ${name}`, () => {
      const r = computeScore(series, "stick", {});
      const sum = dRows(r).reduce((n, row) => n + row.value, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(r.dScore, 6);
    });

    it(`A内訳の合計が aDeduction と一致する: ${name}`, () => {
      const r = computeScore(series, "stick", {});
      const sum = aRows(r).reduce((n, row) => n + row.value, 0);
      expect(Math.round(sum * 10) / 10).toBeCloseTo(r.aDeduction, 6);
    });
  });

  it("審判入力（違反・芸術の欠点）を入れても一致する", () => {
    const violations = VIOLATION_OPTIONS.map((v) => v.id);
    const artDeductions: Record<string, number> = {};
    ART_DEDUCTION_ITEMS.forEach((i) => (artDeductions[i.id] = i.max));
    const r = computeScore(routines[0].series, "stick", { violations, artDeductions });
    const sum = aRows(r).reduce((n, row) => n + row.value, 0);
    expect(Math.round(sum * 10) / 10).toBeCloseTo(r.aDeduction, 6);
  });

  it("「その他の減点」は通常0（ここに出たら分類の足し忘れ）", () => {
    const r = computeScore(routines[0].series, "stick", {});
    expect(aRows(r).find((row) => row.label === "その他の減点")!.value).toBe(0);
  });

  it("0点の行を落としても合計は変わらない", () => {
    const r = computeScore(routines[0].series, "stick", {});
    const all = aRows(r).reduce((n, row) => n + row.value, 0);
    const some = nonZero(aRows(r)).reduce((n, row) => n + row.value, 0);
    expect(some).toBeCloseTo(all, 6);
    expect(nonZero(aRows(r)).every((row) => row.value > 0)).toBe(true);
  });
});
