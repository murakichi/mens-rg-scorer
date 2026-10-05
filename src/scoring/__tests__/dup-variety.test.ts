import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

// テストヘルパー：items から Series を組む
const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// -------------------------------------------------------------------------
// 重複シリーズ（dupFlags）による除外
//   CLAUDE.md ゴッチャ：重複は「カウント・ほとんどの加点」から除外される。
//   ただし「その他（other）」の投げ/受けは重複でも数える例外。
// -------------------------------------------------------------------------
describe("重複シリーズ — カウントからの除外", () => {
  it("完全に同一のシリーズは2本目の投げ回数を数えない", () => {
    const thr = () => S({ kind: "throw" }, { kind: "catch" });
    const r = computeScore([thr(), thr()], "stick");
    // 2本とも同一シグネチャ → 2本目は dup。totalThrowCount は 1 のみ
    expect(r.totalThrowCount).toBe(1);
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
// 「その他（other）」の投げ/受けは重複シリーズでも数える例外
//   score.ts: throwOtherCount/catchOtherCount は isDup ガードの前にある
// -------------------------------------------------------------------------
describe("投げ方・受け方の多様性 — その他の例外", () => {
  it("その他の投げ/受けは重複シリーズでも出現回数ぶん数える", () => {
    const s = () => S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch", catchTypes: ["other"] });
    const r = computeScore([s(), s()], "stick");
    // 2本目は dup だが「その他」は例外的に加算 → throw/catch とも 2
    expect(r.throwKindCount).toBe(2);
    expect(r.catchKindCount).toBe(2);
  });

  it("認識済みの種類（視野外など）は重複シリーズでは数えない（対照）", () => {
    const s = () => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] });
    const r = computeScore([s(), s()], "stick");
    // noview は集合に入るので重複排除 → それぞれ 1
    expect(r.throwKindCount).toBe(1);
    expect(r.catchKindCount).toBe(1);
  });
});

// -------------------------------------------------------------------------
// 左手投げは投げ方・受け方の両方に数える
//   score.ts: reqs.includes("lefthand") → throwKinds と catchKinds 双方に add
// -------------------------------------------------------------------------
describe("投げ方・受け方の多様性 — 左手投げの二重カウント", () => {
  it("左手投げ1回が受け方（catchKinds）にも lefthand を加える", () => {
    // lefthand の catch 側計上を確認する。対照として catch のみのシリーズは受け方1（normal）。
    const base = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(base.catchKindCount).toBe(1); // normal のみ

    const r = computeScore([S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" })], "stick");
    // 投げ：throwTypes [] → normal ＋ lefthand = 2。
    // 受け：lefthand（投げ由来で同時加算）＋ normal（catch []）= 2。
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
