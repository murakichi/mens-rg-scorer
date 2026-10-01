import { describe, it, expect } from "vitest";
import { autoTumblingTemplates, autoTumblingSpecs } from "../autoTumblings";
import { checkApparatusFlow } from "../analysis";
import { tumblingFlowErrors } from "../tumblingChain";
import { computeScore } from "../score";
import type { ApparatusKey, Series } from "../types";

const find = (apparatus: ApparatusKey, demand: number | null) => {
  const out: Series[] = [];
  for (let k = 0; k < 30; k++)
    autoTumblingTemplates(apparatus, { demandScore: demand }).forEach((t) => {
      if (t.spec.pattern.kirimomiThrow) out.push(t.series);
    });
  return out;
};

describe("投げ→前方系→きりもみ（背面投げ）→キャッチ→キャッチ", () => {
  it("全国上位クラスの要求のときだけ、クラブ・リングに出る", () => {
    (["clubs", "ring"] as const).forEach((a) => {
      expect(find(a, 4.5).length).toBeGreaterThan(0);
      expect(find(a, 4.4)).toHaveLength(0);
      expect(find(a, null)).toHaveLength(0);
    });
    (["stick", "rope"] as const).forEach((a) => expect(find(a, 5)).toHaveLength(0));
  });

  it("前方系はC難度以上が主（前宙は少ない）", () => {
    let c = 0;
    let b = 0;
    for (let k = 0; k < 40; k++)
      autoTumblingSpecs({ apparatus: "clubs", demandScore: 5 }).forEach((s) => {
        if (!s.pattern.kirimomiThrow) return;
        if (s.saltoIds[0] === "b_front") b += 1;
        else c += 1;
      });
    expect(c + b).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(b * 3);
  });

  it("並びと整合性", () => {
    (["clubs", "ring"] as const).forEach((a) => {
      find(a, 5).forEach((s) => {
        const kinds = s.items.map((i) => (i.kind === "skill" ? i.skillId : i.kind));
        expect(kinds[0]).toBe("throw");
        expect(["b_front", "c_front1full", "d_frontlay1", "e_frontlay2"]).toContain(kinds[1]);
        expect(kinds.slice(2)).toEqual(["b_kirimomi", "catch", "catch"]);
        const kiri = s.items[2];
        expect(kiri).toMatchObject({ isThrow: true, throwTypes: ["noview"] });
        expect(kiri).toMatchObject({ hasApparatus: false });
        expect(checkApparatusFlow(s, a)).toEqual([]);
        expect(tumblingFlowErrors(s, false)).toEqual([]);
        // 採点でき、背面投げの技術加点が付く
        expect(computeScore([s], a).techniqueBonus).toBeGreaterThan(0);
      });
    });
  });
});
