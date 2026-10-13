import { describe, it, expect } from "vitest";
import { catchStyleWeight, autoCatchStyles, autoThrowTemplates, AUTO_THROW_PATTERNS, rollFinishShape } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { autoVariants } from "../generateSearch";
import { generateRoutine } from "../generate";
import { seededRandom } from "../probe";
import type { ApparatusKey, Series } from "../types";

const APPARATUSES: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];
const isRoll = (it: Series["items"][number] | undefined) =>
  !!it && it.kind === "motion" && (it.motionId === "roll" || it.motionId === "fwd_roll");
/** 転がり・前転の直後が背面（視野外）キャッチになっているか */
const noViewAfterRoll = (s: Series): boolean =>
  s.items.some((it, i) => {
    const next = s.items[i + 1];
    return isRoll(it) && next?.kind === "catch" && (next.catchTypes ?? []).includes("noview");
  });

describe("転がり・前転のあとに背面（視野外）キャッチはしない", () => {
  it("転がり／前転で終わる形では、視野外を含む受け方の重みが 0", () => {
    const shapes = AUTO_THROW_PATTERNS.filter((p) => rollFinishShape(p));
    expect(shapes.length).toBeGreaterThan(0);
    APPARATUSES.forEach((apparatus) =>
      shapes.forEach((pattern) =>
        autoCatchStyles(apparatus)
          .filter((c) => (c.catchTypes ?? []).includes("noview"))
          .forEach((catchStyle) =>
            expect(
              catchStyleWeight({ throwStyle: { id: "normal", name: "通常の投げ" }, catchStyle, pattern, apparatus, motions: 3 }),
            ).toBe(0),
          ),
      ),
    );
  });

  it("投げ・タンブリングの自動生成の候補（本数違いを含む）に、転がり・前転→背面キャッチは無い", () => {
    APPARATUSES.forEach((apparatus) => {
      for (let seed = 1; seed <= 25; seed++) {
        const rand = seededRandom(seed);
        [...autoThrowTemplates(apparatus, { random: rand }), ...autoTumblingTemplates(apparatus, { random: rand })].forEach((t) => {
          expect(noViewAfterRoll(t.series)).toBe(false);
          autoVariants(t).forEach((v) => expect(noViewAfterRoll(v.series)).toBe(false));
        });
      }
    });
  }, 180_000);

  it("生成した構成にも無い", () => {
    APPARATUSES.forEach((apparatus) => {
      const rand = seededRandom(5);
      for (let i = 0; i < 4; i++) {
        const r = generateRoutine([], { apparatus, maxScore: [3.0, 4.5, null][i % 3], random: rand });
        r?.series.forEach((s) => expect(noViewAfterRoll(s)).toBe(false));
      }
    });
  }, 180_000);
});
