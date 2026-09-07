import { describe, it, expect } from "vitest";
import { calcTumblingDifficulty, analyzeSeries } from "../analysis";
import { skillDifficulty, JUNIOR_THROW_COUNT_REQUIRED, THROW_COUNT_REQUIRED } from "../constants";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
/** 投げ→キャッチ1組 = 投げ1回 */
const throwOnce = (): Series => S({ kind: "throw" }, { kind: "catch" });

describe("ジュニア適用規則 — 難度認定（§10 変更規則1-5）", () => {
  it("ダイビング前宙・後方宙返り半ひねりは一般でB、ジュニアでC", () => {
    expect(skillDifficulty("b_divefront")).toBe("B");
    expect(skillDifficulty("b_backhalf")).toBe("B");
    expect(skillDifficulty("b_divefront", true)).toBe("C");
    expect(skillDifficulty("b_backhalf", true)).toBe("C");
  });

  it("その他の技の難度はジュニアでも変わらない", () => {
    expect(skillDifficulty("b_backsalto", true)).toBe("B");
    expect(skillDifficulty("a_cartwheel", true)).toBe("A");
    expect(skillDifficulty("e_doublelay", true)).toBe("E");
  });

  it("calcTumblingDifficulty がジュニア難度を使う", () => {
    expect(calcTumblingDifficulty(["b_backhalf"], false)).toBe("B");
    expect(calcTumblingDifficulty(["b_backhalf"], false, true)).toBe("C");
    // 2技目以降は (難度-1) 加算：B+B → C、ジュニアは C+C → E
    expect(calcTumblingDifficulty(["b_divefront", "b_backhalf"], false)).toBe("C");
    expect(calcTumblingDifficulty(["b_divefront", "b_backhalf"], false, true)).toBe("E");
  });

  it("analyzeSeries のユニット難度に反映される", () => {
    const ser = S({ kind: "skill", skillId: "b_divefront" }, { kind: "catch" });
    expect(analyzeSeries(ser).units[0].finalDiff).toBe("B");
    expect(analyzeSeries(ser, true).units[0].finalDiff).toBe("C");
  });

  it("computeScore の難度点に反映される（B=0.2 → C=0.3）", () => {
    const routine = [S({ kind: "skill", skillId: "b_backhalf" }, { kind: "catch" })];
    expect(computeScore(routine, "stick").tumblingScore).toBeCloseTo(0.2, 5);
    expect(computeScore(routine, "stick", { junior: true }).tumblingScore).toBeCloseTo(0.3, 5);
  });
});

describe("ジュニア適用規則 — 投げ上げの最低回数", () => {
  it("必要回数は一般3回・ジュニア2回", () => {
    expect(THROW_COUNT_REQUIRED).toBe(3);
    expect(JUNIOR_THROW_COUNT_REQUIRED).toBe(2);
    expect(computeScore([], "stick").requiredThrowCount).toBe(3);
    expect(computeScore([], "stick", { junior: true }).requiredThrowCount).toBe(2);
  });

  it("投げ2回：一般は減点、ジュニアは減点なし", () => {
    // 同一構成の重複シリーズは投げ回数に不算入のため、技術タグで別シリーズにする
    const routine = [
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
    ];
    const normal = computeScore(routine, "stick");
    expect(normal.totalThrowCount).toBe(2);
    expect(normal.throwCountDeduction).toBeCloseTo(0.3, 5);
    expect(normal.required.find((c) => c.key === "count3")?.passed).toBe(false);

    const junior = computeScore(routine, "stick", { junior: true });
    expect(junior.totalThrowCount).toBe(2);
    expect(junior.throwCountDeduction).toBe(0);
    expect(junior.required.find((c) => c.key === "count3")?.passed).toBe(true);
    expect(junior.required.find((c) => c.key === "count3")?.label).toBe("投げを2回以上実施");
  });

  it("投げ1回はジュニアでも減点", () => {
    const r = computeScore([throwOnce()], "stick", { junior: true });
    expect(r.totalThrowCount).toBe(1);
    expect(r.throwCountDeduction).toBeCloseTo(0.3, 5);
    expect(r.required.find((c) => c.key === "count3")?.passed).toBe(false);
  });

  it("A減点の差はちょうど投げ回数不足分（0.3）", () => {
    const routine = [
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
    ];
    const normal = computeScore(routine, "stick");
    const junior = computeScore(routine, "stick", { junior: true });
    expect(normal.aDeduction - junior.aDeduction).toBeCloseTo(0.3, 5);
    expect(junior.aScore - normal.aScore).toBeCloseTo(0.3, 5);
  });
});
