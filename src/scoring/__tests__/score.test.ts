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

describe("computeScore — 連続投げの2回目以降も難度の候補に入る", () => {
  it("二つ投げ→4動作→キャッチ→視野外投げ→視野外キャッチ（クラブ）", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", reqTypes: ["twothrow"] },
          { kind: "motion", motionId: "chene", count: 4 },
          { kind: "catch" },
          { kind: "throw", throwTypes: ["noview"] },
          { kind: "catch", catchTypes: ["noview"] },
        ),
      ],
      "clubs",
    );
    // 4動作の投げ受け E=0.7 と 動作0の投げ受け A=0.1。上位3つに収まるので両方採用
    expect(r.handScore).toBeCloseTo(0.8, 5);
    expect(r.unitAdopted[0]).toEqual([true, true]);
    expect(r.twoThrowMotionBonus).toBeCloseTo(0.1, 5);
    expect(r.seriesBonus).toBeCloseTo(0.1, 5);
    expect(r.techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("徒手系が4つ以上あれば難度の低い投げ受けが上位3つから漏れる", () => {
    const thr = (motions: number): Item[] => [
      { kind: "throw" },
      ...(motions > 0 ? [{ kind: "motion" as const, motionId: "chene", count: motions }] : []),
      { kind: "catch" as const },
    ];
    const r = computeScore([S(...thr(4), ...thr(3), ...thr(2), ...thr(0))], "clubs");
    expect(r.analysis[0].units.map((u) => u.finalDiff)).toEqual(["E", "D", "C", "A"]);
    // 上位3つ E+D+C のみ。A難度は候補には入るが上位3つから漏れる
    expect(r.handScore).toBeCloseTo(1.5, 5);
    expect(r.seriesBreakdowns[0].handRows.map((x) => x.adopted)).toEqual([true, true, true, true]);
    expect(r.seriesBreakdowns[0].handRows.map((x) => x.inTop)).toEqual([true, true, true, false]);
  });

  it("A難度の投げ受けしかなければそれが採用される", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "clubs");
    expect(r.handScore).toBeCloseTo(0.1, 5);
  });

  it("同じ内容の投げ受けが2つなら1つだけ採用（内容重複のルール）", () => {
    const r = computeScore(
      [S({ kind: "throw" }, { kind: "catch" }, { kind: "throw" }, { kind: "catch" })],
      "clubs",
    );
    expect(r.analysis[0].units).toHaveLength(2);
    expect(r.handScore).toBeCloseTo(0.1, 5);
  });

  it("ロープ跳びと投げ受けはどちらも候補に入る", () => {
    const r = computeScore(
      [S({ kind: "ropeJump", jumpId: "1f" }, { kind: "throw" }, { kind: "catch" })],
      "rope",
    );
    expect(r.handScore).toBeCloseTo(0.2, 5); // 1重跳び A + 投げ受け A
  });
});

describe("computeScore — 同じ内容の難度は演技全体で1回しか数えない（§3.4.4 / Q20）", () => {
  it("同じ3動作の投げ受けを2回：難度は1つ分、技術加点と連続投げ加点は付く", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw" },
          { kind: "motion", motionId: "m3" },
          { kind: "catch" },
          { kind: "throw", throwTypes: ["noview"] }, // 背面投げ相当の技術タグ
          { kind: "motion", motionId: "m3" },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.handScore).toBeCloseTo(0.5, 5); // D 1つ分のみ
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5); // 不採用でも技術加点は付く
    expect(r.seriesBonus).toBeCloseTo(0.1, 5); // 連続投げ加点も付く
    expect(r.totalThrowCount).toBe(2); // 投げ回数も2回のまま
    expect(r.dScore).toBeCloseTo(0.7, 5);
  });

  it("シリーズをまたいでも同じ内容なら1回だけ採用する", () => {
    const tum = (): Series => S({ kind: "skill", skillId: "d_doubleback" }, { kind: "catch" });
    // 2本目は技術タグの有無で構成が違うのでシリーズ重複にはならないが、転回系の内容は同じ
    const withThrow = S(
      { kind: "skill", skillId: "d_doubleback" },
      { kind: "catch" },
      { kind: "throw" },
      { kind: "catch" },
    );
    const r = computeScore([tum(), withThrow], "clubs");
    expect(r.dupFlags).toEqual([false, false]);
    expect(r.tumblingScore).toBeCloseTo(0.5, 5);
    expect(r.nonDupTumblingCount).toBe(2); // 本数は2本のまま
  });

  it("内容が違えばそれぞれ採用する", () => {
    const tum = (skillId: string): Series => S({ kind: "skill", skillId }, { kind: "catch" });
    const r = computeScore([tum("d_doubleback"), tum("c_back15")], "clubs");
    expect(r.tumblingScore).toBeCloseTo(0.8, 5);
  });

  it("「重複ではない」宣言のシリーズは内容が同じでも採用される", () => {
    const tum = (): Series => S({ kind: "skill", skillId: "d_doubleback" }, { kind: "catch" });
    const r = computeScore([tum(), { ...tum(), notDuplicate: true }], "clubs");
    expect(r.tumblingScore).toBeCloseTo(1.0, 5);
  });

  it("ロープ跳びも同じ跳びなら1回だけ採用する", () => {
    // 2本目は投げの技術タグでシリーズ構成を変え、シリーズ重複ではなくユニット重複にする
    const jump = (id: string, tag?: string): Series =>
      S({ kind: "ropeJump", jumpId: id }, { kind: "throw", throwTypes: tag ? [tag] : [] }, { kind: "catch" });
    const same = computeScore([jump("3b"), jump("3b", "noview")], "rope");
    expect(same.dupFlags).toEqual([false, false]);
    // 3重跳び(C) 1つ + 投げ受け(A) 1つ（跳び・投げ受けとも内容が同じなので各1回）
    expect(same.handScore).toBeCloseTo(0.3 + 0.1, 5);
    const diff = computeScore([jump("3b"), jump("3bc", "noview")], "rope");
    expect(diff.handScore).toBeCloseTo(0.3 + 0.5 + 0.1, 5); // C + D + 投げ受け(A)
  });
});

describe("computeScore — つなぎ技のA難度に手具操作なし（Q10）", () => {
  it("後方一回半ひねり(操作なし)〜ロンダート(操作なし)〜ダイビング前宙(操作あり)で −0.2", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "c_back15", hasApparatus: false },
          { kind: "skill", skillId: "a_roundoff", hasApparatus: false },
          { kind: "skill", skillId: "b_divefront", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.connectNoApparatus).toBe(true);
    expect(r.noApparatusDeduction).toBeCloseTo(0.2, 5);
  });

  it("つなぎのA難度に手具操作があれば減点なし", () => {
    const r = computeScore(
      [
        S(
          { kind: "skill", skillId: "c_back15", hasApparatus: true },
          { kind: "skill", skillId: "a_roundoff", hasApparatus: true },
          { kind: "skill", skillId: "b_divefront", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.connectNoApparatus).toBe(false);
    expect(r.noApparatusDeduction).toBe(0);
  });

  it("投げを含む塊（投げタン）のつなぎ技は対象外", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw" },
          { kind: "skill", skillId: "c_back15", hasApparatus: false },
          { kind: "skill", skillId: "a_roundoff", hasApparatus: false },
          { kind: "skill", skillId: "b_divefront", hasApparatus: true },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    expect(r.connectNoApparatus).toBe(false);
    expect(r.noApparatusDeduction).toBe(0);
  });

  it("手具操作不足減点の上限0.4は維持される", () => {
    // つなぎ技操作なし(0.2) + 投げなしタンブリング全体に操作なしのシリーズ2本(0.2×2) → 上限0.4
    const noApp = (): Series =>
      S(
        { kind: "skill", skillId: "c_back15", hasApparatus: false },
        { kind: "skill", skillId: "a_roundoff", hasApparatus: false },
        { kind: "skill", skillId: "b_backsalto", hasApparatus: false },
        { kind: "catch" },
      );
    const other = S(
      { kind: "skill", skillId: "b_front", hasApparatus: false },
      { kind: "catch" },
    );
    const r = computeScore([noApp(), other], "clubs");
    expect(r.noApparatusDeduction).toBeCloseTo(0.4, 5);
  });
});

describe("computeScore — 徒手難度点の投げごとの内訳（handRows）", () => {
  it("投げごとに行が出て、上位3つ外は inTop=false になる", () => {
    const thr = (motionId: string) => [
      { kind: "throw" as const },
      { kind: "motion" as const, motionId },
      { kind: "catch" as const },
    ];
    const r = computeScore(
      [S(...thr("m4"), ...thr("m3"), ...thr("m2"), ...thr("m1"))],
      "clubs",
    );
    const rows = r.seriesBreakdowns[0].handRows;
    expect(rows.map((x) => x.label)).toEqual(["投げ1", "投げ2", "投げ3", "投げ4"]);
    expect(rows.map((x) => x.diff)).toEqual(["E", "D", "C", "B"]);
    expect(rows.map((x) => x.inTop)).toEqual([true, true, true, false]);
    expect(rows.every((x) => x.adopted)).toBe(true);
    // 上位3つ（E+D+C）のみがシリーズの徒手難度点に入る
    expect(r.seriesBreakdowns[0].handDiff).toBeCloseTo(1.5, 5);
    expect(r.handScore).toBeCloseTo(1.5, 5);
  });

  it("難度不採用のユニットも行として出る（adopted=false）", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw" },
          { kind: "motion", motionId: "m3" },
          { kind: "catch" },
          { kind: "throw", throwTypes: ["noview"] },
          { kind: "motion", motionId: "m3" },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    const rows = r.seriesBreakdowns[0].handRows;
    expect(rows).toHaveLength(2);
    expect(rows.map((x) => x.adopted)).toEqual([true, false]);
    expect(r.seriesBreakdowns[0].handDiff).toBeCloseTo(0.5, 5);
  });

  it("シリーズごとの徒手難度点の合計は全体の徒手難度点と一致する", () => {
    const tum = (skillId: string) => S({ kind: "skill", skillId }, { kind: "catch" });
    const thr = (motionId: string, tag?: string) =>
      S({ kind: "throw", throwTypes: tag ? [tag] : [] }, { kind: "motion", motionId }, { kind: "catch" });
    const r = computeScore(
      [thr("m4"), thr("m3"), thr("m2"), thr("m1", "noview"), tum("e_doublelay")],
      "clubs",
    );
    const sumHand = r.seriesBreakdowns.reduce((s, b) => s + b.handDiff, 0);
    const sumTum = r.seriesBreakdowns.reduce((s, b) => s + b.tumDiff, 0);
    expect(sumHand).toBeCloseTo(r.handScore, 5);
    expect(sumTum).toBeCloseTo(r.tumblingScore, 5);
  });

  it("ロープ跳び由来の行はラベルが「ロープ跳び」", () => {
    const r = computeScore([S({ kind: "ropeJump", jumpId: "3b" })], "rope");
    expect(r.seriesBreakdowns[0].handRows.map((x) => x.label)).toEqual(["ロープ跳び"]);
  });
});

describe("computeScore — 手具を持っての前宙と投げての前宙は同じ技（Q22）", () => {
  /** 手具を持って前宙（投げなし） */
  const hold = (): Series => S({ kind: "skill", skillId: "b_front", hasApparatus: true }, { kind: "catch" });
  /** 投げ前宙（投げ→前宙→キャッチ）＝B+1 で C難度 */
  const thrown = (): Series =>
    S({ kind: "throw" }, { kind: "skill", skillId: "b_front" }, { kind: "catch" });
  /** 投げ前宙前転（前転はA難度なので難度には効かない）＝C難度 */
  const thrownRoll = (): Series =>
    S(
      { kind: "throw" },
      { kind: "skill", skillId: "b_front" },
      { kind: "skill", skillId: "a_frontroll" },
      { kind: "catch" },
    );

  const tum = (r: ReturnType<typeof computeScore>) => r.tumblingScore;

  it("前宙 → 前宙：採用B・不採用", () => {
    const r = computeScore([hold(), hold()], "clubs");
    expect(tum(r)).toBeCloseTo(0.2, 5);
  });

  it("投げ前宙 → 前宙：採用C・不採用", () => {
    const r = computeScore([thrown(), hold()], "clubs");
    expect(tum(r)).toBeCloseTo(0.3, 5);
    expect(r.unitAdopted[0][0]).toBe(true);
    expect(r.unitAdopted[1][0]).toBe(false);
  });

  it("前宙 → 投げ前宙：不採用・採用C（後の方が高難度でも採用される）", () => {
    const r = computeScore([hold(), thrown()], "clubs");
    expect(tum(r)).toBeCloseTo(0.3, 5);
    expect(r.unitAdopted[0][0]).toBe(false);
    expect(r.unitAdopted[1][0]).toBe(true);
  });

  it("前宙 → 投げ前宙前転：不採用・採用C", () => {
    const r = computeScore([hold(), thrownRoll()], "clubs");
    expect(tum(r)).toBeCloseTo(0.3, 5);
    expect(r.unitAdopted[0][0]).toBe(false);
    expect(r.unitAdopted[1][0]).toBe(true);
  });

  it("投げ前宙前転 → 前宙：採用C・不採用", () => {
    const r = computeScore([thrownRoll(), hold()], "clubs");
    expect(tum(r)).toBeCloseTo(0.3, 5);
    expect(r.unitAdopted[0][0]).toBe(true);
    expect(r.unitAdopted[1][0]).toBe(false);
  });

  it("違う宙返りなら別の技として両方採用する", () => {
    const back = S({ kind: "skill", skillId: "b_backsalto", hasApparatus: true }, { kind: "catch" });
    const r = computeScore([hold(), back], "clubs");
    expect(tum(r)).toBeCloseTo(0.4, 5);
  });
});

describe("computeScore — 投げ方が違っても間の内容が同じなら同じ技（Q2）", () => {
  it("背面投げ→2動作→キャッチ と 前投げ→2動作→キャッチ は難度1つ分", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["noview"] }, // 背面投げ
          { kind: "motion", motionId: "m2" },
          { kind: "catch" },
          { kind: "throw" }, // 前投げ
          { kind: "motion", motionId: "m2" },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    const units = r.analysis[0].units;
    expect(units[0].signatures).toEqual(units[1].signatures);
    expect(r.unitAdopted[0]).toEqual([true, false]);
    expect(r.handScore).toBeCloseTo(0.3, 5);
    // 不採用でも技術加点と投げ回数は残る
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
    expect(r.totalThrowCount).toBe(2);
  });
});

describe("computeScore — シェネの手の有無で技を区別する（Q21 / Q28）", () => {
  /** n回のシェネ（handsで手あり）を投げ受けの間に実施 */
  const chene = (spec: [number, boolean][]): Series =>
    S(
      { kind: "throw" },
      ...spec.flatMap(([n, hands]) =>
        Array.from({ length: n }, () => ({ kind: "motion" as const, motionId: "chene", hands })),
      ),
      { kind: "catch" },
    );

  it("Q21：4シェネ／2シェネ＋手あり2シェネ／手あり4シェネ → 2つ目だけ不採用", () => {
    const r = computeScore(
      [chene([[4, false]]), chene([[2, false], [2, true]]), chene([[4, true]])],
      "clubs",
    );
    expect(r.analysis.map((a) => a.units[0].finalDiff)).toEqual(["E", "E", "E"]);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false, true]);
    expect(r.handScore).toBeCloseTo(1.4, 5); // E 0.7 × 2
  });

  it("手なし4シェネと手あり4シェネは別の技", () => {
    const r = computeScore([chene([[4, false]]), chene([[4, true]])], "clubs");
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
    expect(r.handScore).toBeCloseTo(1.4, 5);
  });

  it("同じ手の状態なら同じ技として1つだけ採用", () => {
    // 2本目は投げの技術タグでシリーズ重複を避ける
    const withTag = { ...chene([[4, true]]) };
    withTag.items = [{ kind: "throw", throwTypes: ["noview"] }, ...withTag.items.slice(1)];
    const r = computeScore([chene([[4, true]]), withTag], "clubs");
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
    expect(r.handScore).toBeCloseTo(0.7, 5);
  });

  it("Q28：シェネ2回＋前転 は手の有無で別の技", () => {
    const roll = (hands: boolean): Series =>
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "chene", hands },
        { kind: "motion", motionId: "chene", hands },
        { kind: "motion", motionId: "a_frontroll" },
        { kind: "catch" },
      );
    const r = computeScore([roll(false), roll(true)], "clubs");
    expect(r.analysis.map((a) => a.units[0].finalDiff)).toEqual(["D", "D"]);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
    expect(r.handScore).toBeCloseTo(1.0, 5);
  });

  it("混在シェネが先に採用された場合は手あり・手なしの両方が不採用になる", () => {
    const r = computeScore(
      [chene([[2, false], [2, true]]), chene([[4, false]]), chene([[4, true]])],
      "clubs",
    );
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false, false]);
    expect(r.handScore).toBeCloseTo(0.7, 5);
  });
});

describe("computeScore — 徒手は内訳で技を判定する（順序は問わない）", () => {
  const mo = (id: string, count?: number, hands?: boolean): Item => ({
    kind: "motion",
    motionId: id,
    count,
    hands,
  });
  const thr = (...items: Item[]): Series => S({ kind: "throw" }, ...items, { kind: "catch" });

  it("順序を入れ替えただけなら同じ技", () => {
    const r = computeScore([thr(mo("chene"), mo("fwd_roll")), thr(mo("fwd_roll"), mo("chene"))], "clubs");
    expect(r.analysis[0].units[0].signatures).toEqual(r.analysis[1].units[0].signatures);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
    expect(r.handScore).toBeCloseTo(0.3, 5);
  });

  it("4シェネ と 3シェネ＋前転 は別の技（どちらもE難度で両方採用）", () => {
    const r = computeScore([thr(mo("chene", 4)), thr(mo("chene", 3), mo("fwd_roll"))], "clubs");
    expect(r.analysis.map((a) => a.units[0].finalDiff)).toEqual(["E", "E"]);
    expect(r.analysis[0].units[0].signatures).toEqual(["hand:chene:4"]);
    expect(r.analysis[1].units[0].signatures).toEqual(["hand:chene:3,fwd_roll:1"]);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
    expect(r.handScore).toBeCloseTo(1.4, 5);
  });

  it("同じ内訳なら回数のまとめ方が違っても同じ技", () => {
    const r = computeScore(
      [thr(mo("chene", 2), mo("fwd_roll")), thr(mo("fwd_roll"), mo("chene"), mo("chene"))],
      "clubs",
    );
    expect(r.analysis[0].units[0].signatures).toEqual(r.analysis[1].units[0].signatures);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
  });

  it("動作数が同じでも種類が違えば別の技", () => {
    const r = computeScore([thr(mo("fwd_roll"), mo("back_roll")), thr(mo("chene"), mo("roll"))], "clubs");
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
    expect(r.handScore).toBeCloseTo(0.6, 5);
  });

  it("タンブリング技として入れても徒手動作として入れても同じ技", () => {
    const asSkill = S(
      { kind: "throw" },
      { kind: "skill", skillId: "a_flicflac" },
      { kind: "motion", motionId: "chene" },
      { kind: "catch" },
    );
    const r = computeScore([asSkill, thr(mo("chene"), mo("a_flicflac"))], "clubs");
    expect(r.analysis[0].units[0].signatures).toEqual(r.analysis[1].units[0].signatures);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
  });
});

describe("computeScore — タンブリング難度点も塊ごとの内訳を返す", () => {
  const tum = (skillId: string): Series => S({ kind: "skill", skillId }, { kind: "catch" });

  it("上位3つ外の塊は inTop=false になる", () => {
    const r = computeScore(
      [tum("e_doublelay"), tum("d_doubleback"), tum("c_back15"), tum("b_backsalto")],
      "clubs",
    );
    const rows = r.seriesBreakdowns.map((b) => b.tumRows[0]);
    expect(rows.map((x) => x.label)).toEqual(["タンブリング1", "タンブリング1", "タンブリング1", "タンブリング1"]);
    expect(rows.map((x) => x.diff)).toEqual(["E", "D", "C", "B"]);
    expect(rows.map((x) => x.inTop)).toEqual([true, true, true, false]);
    expect(rows.every((x) => x.adopted)).toBe(true);
    expect(r.tumblingScore).toBeCloseTo(1.5, 5);
    expect(r.seriesBreakdowns.reduce((s, b) => s + b.tumDiff, 0)).toBeCloseTo(1.5, 5);
  });

  it("同じ内容の塊は adopted=false（難度不採用）になる", () => {
    const r = computeScore([tum("d_doubleback"), tum("d_doubleback")], "clubs");
    // 2本目はシリーズ重複でもあるので行自体が空
    expect(r.seriesBreakdowns[0].tumRows[0].adopted).toBe(true);
    expect(r.seriesBreakdowns[1].tumRows[0].adopted).toBe(false);
  });

  it("投げタンの行は「投げタン」表記になる", () => {
    const r = computeScore(
      [S({ kind: "throw" }, { kind: "skill", skillId: "b_front" }, { kind: "catch" })],
      "clubs",
    );
    expect(r.seriesBreakdowns[0].tumRows[0].label).toBe("投げタン1");
  });

  it("E難度＋技中の投げのボーナスが行の点数に含まれる", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "e_doublelay", isThrow: true }, { kind: "catch" })],
      "clubs",
    );
    expect(r.seriesBreakdowns[0].tumRows[0].score).toBeCloseTo(0.8, 5);
  });
});

describe("computeScore — 手ありシェネの種類", () => {
  const chene = (hands: boolean, handsType?: string, count = 3): Item => ({
    kind: "motion",
    motionId: "chene",
    hands,
    handsType,
    count,
  });
  const thr = (...items: Item[]): Series => S({ kind: "throw" }, ...items, { kind: "catch" });

  it("種類が違えば別の技として両方採用される", () => {
    const r = computeScore([thr(chene(true, "one")), thr(chene(true, "both"))], "clubs");
    expect(r.analysis[0].units[0].signatures).toEqual(["hand:chene:3:h:one"]);
    expect(r.analysis[1].units[0].signatures).toEqual(["hand:chene:3:h:both"]);
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
  });

  it("同じ種類なら同じ技（1つだけ採用）", () => {
    const r = computeScore(
      [thr(chene(true, "spin")), S({ kind: "throw", throwTypes: ["noview"] }, chene(true, "spin"), { kind: "catch" })],
      "clubs",
    );
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
  });

  it("手なしとも別の技", () => {
    const r = computeScore([thr(chene(false)), thr(chene(true, "one"))], "clubs");
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, true]);
  });

  it("その他はいくつあっても重複にならない", () => {
    const other = () => thr(chene(true, "other"));
    const r = computeScore([other(), { ...other(), notDuplicate: false }, other()], "clubs");
    // シリーズ構成が同一なので2本目以降はシリーズ重複になる。中身で判定するため技術タグで分ける
    const tagged = (tag: string): Series =>
      S({ kind: "throw", throwTypes: [tag] }, chene(true, "other"), { kind: "catch" });
    const r2 = computeScore([tagged("noview"), tagged("nonhand"), tagged("other")], "clubs");
    expect(r2.unitAdopted.map((u) => u[0])).toEqual([true, true, true]);
    expect(r.dupFlags).toEqual([false, true, true]);
  });

  it("片手上げ・両手上げ・回旋は同じ種類同士でのみ重複する", () => {
    const tagged = (tag: string, ht: string): Series =>
      S({ kind: "throw", throwTypes: [tag] }, chene(true, ht), { kind: "catch" });
    const r = computeScore(
      [tagged("noview", "one"), tagged("nonhand", "one"), tagged("other", "both")],
      "clubs",
    );
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false, true]);
  });

  it("種類未指定の手ありは片手上げ扱い", () => {
    const tagged = (tag: string, ht?: string): Series =>
      S({ kind: "throw", throwTypes: [tag] }, chene(true, ht), { kind: "catch" });
    const r = computeScore([tagged("noview"), tagged("nonhand", "one")], "clubs");
    expect(r.unitAdopted.map((u) => u[0])).toEqual([true, false]);
  });
});

describe("computeScore — 転回系の投げ受け（投げタン）の自動判定", () => {
  const check = (r: ReturnType<typeof computeScore>, apparatus: string) =>
    r.apparatusElementChecks.find((c) => c.key === `appEl_${apparatus}_rotthrow`);

  it("投げタンが無ければ不足", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "clubs");
    expect(check(r, "clubs")?.passed).toBe(false);
    expect(check(r, "clubs")?.label).toBe("転回系の投げ受け（自動判定）");
  });

  it("投げ→技→キャッチ（投げタン）があれば自動でOK", () => {
    const r = computeScore(
      [S({ kind: "throw" }, { kind: "skill", skillId: "b_front" }, { kind: "catch" })],
      "clubs",
    );
    expect(check(r, "clubs")?.passed).toBe(true);
    expect(r.required.find((c) => c.key === "throwTum")?.passed).toBe(true);
  });

  it("技の最中の投げ（投げタン）でもOK", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_front", isThrow: true }, { kind: "catch" })],
      "rope",
    );
    expect(check(r, "rope")?.passed).toBe(true);
  });

  it("転回系を伴わない投げ受けだけでは不足（徒手系ユニット）", () => {
    const r = computeScore(
      [S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 3 }, { kind: "catch" })],
      "ring",
    );
    expect(check(r, "ring")?.passed).toBe(false);
  });

  it("4手具とも自動判定になり、手動チェックでは上書きできない", () => {
    for (const ap of ["stick", "ring", "rope", "clubs"] as const) {
      const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], ap, {
        apparatusElements: [`${ap}_rotthrow`],
      });
      expect(check(r, ap)?.passed).toBe(false);
    }
  });
});
