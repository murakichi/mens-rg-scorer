import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const chene = (count: number): Item => ({ kind: "motion", motionId: "chene", count });

// =========================================================================
// §3.5.5.5(2)「ただし同じ技は重複して数えない」は ⑦ だけでなく ①〜⑥ にも掛かる。
// 全く同じ投げ方・受け方は演技全体で最初の1回だけ技術加点になる。
// 視野外の投げ・手具を使った投げ自体は何回やってもよく、姿勢まで全く同じものだけが重複。
// 「全く同じ」は投げ／受けの入力（技術タグ・横投げ・無回転・手以外の受け方・技の最中ならその技）で判定する。
// 右手・左手・両手（二つ投げ・2つ同時キャッチ）の違いは数えない。
// =========================================================================
describe("技術加点：同じ投げ方・受け方は1回だけ", () => {
  it("同じシリーズの中で同じ背面投げ→背面キャッチを2回 → 0.2（2回目は0）", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["noview"] },
          chene(1),
          { kind: "catch", catchTypes: ["noview"] },
          { kind: "throw", throwTypes: ["noview"] },
          chene(2),
          { kind: "catch", catchTypes: ["noview"] },
        ),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("間の徒手が違っても投げ方・受け方が同じなら重複", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, chene(3), { kind: "catch", catchTypes: ["noview"] }),
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "motion", motionId: "fwd_roll", count: 3 }, { kind: "catch", catchTypes: ["noview"] }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("タグの組み合わせが違えば別の技（視野外 と 視野外＋手以外）", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, chene(1), { kind: "catch" }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.3, 5);
  });

  it("視野外の真後ろと横（横投げ）は別の投げ方", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview", "side"] }, chene(1), { kind: "catch" }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("手以外の受け方の種類が違えば別の受け方", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
        S({ kind: "throw" }, chene(1), { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footPress" }),
        S({ kind: "throw" }, chene(2), { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("投げアイテムの視野外投げと、技の最中（きりもみ）の視野外投げは別の技", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "skill", skillId: "b_kirimomi", isThrow: true, throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "skill", skillId: "b_kirimomi", isThrow: true, throwTypes: ["noview"] }, chene(1), { kind: "catch" }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("右手と左手の違いは別の投げ方とみなさない", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview"], reqTypes: ["lefthand"] }, chene(1), { kind: "catch" }),
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("二つ投げ（両手投げ）と2つ同時キャッチは別の投げ方・受け方とみなさない", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }),
        S(
          { kind: "throw", throwTypes: ["noview"], reqTypes: ["twothrow"] },
          chene(1),
          { kind: "catch", catchTypes: ["noview"], catchTwo: true },
        ),
      ],
      "clubs",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("「重複ではない」と宣言したシリーズは他のシリーズと重複判定しない", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        { ...S({ kind: "throw", throwTypes: ["noview"] }, chene(1), { kind: "catch" }), notDuplicate: true },
      ],
      "stick",
    );
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("シリーズ内訳の合計と全体の技術加点が一致する", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }),
        S({ kind: "throw", throwTypes: ["noview"] }, chene(1), { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
      ],
      "stick",
    );
    expect(r.seriesBreakdowns[0].tech).toBeCloseTo(0.2, 5);
    expect(r.seriesBreakdowns[1].tech).toBeCloseTo(0.1, 5);
    expect(r.techniqueBonus).toBeCloseTo(0.3, 5);
  });
});

describe("二つ投げ4動作加点：同じ内容は1回だけ（⑦）", () => {
  const two = (...mid: Item[]) => S({ kind: "throw", reqTypes: ["twothrow"] }, ...mid, { kind: "catch", catchTwo: true });

  it("同じ徒手（シェネ4）の二つ投げを2回 → 0.1", () => {
    const r = computeScore([two(chene(4)), two(chene(2), chene(2))], "clubs");
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
  });

  it("徒手の内容が違えば別の技 → 0.2", () => {
    const r = computeScore([two(chene(4)), two(chene(3), { kind: "motion", motionId: "fwd_roll", count: 1 })], "clubs");
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.2, 5);
  });
});

// オーナー確認済みの例：シェネ後の背面キャッチと前転後の背面キャッチ
describe("シェネ後の背面キャッチ と 前転後の背面キャッチ", () => {
  const r = computeScore(
    [
      S({ kind: "throw" }, chene(1), { kind: "catch", catchTypes: ["noview"] }),
      S({ kind: "throw" }, { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch", catchTypes: ["noview"] }),
    ],
    "stick",
  );

  it("B難度の投げ受けを2回実施したものとして数える（どちらも難度に採用）", () => {
    const rows = r.seriesBreakdowns.flatMap((b) => b.handRows);
    expect(rows.map((x) => x.diff)).toEqual(["B", "B"]);
    expect(rows.every((x) => x.adopted)).toBe(true);
    expect(r.totalThrowCount).toBe(2);
  });

  it("受け方の種類としては1種類", () => {
    expect(r.catchKindCount).toBe(1);
  });

  it("加点は1回目の背面キャッチの0.1だけ", () => {
    expect(r.seriesBreakdowns[0].tech).toBeCloseTo(0.1, 5);
    expect(r.seriesBreakdowns[1].tech).toBeCloseTo(0, 5);
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });
});
