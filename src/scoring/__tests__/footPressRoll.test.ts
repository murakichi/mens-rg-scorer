import { describe, it, expect } from "vitest";
import { autoThrowTemplates, withNonHandKinds } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { seededRandom } from "../probe";
import type { ApparatusKey, Series } from "../types";

// 低難度（0〜1動作）で足で押さえつけて受けるときは、投げたあとに前転か転がりを実施する（オーナー 2026-11-18）
const motionsBefore = (s: Series, catchIdx: number) => {
  let k = catchIdx - 1;
  const out: Series["items"] = [];
  while (k >= 0) {
    const it = s.items[k];
    if (it.kind === "throw" || (it.kind === "skill" && it.isThrow)) break;
    out.unshift(it);
    k--;
  }
  return out;
};
const motionCount = (items: Series["items"]) =>
  items.reduce((n, it) => n + (it.kind === "motion" ? (it.count ?? 0) : 1), 0);

describe("低難度の足で押さえつけキャッチは前転か転がりのあと", () => {
  it("withNonHandKinds：徒手なし・シェネ1回のあとには足で押さえつけを選ばない", () => {
    (["stick", "clubs", "ring"] as const).forEach((app) => {
      for (let v = 0; v < 40; v++) {
        const tags = app === "ring" ? ["side"] : v % 2 ? ["norotate", "side"] : ["side"];
        const none: Series = { items: [{ kind: "throw", throwTypes: tags, executionDeduction: v } as any, { kind: "catch", catchTypes: ["nonhand"] }] };
        const chene: Series = {
          items: [
            { kind: "throw", throwTypes: tags, executionDeduction: v } as any,
            { kind: "motion", motionId: "chene", count: 1, hands: false },
            { kind: "catch", catchTypes: ["nonhand"] },
          ],
        };
        [none, chene].forEach((s) => {
          const out = withNonHandKinds(s, app);
          const c = out.items[out.items.length - 1];
          expect(c.kind === "catch" && c.nonHandKind).toBeTruthy();
          expect(c.kind === "catch" && c.nonHandKind).not.toBe("footPress");
        });
      }
    });
  });

  it("両手持ち無回転の背面投げは前転か転がり1回のあとに足で押さえつけて受ける", () => {
    let n = 0;
    for (let seed = 1; seed <= 80; seed++)
      autoThrowTemplates("stick", { random: seededRandom(seed) }).forEach((t) => {
        const s = t.series;
        s.items.forEach((it, i) => {
          if (it.kind !== "throw" || !(it.throwTypes ?? []).includes("norotate") || !(it.throwTypes ?? []).includes("noview")) return;
          n++;
          const c = s.items.slice(i + 1).find((x) => x.kind === "catch");
          expect(c?.kind === "catch" && c.nonHandKind).toBe("footPress");
          const between = motionsBefore(s, s.items.indexOf(c!));
          expect(between).toHaveLength(1);
          expect(between[0].kind === "motion" && ["fwd_roll", "roll"].includes(between[0].motionId)).toBe(true);
        });
      });
    expect(n).toBeGreaterThan(0);
  }, 60_000);

  it("生成の候補：0〜1動作で足で押さえつけて受けるのは、前転か転がり1回のあとだけ（転がりも出る）", () => {
    let roll = 0;
    let total = 0;
    (["stick", "clubs", "ring"] as ApparatusKey[]).forEach((app) => {
      for (let seed = 1; seed <= 40; seed++)
        [...autoThrowTemplates(app, { random: seededRandom(seed) }), ...autoTumblingTemplates(app, { random: seededRandom(seed) })].forEach((t) => {
          const s = t.series;
          s.items.forEach((it, i) => {
            if (!((it.kind === "catch" || (it.kind === "skill" && it.isCatch)) && it.nonHandKind === "footPress")) return;
            const between = motionsBefore(s, i);
            if (motionCount(between) > 1) return;
            total++;
            expect(between).toHaveLength(1);
            const m = between[0];
            expect(m.kind === "motion" && ["fwd_roll", "roll"].includes(m.motionId)).toBe(true);
            if (m.kind === "motion" && m.motionId === "roll") roll++;
          });
        });
    });
    expect(total).toBeGreaterThan(0);
    expect(roll).toBeGreaterThan(0);
  }, 240_000);
});
