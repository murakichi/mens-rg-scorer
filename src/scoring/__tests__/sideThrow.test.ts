import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { apparatusBlockers, stripForApparatus } from "../analysis";
import { SIDE_THROW_TAG, TECHNIQUE_BONUS } from "../constants";
import { autoThrowSpecs, buildAutoThrowSeries } from "../autoThrows";
import { commonBlockers } from "../templates";
import type { Series } from "../types";

const ser = (throwTypes: string[]): Series => ({
  executionDeduction: 0,
  items: [{ kind: "throw", throwTypes }, { kind: "catch" }],
});

describe("横投げ", () => {
  it("投げ方の種類として数えるが技術加点にはならない", () => {
    const plain = computeScore([ser([])], "clubs");
    const side = computeScore([ser([SIDE_THROW_TAG])], "clubs");
    expect(side.techniqueBonus).toBe(plain.techniqueBonus);
    expect(side.techniqueBonus).toBe(0);
    const noview = computeScore([ser(["noview"])], "clubs");
    expect(noview.techniqueBonus).toBe(TECHNIQUE_BONUS);
    // 通常の投げ＋横投げ＝2種類（通常を2本並べても重複で1種類のまま）
    const withSide = computeScore([ser([]), ser([SIDE_THROW_TAG])], "clubs");
    const twice = computeScore([ser([]), ser([])], "clubs");
    expect(withSide.varietyDeduction).toBeLessThan(twice.varietyDeduction);
  });

  it("ロープでは入力できず、採点前に落とされる", () => {
    const list = [ser([SIDE_THROW_TAG])];
    expect(apparatusBlockers(list, "rope")).toContain("横投げ");
    expect(apparatusBlockers(list, "stick")).toEqual([]);
    expect(stripForApparatus(list, "rope")[0].items[0]).toMatchObject({ throwTypes: [] });
    expect(commonBlockers(list)).toContain("横投げ");
  });

  it("自動生成：クラブの押さえつけキャッチは高確率で横投げ、ロープには付かない", () => {
    const rate = (apparatus: "clubs" | "ring" | "rope") => {
      let press = 0;
      let pressSide = 0;
      for (let k = 0; k < 20; k++) {
        autoThrowSpecs(apparatus).forEach((spec) => {
          if (!(spec.catchStyle.catchTypes || []).includes("useapp")) return;
          press += 1;
          if ((spec.throwStyle.throwTypes || []).includes(SIDE_THROW_TAG)) pressSide += 1;
        });
      }
      return { press, share: press ? pressSide / press : 0 };
    };
    expect(rate("clubs").share).toBeGreaterThan(0.75);
    expect(rate("ring").share).toBeGreaterThan(0.4);
    expect(rate("ring").share).toBeLessThan(rate("clubs").share);
    let ropeSide = 0;
    for (let k = 0; k < 5; k++)
      autoThrowSpecs("rope").forEach((s) => {
        if ((buildAutoThrowSeries(s).items.some((i) => i.kind === "throw" && (i.throwTypes || []).includes(SIDE_THROW_TAG)))) ropeSide += 1;
      });
    expect(ropeSide).toBe(0);
  });

  it("自動生成：スティックの低難度の左手投げは高確率で横投げ、高難度は付かない", () => {
    let low = 0;
    let lowSide = 0;
    for (let k = 0; k < 30; k++)
      autoThrowSpecs("stick").forEach((spec) => {
        const left = (spec.throwStyle.reqTypes || []).includes("lefthand");
        if (!left) return;
        const motions = spec.cheneCount + spec.pattern.after.reduce((n, m) => n + m.count, 0);
        const side = (spec.throwStyle.throwTypes || []).includes(SIDE_THROW_TAG);
        if (motions <= 1) {
          low += 1;
          if (side) lowSide += 1;
        } else if (!(spec.catchStyle.catchTypes || []).includes("useapp")) expect(side).toBe(false);
      });
    expect(low).toBeGreaterThan(0);
    expect(lowSide / low).toBeGreaterThan(0.6);
  });
});
