import { describe, it, expect } from "vitest";
import {
  extraTwoThrowSeriesCount,
  generateRoutine,
  TWO_THROW_EXTRA_WEIGHT,
  TWO_THROW_TUMBLING_WEIGHT,
  REQUIRED_ELEMENT_WEIGHT,
  twoThrowTumblingCount,
} from "../generate";
import { computeScore } from "../score";
import { seededRandom } from "../probe";
import type { ApparatusKey, Series } from "../types";

const twoThrowSeries = (): Series =>
  ({
    items: [{ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch" }],
  }) as Series;
const plain = (): Series => ({ items: [{ kind: "throw" }, { kind: "catch" }] }) as Series;
const twoInSkill = (): Series =>
  ({
    items: [{ kind: "skill", skillId: "a_roundoff", isThrow: true, reqTypes: ["twothrow"] }, { kind: "catch" }],
  }) as Series;

describe("二つ投げのシリーズは1構成に1本まで", () => {
  it("2本目以降を数える（投げのシリーズ・技の最中の投げのどちらも）", () => {
    expect(extraTwoThrowSeriesCount([plain(), plain()])).toBe(0);
    expect(extraTwoThrowSeriesCount([twoThrowSeries(), plain()])).toBe(0);
    expect(extraTwoThrowSeriesCount([twoThrowSeries(), twoThrowSeries()])).toBe(1);
    expect(extraTwoThrowSeriesCount([twoThrowSeries(), twoInSkill(), twoThrowSeries()])).toBe(2);
  });

  it("重みは必須要素より小さく、現実志向の重み（0.9）より大きい", () => {
    expect(TWO_THROW_EXTRA_WEIGHT).toBeGreaterThan(0.9);
    expect(TWO_THROW_EXTRA_WEIGHT).toBeLessThan(REQUIRED_ELEMENT_WEIGHT);
  });

  it("投げタンの二つ投げは通常の二つ投げより優先度を下げる（禁止ではない）", () => {
    expect(TWO_THROW_TUMBLING_WEIGHT).toBeGreaterThan(0);
    expect(TWO_THROW_TUMBLING_WEIGHT).toBeLessThan(TWO_THROW_EXTRA_WEIGHT);
    const tum = {
      items: [
        { kind: "throw", reqTypes: ["twothrow"] },
        { kind: "skill", skillId: "a_roundoff" },
        { kind: "skill", skillId: "b_front" },
        { kind: "catch" },
      ],
    } as unknown as Series;
    const list = [twoThrowSeries(), tum];
    const r = computeScore(list, "clubs", {});
    expect(r.analysis[1].units.some((u) => u.isThrowTumbling)).toBe(true);
    expect(twoThrowTumblingCount(list, r)).toBe(1);
    expect(twoThrowTumblingCount([twoThrowSeries()], computeScore([twoThrowSeries()], "clubs", {}))).toBe(0);
  });

  for (const apparatus of ["clubs", "ring"] as ApparatusKey[]) {
    it(`${apparatus}：生成した構成は二つ投げのシリーズが1本以下で、必須投げは満たす`, () => {
      const rand = seededRandom(77);
      for (const maxScore of [3.0, null]) {
        for (let i = 0; i < 4; i++) {
          const r = generateRoutine([], { apparatus, maxScore, random: rand });
          expect(r).not.toBeNull();
          expect(extraTwoThrowSeriesCount(r!.series)).toBe(0);
          expect(r!.missing.some((m) => m.includes("2つ同時投げ"))).toBe(false);
        }
      }
    });
  }
});
