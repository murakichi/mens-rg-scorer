import { describe, it, expect } from "vitest";
import { HIGH_TUMBLING_FIRST_CHANCE, highDifficultyTumblingFirst } from "../generateSearch";
import type { SeriesTemplate } from "../templates";
import type { Series } from "../types";

// 単発で高難度（D以上）の技を含むタンブリングは、そうでないタンブリングより前を優先（絶対ではない。オーナー 2026-11-20）
const sk = (skillId: string, extra: Record<string, unknown> = {}) => ({ kind: "skill" as const, skillId, ...extra });
const tpl = (id: string, series: Series): SeriesTemplate =>
  ({ id, name: id, apparatus: "stick", updatedAt: 0, series, auto: true }) as SeriesTemplate;
const LOW = ["b_front", "b_backlayout", "b_sidesalto", "b_tenchu", "b_backlayhalf", "b_front"];
// 中身を少しずつ変える（手具操作の有無で 8 通り × 技 6 通り）
const op = (k: number, bit: number) => ({ hasApparatus: !!((k >> bit) & 1) });
const low = (k: number) =>
  tpl(`low${k}`, { items: [sk("a_roundoff", op(k, 3)), sk(LOW[k % LOW.length], op(k, 4)), sk(LOW[(k + 1) % LOW.length], op(k, 5))] });
const high = (k: number) => tpl(`high${k}`, { items: [sk("a_roundoff"), sk("d_backlay2twist"), sk(LOW[k % LOW.length])] });
// 技の最中に投げる投げタン（高難度を含む）
const throwTum = tpl("throwTum", { items: [sk("a_roundoff"), sk("d_backlay2twist", { isThrow: true }), { kind: "catch" }] });
const throwSeries = tpl("throw", { items: [{ kind: "throw" }, { kind: "motion", motionId: "chene", count: 3, hands: false }, { kind: "catch" }] });

describe("高難度を含むタンブリングを前へ（優先）", () => {
  it("並べ替えるときは高難度を含むものが先。投げ・投げタンの位置は変えない。割合は優先どおり", () => {
    let reordered = 0;
    const N = 60;
    for (let k = 0; k < N; k++) {
      const list = [low(k), throwSeries, throwTum, high(k), throwSeries, low(k + 2)];
      const out = highDifficultyTumblingFirst(list, false, null);
      // 投げ・投げタンはそのまま
      [1, 2, 4].forEach((i) => expect(out[i]).toBe(list[i]));
      if (out === list) continue;
      reordered++;
      expect(out[0].id).toBe(`high${k}`);
    }
    // 絶対ではないが、多くは前に寄せる
    expect(reordered / N).toBeGreaterThan(HIGH_TUMBLING_FIRST_CHANCE - 0.25);
    expect(reordered).toBeLessThan(N);
  });

  it("高難度を含まない（またはすべて含む）なら並びは変えない", () => {
    const list = [low(1), throwSeries, low(2)];
    expect(highDifficultyTumblingFirst(list, false, null)).toBe(list);
  });
});
