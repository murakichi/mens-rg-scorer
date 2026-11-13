import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const chene = (count: number): Item => ({ kind: "motion", motionId: "chene", count });
const T: Item = { kind: "throw" };
const C: Item = { kind: "catch" };

// §3.5.5.5(1) 難易度の高い連続した投げ受け（最大0.10）
//  ① リング・クラブで次々に投げる投げ受けに D難度以上
//  ② 投げた手具を受けると同時に次の投げ受けをする技に D難度以上（全手具）
describe("連続投げ加点は「つながった投げ受け」にだけ付く", () => {
  it("② 受けた直後に次を投げる：スティック・ロープでも加点", () => {
    (["stick", "rope", "clubs", "ring"] as const).forEach((ap) => {
      const r = computeScore([S(T, chene(4), C, T, chene(1), C)], ap);
      expect(r.seriesBonus).toBeCloseTo(0.1, 5);
    });
  });

  it("D難度以上は後ろの投げ受けにあってもよい", () => {
    const r = computeScore([S(T, C, T, chene(3), C)], "stick");
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
  });

  it("キャッチと次の投げの間にタンブリングや徒手が入ると、同じシリーズでも加点しない", () => {
    const tum = computeScore(
      [S(T, chene(4), C, { kind: "skill", skillId: "a_roundoff" }, { kind: "skill", skillId: "b_backsalto" }, T, C)],
      "stick",
    );
    expect(tum.seriesBonus).toBe(0);
    const hand = computeScore([S(T, chene(4), C, chene(1), T, C)], "stick");
    expect(hand.seriesBonus).toBe(0);
  });

  it("つながっていてもD難度以上が無ければ加点しない", () => {
    const r = computeScore([S(T, chene(2), C, T, chene(1), C)], "stick");
    expect(r.seriesBonus).toBe(0);
  });

  it("技の最中の受けの直後に投げるのも②", () => {
    const r = computeScore(
      [S(T, chene(4), { kind: "skill", skillId: "a_roundoff", isCatch: true }, T, C)],
      "clubs",
    );
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
  });

  it("① クラブ・リングで1つ目が空中にあるうちに2つ目を投げる（高難度が後半でも）", () => {
    (["clubs", "ring"] as const).forEach((ap) => {
      const firstHigh = computeScore([S(T, chene(1), T, chene(3), C, chene(1), C)], ap);
      expect(firstHigh.seriesBonus).toBeCloseTo(0.1, 5);
      const secondHigh = computeScore([S(T, chene(1), T, C, chene(4), C)], ap);
      expect(secondHigh.seriesBonus).toBeCloseTo(0.1, 5);
    });
  });

  it("二つ投げ1回だけでは「次々に投げる」にならない", () => {
    const r = computeScore([S({ kind: "throw", reqTypes: ["twothrow"] }, chene(4), { kind: "catch", catchTwo: true })], "clubs");
    expect(r.seriesBonus).toBe(0);
  });
});
