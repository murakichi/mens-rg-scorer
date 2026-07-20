import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// =====================================================================
// D加点クラスタ（§3.5.5.5）
// 期待値は mens-rg-rules.md から導出する（実装出力の写経はしない）。
// =====================================================================

describe("E難度ボーナス E_BONUS（§3.5.5.5(3) 投げ）", () => {
  it("E難度の投げタン（skillThrow）に +0.1 が乗る", () => {
    // e_doublelay(E) + b_backsalto(投げ) → 投げタン E、手具操作なしで appOp は発火しない
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay" },
          { kind: "skill", skillId: "b_backsalto", isThrow: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    // E難度点 0.7 + E_BONUS 0.1
    expect(r.tumblingScore).toBeCloseTo(0.8, 5);
  });

  it("投げを含まないE難度タンブリングには乗らない", () => {
    const r = computeScore([S({ kind: "skill", skillId: "e_doublelay" }, { kind: "catch" })], "stick");
    expect(r.tumblingScore).toBeCloseTo(0.7, 5);
  });
});

describe("シリーズ加点 SERIES_BONUS（§3.5.5.5(1)）", () => {
  it("投げ2回以上 & D以上ユニットありで +0.1", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw" },
          { kind: "catch" },
          { kind: "skill", skillId: "d_doubleback", isThrow: true }, // D→格上げでE、hasDPlus
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
  });

  it("投げ1回のみなら乗らない", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(r.seriesBonus).toBe(0);
  });
});

describe("技術加点 TECHNIQUE_BONUS（§3.5.5.5(2) ①〜⑥）", () => {
  it("視野外/手以外/手具使用の投げ受けは1つにつき +0.1", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["noview", "nonhand"] },
          { kind: "catch", catchTypes: ["useapp"] },
        ),
      ],
      "stick",
    );
    expect(r.techniqueCount).toBe(3);
    expect(r.techniqueBonus).toBeCloseTo(0.3, 5);
  });

  // ❌ バグ（#2）: §3.5.5.5(2) と app-scoring-spec §4 は「その他(other)」を技術加点対象に
  // 含めない（対象は 視野外/手以外/手具使用 のみ）。しかし実装は throwTypes/catchTypes の
  // 個数をそのまま数えるため「その他の投げ/受け」でも +0.1 されてしまう。
  it.skip("「その他の投げ」は技術加点対象外（rule 期待: bonus 0）— #2", () => {
    const r = computeScore([S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch" })], "stick");
    expect(r.techniqueBonus).toBe(0);
  });
});

describe("手具操作加点 APPARATUS_OP_BONUS（§3.5.5.5(3) 2回以上操作）", () => {
  it("手具操作技2つ以上 & 最高難度Eで +0.1", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay", hasApparatus: true },
          { kind: "skill", skillId: "b_backsalto", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.apparatusOpBonus).toBeCloseTo(0.1, 5);
  });

  it("手具操作技が1つだけなら乗らない", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay", hasApparatus: true },
          { kind: "skill", skillId: "b_backsalto" },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.apparatusOpBonus).toBe(0);
  });
});

describe("二つ投げ4動作加点 TWOTHROW_MOTION_BONUS（§3.5.5.5(2)⑦）", () => {
  it("二つ投げ〜受けの間に4動作以上で +0.1", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", reqTypes: ["twothrow"] },
          { kind: "motion", motionId: "m4" },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });

  it("3動作までなら乗らない", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", reqTypes: ["twothrow"] },
          { kind: "motion", motionId: "m3" },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBe(0);
  });
});

// ⚠️ 要確認（#3）: §3.5.5.5(3) は「投げまたは2回以上の操作」を含むE難度転回系に対し
// 最大0.10点。実装は E_BONUS と APPARATUS_OP_BONUS を別々に加算するため、E難度の投げタンで
// かつ手具操作2つ以上のとき 0.10 + 0.10 = 0.20 となり規則の上限を超える可能性がある。
describe("§3.5.5.5(3) の 0.10 上限（要確認 #3）", () => {
  it.skip("E難度投げタン＋手具操作2つでも E系加点は 0.10 を超えない（rule 期待）— #3", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay", hasApparatus: true },
          { kind: "skill", skillId: "b_backsalto", hasApparatus: true, isThrow: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    const eBonus = r.tumblingScore - 0.7; // E難度点0.7を差し引いた加点分
    expect(eBonus + r.apparatusOpBonus).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});
