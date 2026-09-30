import { describe, expect, it } from "vitest";
import { generateRoutine } from "../generate";
import { throwTumblingToFront, THROW_TUMBLING_POSITION } from "../generateSearch";
import { analyzeSeries } from "../analysis";
import { newTemplateId, type SeriesTemplate } from "../templates";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const sk = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });
const th: Item = { kind: "throw", throwTypes: [], reqTypes: [] };
const ct: Item = { kind: "catch", catchTypes: [], catchTwo: false };
const tpl = (name: string, series: Series): SeriesTemplate => ({
  id: newTemplateId(),
  name,
  apparatus: "stick",
  series,
  createdAt: 0,
  updatedAt: 0,
});
const isThrowTum = (t: SeriesTemplate) => analyzeSeries(t.series, false).units.some((u) => u.isThrowTumbling);
const names = (l: SeriesTemplate[]) => l.map((t) => t.name);

describe("投げタンを前半に置く", () => {
  const hand = (n: string) => tpl(n, S(th, { kind: "motion", motionId: "chene" }, ct));
  const tum = (n: string) => tpl(n, S(sk("a_roundoff"), sk("b_backsalto")));
  const throwTum = tpl("投げタン", S(th, sk("b_front"), ct));

  it("投げタンのシリーズを3つ目に寄せる", () => {
    const list = [hand("a"), tum("b"), hand("c"), tum("d"), throwTum];
    expect(names(throwTumblingToFront(list, "stick", false))).toEqual(["a", "b", "投げタン", "c", "d"]);
    expect(THROW_TUMBLING_POSITION).toBe(2);
  });

  it("シリーズが少なければ、置ける最後の位置まで／投げタンが無ければそのまま", () => {
    expect(names(throwTumblingToFront([hand("a"), throwTum], "stick", false))).toEqual(["a", "投げタン"]);
    const noTt = [hand("a"), tum("b")];
    expect(throwTumblingToFront(noTt, "stick", false)).toBe(noTt);
  });

  it("生成した構成では、投げタンが前半（4つ目まで）にある", () => {
    let seen = 0;
    for (let k = 0; k < 20; k++) {
      const r = generateRoutine([tpl("投げ", S(th, ct))], { apparatus: "stick", junior: false });
      if (!r) continue;
      const idx = r.used.findIndex(isThrowTum);
      if (idx < 0) continue;
      seen++;
      expect(idx).toBeLessThanOrEqual(Math.max(3, THROW_TUMBLING_POSITION));
    }
    expect(seen).toBeGreaterThan(0);
  });
});
