import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { apparatusBlockers, stripForApparatus, APPARATUS_INPUT_NAMES } from "../analysis";
import { THROW_OPTIONS_COMMON, CATCH_OPTIONS_COMMON, LEGACY_OTHER_STYLE_TAG } from "../constants";
import { autoThrowStyles, autoCatchStyles } from "../autoThrows";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const APPARATUS = ["stick", "clubs", "ring", "rope"] as const;

// 「その他の投げ・その他のキャッチ」は投げ方・受け方がほぼ網羅されたので入力から削除した。
// 旧データ（保存・テンプレート・共有URL）に残っていても、どの手具でも入力できない内容として落とし、採点しない。
describe("削除した「その他の投げ・キャッチ」", () => {
  it("入力の選択肢にも自動生成の投げ方・受け方にも無い", () => {
    expect(THROW_OPTIONS_COMMON.some((o) => o.id === LEGACY_OTHER_STYLE_TAG)).toBe(false);
    expect(CATCH_OPTIONS_COMMON.some((o) => o.id === LEGACY_OTHER_STYLE_TAG)).toBe(false);
    APPARATUS.forEach((app) => {
      expect(autoThrowStyles(app).some((t) => (t.throwTypes || []).includes(LEGACY_OTHER_STYLE_TAG))).toBe(false);
      expect(autoCatchStyles(app).some((c) => (c.catchTypes || []).includes(LEGACY_OTHER_STYLE_TAG))).toBe(false);
    });
  });

  it("旧データに残っていれば全手具で落とす内容として名前が挙がり、落とすと消える", () => {
    const list = [
      S(
        { kind: "throw", throwTypes: ["noview", "other"] },
        { kind: "catch", catchTypes: ["other"] },
        { kind: "skill", skillId: "b_backsalto", isCatch: true, catchTypes: ["other", "noview"] },
      ),
    ];
    APPARATUS.forEach((app) => {
      expect(apparatusBlockers(list, app)).toContain(APPARATUS_INPUT_NAMES.other);
      const stripped = stripForApparatus(list, app);
      expect(apparatusBlockers(stripped, app)).not.toContain(APPARATUS_INPUT_NAMES.other);
      const items = stripped[0].items as Item[];
      expect((items[0] as { throwTypes?: string[] }).throwTypes).toEqual(["noview"]);
      expect((items[1] as { catchTypes?: string[] }).catchTypes).toEqual([]);
      expect((items[2] as { catchTypes?: string[] }).catchTypes).toEqual(["noview"]);
    });
  });

  it("投げ方・受け方の種類にも技術加点にも数えない（その他を外したのと同じ点）", () => {
    const withOther = [
      S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch", catchTypes: ["other"] }),
      S({ kind: "throw", throwTypes: ["noview", "other"] }, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch" }),
    ];
    const without = [
      S({ kind: "throw" }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch" }),
    ];
    const a = computeScore(withOther, "stick");
    const b = computeScore(without, "stick");
    expect(a.throwKindCount).toBe(b.throwKindCount);
    expect(a.catchKindCount).toBe(b.catchKindCount);
    expect(a.techniqueBonus).toBeCloseTo(b.techniqueBonus, 5);
    expect(a.grandTotal).toBeCloseTo(b.grandTotal, 5);
  });
});
