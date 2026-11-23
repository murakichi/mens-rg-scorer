import { describe, it, expect } from "vitest";
import { sideThrowCatchFlags } from "../analysis";
import { NON_HAND_CATCH_KINDS } from "../constants";
import {
  FOOT_CATCH_KINDS,
  PAIR_SECOND_NO_VIEW_CATCH_CHANCE,
  autoThrowSpecs,
  autoThrowTemplates,
  maybeSideThrow,
} from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { arrangeRopeFootWrap, evaluateUsed, ropeFootWrapIssues } from "../generate";
import { seededRandom } from "../probe";
import type { SeriesTemplate } from "../templates";
import type { ApparatusKey, Series } from "../types";

describe("リングの横投げ前提の受け方（2026-11-18）", () => {
  it("表示名に「横投げ前提」と書かない", () => {
    NON_HAND_CATCH_KINDS.ring.forEach((k) => expect(k.name).not.toContain("横投げ前提"));
  });
  it("sideThrowCatchFlags：横投げで投げた手具を受けるときだけ true", () => {
    const s: Series["items"] = [
      { kind: "throw", throwTypes: ["side"] },
      { kind: "catch" },
      { kind: "throw" },
      { kind: "catch" },
      // 2つとも空中：どちらかが横投げなら出す
      { kind: "throw" },
      { kind: "throw", throwTypes: ["side"] },
      { kind: "catch" },
      { kind: "catch" },
    ];
    // 1つ目を通常のキャッチで受けたら、残る（横投げの）手具の受けでも出す（2026-11-21。以前は false）
    expect(sideThrowCatchFlags(s)).toEqual([false, true, false, false, false, false, true, true]);
  });
  it("sideThrowCatchFlags：横投げ前提の受け方で受けたら横投げの手具を受けたとみなす（2026-11-21）", () => {
    // 横投げ（1つ目）→投げ→上半身に入れる（横投げの手具）→通常キャッチ（横投げでない手具）
    const s: Series["items"] = [
      { kind: "throw", throwTypes: ["side"] },
      { kind: "throw" },
      { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "upperBody" },
      { kind: "motion", motionId: "chene", count: 3, hands: false },
      { kind: "catch" },
    ];
    expect(sideThrowCatchFlags(s)).toEqual([false, false, true, false, false]);
    // 投げ→横投げ→通常キャッチ→上半身に入れる（airPair の形）：2つ目の受けで横投げ前提を選べる
    const t: Series["items"] = [
      { kind: "throw" },
      { kind: "throw", throwTypes: ["side"] },
      { kind: "catch" },
      { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "upperBody" },
    ];
    expect(sideThrowCatchFlags(t)).toEqual([false, false, true, true]);
  });
});

describe("ロープの足に巻き付けたキャッチ（2026-11-18）", () => {
  const S = (...items: Series["items"]): Series => ({ items });
  const wrapAfter = (motionId: string) =>
    S({ kind: "throw" }, { kind: "motion", motionId, count: 1 }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footWrap" });
  it("最後以外のシリーズ・前転や転がりの直後の足に巻き付け、転がりの直後の肩を数える", () => {
    const chene = S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 1, hands: false }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footWrap" });
    expect(ropeFootWrapIssues([chene, chene], "rope")).toMatchObject({ notLast: 1, afterRoll: 0 });
    expect(ropeFootWrapIssues([wrapAfter("fwd_roll")], "rope")).toMatchObject({ notLast: 0, afterRoll: 1 });
    const shoulderAfterRoll = S({ kind: "throw" }, { kind: "motion", motionId: "roll", count: 1 }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "shoulder" });
    expect(ropeFootWrapIssues([shoulderAfterRoll], "rope").afterRoll).toBe(1);
    // 前転の直後の肩はよい
    const shoulderAfterFwd = S({ kind: "throw" }, { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "shoulder" });
    expect(ropeFootWrapIssues([shoulderAfterFwd], "rope").afterRoll).toBe(0);
    expect(ropeFootWrapIssues([chene, chene], "stick")).toMatchObject({ notLast: 0, afterRoll: 0 });
  });

  it("arrangeRopeFootWrap：最後以外の足に巻き付けを肩に直す（自動生成の候補だけ）", () => {
    const chene = S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 2, hands: false }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footWrap" });
    const chene3 = S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 3, hands: false }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footWrap" });
    const tpl = (series: Series, auto: boolean, id: string) => ({ id, name: id, apparatus: "rope", updatedAt: 0, series, auto }) as SeriesTemplate;
    const opts = { apparatus: "rope" as const, minScore: 0 };
    const used = [tpl(chene, true, "a"), tpl(chene3, true, "b")];
    const out = arrangeRopeFootWrap({ used, ev: evaluateUsed(used, opts) }, opts);
    expect(ropeFootWrapIssues(out.used.map((t) => t.series), "rope").notLast).toBe(0);
    const last = out.used[1].series.items.at(-1);
    expect(last?.kind === "catch" && last.nonHandKind).toBe("footWrap");
  });

  it("候補：転がりの直後には手以外で受けない", () => {
    for (let seed = 1; seed <= 40; seed++)
      autoThrowTemplates("rope", { random: seededRandom(seed) }).forEach((t) =>
        t.series.items.forEach((it, i) => {
          const prev = t.series.items[i - 1];
          if (it.kind === "catch" && (it.catchTypes ?? []).includes("nonhand"))
            expect(prev?.kind === "motion" && prev.motionId === "roll").toBe(false);
        }),
      );
  }, 60_000);
});

describe("投げタンを足で受けるのはレア（2026-11-18）", () => {
  it("投げタンの手以外のキャッチは、足以外の受け方がある手具ではほとんど足以外", () => {
    (["ring", "rope"] as ApparatusKey[]).forEach((app) => {
      let foot = 0;
      let all = 0;
      for (let seed = 1; seed <= 80; seed++)
        autoTumblingTemplates(app, { random: seededRandom(seed) }).forEach((t) =>
          t.series.items.forEach((it) => {
            if (!((it.kind === "catch" || (it.kind === "skill" && it.isCatch)) && it.nonHandKind)) return;
            if (!t.series.items.some((x) => x.kind === "skill")) return;
            all++;
            if (FOOT_CATCH_KINDS.includes(it.nonHandKind)) foot++;
          }),
        );
      expect(all).toBeGreaterThan(0);
      expect(foot / all).toBeLessThan(0.25);
    });
  }, 120_000);
});

describe("連続投げの2回目の視野外キャッチは通常のキャッチより少ない（2026-11-18）", () => {
  it("背面投げを足す形の2回目を視野外で受ける確率は半分未満", () => {
    expect(PAIR_SECOND_NO_VIEW_CATCH_CHANCE).toBeLessThan(0.5);
    let nv = 0;
    let plain = 0;
    for (let k = 0; k < 40; k++)
      autoThrowSpecs("stick", { random: seededRandom(k + 1) }).forEach((spec) => {
        if (!spec.pattern.noViewPair) return;
        if (spec.noViewPairPlainCatch) plain++;
        else nv++;
      });
    expect(plain).toBeGreaterThan(nv);
  });
});

describe("視野外の横向きの投げは前転3回では実施しない（2026-11-18）", () => {
  it("maybeSideThrow：前転3回の投げは視野外でも横にしない", () => {
    const nv = { id: "noview", name: "視野外の投げ", throwTypes: ["noview"] };
    const plain = { id: "normal", name: "通常のキャッチ" };
    // 股下にも横にも当たる乱数（股下は3動作なので出ない）
    const r = () => 0.01;
    expect(maybeSideThrow("ring", nv, plain, 3, r, (p) => p, false, true).throwTypes).toEqual(["noview"]);
    expect(maybeSideThrow("ring", nv, plain, 3, r, (p) => p, false, false).throwTypes).toContain("side");
  });
  it("候補：前転3回の投げに視野外の横向きの投げは無い", () => {
    (["clubs", "ring"] as ApparatusKey[]).forEach((app) => {
      for (let seed = 1; seed <= 40; seed++)
        autoThrowTemplates(app, { random: seededRandom(seed), demandScore: 5 }).forEach((t) => {
          const items = t.series.items;
          items.forEach((it, i) => {
            if (it.kind !== "throw") return;
            const tags = it.throwTypes ?? [];
            if (!(tags.includes("noview") && tags.includes("side"))) return;
            let rolls = 0;
            for (let k = i + 1; k < items.length && items[k].kind !== "catch"; k++) {
              const x = items[k];
              if (x.kind === "motion" && x.motionId === "fwd_roll") rolls += x.count ?? 0;
            }
            expect(rolls).toBeLessThan(3);
          });
        });
    });
  }, 120_000);
});

describe("投げ→ロンダートで受ける形はリングだけ（2026-11-18）", () => {
  it("リング以外の候補にはロンダートの最中の受けが無い（リングにはある）", () => {
    const count = (app: ApparatusKey) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++)
        autoTumblingTemplates(app, { random: seededRandom(seed), targetScore: 6, demandScore: 6 } as any).forEach((t) =>
          t.series.items.forEach((it) => {
            if (it.kind === "skill" && it.isCatch && it.skillId === "a_roundoff") n++;
          }),
        );
      return n;
    };
    (["stick", "clubs", "rope"] as ApparatusKey[]).forEach((app) => expect(count(app)).toBe(0));
    expect(count("ring")).toBeGreaterThan(0);
  }, 240_000);
});

describe("ロープのメジャーな受け方は 肩・足・通常・背面 の4種類（2026-11-18）", () => {
  it("背面と手以外を組み合わせた受け方の候補はまれ（引きの重みが低い）", async () => {
    const { ROPE_COMBINED_CATCH_WEIGHT } = await import("../autoThrows");
    expect(ROPE_COMBINED_CATCH_WEIGHT).toBeLessThan(0.5);
    let combo = 0;
    let all = 0;
    for (let seed = 1; seed <= 40; seed++)
      autoThrowTemplates("rope", { random: seededRandom(seed) }).forEach((t) =>
        t.series.items.forEach((it) => {
          if (it.kind !== "catch") return;
          all++;
          if ((it.catchTypes ?? []).length >= 2) combo++;
        }),
      );
    expect(combo / all).toBeLessThan(0.05);
  }, 60_000);
});

describe("視野外の受け→連続投げは生成しない（2026-11-20）", () => {
  it("候補に、視野外のキャッチの直後に投げる形が無い", () => {
    const bad = (s: Series) =>
      s.items.some(
        (it, i) =>
          (it.kind === "catch" || (it.kind === "skill" && !!it.isCatch)) &&
          (it.catchTypes ?? []).includes("noview") &&
          (s.items[i + 1]?.kind === "throw" || (s.items[i + 1]?.kind === "skill" && !!(s.items[i + 1] as { isThrow?: boolean }).isThrow)),
      );
    (["stick", "clubs", "ring", "rope"] as ApparatusKey[]).forEach((app) => {
      for (let seed = 1; seed <= 20; seed++) {
        const opts = { random: seededRandom(seed), demandScore: 5, targetScore: 7 } as never;
        [...autoThrowTemplates(app, opts), ...autoTumblingTemplates(app, opts)].forEach((t) => expect(bad(t.series)).toBe(false));
      }
    });
  }, 240_000);
});
