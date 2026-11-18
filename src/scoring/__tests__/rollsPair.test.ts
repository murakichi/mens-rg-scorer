import { describe, it, expect } from "vitest";
import { AUTO_THROW_PATTERNS, VERTICAL_THREE_PAIR_CHANCE, autoThrowTemplates } from "../autoThrows";
import { verticalThreeThrowCount } from "../generateEvaluate";
import { seededRandom } from "../probe";
import type { Series } from "../types";

// 前転3回→通常のキャッチ→そのまま連続投げ はしてよい。ただし少なめ（オーナー 2026-11-18）
const rolls = (catchTypes: string[], then: boolean): Series => ({
  items: [
    { kind: "throw" },
    { kind: "motion", motionId: "fwd_roll", count: 3 },
    { kind: "catch", catchTypes },
    ...(then ? ([{ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }] as Series["items"]) : []),
  ],
});

describe("前転3回→通常のキャッチ→連続投げ", () => {
  it("評価：通常のキャッチから連続投げに続けるなら、前転3回を手具で押さえつけずに受けても嫌わない", () => {
    expect(verticalThreeThrowCount([rolls([], true)])).toBe(0);
    // 連続投げに続けない前転3回の通常キャッチ・視野外キャッチは従来どおり嫌う
    expect(verticalThreeThrowCount([rolls([], false)])).toBe(1);
    expect(verticalThreeThrowCount([rolls(["noview"], true)])).toBe(1);
  });

  it("形は前転3回の形の一種で、候補に入れる確率は前転3回の形よりさらに低い", () => {
    const pats = AUTO_THROW_PATTERNS.filter((p) => p.rollsPair);
    expect(pats.length).toBeGreaterThan(0);
    pats.forEach((p) => expect(p.verticalThree).toBe(true));
    expect(VERTICAL_THREE_PAIR_CHANCE).toBeLessThan(1);
  });

  it("候補：前転3回のあとの受けが次の投げに続くなら、その受けは通常のキャッチ", () => {
    let n = 0;
    (["stick", "clubs", "ring", "rope"] as const).forEach((app) => {
      for (let seed = 1; seed <= 80; seed++)
        autoThrowTemplates(app, { random: seededRandom(seed), demandScore: 5 }).forEach((t) => {
          const items = t.series.items;
          let rollsCount = 0;
          items.forEach((it, i) => {
            if (it.kind === "throw") rollsCount = 0;
            if (it.kind === "motion" && it.motionId === "fwd_roll") rollsCount += it.count ?? 0;
            if (it.kind === "catch") {
              if (rollsCount >= 3 && items[i + 1]?.kind === "throw") {
                n++;
                expect(it.catchTypes ?? []).toEqual([]);
              }
              rollsCount = 0;
            }
          });
        });
    });
    expect(n).toBeGreaterThan(0);
  }, 120_000);
});
