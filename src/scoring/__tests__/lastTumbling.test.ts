import { describe, it, expect } from "vitest";
import { generateRoutine, isTumblingSeries, lastTumblingNearEnd } from "../generate";
import { seededRandom } from "../probe";
import type { SeriesTemplate } from "../templates";
import type { Item } from "../types";

// 最後のタンブリングは演技の最後か、最後の投げの前あたり（オーナー 2026-11-26）
const tpl = (name: string, items: Item[]): SeriesTemplate =>
  ({ id: name, name, apparatus: "stick", series: { executionDeduction: 0, items } }) as SeriesTemplate;
const H = (n: string) => tpl(n, [{ kind: "throw" }, { kind: "motion", motionId: "chene", count: 3 }, { kind: "catch" }]);
const T = (n: string) => tpl(n, [{ kind: "skill", skillId: "a_roundoff" }, { kind: "skill", skillId: "c_back15" }, { kind: "skill", skillId: "b_front" }]);
const TT = (n: string) => tpl(n, [{ kind: "throw" }, { kind: "skill", skillId: "b_front" }, { kind: "skill", skillId: "b_front" }, { kind: "catch" }]);
const shape = (list: SeriesTemplate[]) => list.map((t) => t.name).join(",");

describe("最後のタンブリングの位置", () => {
  it("最後から3つ目より前にあれば、最後から2つ目と入れ替える（最後のシリーズには触れない）", () => {
    const list = [H("h1"), T("t1"), H("h2"), T("t2"), H("h3"), H("h4"), H("h5")];
    // t2（index 3）と最後から2つ目の h4（index 5）を入れ替える。最後の h5 はそのまま
    expect(shape(lastTumblingNearEnd(list, false))).toBe("h1,t1,h2,h4,h3,t2,h5");
  });

  it("すでに最後か最後から2つ目ならそのまま", () => {
    const a = [H("h1"), T("t1"), H("h2"), T("t2"), H("h3")];
    expect(lastTumblingNearEnd(a, false)).toBe(a);
    const b = [H("h1"), T("t1"), H("h2"), T("t2")];
    expect(lastTumblingNearEnd(b, false)).toBe(b);
  });

  it("動かすのは投げを含まないタンブリングを優先（投げタンの位置は保つ）", () => {
    const list = [T("t1"), H("h1"), TT("tt"), H("h2"), H("h3"), H("h4")];
    const out = lastTumblingNearEnd(list, false);
    expect(out[4].name).toBe("t1");
    expect(out[2].name).toBe("tt");
  });

  it("生成した構成で、最後のタンブリングは最後か最後から2つ目", () => {
    for (const app of ["stick", "rope"] as const)
      for (let s = 1; s <= 6; s++) {
        const r = generateRoutine([], { apparatus: app, maxScore: 4.5, random: seededRandom(s * 131 + 7) });
        if (!r) continue;
        const k = r.series.map((x) => (isTumblingSeries(x, false) ? "T" : "H")).join("");
        expect(k.length - 1 - k.lastIndexOf("T")).toBeLessThanOrEqual(1);
      }
  }, 120_000);
});
