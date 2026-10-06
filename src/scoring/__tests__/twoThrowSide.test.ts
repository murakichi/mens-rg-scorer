import { describe, it, expect } from "vitest";
import { SIDE_THROW_TWO_THROW_CHANCE, SIDE_THROW_TWO_THROW_NON_HAND_CHANCE, SIDE_THROW_NON_HAND_CHANCE, autoThrowStyles, autoThrowTemplates, maybeSideThrow, SIDE_THROW_PRESS_CHANCE } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { analyzeSeries } from "../analysis";
import { seededRandom } from "../probe";
import type { Series } from "../types";
import type { ApparatusKey } from "../types";

const hasTwo = (s: Series) =>
  s.items.some((it) => (it.kind === "throw" || (it.kind === "skill" && !!it.isThrow)) && (it.reqTypes ?? []).includes("twothrow"));
const hasSide = (s: Series) => s.items.some((it) => (it.throwTypes ?? []).includes("side"));
const isSplit = (s: Series) => s.items.some((it) => it.kind === "catch" && (it.catchTypes ?? []).includes("useapp"));
const twoStyle = (apparatus: ApparatusKey) => autoThrowStyles(apparatus).find((t) => t.two)!;
const catchStyle = { id: "normal", name: "通常のキャッチ" };

describe("リングの二つ投げは横投げで行うことがある", () => {
  it("確率は通常の横投げ（押さえつけ）より少し低く、珍しくはない。リングだけ", () => {
    const p = SIDE_THROW_TWO_THROW_CHANCE.ring!;
    expect(p).toBeLessThan(SIDE_THROW_PRESS_CHANCE.ring!);
    expect(p).toBeGreaterThanOrEqual(0.3);
    expect(SIDE_THROW_TWO_THROW_CHANCE.clubs).toBeUndefined();
  });

  it("maybeSideThrow：リングの二つ投げは抽選に当たれば横投げ、外れれば付けない", () => {
    expect(maybeSideThrow("ring", twoStyle("ring"), catchStyle, 0, () => 0).throwTypes).toContain("side");
    expect(maybeSideThrow("ring", twoStyle("ring"), catchStyle, 0, () => 0.99).throwTypes ?? []).not.toContain("side");
  });

  it("手以外のキャッチ（2つ同時キャッチの一方を首・足にはめる）で受けるときは横投げの確率が上がる。ふつうの手以外のキャッチよりは少し低い", () => {
    const nonHandCatch = { id: "nonhand", name: "手以外のキャッチ", catchTypes: ["nonhand"] };
    const p = SIDE_THROW_TWO_THROW_NON_HAND_CHANCE.ring!;
    expect(p).toBeGreaterThan(SIDE_THROW_TWO_THROW_CHANCE.ring!);
    expect(p).toBeLessThan(SIDE_THROW_NON_HAND_CHANCE.ring!);
    // 0.5 以上 0.6 未満の抽選値：通常の受けでは外れ、手以外のキャッチでは当たる
    const roll = () => (SIDE_THROW_TWO_THROW_CHANCE.ring! + p) / 2;
    expect(maybeSideThrow("ring", twoStyle("ring"), catchStyle, 0, roll).throwTypes ?? []).not.toContain("side");
    expect(maybeSideThrow("ring", twoStyle("ring"), nonHandCatch, 0, roll).throwTypes).toContain("side");
  });

  it("視野外・手以外の投げとは組まない", () => {
    const nv = { ...twoStyle("ring"), throwTypes: ["noview"] };
    const nh = { ...twoStyle("ring"), throwTypes: ["nonhand"] };
    expect(maybeSideThrow("ring", nv, catchStyle, 0, () => 0).throwTypes).toEqual(["noview"]);
    expect(maybeSideThrow("ring", nh, catchStyle, 0, () => 0).throwTypes).toEqual(["nonhand"]);
  });

  it("クラブの二つ投げには付けず、乱数も使わない（他の手具の生成を動かさない）", () => {
    let calls = 0;
    const r = maybeSideThrow("clubs", twoStyle("clubs"), catchStyle, 0, () => (calls++, 0));
    expect(r.throwTypes ?? []).not.toContain("side");
    expect(calls).toBe(0);
  });

  it("リングの候補：2つ同時キャッチで受ける二つ投げの半分前後が横投げ（二つ投げ→押さえつけの形を除く）", () => {
    let all = 0;
    let side = 0;
    for (let seed = 1; seed <= 30; seed++)
      autoThrowTemplates("ring", { random: seededRandom(seed) }).forEach((t) => {
        if (!hasTwo(t.series) || isSplit(t.series)) return;
        all += 1;
        if (hasSide(t.series)) side += 1;
      });
    expect(all).toBeGreaterThan(50);
    expect(side / all).toBeGreaterThan(0.3);
    expect(side / all).toBeLessThan(0.7);
  }, 60_000);

  it("クラブの候補：二つ投げ→押さえつけの形以外では横投げにならない", () => {
    for (let seed = 1; seed <= 10; seed++)
      autoThrowTemplates("clubs", { random: seededRandom(seed) }).forEach((t) => {
        if (!hasTwo(t.series) || isSplit(t.series)) return;
        expect(hasSide(t.series)).toBe(false);
      });
  }, 60_000);

  it("リングの投げタンの二つ投げも、横投げになることがある（クラブはならない）", () => {
    const count = (apparatus: ApparatusKey) => {
      let all = 0;
      let side = 0;
      for (let seed = 1; seed <= 30; seed++)
        autoTumblingTemplates(apparatus, { random: seededRandom(seed) }).forEach((t) => {
          if (!hasTwo(t.series)) return;
          if (!analyzeSeries(t.series, false, null).units.some((u) => u.isThrowTumbling)) return;
          all += 1;
          if (hasSide(t.series)) side += 1;
        });
      return { all, side };
    };
    const ring = count("ring");
    expect(ring.all).toBeGreaterThan(20);
    expect(ring.side).toBeGreaterThan(0);
    expect(ring.side).toBeLessThan(ring.all);
    expect(count("clubs").side).toBe(0);
  }, 120_000);

  it("リングの投げタンの二つ投げ＋2つ同時キャッチ＋手以外のキャッチは横投げで行う（クラブでは受けない）", () => {
    const nonHandTwo = (apparatus: ApparatusKey) => {
      const out: Series[] = [];
      for (let seed = 1; seed <= 40; seed++)
        autoTumblingTemplates(apparatus, { random: seededRandom(seed) }).forEach((t) => {
          if (!hasTwo(t.series)) return;
          if (t.series.items.some((it) => it.kind === "catch" && (it.catchTypes ?? []).includes("nonhand"))) out.push(t.series);
        });
      return out;
    };
    const ring = nonHandTwo("ring");
    expect(ring.length).toBeGreaterThan(0);
    ring.forEach((s) => {
      expect(hasSide(s)).toBe(true);
      expect(s.items.some((it) => it.kind === "catch" && it.catchTwo)).toBe(true);
    });
    expect(nonHandTwo("clubs")).toHaveLength(0);
  }, 120_000);
});
