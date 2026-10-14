import { describe, it, expect } from "vitest";
import {
  SKILL_WEIGHT_DEFAULT,
  SKILL_WEIGHT_MAX,
  SKILL_WEIGHT_MIN,
  changedSkillCount,
  clampSkillWeight,
  normalizeSkillWeights,
  resetSkillWeight,
  resetSkillWeights,
  setSkillWeight,
  userSkillWeight,
} from "../skillWeights";
import { autoTumblingTemplates } from "../autoTumblings";
import { baseSkillWeights, saltoWeights } from "../tumblingWeights";
import type { ApparatusKey } from "../types";

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const APPS: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];

describe("技ごとの出やすさ（ユーザー設定）", () => {
  it("既定から変えたものだけ持つ（＝リセットは捨てるだけ）", () => {
    let store = setSkillWeight({}, "b_front", 0.5);
    expect(store).toEqual({ b_front: 0.5 });
    // 既定に戻すと消える（保存する意味がない）
    store = setSkillWeight(store, "b_front", SKILL_WEIGHT_DEFAULT);
    expect(store).toEqual({});
    expect(changedSkillCount({})).toBe(0);
    // 1技だけ戻す／すべて戻す
    const two = setSkillWeight(setSkillWeight({}, "b_front", 0), "b_sidesalto", 2);
    expect(changedSkillCount(two)).toBe(2);
    expect(resetSkillWeight(two, "b_front")).toEqual({ b_sidesalto: 2 });
    expect(resetSkillWeights()).toEqual({});
  });

  it("保存データは正規化する（知らないid・数値でない・範囲外を捨てる／丸める）", () => {
    expect(
      normalizeSkillWeights({
        b_front: 0.5,
        unknown_skill: 2,
        b_sidesalto: "abc",
        b_kirimomi: 99,
        c_back15: -5,
        b_tenchu: SKILL_WEIGHT_DEFAULT,
      }),
    ).toEqual({ b_front: 0.5, b_kirimomi: SKILL_WEIGHT_MAX, c_back15: SKILL_WEIGHT_MIN });
    expect(normalizeSkillWeights(null)).toEqual({});
    expect(normalizeSkillWeights("壊れたデータ")).toEqual({});
    expect(clampSkillWeight(0.44)).toBeCloseTo(0.4, 6);
  });

  it("重みに掛かる（位置ごとの重みを上書きする場所でも消えない）", () => {
    const store = { b_front: 0.5, b_kirimomi: 2 };
    const base = baseSkillWeights(false, undefined, null, store);
    expect(base["b_front"]).toBeCloseTo(0.5, 6);
    // 後方伸身宙返りの後は `AFTER_BACK_LAYOUT_SALTOS` が重みを上書きする位置
    const after = saltoWeights("b_backlayout", false, undefined, null, store);
    const plain = saltoWeights("b_backlayout");
    expect(after["b_front"]).toBeCloseTo(plain["b_front"] * 0.5, 6);
    expect(after["b_kirimomi"]).toBeCloseTo(plain["b_kirimomi"] * 2, 6);
  });

  it("0にした技は候補に出てこない", () => {
    const zero = { b_front: 0 };
    let withFront = 0;
    let withoutFront = 0;
    for (const app of APPS)
      for (let seed = 0; seed < 10; seed++) {
        for (const t of autoTumblingTemplates(app, { random: seeded(seed) }))
          if (t.series.items.some((it) => it.kind === "skill" && it.skillId === "b_front")) withFront += 1;
        for (const t of autoTumblingTemplates(app, { random: seeded(seed), skillWeights: zero }))
          if (t.series.items.some((it) => it.kind === "skill" && it.skillId === "b_front")) withoutFront += 1;
      }
    expect(withFront).toBeGreaterThan(0);
    expect(withoutFront).toBe(0);
  });

  it("倍率を上げるとその技を含む候補が増える", () => {
    const share = (store?: Record<string, number>) => {
      let n = 0;
      let hit = 0;
      for (const app of APPS)
        for (let seed = 0; seed < 10; seed++)
          for (const t of autoTumblingTemplates(app, { random: seeded(seed), skillWeights: store })) {
            n += 1;
            if (t.series.items.some((it) => it.kind === "skill" && it.skillId === "b_tenchu")) hit += 1;
          }
      return hit / n;
    };
    expect(share({ b_tenchu: SKILL_WEIGHT_MAX })).toBeGreaterThan(share());
  });

  it("未設定なら既定（1）", () => {
    expect(userSkillWeight(undefined, "b_front")).toBe(SKILL_WEIGHT_DEFAULT);
    expect(userSkillWeight({}, "b_front")).toBe(SKILL_WEIGHT_DEFAULT);
    expect(userSkillWeight({ b_front: 0.3 }, "b_front")).toBe(0.3);
  });
});
