import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { checkApparatusFlow } from "../analysis";
import { apparatusBlockers, stripForApparatus } from "../analysis";
import { SIDE_THROW_TAG, TECHNIQUE_BONUS } from "../constants";
import { autoThrowSpecs, buildAutoThrowSeries } from "../autoThrows";
import { commonBlockers } from "../templates";
import { autoTumblingTemplates } from "../autoTumblings";
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
          // 視野外の投げ・二つ投げ・手以外の投げは横投げにしない（分母から外す）
          const t = spec.throwStyle.throwTypes || [];
          if (t.includes("noview") || t.includes("nonhand") || spec.throwStyle.two) return;
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

  it("自動生成：横投げと視野外の投げは組み合わせない", () => {
    (["stick", "clubs", "ring"] as const).forEach((apparatus) => {
      for (let k = 0; k < 20; k++)
        autoThrowSpecs(apparatus).forEach((spec) => {
          buildAutoThrowSeries(spec).items.forEach((item) => {
            if (item.kind !== "throw") return;
            const types = item.throwTypes || [];
            expect(types.includes(SIDE_THROW_TAG) && types.includes("noview")).toBe(false);
          });
        });
    });
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

  it("自動生成：クラブは横投げ以外の投げを押さえつけキャッチで受けない", () => {
    const check = (series: Series) => {
      let thrown: string[] | null = null;
      series.items.forEach((item) => {
        if (item.kind === "throw" || (item.kind === "skill" && item.isThrow)) thrown = item.throwTypes || [];
        if (item.kind === "catch" && (item.catchTypes || []).includes("useapp")) {
          expect(thrown).not.toBeNull();
          expect(thrown).toContain(SIDE_THROW_TAG);
        }
      });
    };
    let presses = 0;
    for (let k = 0; k < 10; k++) {
      autoThrowSpecs("clubs").forEach((spec) => {
        const s = buildAutoThrowSeries(spec);
        presses += s.items.filter((i) => i.kind === "catch" && (i.catchTypes || []).includes("useapp")).length;
        check(s);
      });
      autoTumblingTemplates("clubs").forEach((t) => {
        presses += t.series.items.filter((i) => i.kind === "catch" && (i.catchTypes || []).includes("useapp")).length;
        check(t.series);
      });
    }
    expect(presses).toBeGreaterThan(0);
  });

  it("自動生成：二つ投げ（横）→キャッチ→0〜1動作→押さえつけてキャッチの形が出る（クラブ・リング）", () => {
    (["clubs", "ring"] as const).forEach((apparatus) => {
      const specs = autoThrowSpecs(apparatus).filter((s) => s.pattern.splitCatch);
      expect(specs.length).toBeGreaterThan(0);
      specs.forEach((spec) => {
        const items = buildAutoThrowSeries(spec).items;
        const kinds = items.map((i) => i.kind);
        expect(kinds[0]).toBe("throw");
        expect(items[0]).toMatchObject({ reqTypes: ["twothrow"], throwTypes: [SIDE_THROW_TAG] });
        // 間の徒手は0〜1動作、キャッチは2つ同時ではなく1つずつ
        expect(spec.cheneCount).toBeLessThanOrEqual(1);
        const catches = items.filter((i) => i.kind === "catch");
        expect(catches).toHaveLength(2);
        expect(catches[0]).not.toHaveProperty("catchTwo");
        expect(catches[1]).toMatchObject({ catchTypes: ["useapp"] });
        expect(items[items.length - 1].kind).toBe("catch");
        expect(checkApparatusFlow(buildAutoThrowSeries(spec), apparatus)).toEqual([]);
      });
    });
    // スティック・ロープには出ない
    expect(autoThrowSpecs("stick").some((s) => s.pattern.splitCatch)).toBe(false);
    expect(autoThrowSpecs("rope").some((s) => s.pattern.splitCatch)).toBe(false);
  });
});
