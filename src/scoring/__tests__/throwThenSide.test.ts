import { describe, it, expect } from "vitest";
import { autoTumblingTemplates, throwThenSideKind } from "../autoTumblings";
import { checkApparatusFlow } from "../analysis";
import { computeScore } from "../score";
import { seededRandom } from "../probe";
import type { ApparatusKey } from "../types";

// 技の最中の投げ→側宙／転宙→キャッチ（投げる技はダイビング前宙・前宙・前宙以外の前方系＝視野外。オーナー 2026-11-23）
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

describe("技の最中の投げ→側宙／転宙→キャッチ", () => {
  it.each(["stick", "clubs", "ring"] as const)("%s：投げるのはダイビング前宙・前宙・前方系で、続けて側宙か転宙。前転は挟まない", (app) => {
    const list = collect(app);
    expect(list.length).toBeGreaterThan(0);
    const finishers = new Set<string>();
    list.forEach((t) => {
      const items = t.series.items;
      const skills = items.filter((i) => i.kind === "skill");
      const last = skills[skills.length - 1];
      const thrower = skills[skills.length - 2];
      expect(thrower).toMatchObject({ isThrow: true });
      const kind = thrower.kind === "skill" ? throwThenSideKind(thrower.skillId) : null;
      expect(kind).not.toBeNull();
      // 前宙以外の前方系は視野外の投げ
      if (kind === "otherNoView") expect(thrower.kind === "skill" && thrower.throwTypes).toContain("noview");
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

describe("前宙(投げ)→側宙／転宙と、前宙以外の前方系（2026-11-23）", () => {
  const throwers = (app: ApparatusKey) =>
    collect(app).map((t) => {
      const skills = t.series.items.filter((i) => i.kind === "skill");
      const th = skills[skills.length - 2];
      return th.kind === "skill" ? th.skillId : "";
    });

  it("前宙で投げて側宙・転宙に続ける形が出る（伸身1回半→前宙(投げ)→側宙→キャッチ など）", () => {
    const all = (["stick", "clubs", "ring", "rope"] as const).flatMap((app) => collect(app));
    const seqs = all.map((t) =>
      t.series.items.map((i) => (i.kind === "skill" ? `${i.skillId}${i.isThrow ? "(投)" : ""}` : i.kind)).join(">"),
    );
    expect(seqs.some((s) => s.includes("b_front(投)>b_sidesalto>catch"))).toBe(true);
    expect(seqs.some((s) => s.includes("b_front(投)>b_tenchu>catch"))).toBe(true);
  });

  it("前宙以外の前方系で投げる形は前宙より少ない", () => {
    const list = (["stick", "clubs", "ring", "rope"] as const).flatMap((app) => throwers(app));
    const front = list.filter((id) => id === "b_front").length;
    const other = list.filter((id) => throwThenSideKind(id) === "otherNoView").length;
    expect(other).toBeGreaterThan(0);
    expect(other).toBeLessThan(front);
  });

  it("後ろ向きに降りる前宙半ひねりと、あとに続かない技では投げない", () => {
    expect(throwThenSideKind("b_fronthalf")).toBeNull();
    expect(throwThenSideKind("b_front")).toBe("front");
    expect(throwThenSideKind("b_divefront")).toBe("diving");
    expect(throwThenSideKind("c_front1full")).toBe("otherNoView");
    expect(throwThenSideKind("c_backlay15")).toBeNull();
  });
});
