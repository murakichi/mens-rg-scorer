import { describe, expect, it } from "vitest";
import { generateRoutine } from "../generate";
import { throwTumblingToFront, THROW_TUMBLING_POSITIONS } from "../generateSearch";
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

  it("投げタンを3〜4つ目の位置にあるタンブリングと入れ替える（投げのシリーズは動かさない）", () => {
    // 種類: T H T H T T(投げタン)。3つ目=T、4つ目=H なので入れ替え先は3つ目だけ
    const list = [tum("a"), hand("b"), tum("c"), hand("d"), tum("e"), throwTum];
    [0, 0.99].forEach((r) =>
      expect(names(throwTumblingToFront(list, "stick", false, null, () => r))).toEqual(["a", "b", "投げタン", "d", "e", "c"]),
    );
    // 3つ目・4つ目ともタンブリングなら、乱数でどちらかになる
    const both = [hand("a"), tum("b"), tum("c"), tum("d"), tum("e"), throwTum];
    expect(names(throwTumblingToFront(both, "stick", false, null, () => 0))[2]).toBe("投げタン");
    expect(names(throwTumblingToFront(both, "stick", false, null, () => 0.99))[3]).toBe("投げタン");
    expect(THROW_TUMBLING_POSITIONS).toEqual([2, 3]);
  });

  it("宙返りの最中に投げる投げタンは、最初のタンブリングの位置も候補（すでにそこなら動かさない）", () => {
    const inSkill = tpl("投げタン(技中)", S(sk("a_roundoff"), { kind: "skill", skillId: "b_front", hasApparatus: false, isThrow: true }, ct));
    // 種類: H T H H H T(技中の投げタン)。3〜4つ目は H だけなので、最初のタンブリング(2つ目)だけが入れ替え先
    const list = [hand("a"), tum("b"), hand("c"), hand("d"), hand("e"), inSkill];
    expect(names(throwTumblingToFront(list, "stick", false, null, () => 0.5))).toEqual(["a", "投げタン(技中)", "c", "d", "e", "b"]);
    // 投げてから宙返りの投げタンは対象外（3〜4つ目に入れ替え先が無ければそのまま）
    const before = [hand("a"), tum("b"), hand("c"), hand("d"), hand("e"), throwTum];
    expect(throwTumblingToFront(before, "stick", false)).toBe(before);
    // すでに最初のタンブリングなら動かさない
    const first = [hand("a"), inSkill, hand("c"), tum("d")];
    expect(throwTumblingToFront(first, "stick", false)).toBe(first);
  });

  it("すでに3〜4つ目にある／入れ替え先が無い／投げタンが無いときはそのまま", () => {
    const at3 = [hand("a"), tum("b"), throwTum, hand("c")];
    expect(throwTumblingToFront(at3, "stick", false)).toBe(at3);
    const noTarget = [hand("a"), hand("b"), hand("c"), hand("d"), throwTum];
    expect(throwTumblingToFront(noTarget, "stick", false)).toBe(noTarget);
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
      expect(idx).toBeLessThanOrEqual(3);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
