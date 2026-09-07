import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

describe("computeScore — 空の演技（回帰アンカー）", () => {
  it("演技が空ならすべての必須要素が不足し、A満点から規定減点される", () => {
    const r = computeScore([], "stick");
    expect(r.dScore).toBe(0);
    expect(r.eScore).toBe(10);
    // 方向系3不足(0.9) + 投げ不足(0.3) + 宙返り連続なし(0.2) + 多様性上限(0.5)
    //  + スティック手具別必須要素4項目未実施(4×0.3=1.2) = 3.1
    expect(r.aDeduction).toBeCloseTo(3.1, 5);
    expect(r.aScore).toBeCloseTo(6.9, 5);
    expect(r.grandTotal).toBeCloseTo(16.9, 5);
    expect(r.missing.length).toBeGreaterThan(0);
    // 手具別必須要素は未実施4項目で −1.2
    expect(r.apparatusElementDeduction).toBeCloseTo(1.2, 5);
  });
});

describe("computeScore — 難度採用は上位3ユニット", () => {
  it("タンブリングは finalDiff 上位3つのみ採用する", () => {
    // 4本の tumbling: E,D,C,B → 上位3 (E=0.7, D=0.5, C=0.3) = 1.5、B は不採用
    const tum = (skillId: string) => S({ kind: "skill", skillId }, { kind: "catch" });
    const r = computeScore(
      [tum("e_doublelay"), tum("d_doubleback"), tum("c_back15"), tum("b_backsalto")],
      "stick",
    );
    expect(r.tumblingScore).toBeCloseTo(1.5, 5);
  });
});

describe("computeScore — スティックの必須投げ（左手投げ）", () => {
  it("左手投げが無ければ appThrow が不足", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    const appThrow = r.required.find((c) => c.key === "appThrow");
    expect(appThrow?.passed).toBe(false);
  });
  it("左手投げを実施すれば appThrow を満たす", () => {
    const r = computeScore(
      [S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" })],
      "stick",
    );
    const appThrow = r.required.find((c) => c.key === "appThrow");
    expect(appThrow?.passed).toBe(true);
  });
});

describe("computeScore — 右投げ右受けの自動判定（§3.2 スティック）", () => {
  const check = (r: ReturnType<typeof computeScore>) =>
    r.apparatusElementChecks.find((c) => c.key === "appEl_stick_right");

  it("投げが無ければ不足のまま（−0.3）", () => {
    const r = computeScore([S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" })], "stick");
    expect(check(r)?.passed).toBe(false);
    expect(r.apparatusElementDeduction).toBeCloseTo(1.2, 5);
  });

  it("通常の投げが1回でもあれば自動でOK", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(check(r)?.passed).toBe(true);
    // 4項目中1つ自動OK → 残り3項目未チェックで −0.9
    expect(r.apparatusElementDeduction).toBeCloseTo(0.9, 5);
  });

  it("左手投げ・手以外の投げだけでは右投げとみなさない", () => {
    const r = computeScore(
      [
        S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
      ],
      "stick",
    );
    expect(check(r)?.passed).toBe(false);
  });

  it("視野外など他の技術タグ付きの投げは右投げとみなす", () => {
    const r = computeScore([S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" })], "stick");
    expect(check(r)?.passed).toBe(true);
  });

  it("技の最中の投げ（投げタン）も右投げとみなす", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" })],
      "stick",
    );
    expect(check(r)?.passed).toBe(true);
  });

  it("手動チェックでは自動判定を上書きできない（チェックしても投げが無ければ不足）", () => {
    const r = computeScore([S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" })], "stick", {
      apparatusElements: ["stick_right"],
    });
    expect(check(r)?.passed).toBe(false);
  });
});

describe("computeScore — 重複シリーズの手動解除（notDuplicate）", () => {
  const dup = (): Series => S({ kind: "throw" }, { kind: "skill", skillId: "b_backsalto" }, { kind: "catch" });

  it("同一構成の2本目は重複扱いで投げ回数・本数に不算入", () => {
    const r = computeScore([dup(), dup()], "stick");
    expect(r.dupSignatureFlags).toEqual([false, true]);
    expect(r.dupFlags).toEqual([false, true]);
    expect(r.totalThrowCount).toBe(1);
    expect(r.nonDupTumblingCount).toBe(1);
  });

  it("notDuplicate を立てると重複から除外され、通常のシリーズとして算入される", () => {
    const second = { ...dup(), notDuplicate: true };
    const r = computeScore([dup(), second], "stick");
    // 構成一致の検出自体は残す（UIのチェックボックス表示条件）
    expect(r.dupSignatureFlags).toEqual([false, true]);
    expect(r.dupFlags).toEqual([false, false]);
    expect(r.totalThrowCount).toBe(2);
    expect(r.nonDupTumblingCount).toBe(2);
  });

  it("notDuplicate は他のシリーズの重複判定に影響しない", () => {
    const r = computeScore([dup(), { ...dup(), notDuplicate: true }, dup()], "stick");
    expect(r.dupSignatureFlags).toEqual([false, true, true]);
    expect(r.dupFlags).toEqual([false, false, true]);
    expect(r.totalThrowCount).toBe(2);
  });

  it("重複解除で加点（技術加点）も算入される", () => {
    const withTag = (): Series => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" });
    const base = computeScore([withTag(), withTag()], "stick");
    const freed = computeScore([withTag(), { ...withTag(), notDuplicate: true }], "stick");
    // 重複シリーズは技術加点も不算入。解除すると2本分が計上される
    expect(base.techniqueBonus).toBeCloseTo(0.1, 5);
    expect(freed.techniqueBonus).toBeCloseTo(0.2, 5);
    expect(base.totalThrowCount).toBe(1);
    expect(freed.totalThrowCount).toBe(2);
    expect(base.throwCountDeduction).toBeCloseTo(0.3, 5);
    expect(freed.throwCountDeduction).toBeCloseTo(0.3, 5); // 一般は3回必要なので2回でも不足
    expect(computeScore([withTag(), { ...withTag(), notDuplicate: true }], "stick", { junior: true })
      .throwCountDeduction).toBe(0);
  });

  it("重複していないシリーズに notDuplicate が付いていても影響はない", () => {
    const r = computeScore([{ ...dup(), notDuplicate: true }], "stick");
    expect(r.dupSignatureFlags).toEqual([false]);
    expect(r.dupFlags).toEqual([false]);
    expect(r.totalThrowCount).toBe(1);
  });
});

describe("computeScore — 重複シリーズはDスコアからも除外", () => {
  const tum = (skillId: string): Series => S({ kind: "skill", skillId }, { kind: "catch" });

  it("同一構成のタンブリングは1本分しか難度点に算入されない", () => {
    const single = computeScore([tum("d_doubleback")], "stick");
    const twice = computeScore([tum("d_doubleback"), tum("d_doubleback")], "stick");
    expect(single.tumblingScore).toBeCloseTo(0.5, 5);
    expect(twice.tumblingScore).toBeCloseTo(0.5, 5);
    expect(twice.seriesBreakdowns[1].tumDiff).toBe(0);
    expect(twice.seriesBreakdowns[1].dPart).toBe(0);
  });

  it("重複の難度が高くても採用候補に入らない（上位3本を重複で埋めない）", () => {
    // 同一構成のE難度を3本 + C難度1本 → 採用は E(0.7) + C(0.3) のみ
    const r = computeScore(
      [tum("e_doublelay"), tum("e_doublelay"), tum("e_doublelay"), tum("c_back15")],
      "stick",
    );
    expect(r.dupFlags).toEqual([false, true, true, false]);
    expect(r.tumblingScore).toBeCloseTo(1.0, 5);
  });

  it("徒手系（投げ）難度も重複シリーズ分は採用されない", () => {
    const thr = (): Series => S({ kind: "throw" }, { kind: "motion", motionId: "m3" }, { kind: "catch" });
    const r = computeScore([thr(), thr()], "stick");
    // 3動作 → D(0.5) 1つ分だけ
    expect(r.handScore).toBeCloseTo(0.5, 5);
    expect(r.seriesBreakdowns[1].handDiff).toBe(0);
  });

  it("連続投げ加点も重複シリーズでは付かない", () => {
    const s2 = (): Series =>
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "m3" },
        { kind: "catch" },
        { kind: "throw" },
        { kind: "motion", motionId: "m3" },
        { kind: "catch" },
      );
    const r = computeScore([s2(), s2()], "stick");
    expect(r.seriesBreakdowns[0].sBonus).toBeCloseTo(0.1, 5);
    expect(r.seriesBreakdowns[1].sBonus).toBe(0);
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
  });

  it("notDuplicate で解除すれば難度点に復活する", () => {
    const r = computeScore([tum("d_doubleback"), { ...tum("d_doubleback"), notDuplicate: true }], "stick");
    expect(r.tumblingScore).toBeCloseTo(1.0, 5);
    expect(r.seriesBreakdowns[1].tumDiff).toBeCloseTo(0.5, 5);
  });
});
