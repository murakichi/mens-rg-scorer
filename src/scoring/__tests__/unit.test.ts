// =====================================================================
// ユニット確定（finalizeUnit）と手具フロー検証（checkApparatusFlow）。
// 期待値は mens-rg-rules.md §3.5.5.3 / §3.5.5.4 から手計算した literal。
// =====================================================================
import { describe, it, expect } from "vitest";
import { analyzeSeries, checkApparatusFlow, motionDef, motionTimes } from "../analysis";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const mot = (motionId: string, count = 1): Item => ({ kind: "motion", motionId, count });
const unit0 = (series: Series) => analyzeSeries(series).units[0];

describe("投げユニットの難度は徒手系と転回系の高い方（§3.5.5.4）", () => {
  it("転回系の方が高ければ転回系を採る", () => {
    // 投げ → 後方宙返り(B) → キャッチ：投げタンで1ランクアップして C、徒手は0動作で A
    const u = unit0(S({ kind: "throw" }, { kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }));
    expect(u.tumblingDiff).toBe("C");
    expect(u.handDiff).toBe("A");
    expect(u.finalDiff).toBe("C");
    expect(u.diffFromHand).toBe(false);
  });

  it("徒手系の方が高ければ徒手系を採る", () => {
    // 投げ → シェネ4回 → 後方宙返り(B) → キャッチ：徒手4動作で E、転回系は C
    const u = unit0(
      S({ kind: "throw" }, mot("chene", 4), { kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }),
    );
    expect(u.tumblingDiff).toBe("C");
    expect(u.handDiff).toBe("E");
    expect(u.finalDiff).toBe("E");
    expect(u.diffFromHand).toBe(true);
  });

  it("同値なら徒手系を採る", () => {
    // 投げ → シェネ2回 → 後方宙返り(B) → キャッチ：徒手2動作で C、転回系も C
    const u = unit0(
      S({ kind: "throw" }, mot("chene", 2), { kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }),
    );
    expect(u.tumblingDiff).toBe("C");
    expect(u.handDiff).toBe("C");
    expect(u.finalDiff).toBe("C");
    expect(u.diffFromHand).toBe(true);
  });

  it("転回系を含む投げユニットは徒手系難度を採っても投げタンのまま", () => {
    const u = unit0(
      S({ kind: "throw" }, mot("chene", 4), { kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }),
    );
    expect(u.isThrowTumbling).toBe(true);
  });
});

describe("hasDPlus（シリーズ加点の判定に使うD難度以上のユニット）", () => {
  it("3動作でD難度になれば true", () => {
    const u = unit0(S({ kind: "throw" }, mot("chene", 3), { kind: "catch" }));
    expect(u.finalDiff).toBe("D");
    expect(u.hasDPlus).toBe(true);
  });

  it("2動作（C難度）なら false", () => {
    const u = unit0(S({ kind: "throw" }, mot("chene", 2), { kind: "catch" }));
    expect(u.finalDiff).toBe("C");
    expect(u.hasDPlus).toBe(false);
  });

  it("技を含んでD難度以上なら true", () => {
    // 投げ → 後方1回半ひねり(C) → キャッチ：投げタンで D
    const u = unit0(S({ kind: "throw" }, { kind: "skill", skillId: "c_back15" }, { kind: "catch" }));
    expect(u.finalDiff).toBe("D");
    expect(u.hasDPlus).toBe(true);
  });

  it("投げなしのタンブリング塊は対象外（false）", () => {
    const u = unit0(S({ kind: "skill", skillId: "e_doublelay" }, { kind: "catch" }));
    expect(u.type).toBe("tumbling");
    expect(u.hasDPlus).toBe(false);
  });
});

describe("不正・未知の入力は無視する", () => {
  it("技が未選択（skillId が空）ならユニットにならない", () => {
    expect(analyzeSeries(S({ kind: "skill", skillId: "" }, { kind: "catch" })).units).toHaveLength(0);
  });

  it("未知の徒手動作idは動作数に数えない", () => {
    expect(motionDef("no_such_motion")).toBeNull();
    const u = unit0(S({ kind: "throw" }, mot("no_such_motion", 3), { kind: "catch" }));
    expect(u.finalDiff).toBe("A"); // 0動作のまま
  });

  it("未知のロープ跳びidはユニットを作らない", () => {
    expect(analyzeSeries(S({ kind: "ropeJump", jumpId: "no_such_jump" })).units).toHaveLength(0);
  });

  it("連続回数が0・負・不正値なら1回として数える", () => {
    expect(motionTimes(0)).toBe(1);
    expect(motionTimes(-3)).toBe(1);
    expect(motionTimes(undefined)).toBe(1);
    expect(motionTimes(NaN)).toBe(1);
    expect(motionTimes(2.7)).toBe(2); // 小数は切り捨て
  });
});

describe("checkApparatusFlow（手元/空中の手具数の検証・採点には非影響）", () => {
  it("投げてキャッチすれば警告なし", () => {
    expect(checkApparatusFlow(S({ kind: "throw" }, { kind: "catch" }), "stick")).toEqual([]);
  });

  it("手元に無いのに投げると警告（何番目かを示す）", () => {
    const errs = checkApparatusFlow(
      S({ kind: "throw" }, { kind: "throw" }, { kind: "catch" }, { kind: "catch" }),
      "stick",
    );
    expect(errs).toEqual([
      "2番目の投げ：手元の手具が足りません",
      "4番目のキャッチ：空中に手具がありません",
    ]);
  });

  it("空中に無いのにキャッチすると警告", () => {
    expect(checkApparatusFlow(S({ kind: "catch" }), "stick")).toEqual([
      "1番目のキャッチ：空中に手具がありません",
    ]);
  });

  it("キャッチせずに終わると警告", () => {
    expect(checkApparatusFlow(S({ kind: "throw" }), "stick")).toEqual([
      "シリーズ終了時に空中の手具が残っています（キャッチ不足）",
    ]);
  });

  it("二つ投げは手具を2つ消費し、2つ同時キャッチで戻る（クラブ）", () => {
    expect(
      checkApparatusFlow(
        S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch", catchTwo: true }),
        "clubs",
      ),
    ).toEqual([]);
  });

  it("二つ投げを1つしか受けないと空中に残る", () => {
    expect(
      checkApparatusFlow(S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch" }), "clubs"),
    ).toEqual(["シリーズ終了時に空中の手具が残っています（キャッチ不足）"]);
  });

  it("手具が1つしか無い手具で二つ投げをすると警告（消費は手元にある分だけ）", () => {
    expect(
      checkApparatusFlow(S({ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch" }), "rope"),
    ).toEqual(["1番目の投げ：手元の手具が足りません"]);
  });

  it("クラブは2つあるので単発の投げを2回続けられる", () => {
    expect(
      checkApparatusFlow(
        S({ kind: "throw" }, { kind: "throw" }, { kind: "catch", catchTwo: true }),
        "clubs",
      ),
    ).toEqual([]);
  });

  it("技の最中の投げも手具を消費する", () => {
    expect(
      checkApparatusFlow(
        S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" }),
        "stick",
      ),
    ).toEqual([]);
  });

  it("技の最中の投げが続くと専用の警告を出す", () => {
    const errs = checkApparatusFlow(
      S(
        { kind: "skill", skillId: "b_backsalto", isThrow: true },
        { kind: "skill", skillId: "b_front", isThrow: true },
        { kind: "catch" },
        { kind: "catch" },
      ),
      "stick",
    );
    expect(errs).toEqual([
      "2番目の技の最中の投げ：手元の手具が足りません",
      "4番目のキャッチ：空中に手具がありません",
    ]);
  });

  it("投げを伴わない技・徒手動作は手具数を変えない", () => {
    expect(
      checkApparatusFlow(S({ kind: "skill", skillId: "b_backsalto" }, mot("chene")), "stick"),
    ).toEqual([]);
  });
});

describe("徒手動作だけのユニット", () => {
  it("投げも技も無い徒手動作の並びは徒手系ユニットになる", () => {
    const u = unit0(S(mot("chene", 2)));
    expect(u.type).toBe("throw");
    expect(u.isThrow).toBe(false);
    expect(u.finalDiff).toBe("C"); // 2動作 = C
  });

  it("徒手動作から始まって投げを挟むと1つの投げユニットにまとまる", () => {
    const a = analyzeSeries(S(mot("chene", 2), { kind: "throw" }, mot("roll", 1), { kind: "catch" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].isThrow).toBe(true);
    expect(a.units[0].finalDiff).toBe("D"); // 3動作 = D
  });
});
