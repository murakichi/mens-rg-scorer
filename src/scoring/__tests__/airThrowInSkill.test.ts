import { describe, it, expect } from "vitest";
import { autoTumblingTemplates, airThrowInSkillChance } from "../autoTumblings";
import { computeScore } from "../score";
import { skillDef, skillDifficulty, CATEGORY } from "../constants";
import { checkApparatusFlow } from "../analysis";
import { seededRandom } from "../probe";
import type { ApparatusKey } from "../types";

// 投げ→前宙（視野外投げ）→B難度の前方系・側方系→キャッチ→キャッチ
const collect = (app: ApparatusKey, targetScore: number | null) => {
  const out: ReturnType<typeof autoTumblingTemplates> = [];
  for (let seed = 1; seed <= 30; seed++)
    out.push(
      ...autoTumblingTemplates(app, { random: seededRandom(seed), apparatus: app, targetScore }).filter(
        (t) => t.spec.pattern.airThrowInSkill,
      ),
    );
  return out;
};

describe("前宙の最中に2つ目を視野外で投げる形（airThrowInSkill）", () => {
  it("上限4.0未満・スティック・ロープでは出さない", () => {
    expect(airThrowInSkillChance(3.9)).toBe(0);
    expect(collect("clubs", 3.5)).toHaveLength(0);
    expect(collect("stick", null)).toHaveLength(0);
    expect(collect("rope", null)).toHaveLength(0);
  });

  it.each(["clubs", "ring"] as const)("%s：並びは 投げ→前宙(視野外投げ)→B難度の前方・側方→キャッチ→キャッチ", (app) => {
    const list = collect(app, null);
    expect(list.length).toBeGreaterThan(0);
    list.forEach((t) => {
      const items = t.series.items;
      expect(items.map((i) => i.kind)).toEqual(["throw", "skill", "skill", "catch", "catch"]);
      const [, a, b] = items;
      expect(a).toMatchObject({ skillId: "b_front", isThrow: true, throwTypes: ["noview"] });
      expect(b.kind === "skill" && b.isThrow).toBeFalsy();
      const id = b.kind === "skill" ? b.skillId : "";
      // B難度の前方系・側方系、またはきりもみ転回
      if (id !== "c_kirimomiten") {
        expect(skillDifficulty(id, false, null)).toBe("B");
        expect([CATEGORY.FORWARD, CATEGORY.SIDE]).toContain(skillDef(id)?.category);
      }
      // 手具が空中にある間は手具操作を付けない
      items.forEach((i) => i.kind === "skill" && expect(i.hasApparatus).toBeFalsy());
    });
  });

  it("採点：視野外の技術加点と、次々に投げる加点（D難度以上）が付く", () => {
    collect("clubs", null).forEach((t) => {
      const r = computeScore([t.series], "clubs");
      expect(r.techniqueBonus).toBeGreaterThanOrEqual(0.1);
      expect(r.seriesBonus).toBe(0.1);
      expect(checkApparatusFlow(t.series, "clubs")).toEqual([]);
    });
  });
});
