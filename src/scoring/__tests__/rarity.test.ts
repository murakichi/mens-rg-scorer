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
import type { ApparatusKey } from "../types";

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

    /** その他のキャッチ（重み0.1）を含む投げ候補の割合 */
    const otherCatchShare = (rarity: number) => {
      let n = 0;
      let hit = 0;
      for (const app of APPS)
        for (let seed = 0; seed < 12; seed++)
          for (const sp of autoThrowSpecs(app, { random: seeded(seed), rarity })) {
            n += 1;
            if ((sp.catchStyle.catchTypes || []).includes("other")) hit += 1;
          }
      return hit / n;
    };
    expect(otherCatchShare(100)).toBeGreaterThan(otherCatchShare(0));
  });
});
