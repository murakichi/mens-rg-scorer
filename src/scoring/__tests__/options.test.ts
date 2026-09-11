import { describe, it, expect } from "vitest";
import { needsRoundoffBefore, prevSkillId } from "../analysis";
import type { Item } from "../types";
import {
  CATEGORY,
  MOTION_OPTIONS,
  motionOptionGroupsFor,
  motionOptionsFor,
  skillOptionGroups,
  skillOptions,
  skillFlowAfter,
  leadsBackward,
  isBackwardSalto,
} from "../constants";

describe("タンブリング技の選択肢は系統ごとにまとめる", () => {
  it("前方系・側方系・後方系の順に並ぶ", () => {
    expect(skillOptionGroups().map((g) => g.name)).toEqual([CATEGORY.FORWARD, CATEGORY.SIDE, CATEGORY.BACKWARD]);
  });

  it("どの技も1つの群にちょうど1回だけ入る", () => {
    const ids = skillOptionGroups().flatMap((g) => g.skills.map((s) => s.id));
    expect(ids.sort()).toEqual(skillOptions().map((s) => s.id).sort());
  });

  it("各技は自分の系統の群に入る", () => {
    skillOptionGroups().forEach((g) => g.skills.forEach((s) => expect(s.category).toBe(g.name)));
  });

  it("ジュニアでは2回宙返り系が群からも消える", () => {
    const ids = skillOptionGroups(true).flatMap((g) => g.skills.map((s) => s.id));
    expect(ids).not.toContain("e_doublelay");
    expect(ids.sort()).toEqual(skillOptions(true).map((s) => s.id).sort());
  });
});

describe("実施できる向きで選択肢を絞る", () => {
  const idsAfter = (prev?: string, junior = false) =>
    skillOptionGroups(junior, skillFlowAfter(prev)).flatMap((g) => g.skills.map((s) => s.id));

  it("後方系はどこでも選べる（入れない位置ではロンダートを補う）", () => {
    [undefined, "a_handspring", "b_backhalf", "b_divefront"].forEach((prev) => {
      expect(idsAfter(prev)).toContain("b_backsalto");
    });
  });

  const groupsAfter = (prev?: string) => skillOptionGroups(false, skillFlowAfter(prev)).map((g) => g.name);

  it("ロンダート・バク転からは後方系しか出さない", () => {
    ["a_roundoff", "a_flicflac"].forEach((prev) => {
      expect(groupsAfter(prev)).toEqual([CATEGORY.BACKWARD]);
      expect(idsAfter(prev)).toContain("b_backlayout");
    });
  });

  it("宙返りの後はどの系統も選べる（前方系へ戻るのは実用的でなくても可能）", () => {
    ["b_backsalto", "b_backlayout", "d_back2twist", "b_fronthalf", "b_front", "b_backhalf", "b_sidesalto"].forEach(
      (prev) => {
        expect(groupsAfter(prev)).toEqual([CATEGORY.FORWARD, CATEGORY.SIDE, CATEGORY.BACKWARD]);
      },
    );
  });

  it("ロンダートを挟まずに後方系へ入れるのは後ろ向きで終わる技の後だけ", () => {
    // 前方の半ひねり・後方の0〜整数ひねりは後ろ向きで終わる
    ["b_fronthalf", "tw:front:1.5:layout", "b_backsalto", "d_back2twist", "b_tempo"].forEach((prev) =>
      expect(leadsBackward(prev)).toBe(true),
    );
    // 前方の0〜整数ひねり・後方の半ひねり・ダイビング前宙は前向きで終わる
    ["b_front", "c_front1full", "d_frontlay1", "b_backhalf", "c_back15", "d_backlay25", "b_divefront"].forEach(
      (prev) => expect(leadsBackward(prev)).toBe(false),
    );
  });

  it("テンポ宙返り・テンポひねり（1回ひねり）は後ろ向きで終わる", () => {
    expect(leadsBackward("b_tempo")).toBe(true);
    expect(leadsBackward("c_tempotwist")).toBe(true);
  });

  it("ロンダート・バク転以外の後は前方系も側方系も選べる", () => {
    ["b_backhalf", "c_back15", "d_backlay25", "b_divefront", "a_handspring", "b_front", undefined].forEach((prev) => {
      const ids = idsAfter(prev);
      expect(ids).toContain("b_front");
      expect(ids).toContain("a_roundoff");
      expect(ids).toContain("b_sidesalto");
    });
  });

  it("組み立てたひねりの技も向きで判定する", () => {
    expect(isBackwardSalto("tw:back:2.5:pike")).toBe(true);
    expect(isBackwardSalto("tw:front:1.5:layout")).toBe(false);
    // 2回ひねり（整数）は後ろ向きに降りるのでそのまま後方系へ、2回半ひねりは前向き
    expect(leadsBackward("tw:back:2:pike")).toBe(true);
    expect(leadsBackward("tw:back:2.5:pike")).toBe(false);
  });

  it("向きの制限とジュニアの禁止は両方かかる", () => {
    const ids = idsAfter("a_roundoff", true);
    expect(ids).not.toContain("d_doubleback");
    expect(ids).toContain("b_backsalto");
  });

  it("既定（位置を渡さない）ときは全部出す", () => {
    const ids = skillOptionGroups().flatMap((g) => g.skills.map((s) => s.id));
    expect(ids).toContain("b_front");
    expect(ids).toContain("b_backsalto");
  });
});

describe("後方系に入るときはロンダートを補う", () => {
  const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });
  const needs = (items: Item[]) => needsRoundoffBefore(items, items.length - 1);

  it("何も無いところでいきなり後方の宙返りを選んだら補う", () => {
    expect(needs([skill("b_backsalto")])).toBe(true);
    expect(needs([{ kind: "throw", throwTypes: [], reqTypes: [] }, skill("b_backlayout")])).toBe(true);
  });

  it("立ちバク転・前方系・側宙はそのまま", () => {
    expect(needs([skill("a_flicflac")])).toBe(false);
    expect(needs([skill("b_front")])).toBe(false);
    expect(needs([skill("b_sidesalto")])).toBe(false);
    expect(needs([skill("a_roundoff")])).toBe(false);
  });

  it("ロンダート・バク転・後ろ向きに降りる宙返りの後は補わない", () => {
    expect(needs([skill("a_roundoff"), skill("a_flicflac")])).toBe(false);
    expect(needs([skill("a_roundoff"), skill("b_backsalto")])).toBe(false);
    expect(needs([skill("a_roundoff"), skill("b_backsalto"), skill("b_backlayout")])).toBe(false);
  });

  it("前方の半ひねりの後はそのまま後方系に入れる", () => {
    expect(needs([skill("a_handspring"), skill("b_fronthalf"), skill("b_backsalto")])).toBe(false);
    expect(needs([skill("b_fronthalf"), skill("a_flicflac")])).toBe(false);
  });

  it("前方系・半ひねり系・ダイビング前宙の後に後方系を選んだら補う", () => {
    expect(needs([skill("a_handspring"), skill("b_backsalto")])).toBe(true);
    expect(needs([skill("b_front"), skill("a_flicflac")])).toBe(true);
    expect(needs([skill("a_roundoff"), skill("b_backhalf"), skill("b_backsalto")])).toBe(true);
    expect(needs([skill("a_roundoff"), skill("c_back15"), skill("a_flicflac")])).toBe(true);
    expect(needs([skill("a_roundoff"), skill("b_divefront"), skill("b_backsalto")])).toBe(true);
  });

  it("投げ・キャッチはタンブリングの流れを切らない", () => {
    const items: Item[] = [
      skill("a_roundoff"),
      { kind: "catch", catchTypes: [], catchTwo: false },
      skill("b_backsalto"),
    ];
    expect(needs(items)).toBe(false);
    expect(prevSkillId(items, 2)).toBe("a_roundoff");
  });

  it("技が未選択なら何もしない", () => {
    expect(needs([skill("")])).toBe(false);
  });
});

describe("徒手動作の選択肢は縦回転・横回転でまとめる", () => {
  it("縦回転・横回転の順に並ぶ", () => {
    expect(motionOptionGroupsFor().map((g) => g.name)).toEqual(["縦回転", "横回転"]);
  });

  it("シェネ・転がりは横回転、それ以外の回転系は縦回転", () => {
    const groups = motionOptionGroupsFor();
    const horizontal = groups.find((g) => g.name === "横回転")!.options.map((o) => o.id);
    const vertical = groups.find((g) => g.name === "縦回転")!.options.map((o) => o.id);
    expect(horizontal.sort()).toEqual(["chene", "roll"]);
    expect(vertical).toContain("fwd_roll");
    expect(vertical).toContain("td_rise");
    expect(vertical).toContain("a_cartwheel"); // 徒手扱いの転回技は縦の一回転
  });

  it("選択肢を落とさず、群の中の並び順は motionOptionsFor と同じ", () => {
    const all = motionOptionGroupsFor("chene").flatMap((g) => g.options.map((o) => o.id));
    expect(all.sort()).toEqual(MOTION_OPTIONS.map((o) => o.id).sort());
    const ordered = motionOptionsFor("chene").map((o) => o.id);
    const vertical = motionOptionGroupsFor("chene").find((g) => g.name === "縦回転")!.options.map((o) => o.id);
    expect(vertical).toEqual(ordered.filter((id) => vertical.includes(id)));
  });
});
