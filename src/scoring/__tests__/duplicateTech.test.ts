import { describe, it, expect } from "vitest";
import { dropDuplicateTechTags, duplicateTechCount, evaluateUsed, generateRoutine } from "../generate";
import { computeScore } from "../score";
import { seededRandom } from "../probe";
import type { SeriesTemplate } from "../templates";
import type { Series } from "../types";
import { slowIt } from "./slow";

// 加点済みと全く同じ投げ方・受け方（加点にならない技術タグ）を生成に入れない（オーナー 2026-11-18）
const noViewPair = (chene: number): Series => ({
  items: [
    { kind: "throw" },
    { kind: "motion", motionId: "chene", count: chene, hands: false },
    { kind: "catch" },
    { kind: "throw", throwTypes: ["noview"] },
    { kind: "catch", catchTypes: ["noview"] },
  ],
});
const tpl = (series: Series, auto: boolean, id: string): SeriesTemplate =>
  ({ id, name: id, apparatus: "stick", updatedAt: 0, series, auto }) as SeriesTemplate;
const opts = { apparatus: "stick" as const, minScore: 0 };

describe("加点済みの投げ方・受け方の重複を生成から外す", () => {
  it("同じ背面投げ→背面キャッチが2本あると、2本目の投げ・受けは重複として数える", () => {
    const r = computeScore([noViewPair(4), noViewPair(3)], "stick");
    expect(duplicateTechCount(r)).toBe(2);
  });

  it("dropDuplicateTechTags：自動生成の2本目から視野外を外し、評価が上がる。ユーザーのテンプレートはそのまま", () => {
    const used = [tpl(noViewPair(4), true, "a"), tpl(noViewPair(3), true, "b")];
    const best = { used, ev: evaluateUsed(used, opts) };
    const out = dropDuplicateTechTags(best, opts);
    expect(out.ev.value).toBeGreaterThan(best.ev.value);
    expect(duplicateTechCount(computeScore(out.used.map((t) => t.series), "stick"))).toBe(0);
    // 1本目は加点を持ったまま
    expect(out.used[0].series).toEqual(noViewPair(4));
    // ユーザーのテンプレートは書き換えない
    const own = [tpl(noViewPair(4), false, "a"), tpl(noViewPair(3), false, "b")];
    const kept = dropDuplicateTechTags({ used: own, ev: evaluateUsed(own, opts) }, opts);
    expect(kept.used).toEqual(own);
  });
});

slowIt("（傾向）生成した構成に、加点済みと同じ投げ方・受け方がほぼ残らない", () => {
  let dup = 0;
  for (const maxScore of [3.0, 4.5, undefined])
    for (const apparatus of ["stick", "clubs", "ring", "rope"] as const)
      for (let seed = 1; seed <= 5; seed++) {
        const r = generateRoutine([], { apparatus, minScore: 0, maxScore, random: seededRandom(seed) })!;
        dup += duplicateTechCount(computeScore(r.series, apparatus));
      }
  expect(dup).toBeLessThanOrEqual(2);
}, 600_000);
