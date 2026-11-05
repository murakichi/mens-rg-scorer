import { describe, it, expect } from "vitest";
import { autoTumblingTemplates } from "../autoTumblings";
import { checkApparatusFlow } from "../analysis";
import { computeScore } from "../score";
import { seededRandom } from "../probe";
import type { ApparatusKey } from "../types";

// ダイビング前宙(投げ)→側宙／転宙→キャッチ（投げる技はダイビング前宙だけ）
const collect = (app: ApparatusKey) => {
  const out: ReturnType<typeof autoTumblingTemplates> = [];
  for (let seed = 1; seed <= 80; seed++)
    out.push(
      ...autoTumblingTemplates(app, { random: seededRandom(seed), apparatus: app, targetScore: null }).filter(
        (t) => t.spec.pattern.throwThenSide,
      ),
    );
  return out;
};

describe("ダイビング前宙(投げ)→側宙／転宙→キャッチ", () => {
  it.each(["stick", "clubs", "ring"] as const)("%s：投げるのはダイビング前宙で、続けて側宙か転宙。前転は挟まない", (app) => {
    const list = collect(app);
    expect(list.length).toBeGreaterThan(0);
    const finishers = new Set<string>();
    list.forEach((t) => {
      const items = t.series.items;
      const skills = items.filter((i) => i.kind === "skill");
      const last = skills[skills.length - 1];
      const thrower = skills[skills.length - 2];
      expect(thrower).toMatchObject({ skillId: "b_divefront", isThrow: true });
      expect(last.kind === "skill" && last.isThrow).toBeFalsy();
      finishers.add(last.kind === "skill" ? last.skillId : "");
      expect(["b_sidesalto", "b_tenchu"]).toContain(last.kind === "skill" ? last.skillId : "");
      expect(items.some((i) => i.kind === "motion")).toBe(false);
      expect(items[items.length - 1].kind).toBe("catch");
      expect(checkApparatusFlow(t.series, app)).toEqual([]);
      // 投げタンの1ユニットとして採点される
      const r = computeScore([t.series], app);
      expect(r.analysis[0].units.some((u) => u.isThrowTumbling)).toBe(true);
    });
    expect(finishers.has("b_sidesalto")).toBe(true);
  });

  it("テンポを使う連鎖も、テンポを使わずつなぎの後半で実施する連鎖も出る", () => {
    const ids = collect("clubs").map((t) =>
      t.series.items.flatMap((i) => (i.kind === "skill" ? [i.skillId] : [])).join(">"),
    );
    expect(ids.some((s) => s.includes("b_tempo>b_divefront"))).toBe(true);
    expect(ids.some((s) => !s.includes("b_tempo"))).toBe(true);
  });
});
