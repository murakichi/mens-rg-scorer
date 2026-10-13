import { describe, it, expect } from "vitest";
import { autoTumblingTemplates, airPairTumChance, AIR_PAIR_TUM_MIN_SCORE } from "../autoTumblings";
import { computeScore } from "../score";
import { skillDef, skillDifficulty, DIFF_VALUE, CATEGORY } from "../constants";
import { seededRandom } from "../probe";
import type { ApparatusKey } from "../types";

// 投げ→横投げ→(C以上の前方系)→(前転)→キャッチ→手具を使ったキャッチ
const collect = (app: ApparatusKey, targetScore: number | null) => {
  const out: ReturnType<typeof autoTumblingTemplates> = [];
  for (let seed = 1; seed <= 40; seed++)
    out.push(
      ...autoTumblingTemplates(app, { random: seededRandom(seed), apparatus: app, targetScore }).filter(
        (t) => t.spec.pattern.airPairSide,
      ),
    );
  return out;
};

describe("2つ投げてから跳ぶ投げタン（airPairSide）", () => {
  it("上限4.0未満では出さない", () => {
    expect(airPairTumChance(3.5)).toBe(0);
    expect(airPairTumChance(AIR_PAIR_TUM_MIN_SCORE)).toBeGreaterThan(0);
    expect(collect("clubs", 3.5)).toHaveLength(0);
  });

  it("スティック・ロープでは出さない", () => {
    expect(collect("stick", null)).toHaveLength(0);
    expect(collect("rope", null)).toHaveLength(0);
  });

  it.each(["clubs", "ring"] as const)("%s：並びと、宙返りは補正無しでC難度以上の前方系", (app) => {
    const list = collect(app, null);
    expect(list.length).toBeGreaterThan(0);
    list.forEach((t) => {
      const items = t.series.items;
      expect(items[0]).toMatchObject({ kind: "throw" });
      expect(items[1]).toMatchObject({ kind: "throw", throwTypes: ["side"] });
      const kinds = items.map((i) => i.kind);
      expect(kinds.slice(-2)).toEqual(["catch", "catch"]);
      const last = items[items.length - 1];
      const lastTypes = (last.kind === "catch" && last.catchTypes) || [];
      // クラブは必ず手具を使ったキャッチ。リングは手以外・視野外のこともある
      expect(app === "clubs" ? ["useapp"] : [["useapp"], ["nonhand"], ["noview"]]).toContainEqual(
        app === "clubs" ? lastTypes[0] : lastTypes,
      );
      // 視野外のキャッチは前転の直後には受けない
      if (lastTypes.includes("noview")) {
        const before = items[items.length - 3];
        expect(before.kind === "motion").toBe(false);
      }
      const skill = items.find((i) => i.kind === "skill");
      const id = skill && skill.kind === "skill" ? skill.skillId : "";
      expect(skillDef(id)?.category).toBe(CATEGORY.FORWARD);
      expect(DIFF_VALUE[skillDifficulty(id, false, null) ?? "A"]).toBeGreaterThanOrEqual(DIFF_VALUE.C);
    });
  });

  it("リングの最後の受けは手具を使った・手以外・視野外の3通りが出る", () => {
    const seen = new Set(
      collect("ring", null).map((t) => {
        const last = t.series.items[t.series.items.length - 1];
        return last.kind === "catch" ? (last.catchTypes ?? []).join(",") : "";
      }),
    );
    expect([...seen].sort()).toEqual(["nonhand", "noview", "useapp"]);
  });

  it("次々に投げる投げ受けのD難度以上で0.1、手具を使ったキャッチで0.1（計0.2）", () => {
    collect("clubs", null).forEach((t) => {
      const r = computeScore([t.series], "clubs");
      expect(r.seriesBonus).toBe(0.1);
      expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
    });
  });

  it("リングの手以外・視野外のキャッチもそれぞれ技術加点0.1", () => {
    collect("ring", null).forEach((t) => {
      const r = computeScore([t.series], "ring");
      expect(r.seriesBonus).toBe(0.1);
      expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
    });
  });
});
