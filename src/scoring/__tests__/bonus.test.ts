import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// =========================================================================
// 技術加点 TECHNIQUE_BONUS（ルール §3.5.5.5(2) 難易度の高い投げ受け）
//   対象①〜⑥：手以外の投げ/受け・視野外の投げ/受け・手具を使った投げ/受け。
//   「制限なし・各その都度0.10点」＝上限なし、出現ごとに加算、重複排除なし。
//   （その他 other は対象外 → issue #2 で既報）
// =========================================================================
describe("技術加点 §3.5.5.5(2)", () => {
  it("視野外の投げ1回で +0.10", () => {
    const r = computeScore([S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" })], "stick");
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
    expect(r.techniqueCount).toBe(1);
  });

  it("手以外の受け1回で +0.10", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"] })], "stick");
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("1つの投げに複数タグ（視野外＋手以外）は個数ぶん加算 → +0.20", () => {
    const r = computeScore(
      [S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, { kind: "catch" })],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
    expect(r.techniqueCount).toBe(2);
  });

  it("投げタン（skill.isThrow）の throwTypes も技術加点に数える", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_backsalto", isThrow: true, throwTypes: ["noview"] }, { kind: "catch" })],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("制限なし：4タグで +0.40（上限クランプされない）", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, { kind: "catch", catchTypes: ["noview", "nonhand"] }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.4, 5);
  });

  it("各その都度：同一の視野外投げを2回（重複シリーズでも）出現ごとに加算 → +0.20", () => {
    // §3.5.5.5(2) は「同じ技は重複して数えない」の但し書きが無い（⑦のみに付く）。
    // よって重複シリーズでも技術加点は出現回数ぶん計上されるのがルール準拠。
    const s = () => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" });
    const r = computeScore([s(), s()], "stick");
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it.skip("その他（other）の投げは技術加点の対象外＝0（→ issue #2、修正後に skip 解除）", () => {
    // ルール §3.5.5.5(2) の対象は①〜⑥のみ。other は含まれない。
    // 実装は throwTypes.length で数えるため other も +0.1 してしまう。
    const r = computeScore([S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch" })], "stick");
    expect(r.techniqueBonus).toBeCloseTo(0, 5);
  });
});

// =========================================================================
// シリーズ加点 SERIES_BONUS（ルール §3.5.5.5(1) 難易度の高い連続した投げ受け）
//   条件：連続した投げ受け（投げ2回以上）に D難度以上の内容が含まれる。
//   最大0.10点（＝演技全体で1回のみ）。
//   実装：a.throwCount >= 2 && 投げユニットに hasDPlus → 単一 SERIES_BONUS。
// =========================================================================
describe("シリーズ加点 §3.5.5.5(1)", () => {
  // D+ になる投げユニット：投げ＋3動作 → 徒手難度D、hasDPlus 成立
  const dPlusThrow = (extra: Partial<Extract<Item, { kind: "throw" }>> = {}): Item[] => [
    { kind: "throw", ...extra },
    { kind: "motion", motionId: "m3" },
    { kind: "catch" },
  ];
  const plainThrow: Item[] = [{ kind: "throw" }, { kind: "catch" }];

  it("投げ2回以上＋D難度以上ユニットあり → +0.10", () => {
    const r = computeScore([S(...dPlusThrow(), ...plainThrow)], "stick");
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
  });

  it("投げが1回だけなら（連続でない）加点なし", () => {
    const r = computeScore([S(...dPlusThrow())], "stick");
    expect(r.totalThrowCount).toBe(1);
    expect(r.seriesBonus).toBeCloseTo(0, 5);
  });

  it("投げ2回でもD難度以上ユニットが無ければ加点なし", () => {
    const r = computeScore([S(...plainThrow, ...plainThrow)], "stick");
    expect(r.seriesBonus).toBeCloseTo(0, 5);
  });

  it("最大0.10：複数シリーズが条件を満たしても演技全体で0.10のみ", () => {
    // 別構成（throwTypes 差）で2本とも非重複＆条件充足にする
    const a = S(...dPlusThrow(), ...plainThrow);
    const b = S(...dPlusThrow({ throwTypes: ["noview"] }), ...plainThrow);
    const r = computeScore([a, b], "stick");
    expect(r.seriesBonus).toBeCloseTo(0.1, 5); // グローバルは単一値
    // 参考：各シリーズ内訳 sBonus は行ごとに 0.1 が立つ（表示用、dScore には二重加算されない）
    expect(r.seriesBreakdowns[0].sBonus).toBeCloseTo(0.1, 5);
    expect(r.seriesBreakdowns[1].sBonus).toBeCloseTo(0.1, 5);
  });
});
