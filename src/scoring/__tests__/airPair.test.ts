import { describe, it, expect } from "vitest";
import {
  AIR_PAIR_FIRST_THROWS,
  AIR_PAIR_LOW_COUNTS,
  AIR_PAIR_NON_HAND_CATCH_CHANCE,
  AIR_PAIR_PATTERN_CHANCE,
  AUTO_THROW_PATTERNS,
  OVERLAP_PATTERN_CHANCE,
  autoThrowTemplates,
  isAutoThrowTemplate,
} from "../autoThrows";
import { checkApparatusFlow } from "../analysis";
import { seededRandom } from "../probe";
import type { ApparatusKey, Item } from "../types";

const airSeries = (apparatus: ApparatusKey, seeds = 120) => {
  const out: ReturnType<typeof autoThrowTemplates> = [];
  for (let seed = 1; seed <= seeds; seed++)
    autoThrowTemplates(apparatus, { random: seededRandom(seed) }).forEach((t) => {
      if (isAutoThrowTemplate(t) && t.spec.pattern.airPair) out.push(t);
    });
  return out;
};
const kinds = (items: Item[]) => items.map((it) => it.kind);

describe("2つとも空中にある2つの投げ（投げ→徒手→横投げ→徒手→キャッチ→手具を使ったキャッチ）", () => {
  it("形は前半が高難度か後半が高難度の2つで、通常の投げ受けより出にくい", () => {
    const ids = AUTO_THROW_PATTERNS.filter((p) => p.airPair).map((p) => p.airPair);
    expect(ids.sort()).toEqual(["firstHigh", "secondHigh"]);
    expect(AIR_PAIR_PATTERN_CHANCE).toBeGreaterThan(0);
    expect(AIR_PAIR_PATTERN_CHANCE).toBeLessThan(OVERLAP_PATTERN_CHANCE);
  });

  it("クラブ・リングで生成され、スティック・ロープでは生成されない", () => {
    expect(airSeries("clubs").length).toBeGreaterThan(0);
    expect(airSeries("ring").length).toBeGreaterThan(0);
    expect(airSeries("stick")).toHaveLength(0);
    expect(airSeries("rope")).toHaveLength(0);
  });

  (["clubs", "ring"] as ApparatusKey[]).forEach((app) =>
    it(`${app}：並びは 投げ→(徒手)→横投げ→(徒手)→キャッチ→(転がり)→最後の受け で、手具の流れに矛盾がない`, () => {
      airSeries(app).forEach((t) => {
        const items = t.series.items;
        const throws = items.filter((it) => it.kind === "throw");
        expect(throws).toHaveLength(2);
        // 1つ目は通常の投げか背面（視野外）、2つ目は横投げ
        const first = throws[0] as Extract<Item, { kind: "throw" }>;
        const second = throws[1] as Extract<Item, { kind: "throw" }>;
        const firstTypes = first.throwTypes ?? [];
        expect(firstTypes.length === 0 || (firstTypes.length === 1 && AIR_PAIR_FIRST_THROWS.includes(firstTypes[0]))).toBe(true);
        expect(second.throwTypes ?? []).toContain("side");
        // 2つ目の投げのあとのキャッチは2つ（1つ目が通常、最後が手具を使った／リングは手以外）。間に入れてよい徒手は転がりだけ
        const secondAt = items.indexOf(second);
        const tail = items.slice(secondAt + 1);
        const catches = tail.filter((it) => it.kind === "catch") as Extract<Item, { kind: "catch" }>[];
        expect(catches).toHaveLength(2);
        expect(catches[0].catchTypes ?? []).toEqual([]);
        const last = catches[1].catchTypes ?? [];
        expect(last.length).toBe(1);
        expect(["useapp", "nonhand"]).toContain(last[0]);
        if (app === "clubs") expect(last[0]).toBe("useapp");
        const between = tail.slice(tail.indexOf(catches[0]) + 1, tail.indexOf(catches[1]));
        between.forEach((it) => expect(it.kind === "motion" && it.motionId === "roll").toBe(true));
        expect(kinds(items).filter((k) => k === "catch")).toHaveLength(2);
        // 手具の流れ（空中・手元）に矛盾がない
        expect(checkApparatusFlow(t.series, app)).toEqual([]);
      });
    }),
  );

  it("高難度は片方だけ（3〜4動作）で、もう一方は 0〜1 動作", () => {
    airSeries("ring").forEach((t) => {
      const spec = t.spec;
      expect(spec.cheneCount).toBeGreaterThanOrEqual(3);
      expect(spec.cheneCount).toBeLessThanOrEqual(4);
      expect(AIR_PAIR_LOW_COUNTS).toContain(spec.airLowCount);
      const items = t.series.items;
      const secondThrowAt = items.findIndex((it, i) => it.kind === "throw" && i > 0);
      const motions = (from: number, to: number) =>
        items.slice(from, to).reduce((n, it) => n + (it.kind === "motion" && it.motionId === "chene" ? Number(it.count) : 0), 0);
      const before = motions(1, secondThrowAt);
      const after = motions(secondThrowAt + 1, items.length);
      const [hi, lo] = spec.pattern.airPair === "firstHigh" ? [before, after] : [after, before];
      expect(hi).toBe(spec.cheneCount);
      expect(lo).toBe(spec.airLowCount);
    });
  });

  it("リングだけ最後の受けが手以外のキャッチになることがある（クラブはならない）", () => {
    expect(AIR_PAIR_NON_HAND_CATCH_CHANCE.ring).toBeGreaterThan(0);
    expect(AIR_PAIR_NON_HAND_CATCH_CHANCE.clubs).toBeUndefined();
    const ring = airSeries("ring").filter((t) => (t.series.items.at(-1) as Extract<Item, { kind: "catch" }>).catchTypes?.[0] === "nonhand");
    expect(ring.length).toBeGreaterThan(0);
    // 手具を使ったキャッチとは排他
    ring.forEach((t) => expect((t.series.items.at(-1) as Extract<Item, { kind: "catch" }>).catchTypes).toEqual(["nonhand"]));
  });

  it("2つのキャッチの間に転がりが入る形と入らない形がある", () => {
    const rolls = airSeries("clubs").map((t) => t.series.items.some((it) => it.kind === "motion" && it.motionId === "roll"));
    expect(rolls).toContain(true);
    expect(rolls).toContain(false);
  });
});
