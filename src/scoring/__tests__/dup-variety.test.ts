import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

// テストヘルパー：items から Series を組む
const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// -------------------------------------------------------------------------
// 重複シリーズ（dupFlags）による除外
//   CLAUDE.md ゴッチャ：重複は「カウント・ほとんどの加点」から除外される。
// -------------------------------------------------------------------------
describe("重複シリーズ — カウントからの除外", () => {
  it("完全に同一のシリーズの2本目も投げ回数には数える（難度・加点には数えない）", () => {
    const thr = () => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "motion", motionId: "chene", count: 2 }, { kind: "catch" });
    const r = computeScore([thr(), thr(), thr()], "stick");
    expect(r.dupFlags).toEqual([false, true, true]);
    expect(r.totalThrowCount).toBe(3);
    expect(r.performedThrowCount).toBe(3);
    expect(r.throwCountDeduction).toBe(0);
    // 難度は1本分（C 0.3）、技術加点も1本分
    expect(r.handScore).toBeCloseTo(0.3, 5);
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("ジュニアの投げ上限（5回）にも重複シリーズの投げを数える", () => {
    const thr = () => S({ kind: "throw" }, { kind: "catch" });
    const other = () => S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch" });
    const r = computeScore([thr(), thr(), thr(), thr(), thr(), other()], "stick", { junior: true });
    expect(r.performedThrowCount).toBe(6);
    expect(r.totalThrowCount).toBe(5);
    expect(r.overThrowCount).toBe(1);
    // 6回目（重複でないシリーズ）は上限超過なので難度にも数えない
    expect(r.seriesBreakdowns[5].handRows.every((x) => !x.adopted || !x.inTop)).toBe(true);
  });

  it("構成が異なる投げシリーズは両方数える", () => {
    const s1 = S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" });
    const s2 = S({ kind: "throw" }, { kind: "catch" });
    const r = computeScore([s1, s2], "stick");
    expect(r.totalThrowCount).toBe(2);
  });

  it("同一タンブリングシリーズは tumCount 判定で1本しか数えない", () => {
    const tum = () => S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" });
    const r = computeScore([tum(), tum(), tum()], "stick");
    // 3本並べても重複扱いで nonDupTumblingCount は 1
    expect(r.nonDupTumblingCount).toBe(1);
    const tumCount = r.required.find((c) => c.key === "tumCount");
    expect(tumCount?.passed).toBe(false);
  });
});

// -------------------------------------------------------------------------
// 投げ方・受け方の種類は重複シリーズでは数えない
// -------------------------------------------------------------------------
describe("投げ方・受け方の多様性 — 重複シリーズ", () => {
  it("認識済みの種類（視野外など）は重複シリーズでは数えない（対照）", () => {
    const s = () => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] });
    const r = computeScore([s(), s()], "stick");
    // noview は集合に入るので重複排除 → それぞれ 1
    expect(r.throwKindCount).toBe(1);
    expect(r.catchKindCount).toBe(1);
  });
});

// -------------------------------------------------------------------------
// 右手・左手・二つ投げ（必須投げ）は投げ方・受け方の種類に影響させない（#134）
//   score.ts: 1回の投げ／受けは throwTypes／catchTypes のチェックの組み合わせ1つが1種類。
//   reqTypes（lefthand／twothrow）は種類の数に入らない。
// -------------------------------------------------------------------------
describe("投げ方・受け方の多様性 — 必須投げ（左手投げ・二つ投げ）は種類に数えない", () => {
  it("左手投げ・二つ投げにしても、投げ方・受け方の種類は通常の投げ受けと同じ1種類", () => {
    const base = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(base.throwKindCount).toBe(1);
    expect(base.catchKindCount).toBe(1);

    const left = computeScore([S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" })], "stick");
    expect(left.throwKindCount).toBe(1);
    expect(left.catchKindCount).toBe(1);

    const two = computeScore([S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch" })], "clubs");
    expect(two.throwKindCount).toBe(1);
    expect(two.catchKindCount).toBe(1);
  });

  it("技術タグ（視野外）を付けると別の1種類になる", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }),
      ],
      "stick",
    );
    expect(r.throwKindCount).toBe(2);
    expect(r.catchKindCount).toBe(2);
  });
});

// -------------------------------------------------------------------------
// 多様性減点の計算（ルール §3.5：3種類必要、不足1種につき0.1、合算上限0.5）
// -------------------------------------------------------------------------
describe("投げ方・受け方の多様性 — 減点の算術", () => {
  it("投げ方3種・受け方3種そろえば減点0", () => {
    const s = S(
      { kind: "throw" }, // normal
      { kind: "catch" },
      { kind: "throw", throwTypes: ["noview"] },
      { kind: "catch", catchTypes: ["noview"] },
      { kind: "throw", throwTypes: ["nonhand"] },
      { kind: "catch", catchTypes: ["nonhand"] },
    );
    const r = computeScore([s], "stick");
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(3);
    expect(r.varietyDeduction).toBeCloseTo(0, 5);
  });

  it("投げ方1種・受け方1種なら不足2+2 → 0.4減点", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(r.throwKindCount).toBe(1);
    expect(r.catchKindCount).toBe(1);
    // (3-1)+(3-1)=4 種不足 × 0.1 = 0.4（上限0.5未満）
    expect(r.varietyDeduction).toBeCloseTo(0.4, 5);
  });

  it("何も無ければ不足6 → 上限0.5でクランプ", () => {
    const r = computeScore([], "stick");
    expect(r.throwKindCount).toBe(0);
    expect(r.catchKindCount).toBe(0);
    // (3+3)*0.1 = 0.6 → min(0.5) でクランプ
    expect(r.varietyDeduction).toBeCloseTo(0.5, 5);
  });
});

// -------------------------------------------------------------------------
// ルール §155：難度採用（各上位3つ）では「全く同じ技は難度として数えない」。
// 実装は topTumbling/topHand の採用時に重複を除外しないため、
// 完全同一シリーズの同一技が難度に二重計上される疑い。→ issue 化。
// （skill方針：実装バグ確信時は .fails させず skip し issue を立てる）
// -------------------------------------------------------------------------
describe("難度採用 — 全く同じ技の二重計上（ルール §155）", () => {
  it.skip("完全同一のE難度タンブリング2本は難度に1回しか数えない（要修正 → 下記issue）", () => {
    const tum = () => S({ kind: "skill", skillId: "e_doublelay" }, { kind: "catch" });
    const r = computeScore([tum(), tum()], "stick");
    // ルール §155：全く同じ技は難度として数えない → E 1つぶん = 0.7
    // 実装は 0.7+0.7 = 1.4 を返す（重複が top3 採用枠に残るため）
    expect(r.tumblingScore).toBeCloseTo(0.7, 5);
  });
});

// タンブリングの最中の受けは、最中の投げと同じく「投げタン」の受けとして別の1種類に数える（オーナー確認）
describe("投げ方・受け方の種類 — タンブリングの最中の投げ・受け", () => {
  it("最中の投げと最中の受けはどちらも通常とは別の1種類", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch" }),
        S({ kind: "skill", skillId: "b_front", isThrow: true }, { kind: "catch" }),
        S({ kind: "throw" }, { kind: "skill", skillId: "a_roundoff", isCatch: true }, { kind: "skill", skillId: "b_backsalto" }),
      ],
      "clubs",
    );
    // 投げ：通常／最中の投げ　受け：通常／最中の受け
    expect(r.throwKindCount).toBe(2);
    expect(r.catchKindCount).toBe(2);
  });

  it("タグの付いた最中の受けは、同じタグのキャッチと同じ種類", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch", catchTypes: ["useapp"] }),
        S({ kind: "throw" }, { kind: "skill", skillId: "a_roundoff", isCatch: true, catchTypes: ["useapp"] }, { kind: "skill", skillId: "b_backsalto" }),
      ],
      "clubs",
    );
    expect(r.catchKindCount).toBe(1);
  });
});

// 手以外のキャッチの受け方は受け方の種類として別に数える／2つ同時キャッチは種類に数えない（オーナー確認）
describe("受け方の種類 — 手以外の受け方と2つ同時キャッチ", () => {
  const T: Item = { kind: "throw" };
  it("手以外のキャッチの受け方が違えば別の種類", () => {
    const r = computeScore(
      [
        S(T, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
        S(T, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footClamp" }),
        S(T, { kind: "motion", motionId: "chene", count: 2 }, { kind: "catch", catchTypes: ["nonhand"] }),
      ],
      "stick",
    );
    expect(r.catchKindCount).toBe(3);
  });

  it("同じ受け方なら1種類", () => {
    const r = computeScore(
      [
        S(T, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
        S(T, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "neckShoulder" }),
      ],
      "stick",
    );
    expect(r.catchKindCount).toBe(1);
  });

  it("2つ同時キャッチは種類に数えない", () => {
    const r = computeScore(
      [
        S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch", catchTwo: true }),
        S(T, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch" }),
      ],
      "clubs",
    );
    expect(r.catchKindCount).toBe(1);
  });
});
