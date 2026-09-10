// =====================================================================
// D（難度）のボーナス加点 §3.5.5.5 の検証。
// 期待値はすべて mens-rg-rules.md から手計算した literal。
// =====================================================================
import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
/** 徒手動作を count 回まとめた1アイテム */
const mot = (motionId: string, count = 1): Item => ({ kind: "motion", motionId, count });

describe("E難度ボーナス（§3.5.5.5(3) 投げを含むE難度の転回系）", () => {
  it("E難度タンブリングに技中の投げが含まれると +0.10", () => {
    // 後方伸身2回宙返り(E) を投げながら実施 → 難度E(0.70) + ボーナス(0.10)
    const r = computeScore(
      [S({ kind: "skill", skillId: "e_doublelay", isThrow: true }, { kind: "catch" })],
      "stick",
    );
    expect(r.tumblingScore).toBeCloseTo(0.8, 5);
  });

  it("投げが無ければ難度点のみ（ボーナスなし）", () => {
    const r = computeScore([S({ kind: "skill", skillId: "e_doublelay" }, { kind: "catch" })], "stick");
    expect(r.tumblingScore).toBeCloseTo(0.7, 5);
  });

  it("E難度でなければ投げを含んでもボーナスは付かない", () => {
    // 後方宙返り(B) + 投げタンで1ランクアップ → C(0.30) のみ
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" })],
      "stick",
    );
    expect(r.tumblingScore).toBeCloseTo(0.3, 5);
  });

  it("内訳の行（tumRows）にもボーナス込みの点数が入る", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "e_doublelay", isThrow: true }, { kind: "catch" })],
      "stick",
    );
    expect(r.seriesBreakdowns[0].tumRows[0].score).toBeCloseTo(0.8, 5);
    expect(r.seriesBreakdowns[0].tumDiff).toBeCloseTo(0.8, 5);
  });
});

describe("シリーズ加点（§3.5.5.5(1) 難易度の高い連続した投げ受け）", () => {
  // 投げ→3動作→キャッチ ＝ 徒手系D難度。これを1シリーズに2回で「次々に投げる投げ受け」
  const twoThrowsD = S(
    { kind: "throw" },
    mot("chene", 3),
    { kind: "catch" },
    { kind: "throw" },
    mot("roll", 3),
    { kind: "catch" },
  );

  it("1シリーズに投げ2回以上かつD難度以上の投げ受けがあれば +0.10", () => {
    const r = computeScore([twoThrowsD], "clubs");
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
    // 徒手系D(0.50)×2本 ＋ シリーズ加点(0.10)
    expect(r.handScore).toBeCloseTo(1.0, 5);
    expect(r.dScore).toBeCloseTo(1.1, 5);
  });

  it("D難度未満（2動作＝C）なら付かない", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw" },
          mot("chene", 2),
          { kind: "catch" },
          { kind: "throw" },
          mot("roll", 2),
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.seriesBonus).toBe(0);
  });

  it("投げが1回だけなら「連続した投げ受け」にならず付かない", () => {
    const r = computeScore([S({ kind: "throw" }, mot("chene", 3), { kind: "catch" })], "clubs");
    expect(r.seriesBonus).toBe(0);
  });

  it("複数シリーズが該当しても演技全体で1回だけ（最大0.10点）", () => {
    // 2本目は4動作にして重複シリーズ判定を避ける
    const other = S(
      { kind: "throw" },
      mot("chene", 4),
      { kind: "catch" },
      { kind: "throw" },
      mot("roll", 4),
      { kind: "catch" },
    );
    const r = computeScore([twoThrowsD, other], "clubs");
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
    // 内訳の行は該当シリーズごとに立つ（表示用）。合計は seriesBonus が唯一の真値。
    expect(r.seriesBreakdowns[0].sBonus).toBeCloseTo(0.1, 5);
    expect(r.seriesBreakdowns[1].sBonus).toBeCloseTo(0.1, 5);
  });
});

describe("技術加点（§3.5.5.5(2) 難易度の高い投げ受け）", () => {
  it("視野外・手以外・手具使用の投げ／受けは1つにつき +0.10", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["noview", "nonhand"] },
          { kind: "catch", catchTypes: ["useapp"] },
        ),
      ],
      "clubs",
    );
    expect(r.techniqueCount).toBe(3);
    expect(r.techniqueBonus).toBeCloseTo(0.3, 5);
  });

  it("技中の投げ（投げタン）の技術タグも数える", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_backsalto", isThrow: true, throwTypes: ["noview"] }, { kind: "catch" })],
      "stick",
    );
    expect(r.techniqueCount).toBe(1);
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("その都度加算される（制限なし）", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["noview"] },
          { kind: "catch" },
          { kind: "throw", throwTypes: ["noview"] },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.techniqueCount).toBe(2);
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("技術タグが無ければ0", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(r.techniqueBonus).toBe(0);
  });
});

describe("手具操作加点（§3.5.5.5(3) 2回以上の操作を伴うE難度の転回系）", () => {
  it("手具操作2回以上かつシリーズ最高難度Eで +0.10", () => {
    // 後方伸身2回宙返り(E) + 後方宙返り(B) の連続 = E難度、どちらも手具操作あり
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

  it("手具操作が1回だけなら付かない", () => {
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

  it("最高難度がEでなければ付かない", () => {
    // 後方宙返り(B) + 前宙(B) = C難度
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "b_backsalto", hasApparatus: true },
          { kind: "skill", skillId: "b_front", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.apparatusOpBonus).toBe(0);
  });
});

describe("二つ投げ4動作加点（§3.5.5.5(2)⑦）", () => {
  const twoThrow = (motionCount: number): Series =>
    S({ kind: "throw", reqTypes: ["twothrow"] }, mot("chene", motionCount), { kind: "catch" });

  it("二つ投げから受けるまでに4動作以上で +0.10", () => {
    const r = computeScore([twoThrow(4)], "clubs");
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });

  it("3動作では付かない（境界）", () => {
    const r = computeScore([twoThrow(3)], "clubs");
    expect(r.twoThrowMotionBonus).toBe(0);
  });

  it("二つ投げでなければ4動作でも付かない", () => {
    const r = computeScore(
      [S({ kind: "throw" }, mot("chene", 4), { kind: "catch" })],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBe(0);
  });

  it("キャッチを挟んだ別の二つ投げは別々に数える", () => {
    // 4動作(シェネ) と 4動作(転がり) で内容が異なる2回
    const r = computeScore(
      [
        S(
          { kind: "throw", reqTypes: ["twothrow"] },
          mot("chene", 4),
          { kind: "catch" },
          { kind: "throw", reqTypes: ["twothrow"] },
          mot("roll", 4),
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.2, 5);
  });
});

describe("様々な跳びに対する加点（§3.5.5.5(4)① ロープ）", () => {
  const jump = (jumpId: string, isMoving6m = false): Item => ({ kind: "ropeJump", jumpId, isMoving6m });

  it("6m以上移動の跳びに2重跳びが3回以上含まれれば +0.10", () => {
    const r = computeScore([S(jump("2f", true), jump("2f", true), jump("2f", true))], "rope");
    expect(r.jumpVarietyBonus).toBeCloseTo(0.1, 5);
  });

  it("2回では付かない（境界）", () => {
    const r = computeScore([S(jump("2f", true), jump("2f", true))], "rope");
    expect(r.jumpVarietyBonus).toBe(0);
  });

  it("1重跳びは移動が3回以上あっても対象外", () => {
    const r = computeScore([S(jump("1f", true), jump("1f", true), jump("1f", true))], "rope");
    expect(r.jumpVarietyBonus).toBe(0);
  });

  it("移動を伴わない2重跳びは対象外", () => {
    const r = computeScore([S(jump("2f"), jump("2f"), jump("2f"))], "rope");
    expect(r.jumpVarietyBonus).toBe(0);
  });

  it("ロープ以外の手具では判定しない", () => {
    const r = computeScore([S(jump("2f", true), jump("2f", true), jump("2f", true))], "stick");
    expect(r.jumpVarietyBonus).toBe(0);
  });
});

describe("技術加点：「その他の投げ／受け」の扱い（issue #2 — 仕様として加点対象）", () => {
  // 背面投げなど姿勢が変わるものは別の投げ方として扱ってよい、というオーナー裁定（issue #2）。
  // ルール §3.5.5.5(2) の①〜⑥には無いが、意図された挙動なのでここで固定する。
  it("その他の投げ・その他の受けも1つにつき +0.10", () => {
    const r = computeScore(
      [S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch", catchTypes: ["other"] })],
      "stick",
    );
    expect(r.techniqueCount).toBe(2);
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });
});

// ---------------------------------------------------------------------
// 以下はルールと実装の乖離として起票済み。修正が入ったら skip を外す。
// ---------------------------------------------------------------------

describe("§3.5.5.5(3) の上限0.10（issue #3 — 未解決）", () => {
  it.skip("投げと2回以上の操作の両方が揃っても、E系の加点は合計0.10まで", () => {
    // 手具を保持したE難度転回系（操作2回）を投げながら実施
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay", hasApparatus: true, isThrow: true },
          { kind: "skill", skillId: "b_backsalto", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    // 難度E(0.70) + §3.5.5.5(3)の加点(0.10) = 0.80 が上限
    expect(r.tumblingScore + r.apparatusOpBonus).toBeCloseTo(0.8, 5);
  });

  it.skip("複数シリーズが該当しても演技全体で0.10まで", () => {
    const s1 = S(
      { kind: "skill", skillId: "e_doublelay", hasApparatus: true },
      { kind: "skill", skillId: "b_backsalto", hasApparatus: true },
      { kind: "catch" },
    );
    const s2 = S(
      { kind: "skill", skillId: "e_frontlay2", hasApparatus: true },
      { kind: "skill", skillId: "b_front", hasApparatus: true },
      { kind: "catch" },
    );
    expect(computeScore([s1, s2], "stick").apparatusOpBonus).toBeCloseTo(0.1, 5);
  });
});

describe("§3.5.5.5(3) の局所性（issue #6 — 未解決）", () => {
  it.skip("E難度転回系そのものに操作が無ければ加点しない", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "e_doublelay" }, // E難度・手具操作なし
          { kind: "catch" },
          { kind: "skill", skillId: "b_backsalto", hasApparatus: true }, // 操作は別ユニット
          { kind: "skill", skillId: "b_front", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "stick",
    );
    expect(r.apparatusOpBonus).toBe(0);
  });
});

describe("二つ投げ4動作加点の重複（issue #23 — 未解決）", () => {
  it.skip("同じ内容の二つ投げ4動作は重複して数えない（§3.5.5.5(2)⑦）", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", reqTypes: ["twothrow"] },
          mot("chene", 4),
          { kind: "catch" },
          { kind: "throw", reqTypes: ["twothrow"] },
          mot("chene", 4),
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });
});
