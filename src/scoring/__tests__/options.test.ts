import { describe, it, expect } from "vitest";
import {
  CATEGORY,
  MOTION_OPTIONS,
  motionOptionGroupsFor,
  motionOptionsFor,
  skillOptionGroups,
  skillOptions,
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
