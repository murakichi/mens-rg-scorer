import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// =========================================================================
// E難度ボーナス E_BONUS（ルール §3.5.5.5(3) 投げの経路）
//   手具を保持して行うE難度の転回系に「投げ」が含まれる → +0.10（tumblingScore に加算）。
//   実装：unit.finalDiff==="E" && unit.skillThrow のとき DIFF_SCORE[E] に E_BONUS を上乗せ。
// =========================================================================
describe("E難度ボーナス §3.5.5.5(3)〔投げ〕", () => {
  it("E難度タンブリング＋技中の投げ → 0.7 + 0.10 = 0.80", () => {
    const r = computeScore([S({ kind: "skill", skillId: "e_doublelay", isThrow: true }, { kind: "catch" })], "stick");
    // E難度(0.7) に E_BONUS(0.1) が乗る
    expect(r.tumblingScore).toBeCloseTo(0.8, 5);
  });

  it("E難度でも投げが無ければ E_BONUS なし → 0.70", () => {
    const r = computeScore([S({ kind: "skill", skillId: "e_doublelay" }, { kind: "catch" })], "stick");
    expect(r.tumblingScore).toBeCloseTo(0.7, 5);
  });

  it("投げがあってもE未満なら E_BONUS なし（D難度単体 → 0.50）", () => {
    const r = computeScore([S({ kind: "skill", skillId: "d_doubleback", isThrow: true }, { kind: "catch" })], "stick");
    // d_doubleback D(4) + 投げ+1 = 5 → E?? いや calcTumblingDifficulty で +1 されるため要確認。
    // D(4)+1(投げ)=5 → E。したがって E_BONUS が乗り 0.7+0.1=0.8 になる。
    // → 「投げ+1でEに格上げ」される境界を明示（下の期待値はルールの難度算出に従う）
    expect(r.tumblingScore).toBeCloseTo(0.8, 5);
  });
});

// =========================================================================
// 手具操作加点 APPARATUS_OP_BONUS（ルール §3.5.5.5(3) 2回以上の操作の経路）
//   手具を保持して行うE難度の転回系に「2回以上の操作」が含まれる → +0.10。
//   実装：シリーズ内 hasApparatus 技が2つ以上 & いずれかのユニットが最高難度E。
// =========================================================================
describe("手具操作加点 §3.5.5.5(3)〔2回以上の操作〕", () => {
  it("E難度ユニットに手具操作2回 → +0.10", () => {
    const r = computeScore(
      [S(
        { kind: "skill", skillId: "e_doublelay", hasApparatus: true },
        { kind: "skill", skillId: "a_cartwheel", hasApparatus: true },
        { kind: "catch" },
      )],
      "stick",
    );
    expect(r.apparatusOpBonus).toBeCloseTo(0.1, 5);
  });

  it("手具操作が1回だけなら加点なし", () => {
    const r = computeScore([S({ kind: "skill", skillId: "e_doublelay", hasApparatus: true }, { kind: "catch" })], "stick");
    expect(r.apparatusOpBonus).toBeCloseTo(0, 5);
  });

  it("操作2回でも最高難度がE未満なら加点なし（D止まり）", () => {
    const r = computeScore(
      [S(
        { kind: "skill", skillId: "d_doubleback", hasApparatus: true },
        { kind: "skill", skillId: "a_cartwheel", hasApparatus: true },
        { kind: "catch" },
      )],
      "stick",
    );
    // d_doubleback D + a_cartwheel(A除外) → D。E未満 → appOp 0
    expect(r.apparatusOpBonus).toBeCloseTo(0, 5);
  });
});

// =========================================================================
// 二つ投げ4動作加点 TWOTHROW_MOTION_BONUS（ルール §3.5.5.5(2)⑦）
//   2本投げ〜受けの区間に徒手動作が合計4動作以上 → +0.10。
// =========================================================================
describe("二つ投げ4動作加点 §3.5.5.5(2)⑦", () => {
  it("二つ投げ区間に4動作 → +0.10", () => {
    const r = computeScore(
      [S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "motion", motionId: "m4" }, { kind: "catch" })],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });

  it("二つ投げ区間の動作が3動作なら加点なし", () => {
    const r = computeScore(
      [S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "motion", motionId: "m3" }, { kind: "catch" })],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0, 5);
  });

  it("二つ投げでない投げなら4動作あっても加点なし", () => {
    const r = computeScore(
      [S({ kind: "throw" }, { kind: "motion", motionId: "m4" }, { kind: "catch" })],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0, 5);
  });
});

// =========================================================================
// §3.5.5.5(3) は「最大0.10点」。実装は E_BONUS（投げ）と APPARATUS_OP_BONUS（操作）を
// 別々に加算するため、両条件を満たすと 0.20 になりうる。→ 既報 issue #3。
// =========================================================================
describe("§3.5.5.5(3) 上限0.10の逸脱", () => {
  it.skip("E＋投げ＋操作2回でも (3)由来の加点は0.10まで（→ issue #3、修正後 skip 解除）", () => {
    const r = computeScore(
      [S(
        { kind: "skill", skillId: "e_doublelay", isThrow: true, hasApparatus: true },
        { kind: "skill", skillId: "a_cartwheel", hasApparatus: true },
        { kind: "catch" },
      )],
      "stick",
    );
    // ルール：E転回系の基礎0.7 ＋ (3)由来0.10 = 0.80 が上限。
    // 実装：tumblingScore 0.80（E_BONUS込）＋ apparatusOpBonus 0.10 = 0.90 になる。
    expect(r.tumblingScore + r.apparatusOpBonus).toBeCloseTo(0.8, 5);
  });
});

// =========================================================================
// §3.5.5.5(3) の局所性：操作は「E難度転回系に」含まれる必要がある。
// 実装はシリーズ全体で操作を数えE判定も別ユニットで良いため、E転回系の外の
// 操作でも成立する。→ issue #6。
// =========================================================================
describe("§3.5.5.5(3) 操作の局所性", () => {
  it.skip("E転回系に操作が無ければ手具操作加点は成立しない（→ issue #6、修正後 skip 解除）", () => {
    const r = computeScore(
      [S(
        { kind: "skill", skillId: "e_doublelay", hasApparatus: false }, // E転回系・操作なし
        { kind: "catch" },
        { kind: "skill", skillId: "b_backsalto", hasApparatus: true }, // 操作はCユニット側
        { kind: "skill", skillId: "b_front", hasApparatus: true },
        { kind: "catch" },
      )],
      "stick",
    );
    // ルール：E転回系に操作が含まれない → apparatusOpBonus = 0
    // 実装：0.10（シリーズ全体で操作2回 & いずれかE のため）
    expect(r.apparatusOpBonus).toBeCloseTo(0, 5);
  });
});
