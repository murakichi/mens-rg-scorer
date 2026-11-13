import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { stripForApparatus, apparatusBlockers, APPARATUS_INPUT_NAMES } from "../analysis";
import { skillOptions, MOTION_OPTIONS } from "../constants";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const cartSkill: Item = { kind: "skill", skillId: "a_cartwheel" };
const cartMotion: Item = { kind: "motion", motionId: "a_cartwheel", count: 1 };

// 側転は徒手として統一した：個人のタンブリング欄には出さず、徒手動作で入力する。
describe("側転は徒手として統一", () => {
  it("個人のタンブリングの選択肢に無く、徒手動作の選択肢にはある（団体は従来どおり）", () => {
    expect(skillOptions().some((s) => s.id === "a_cartwheel")).toBe(false);
    expect(MOTION_OPTIONS.some((m) => m.id === "a_cartwheel")).toBe(true);
    expect(skillOptions(false, undefined, null, true).some((s) => s.id === "a_cartwheel")).toBe(true);
  });

  it("旧データのタンブリング欄の側転は徒手動作（1回）に移す", () => {
    const list = [S({ kind: "skill", skillId: "b_sidesalto" }, { ...cartSkill, hasApparatus: true }, { kind: "catch" })];
    (["stick", "clubs", "ring", "rope"] as const).forEach((ap) => {
      expect(apparatusBlockers(list, ap)).toContain(APPARATUS_INPUT_NAMES.cartwheelSkill);
      expect(stripForApparatus(list, ap)[0].items[1]).toEqual(cartMotion);
    });
  });

  it("技の最中に投げる・受ける側転は徒手動作で表せないので残す", () => {
    const list = [S({ kind: "skill", skillId: "a_cartwheel", isThrow: true }, { kind: "catch" })];
    expect(apparatusBlockers(list, "stick")).not.toContain(APPARATUS_INPUT_NAMES.cartwheelSkill);
  });

  it("タンブリング欄の側転と徒手動作の側転は同じ点になる", () => {
    const routines = (cart: Item) => [
      S({ kind: "throw" }, cart, { kind: "motion", motionId: "chene", count: 2 }, { kind: "catch" }),
      S({ kind: "skill", skillId: "b_front" }, cart, { kind: "skill", skillId: "b_sidesalto" }),
    ];
    const a = computeScore(routines(cartSkill), "stick");
    const b = computeScore(routines(cartMotion), "stick");
    expect(a.dScore).toBeCloseTo(b.dScore, 5);
    expect(a.grandTotal).toBeCloseTo(b.grandTotal, 5);
  });

  it("二つ投げ4動作加点：側転を含む4動作は入力の仕方によらず加点する", () => {
    const two = (cart: Item) =>
      S({ kind: "throw", reqTypes: ["twothrow"] }, cart, { kind: "motion", motionId: "chene", count: 3 }, { kind: "catch", catchTwo: true });
    expect(computeScore([two(cartMotion)], "clubs").twoThrowMotionBonus).toBeCloseTo(0.1, 5);
    expect(computeScore([two(cartSkill)], "clubs").twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });
});
