import { describe, it, expect } from "vitest";
import {
  SKILL_LIST,
  TWIST_ID_PREFIX,
  buildTwistSkillId,
  parseTwistSkillId,
  skillDef,
  skillDifficulty,
  twistDifficulty,
  twistLabel,
  twistName,
} from "../constants";
import type { TwistParams } from "../types";

const back = (twist: number, posture: TwistParams["posture"] = "tuck"): TwistParams => ({ base: "back", twist, posture });
const front = (twist: number, posture: TwistParams["posture"] = "tuck"): TwistParams => ({ base: "front", twist, posture });

describe("ひねり・姿勢からの難度（§3.6.2）", () => {
  it("後方系は姿勢によらずひねり回数で決まる", () => {
    (["tuck", "pike", "layout"] as const).forEach((p) => {
      expect(twistDifficulty(back(0, p))).toBe("B");
      expect(twistDifficulty(back(0.5, p))).toBe("B");
      expect(twistDifficulty(back(1, p))).toBe("C");
      expect(twistDifficulty(back(1.5, p))).toBe("C");
      expect(twistDifficulty(back(2, p))).toBe("D");
      expect(twistDifficulty(back(2.5, p))).toBe("D");
      expect(twistDifficulty(back(3, p))).toBe("E");
      expect(twistDifficulty(back(3.5, p))).toBe("E");
    });
  });

  it("前方系は伸身だけ1段階上がる", () => {
    // かかえ込み・屈身は後方系と同じ表
    expect(twistDifficulty(front(0))).toBe("B");
    expect(twistDifficulty(front(0.5))).toBe("B");
    expect(twistDifficulty(front(1))).toBe("C");
    expect(twistDifficulty(front(1, "pike"))).toBe("C");
    // 伸身：前方伸身宙返り=C、1回ひねり=D、1回半=D、2回ひねり=E
    expect(twistDifficulty(front(0, "layout"))).toBe("C");
    expect(twistDifficulty(front(1, "layout"))).toBe("D");
    expect(twistDifficulty(front(1.5, "layout"))).toBe("D");
    expect(twistDifficulty(front(2, "layout"))).toBe("E");
    expect(twistDifficulty(front(3, "layout"))).toBe("E"); // 上限E
  });

  it("名前を組み立てる", () => {
    expect(twistName(back(0))).toBe("後方宙返り");
    expect(twistName(back(0.5, "layout"))).toBe("後方伸身宙返り半ひねり");
    expect(twistName(back(1.5, "pike"))).toBe("後方屈伸宙返り1回半ひねり");
    expect(twistName(front(1, "layout"))).toBe("伸身前宙1回ひねり");
    expect(twistLabel(0)).toBe("なし");
    expect(twistLabel(2.5)).toBe("2回半ひねり");
  });
});

describe("技idの組み立てと復元", () => {
  it("一覧にある組み合わせは既存のidになる（重複判定が食い違わない）", () => {
    expect(buildTwistSkillId(back(0))).toBe("b_backsalto");
    expect(buildTwistSkillId(back(0.5, "layout"))).toBe("b_backlayhalf");
    expect(buildTwistSkillId(back(1.5))).toBe("c_back15");
    expect(buildTwistSkillId(front(1, "layout"))).toBe("d_frontlay1");
    expect(buildTwistSkillId(front(0))).toBe("b_front");
  });

  it("一覧に無い組み合わせは合成idになり、技として解決できる", () => {
    const id = buildTwistSkillId(front(0, "layout")); // 前方伸身宙返り（一覧に無い）
    expect(id.startsWith(TWIST_ID_PREFIX)).toBe(true);
    const def = skillDef(id)!;
    expect(def.name).toBe("伸身前宙");
    expect(def.difficulty).toBe("C");
    expect(def.isSalto).toBe(true);
    expect(def.category).toBe("前方系");
  });

  it("既存idからひねり・姿勢に戻せる", () => {
    expect(parseTwistSkillId("c_backlay15")).toEqual(back(1.5, "layout"));
    expect(parseTwistSkillId("e_frontlay2")).toEqual(front(2, "layout"));
    // 組み立てで表せない技は null
    expect(parseTwistSkillId("b_sidesalto")).toBeNull();
    expect(parseTwistSkillId("b_tempo")).toBeNull();
    expect(parseTwistSkillId("")).toBeNull();
    expect(parseTwistSkillId("tw:bogus:1:tuck")).toBeNull();
  });

  it("往復しても同じ内容になる", () => {
    SKILL_LIST.filter((s) => s.twist).forEach((s) => {
      expect(buildTwistSkillId(s.twist!)).toBe(s.id);
      expect(skillDef(s.id)!.difficulty).toBe(twistDifficulty(s.twist!));
    });
  });

  it("ジュニアでは組み立てた後方宙返り半ひねりもC難度", () => {
    const id = buildTwistSkillId(back(0.5, "pike")); // 一覧に無い（屈伸の半ひねり）
    expect(skillDifficulty(id)).toBe("B");
    expect(skillDifficulty(id, true)).toBe("C");
  });
});
