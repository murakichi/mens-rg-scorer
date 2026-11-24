import { describe, it, expect } from "vitest";
import { autoTumblingTemplates } from "../autoTumblings";
import { analyzeSeries } from "../analysis";
import { computeScore } from "../score";
import { seededRandom } from "../probe";
import type { Item, Series } from "../types";

// 投げ→ロンダート→ダイビング前宙（ここで受け）→何か（オーナー 2026-11-24）
const found = (targetScore: number) => {
  const out: { app: string; series: Series }[] = [];
  for (let seed = 1; seed <= 60; seed++)
    (["stick", "clubs", "ring", "rope"] as const).forEach((app) =>
      autoTumblingTemplates(app, { targetScore, random: seededRandom(seed) }).forEach((t) => {
        if (t.spec?.pattern.id.endsWith("CatchOnDiveFront")) out.push({ app, series: t.series });
      }),
    );
  return out;
};

describe("投げ→ロンダート→ダイビング前宙（受け）→…", () => {
  it("上級者の候補に全手具で出て、受けるのはダイビング前宙。そのあとに技が続く", () => {
    const list = found(5);
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((x) => x.app)).size).toBe(4);
    list.forEach(({ series }) => {
      const items = series.items;
      expect(items[0].kind).toBe("throw");
      const skills = items.filter((i): i is Extract<Item, { kind: "skill" }> => i.kind === "skill");
      expect(skills[0].skillId).toBe("a_roundoff");
      expect(skills[0].isCatch).toBeFalsy();
      // 手具が空中にあるロンダートでは手具操作をしない
      expect(skills[0].hasApparatus).toBeFalsy();
      expect(skills[1].skillId).toBe("b_divefront");
      expect(skills[1].isCatch).toBe(true);
      // 受け方は通常（技の最中の受けに視野外・手以外・押さえつけは付けない）
      expect(skills[1].catchTypes ?? []).toEqual([]);
      expect(skills.length).toBeGreaterThanOrEqual(3);
      // キャッチアイテムは無い（ダイビング前宙で受けている）
      expect(items.some((i) => i.kind === "catch")).toBe(false);
    });
  });

  it("D要求が4.0未満では出さない（技の最中に受ける形は上級者だけ）", () => {
    expect(found(3)).toHaveLength(0);
  });

  it("採点：受けたあとに転回技が続くので、ロンダート〜最後の技までが1本の投げタン", () => {
    const { series } = found(5)[0];
    const a = analyzeSeries(series);
    const tum = a.units.filter((u) => u.type === "throw" && u.isThrowTumbling);
    expect(tum).toHaveLength(1);
    const r = computeScore([series], "ring");
    expect(r.required.find((c) => c.key === "throwTum")?.passed).toBe(true);
  });
});
