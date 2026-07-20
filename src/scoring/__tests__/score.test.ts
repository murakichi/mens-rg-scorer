import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

describe("computeScore — 空の演技（回帰アンカー）", () => {
  it("演技が空ならすべての必須要素が不足し、A満点から規定減点される", () => {
    const r = computeScore([], "stick");
    expect(r.dScore).toBe(0);
    expect(r.eScore).toBe(10);
    // 方向系3不足(0.9) + 投げ不足(0.3) + 宙返り連続なし(0.2) + 多様性上限(0.5)
    //  + スティック手具別必須要素4項目未実施(4×0.3=1.2) = 3.1
    expect(r.aDeduction).toBeCloseTo(3.1, 5);
    expect(r.aScore).toBeCloseTo(6.9, 5);
    expect(r.grandTotal).toBeCloseTo(16.9, 5);
    expect(r.missing.length).toBeGreaterThan(0);
    // 手具別必須要素は未実施4項目で −1.2
    expect(r.apparatusElementDeduction).toBeCloseTo(1.2, 5);
  });
});

describe("computeScore — 難度採用は上位3ユニット", () => {
  it("タンブリングは finalDiff 上位3つのみ採用する", () => {
    // 4本の tumbling: E,D,C,B → 上位3 (E=0.7, D=0.5, C=0.3) = 1.5、B は不採用
    const tum = (skillId: string) => S({ kind: "skill", skillId }, { kind: "catch" });
    const r = computeScore(
      [tum("e_doublelay"), tum("d_doubleback"), tum("c_back15"), tum("b_backsalto")],
      "stick",
    );
    expect(r.tumblingScore).toBeCloseTo(1.5, 5);
  });
});

describe("computeScore — スティックの必須投げ（左手投げ）", () => {
  it("左手投げが無ければ appThrow が不足", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    const appThrow = r.required.find((c) => c.key === "appThrow");
    expect(appThrow?.passed).toBe(false);
  });
  it("左手投げを実施すれば appThrow を満たす", () => {
    const r = computeScore(
      [S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" })],
      "stick",
    );
    const appThrow = r.required.find((c) => c.key === "appThrow");
    expect(appThrow?.passed).toBe(true);
  });
});
