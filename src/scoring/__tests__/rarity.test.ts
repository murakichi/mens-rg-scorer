import { describe, it, expect } from "vitest";
import {
  DEFAULT_RARITY,
  RARITY_COMMON_EXPONENT,
  RARITY_RARE_EXPONENT,
  pickWeighted,
  rarityChance,
  rarityExponent,
  rarityWeight,
} from "../pick";
import { autoTumblingTemplates } from "../autoTumblings";
import { autoThrowSpecs } from "../autoThrows";
import { computeScore } from "../score";
import {
  OTHER_FIRST_WEIGHT,
  OTHER_STYLE_WEIGHT,
  REQUIRED_ELEMENT_WEIGHT,
  otherStyleUsage,
  trimSpareOtherStyles,
  generateRoutine,
} from "../generate";
import type { ApparatusKey, Item, Series } from "../types";

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const APPS: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];

describe("珍しさ（rarity）のつまみ", () => {
  it("50で素の重み、0でよく実施される形に尖り、100で反転する", () => {
    expect(rarityExponent(DEFAULT_RARITY)).toBe(1);
    expect(rarityExponent()).toBe(1);
    expect(rarityExponent(0)).toBeCloseTo(RARITY_COMMON_EXPONENT, 6);
    expect(rarityExponent(100)).toBeCloseTo(RARITY_RARE_EXPONENT, 6);
    // 0→100 で単調に下がる
    const steps = [0, 25, 50, 75, 100].map((r) => rarityExponent(r));
    steps.forEach((v, i) => i > 0 && expect(v).toBeLessThan(steps[i - 1]));
    // 範囲外は丸める
    expect(rarityExponent(-10)).toBe(rarityExponent(0));
    expect(rarityExponent(200)).toBe(rarityExponent(100));
  });

  it("重みの変形：珍しさ0で差が広がり、100で大小が入れ替わる", () => {
    // 重み1（普通）と0.2（稀）の比
    const ratio = (rarity: number) =>
      rarityWeight(0.2, rarityExponent(rarity)) / rarityWeight(1, rarityExponent(rarity));
    expect(ratio(DEFAULT_RARITY)).toBeCloseTo(0.2, 6);
    expect(ratio(0)).toBeLessThan(0.2); // 稀な方がさらに引かれにくい
    expect(ratio(100)).toBeGreaterThan(1); // 稀な方が引かれやすい＝反転
    // 重み0は選ばれないまま（反転しても復活しない）
    expect(rarityWeight(0, rarityExponent(100))).toBe(0);
  });

  it("0〜1の確率も同じ向きに動く（0.5は動かない）", () => {
    expect(rarityChance(0.5, 0)).toBeCloseTo(0.5, 6);
    expect(rarityChance(0.5, 100)).toBeCloseTo(0.5, 6);
    expect(rarityChance(0.2, DEFAULT_RARITY)).toBeCloseTo(0.2, 6);
    expect(rarityChance(0.2, 0)).toBeLessThan(0.2);
    expect(rarityChance(0.2, 100)).toBeGreaterThan(0.2);
    // 0と1は動かさない（起きない／必ず起きるものは変えない）
    expect(rarityChance(0, 100)).toBe(0);
    expect(rarityChance(1, 0)).toBe(1);
  });

  it("珍しさ0では、重みの大きい選択肢がほぼ必ず選ばれる", () => {
    const rand = seeded(7);
    const weights: Record<string, number> = { common: 1, rare: 0.2 };
    const share = (rarity: number) => {
      let rare = 0;
      for (let i = 0; i < 400; i++)
        if (pickWeighted(["common", "rare"], rand, (id) => weights[id], rarityExponent(rarity)) === "rare")
          rare += 1;
      return rare / 400;
    };
    const low = share(0);
    const mid = share(DEFAULT_RARITY);
    const high = share(100);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeGreaterThan(0.5);
  });

  it("候補づくりに効く：珍しさを上げると稀な技・稀な受け方が増える", () => {
    /** 稀な技（`SKILL_PICK_WEIGHT` が低いもの）を含む候補の割合 */
    const rareSkillShare = (rarity: number) => {
      let n = 0;
      let hit = 0;
      for (const app of APPS)
        for (let seed = 0; seed < 12; seed++)
          for (const t of autoTumblingTemplates(app, { random: seeded(seed), rarity })) {
            n += 1;
            if (
              t.series.items.some(
                (it) =>
                  it.kind === "skill" &&
                  ["a_handspring", "b_tenchu", "c_kirimomiten", "c_tempotwist"].includes(it.skillId),
              )
            )
              hit += 1;
          }
      return hit / n;
    };
    const common = rareSkillShare(0);
    const normal = rareSkillShare(DEFAULT_RARITY);
    const rare = rareSkillShare(100);
    expect(common).toBeLessThan(normal);
    expect(normal).toBeLessThan(rare);

    /** 手以外のキャッチ（手具ごとに重みが下がる受け方）を含む投げ候補の割合 */
    const nonHandShare = (rarity: number) => {
      let n = 0;
      let hit = 0;
      for (const app of APPS)
        for (let seed = 0; seed < 12; seed++)
          for (const sp of autoThrowSpecs(app, { random: seeded(seed), rarity })) {
            n += 1;
            if ((sp.catchStyle.catchTypes || []).includes("nonhand")) hit += 1;
          }
      return hit / n;
    };
    expect(nonHandShare(100)).toBeGreaterThan(nonHandShare(0));
  });
});

describe("その他の投げ受け（種類を埋めるための入力）", () => {
  const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
  const otherThrow: Item = { kind: "throw", throwTypes: ["other"] };
  const plainThrow: Item = { kind: "throw" };
  const otherCatch: Item = { kind: "catch", catchTypes: ["other"] };
  const plainCatch: Item = { kind: "catch" };

  it("珍しさの変形から外れている（珍しさを上げても候補で増えない）", () => {
    const share = (rarity: number) => {
      let n = 0;
      let other = 0;
      for (const app of APPS)
        for (let seed = 0; seed < 12; seed++)
          for (const sp of autoThrowSpecs(app, { random: seeded(seed), rarity })) {
            n += 1;
            if ((sp.catchStyle.catchTypes || []).includes("other")) other += 1;
          }
      return other / n;
    };
    // 珍しい受け方ではないので、珍しさ100で増えたりしない
    expect(share(100)).toBeLessThan(share(DEFAULT_RARITY));
  });

  it("最初の投げ・最初のキャッチがその他なら `leading` に数える", () => {
    // 1本目がその他の投げ／その他のキャッチ
    expect(otherStyleUsage([S(otherThrow, plainCatch)]).leading).toBe(1);
    expect(otherStyleUsage([S(plainThrow, otherCatch)]).leading).toBe(1);
    expect(otherStyleUsage([S(otherThrow, otherCatch)]).leading).toBe(2);
    // 通常の投げ受けのあとならよい（比べる相手がある）
    expect(otherStyleUsage([S(plainThrow, plainCatch), S(otherThrow, otherCatch)]).leading).toBe(0);
    // シリーズをまたいでも「最初」は演技の最初
    expect(otherStyleUsage([S(plainThrow, otherCatch), S(otherThrow, plainCatch)]).leading).toBe(1);
  });

  it("種類を埋めている分は嫌わない（余った分だけ `spare`）", () => {
    const series = [S(plainThrow, plainCatch), S(otherThrow, otherCatch)];
    // 種類が足りない構成：その他が種類を埋めているので余りは0
    expect(otherStyleUsage(series, {
      throwKindCount: 2,
      catchKindCount: 2,
      throwOtherCount: 1,
      catchOtherCount: 1,
    }).spare).toBe(0);
    // 種類が足りている構成：その他は飾りなので余りに数える
    expect(otherStyleUsage(series, {
      throwKindCount: 4,
      catchKindCount: 4,
      throwOtherCount: 1,
      catchOtherCount: 1,
    }).spare).toBe(2);
  });

  it("評価では『最初がその他』を実質させない重みにしてある", () => {
    // 現実志向の重み（0.1〜0.9）より上、必須要素（10）より下
    expect(OTHER_FIRST_WEIGHT).toBeGreaterThan(OTHER_STYLE_WEIGHT);
    expect(OTHER_FIRST_WEIGHT).toBeGreaterThan(0.9);
    expect(OTHER_FIRST_WEIGHT).toBeLessThan(REQUIRED_ELEMENT_WEIGHT);
  });
});

describe("種類を埋めていないその他のタグは外す", () => {
  const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
  const otherThrow: Item = { kind: "throw", throwTypes: ["other"] };
  const otherCatch: Item = { kind: "catch", catchTypes: ["other"] };

  it("種類が足りているときだけ外す（足りていなければ残す）", () => {
    const series = [S({ kind: "throw" }, { kind: "catch" }), S(otherThrow, otherCatch)];
    // 種類が足りている＝その他は飾りなので外す
    const trimmed = trimSpareOtherStyles(series, {
      throwKindCount: 4,
      catchKindCount: 4,
      throwOtherCount: 1,
      catchOtherCount: 1,
    });
    expect(trimmed).not.toBe(series);
    const tags = trimmed.flatMap((s) =>
      s.items.flatMap((it) =>
        it.kind === "throw" ? it.throwTypes || [] : it.kind === "catch" ? it.catchTypes || [] : [],
      ),
    );
    expect(tags).not.toContain("other");
    // 種類が足りていない＝役割を果たしているので触らない（同じ配列がそのまま返る）
    expect(
      trimSpareOtherStyles(series, {
        throwKindCount: 2,
        catchKindCount: 2,
        throwOtherCount: 1,
        catchOtherCount: 1,
      }),
    ).toBe(series);
  });

  it("生成結果には飾りのその他も『最初がその他』も残らない", () => {
    for (const app of APPS)
      for (let seed = 1; seed <= 8; seed++)
        for (const rarity of [0, DEFAULT_RARITY, 100]) {
          const r = generateRoutine([], { apparatus: app, random: seeded(seed), rarity });
          if (!r) continue;
          const sc = computeScore(r.series, app, {});
          const u = otherStyleUsage(r.series, sc);
          expect(u.leading).toBe(0);
          expect(u.spare).toBe(0);
        }
  }, 120_000);
});
