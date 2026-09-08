import { describe, it, expect } from "vitest";
import {
  calcTumblingDifficulty,
  calcHandDifficulty,
  maxSaltoChain,
  hasConnect,
  hasConnectWithoutApparatus,
  saltoFlags,
  handMotionsOfSkill,
  motionDef,
  motionTimes,
  analyzeSeries,
  seriesSignature,
} from "../analysis";
import { ropeJumpDef, MOTION_OPTIONS, SKILL_LIST, legacyMotionDef, motionOptionsFor } from "../constants";
import type { Series, Item } from "../types";

// テストヘルパー：items から Series を組む
const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

describe("calcTumblingDifficulty", () => {
  it("単一の非A技はその難度を返す", () => {
    expect(calcTumblingDifficulty(["b_backsalto"], false)).toBe("B");
  });
  it("2技目以降は (難度-1) を加算して格上げする", () => {
    // B(2) + (B-1=1) = 3 → C
    expect(calcTumblingDifficulty(["b_backsalto", "b_front"], false)).toBe("C");
  });
  it("投げを含むと +1 される", () => {
    // B(2) + 1(投げ) = 3 → C
    expect(calcTumblingDifficulty(["b_backsalto"], true)).toBe("C");
  });
  it("A難度技は難度算出から除外される（先頭でも無視）", () => {
    expect(calcTumblingDifficulty(["a_cartwheel", "b_backsalto"], false)).toBe("B");
  });
  it("非A技が無ければ null", () => {
    expect(calcTumblingDifficulty(["a_cartwheel", "a_roundoff"], false)).toBeNull();
  });
  it("E難度で頭打ち（上限超過しない）", () => {
    // E(5) + (B-1=1) = 6 → min(6,5)=5 → E
    expect(calcTumblingDifficulty(["e_doublelay", "b_backsalto"], false)).toBe("E");
  });
});

describe("calcHandDifficulty", () => {
  it("縦3動作は無条件で E", () => {
    expect(calcHandDifficulty(0, true)).toBe("E");
  });
  it("動作数を A 起点で加算する", () => {
    expect(calcHandDifficulty(0, false)).toBe("A");
    expect(calcHandDifficulty(3, false)).toBe("D");
    expect(calcHandDifficulty(4, false)).toBe("E");
  });
  it("上限 E で頭打ち", () => {
    expect(calcHandDifficulty(9, false)).toBe("E");
  });
});

describe("maxSaltoChain", () => {
  it("連続する宙返りの最大数を返す（非宙返りでリセット）", () => {
    expect(maxSaltoChain(["b_backsalto", "b_front", "a_cartwheel", "b_backsalto"])).toBe(2);
  });
  it("宙返りが無ければ 0", () => {
    expect(maxSaltoChain(["a_cartwheel", "a_roundoff"])).toBe(0);
  });
});

describe("hasConnect / hasConnectWithoutApparatus", () => {
  const skills = (...ids: string[]) => ids.map((skillId) => ({ skillId, hasApparatus: true, isThrow: false }));

  it("宙返り→A難度→宙返り の並びを検出する", () => {
    expect(hasConnect(skills("b_backsalto", "a_cartwheel", "b_front"))).toBe(true);
  });
  it("A難度が挟まれていなければ false", () => {
    expect(hasConnect(skills("b_backsalto", "b_front"))).toBe(false);
  });
  it("つなぎ技のA難度に手具操作が無いと検出する", () => {
    const s = [
      { skillId: "b_backsalto", hasApparatus: true, isThrow: false },
      { skillId: "a_cartwheel", hasApparatus: false, isThrow: false },
      { skillId: "b_front", hasApparatus: true, isThrow: false },
    ];
    expect(hasConnectWithoutApparatus(s)).toBe(true);
  });
});

describe("analyzeSeries", () => {
  it("投げなしの技列は tumbling ユニットになる", () => {
    const a = analyzeSeries(S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].type).toBe("tumbling");
    expect(a.units[0].finalDiff).toBe("B");
    expect(a.throwCount).toBe(0);
  });
  it("投げ+受けは throw ユニットになり throwCount が増える", () => {
    const a = analyzeSeries(S({ kind: "throw" }, { kind: "catch" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].type).toBe("throw");
    expect(a.throwCount).toBe(1);
  });
  it("技を含む投げユニットは投げタン（isThrowTumbling）になる", () => {
    const a = analyzeSeries(
      S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" }),
    );
    expect(a.units[0].type).toBe("throw");
    expect(a.units[0].isThrowTumbling).toBe(true);
    expect(a.throwCount).toBe(1);
  });
  it("ロープ跳びは最高難度の独立ユニットを追加する", () => {
    const a = analyzeSeries(S({ kind: "ropeJump", jumpId: "3bc" }, { kind: "ropeJump", jumpId: "1f" }));
    // 3bc = D, 1f = A → 最高の D が採用
    expect(a.units).toHaveLength(1);
    expect(a.units[0].finalDiff).toBe("D");
  });
});

describe("seriesSignature", () => {
  it("投げタグの順序に依存しない（ソートで正規化）", () => {
    const s1 = S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, { kind: "catch" });
    const s2 = S({ kind: "throw", throwTypes: ["nonhand", "noview"] }, { kind: "catch" });
    expect(seriesSignature(s1)).toBe(seriesSignature(s2));
  });
  it("構成が異なれば別シグネチャ", () => {
    const s1 = S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" });
    const s2 = S({ kind: "skill", skillId: "b_front" }, { kind: "catch" });
    expect(seriesSignature(s1)).not.toBe(seriesSignature(s2));
  });
});

describe("ロープ跳び — 3重連続3回以上・4重跳びは前後で難度が同じ", () => {
  const diff = (id: string) => ropeJumpDef(id)?.difficulty;

  it("3重跳び連続3回以上は前後ともD", () => {
    expect(diff("3x3f")).toBe("D");
    expect(diff("3x3b")).toBe("D");
  });

  it("4重跳びは前後ともD、連続2回以上は前後ともE", () => {
    expect(diff("4f")).toBe("D");
    expect(diff("4b")).toBe("D");
    expect(diff("4x2f")).toBe("E");
    expect(diff("4x2b")).toBe("E");
  });

  it("前後の別は要求要素（前回し／後ろ回し）の判定用に保持される", () => {
    expect(ropeJumpDef("4f")?.direction).toBe("front");
    expect(ropeJumpDef("4b")?.direction).toBe("back");
  });

  it("前の4重跳びも徒手系難度Dのユニットになる", () => {
    const a = analyzeSeries(S({ kind: "ropeJump", jumpId: "4f" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].finalDiff).toBe("D");
  });
});

describe("きりもみ系は宙返りの連続に含まれる場合のみ宙返り扱い（Q7）", () => {
  it("単体のきりもみ・きりもみ転回は宙返りとして数えない", () => {
    expect(saltoFlags(["b_kirimomi"])).toEqual([false]);
    expect(saltoFlags(["c_kirimomiten"])).toEqual([false]);
    expect(maxSaltoChain(["b_kirimomi"])).toBe(0);
  });

  it("きりもみ同士が並んだだけでは連続とみなさない", () => {
    expect(saltoFlags(["b_kirimomi", "c_kirimomiten"])).toEqual([false, false]);
    expect(maxSaltoChain(["b_kirimomi", "b_kirimomi"])).toBe(0);
  });

  it("本物の宙返りが隣にあれば宙返りとして数える", () => {
    expect(saltoFlags(["b_front", "b_kirimomi"])).toEqual([true, true]);
    expect(maxSaltoChain(["b_front", "b_kirimomi"])).toBe(2);
    expect(maxSaltoChain(["b_front", "b_kirimomi", "b_backsalto"])).toBe(3);
    // きりもみ→きりもみ→前宙：前宙の隣のきりもみだけが宙返り扱い
    expect(saltoFlags(["b_kirimomi", "b_kirimomi", "b_front"])).toEqual([false, true, true]);
    expect(maxSaltoChain(["b_kirimomi", "b_kirimomi", "b_front"])).toBe(2);
  });

  it("つなぎ技のA難度を挟んだ先に本物の宙返りがあれば宙返り扱い", () => {
    expect(saltoFlags(["b_front", "a_roundoff", "b_kirimomi"])).toEqual([true, true, true].map((_, i) => i !== 1));
    expect(saltoFlags(["b_kirimomi", "a_roundoff", "b_kirimomi"])).toEqual([false, false, false]);
  });

  it("A難度を挟んだきりもみ同士はつなぎ技にならない", () => {
    const skills = (ids: string[]) => ids.map((skillId) => ({ skillId, hasApparatus: false, isThrow: false }));
    expect(hasConnect(skills(["b_kirimomi", "a_roundoff", "b_kirimomi"]))).toBe(false);
    expect(hasConnect(skills(["b_front", "a_roundoff", "b_kirimomi"]))).toBe(true);
    expect(hasConnect(skills(["b_front", "a_roundoff", "b_backsalto"]))).toBe(true);
  });

  it("難度はそのまま（きりもみB・きりもみ転回C）", () => {
    expect(calcTumblingDifficulty(["b_kirimomi"], false)).toBe("B");
    expect(calcTumblingDifficulty(["c_kirimomiten"], false)).toBe("C");
  });
});

describe("宙返りに数えない技は徒手系の動作として数える（Q7の回答）", () => {
  const unit = (ser: Series) => analyzeSeries(ser).units[0];
  const sk = (skillId: string): Item => ({ kind: "skill", skillId });

  it("A難度技は縦の一回転の徒手＝1動作", () => {
    expect(handMotionsOfSkill("a_cartwheel")).toBe(1);
    expect(handMotionsOfSkill("a_flicflac")).toBe(1);
    expect(handMotionsOfSkill("a_handspring")).toBe(1);
  });

  it("きりもみは1動作・きりもみ転回は2動作（難度をそのまま読み替える）", () => {
    expect(handMotionsOfSkill("b_kirimomi")).toBe(1);
    expect(handMotionsOfSkill("c_kirimomiten")).toBe(2);
  });

  it("投げ→バク転→キャッチ は徒手系B（1動作）", () => {
    const u = unit(S({ kind: "throw" }, sk("a_flicflac"), { kind: "catch" }));
    expect(u.isThrowTumbling).toBe(false);
    expect(u.finalDiff).toBe("B");
  });

  it("投げ→ロンダート→バク転→キャッチ は徒手系C（2動作）", () => {
    expect(unit(S({ kind: "throw" }, sk("a_roundoff"), sk("a_flicflac"), { kind: "catch" })).finalDiff).toBe("C");
  });

  it("徒手動作と技の動作数は合算する", () => {
    const u = unit(S({ kind: "throw" }, { kind: "motion", motionId: "m2" }, sk("a_flicflac"), { kind: "catch" }));
    expect(u.finalDiff).toBe("D"); // 2動作 + バク転1動作 = 3動作
  });

  it("単体のきりもみ系は徒手扱いで難度はそのまま", () => {
    expect(unit(S({ kind: "throw" }, sk("b_kirimomi"), { kind: "catch" })).finalDiff).toBe("B");
    expect(unit(S({ kind: "throw" }, sk("c_kirimomiten"), { kind: "catch" })).finalDiff).toBe("C");
  });

  it("投げなしでも徒手としてカウントする", () => {
    const u = unit(S(sk("a_cartwheel"), { kind: "catch" }));
    expect(u.type).toBe("throw"); // 徒手系ユニット（投げは含まない）
    expect(u.isThrow).toBe(false);
    expect(u.finalDiff).toBe("B");
  });

  it("宙返りと並んだA難度技は転回系のまま（つなぎ技は動作に数えない）", () => {
    const u = unit(S(sk("b_front"), sk("a_roundoff"), sk("b_front"), { kind: "catch" }));
    expect(u.type).toBe("tumbling");
    expect(u.finalDiff).toBe("C"); // B + (B-1) = C、ロンダートは徒手に数えない
  });

  it("宙返りの連続に含まれるきりもみは転回系のまま", () => {
    const u = unit(S(sk("b_front"), sk("b_kirimomi"), { kind: "catch" }));
    expect(u.type).toBe("tumbling");
    expect(u.finalDiff).toBe("C"); // 前宙B + きりもみ(B-1) = C
  });
});

describe("徒手動作として転回技を選べる（プルダウンの選択肢）", () => {
  it("選択肢は回転系の徒手のみ（汎用のn動作は出さない）", () => {
    const ids = MOTION_OPTIONS.map((o) => o.id);
    expect(ids).not.toContain("m1");
    expect(ids).not.toContain("m4");
    expect(ids).not.toContain("mv3");
    expect(ids).toContain("td_rise");
    expect(ids).toContain("chene");
    expect(ids).toContain("roll");
    expect(ids).toContain("a_cartwheel");
    expect(ids).toContain("a_flicflac");
    expect(ids).toContain("b_kirimomi");
    expect(ids).toContain("c_kirimomiten");
    // 宙返りは徒手動作の選択肢に出さない
    expect(ids).not.toContain("b_front");
    expect(ids).not.toContain("e_doublelay");
    expect(MOTION_OPTIONS.find((o) => o.id === "a_cartwheel")?.name).toBe("側転");
    expect(MOTION_OPTIONS.find((o) => o.id === "c_kirimomiten")?.name).toBe("きりもみ転回");
  });

  it("徒手動作として選んだ転回技も動作数に合算される", () => {
    // 投げ→2動作→バク転（徒手動作として選択）→キャッチ ＝ 3動作 → D
    const u = analyzeSeries(
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "m2" },
        { kind: "motion", motionId: "a_flicflac" },
        { kind: "catch" },
      ),
    ).units[0];
    expect(u.finalDiff).toBe("D");
  });

  it("タンブリング技として入れた場合と同じ動作数になる", () => {
    const asMotion = analyzeSeries(
      S({ kind: "throw" }, { kind: "motion", motionId: "c_kirimomiten" }, { kind: "catch" }),
    ).units[0];
    const asSkill = analyzeSeries(
      S({ kind: "throw" }, { kind: "skill", skillId: "c_kirimomiten" }, { kind: "catch" }),
    ).units[0];
    expect(asMotion.finalDiff).toBe("C");
    expect(asSkill.finalDiff).toBe("C");
  });
});

describe("タッチダウンライズ（縦回転の徒手）", () => {
  it("徒手動作の選択肢にあり、タンブリング技には無い", () => {
    expect(MOTION_OPTIONS.map((o) => o.id)).toContain("td_rise");
    expect(MOTION_OPTIONS.find((o) => o.id === "td_rise")?.name).toBe("タッチダウンライズ");
    expect(SKILL_LIST.some((s) => s.id === "td_rise")).toBe(false);
  });

  it("1動作として徒手系難度に数える", () => {
    expect(motionDef("td_rise")).toEqual({
      motions: 1,
      verticalThree: false,
      vertical: 1,
      hasHandsOption: false,
      generic: false,
    });
    const u = analyzeSeries(
      S({ kind: "throw" }, { kind: "motion", motionId: "td_rise" }, { kind: "catch" }),
    ).units[0];
    expect(u.finalDiff).toBe("B");
    expect(u.isThrowTumbling).toBe(false);
  });

  it("徒手動作と合算される", () => {
    const u = analyzeSeries(
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "m2" },
        { kind: "motion", motionId: "td_rise" },
        { kind: "catch" },
      ),
    ).units[0];
    expect(u.finalDiff).toBe("D"); // 2動作 + 1動作
  });
});

describe("縦回転の徒手を3動作分つなげると縦3動作（E難度）", () => {
  const unit = (ser: Series) => analyzeSeries(ser).units[0];
  const mo = (id: string): Item => ({ kind: "motion", motionId: id });
  const sk = (skillId: string): Item => ({ kind: "skill", skillId });

  it("徒手動作として3つ並べるとE", () => {
    expect(
      unit(S({ kind: "throw" }, mo("a_flicflac"), mo("a_flicflac"), mo("a_flicflac"), { kind: "catch" })).finalDiff,
    ).toBe("E");
    expect(
      unit(S({ kind: "throw" }, mo("a_cartwheel"), mo("a_flicflac"), mo("td_rise"), { kind: "catch" })).finalDiff,
    ).toBe("E");
  });

  it("タンブリング技として入れても同じ判定", () => {
    expect(
      unit(S({ kind: "throw" }, sk("a_cartwheel"), sk("a_flicflac"), sk("a_handspring"), { kind: "catch" })).finalDiff,
    ).toBe("E");
  });

  it("きりもみ転回（2動作）＋縦回転1つでもE", () => {
    expect(unit(S({ kind: "throw" }, mo("c_kirimomiten"), mo("a_flicflac"), { kind: "catch" })).finalDiff).toBe("E");
  });

  it("縦回転が2動作分までならD以下のまま", () => {
    expect(unit(S({ kind: "throw" }, mo("a_flicflac"), mo("a_flicflac"), { kind: "catch" })).finalDiff).toBe("C");
    // 一般の動作は縦回転として数えない（2動作＋バク転＝3動作でD）
    expect(unit(S({ kind: "throw" }, mo("m2"), mo("a_flicflac"), { kind: "catch" })).finalDiff).toBe("D");
    expect(unit(S({ kind: "throw" }, mo("m1"), mo("m1"), mo("m1"), { kind: "catch" })).finalDiff).toBe("D");
  });

  it("宙返りの連続に含まれる技は縦回転の徒手に数えない", () => {
    // 前宙→ロンダート→前宙は転回系。徒手側は0動作のまま
    const u = unit(S({ kind: "throw" }, sk("b_front"), sk("a_roundoff"), sk("b_front"), { kind: "catch" }));
    expect(u.handDiff).toBe("A");
  });
});

describe("徒手動作の連続回数", () => {
  const unit = (ser: Series) => analyzeSeries(ser).units[0];

  it("未指定は1回、2以上でその回数分の動作数になる", () => {
    expect(motionTimes(undefined)).toBe(1);
    expect(motionTimes(0)).toBe(1);
    expect(motionTimes(4)).toBe(4);
    const u = unit(
      S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 4 }, { kind: "catch" }),
    );
    expect(u.finalDiff).toBe("E"); // 4動作
  });

  it("旧データの1動作×2回 と 2動作 は同じ扱い", () => {
    const a = unit(S({ kind: "throw" }, { kind: "motion", motionId: "m1", count: 2 }, { kind: "catch" }));
    const b = unit(S({ kind: "throw" }, { kind: "motion", motionId: "m2" }, { kind: "catch" }));
    expect(a.finalDiff).toBe(b.finalDiff);
    expect(a.signatures).toEqual(b.signatures);
  });

  it("縦回転も回数分だけ数える（バク転×3で縦3動作＝E）", () => {
    const u = unit(
      S({ kind: "throw" }, { kind: "motion", motionId: "a_flicflac", count: 3 }, { kind: "catch" }),
    );
    expect(u.finalDiff).toBe("E");
  });

  it("シェネの手ありも回数分だけ数える", () => {
    const mixed = unit(
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "chene", count: 2 },
        { kind: "motion", motionId: "chene", hands: true, count: 2 },
        { kind: "catch" },
      ),
    );
    expect(mixed.finalDiff).toBe("E");
    // 手あり・手なし混在なので内容キーを2つ持つ
    expect(mixed.signatures).toEqual(["hand:chene:4", "hand:chene:4:h:one"]);
    });
});

describe("旧データの徒手動作（n動作）", () => {
  it("選択肢には出ないが計算では従来どおり解決する", () => {
    expect(legacyMotionDef("m3")?.motions).toBe(3);
    expect(legacyMotionDef("mv3")?.verticalThree).toBe(true);
    expect(legacyMotionDef("chene")).toBeUndefined();
    const u = analyzeSeries(
      S({ kind: "throw" }, { kind: "motion", motionId: "m3" }, { kind: "catch" }),
    ).units[0];
    expect(u.finalDiff).toBe("D");
    const v = analyzeSeries(
      S({ kind: "throw" }, { kind: "motion", motionId: "mv3" }, { kind: "catch" }),
    ).units[0];
    expect(v.finalDiff).toBe("E");
  });
});

describe("前転・後転（縦の一回転の徒手）", () => {
  it("選択肢にあり、1動作の縦回転として数える", () => {
    const ids = MOTION_OPTIONS.map((o) => o.id);
    expect(ids).toContain("fwd_roll");
    expect(ids).toContain("back_roll");
    expect(motionDef("fwd_roll")).toEqual({
      motions: 1,
      verticalThree: false,
      vertical: 1,
      hasHandsOption: false,
      generic: false,
    });
    // 前転・後転・タッチダウンライズで縦3動作＝E
    const u = analyzeSeries(
      S(
        { kind: "throw" },
        { kind: "motion", motionId: "fwd_roll" },
        { kind: "motion", motionId: "back_roll" },
        { kind: "motion", motionId: "td_rise" },
        { kind: "catch" },
      ),
    ).units[0];
    expect(u.finalDiff).toBe("E");
  });
});

describe("徒手動作の選択肢の並び順", () => {
  const names = (prev?: string) => motionOptionsFor(prev).map((o) => o.name);

  it("既定はシェネ→前転→側転→とび前転→ハンドスプリングの順", () => {
    expect(names().slice(0, 5)).toEqual(["シェネ", "前転", "側転", "とび前転", "ハンドスプリング"]);
  });

  it("シェネの次は前転・転がり・側転が上に来る", () => {
    expect(names("chene").slice(0, 3)).toEqual(["前転", "転がり", "側転"]);
  });

  it("前転の次は転がりが一番上", () => {
    expect(names("fwd_roll")[0]).toBe("転がり");
  });

  it("並べ替えても選択肢の顔ぶれは変わらない", () => {
    const base = motionOptionsFor().map((o) => o.id).sort();
    expect(motionOptionsFor("chene").map((o) => o.id).sort()).toEqual(base);
    expect(motionOptionsFor("fwd_roll").map((o) => o.id).sort()).toEqual(base);
  });

  it("ギャンビは縦の一回転の徒手", () => {
    expect(motionOptionsFor().map((o) => o.id)).toContain("gambi");
    expect(motionDef("gambi")).toEqual({
      motions: 1,
      verticalThree: false,
      vertical: 1,
      hasHandsOption: false,
      generic: false,
    });
  });
});
