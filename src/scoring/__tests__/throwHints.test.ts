import { describe, it, expect } from "vitest";
import { requiredThrowCounts, twoThrowMotionTotals } from "../analysis";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const chene = (count: number): Item => ({ kind: "motion", motionId: "chene", count });

describe("requiredThrowCounts（必須投げを実施した回数）", () => {
  it("投げアイテムと技の最中の投げの必須投げを数える", () => {
    const counts = requiredThrowCounts([
      S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch", catchTwo: true }),
      S({ kind: "skill", skillId: "b_front", isThrow: true, reqTypes: ["twothrow"] }, { kind: "catch" }),
      S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" }),
    ]);
    expect(counts).toEqual({ twothrow: 2, lefthand: 1 });
  });
});

describe("twoThrowMotionTotals（二つ投げの間の徒手の動作数）", () => {
  it("二つ投げから受けまでの徒手に、その間の合計を付ける", () => {
    const items: Item[] = [
      { kind: "throw", reqTypes: ["twothrow"] },
      chene(2),
      { kind: "motion", motionId: "fwd_roll", count: 1 },
      { kind: "catch", catchTwo: true },
      chene(1),
    ];
    expect(twoThrowMotionTotals(items)).toEqual([null, 3, 3, null, null]);
  });

  it("ふつうの投げの間の徒手には付けない", () => {
    expect(twoThrowMotionTotals([{ kind: "throw" }, chene(4), { kind: "catch" }])).toEqual([null, null, null]);
  });

  it("技の最中の二つ投げにも付く", () => {
    const items: Item[] = [{ kind: "skill", skillId: "b_front", isThrow: true, reqTypes: ["twothrow"] }, chene(4), { kind: "catch", catchTwo: true }];
    expect(twoThrowMotionTotals(items)[1]).toBe(4);
  });
});
