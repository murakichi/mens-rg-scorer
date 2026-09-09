import { describe, it, expect } from "vitest";
import { calcTumblingDifficulty, analyzeSeries } from "../analysis";
import {
  skillDifficulty,
  skillAllowed,
  skillOptions,
  SKILL_LIST,
  JUNIOR_THROW_COUNT_REQUIRED,
  THROW_COUNT_REQUIRED,
} from "../constants";
import { computeScore } from "../score";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
/** 投げ→キャッチ1組 = 投げ1回 */
const throwOnce = (): Series => S({ kind: "throw" }, { kind: "catch" });

describe("ジュニア適用規則 — 難度認定（§10 変更規則1-5）", () => {
  it("ダイビング前宙・後方宙返り半ひねり・後方伸身宙返り半ひねりは一般でB、ジュニアでC", () => {
    for (const id of ["b_divefront", "b_backhalf", "b_backlayhalf"]) {
      expect(skillDifficulty(id)).toBe("B");
      expect(skillDifficulty(id, true)).toBe("C");
    }
  });

  it("その他の技の難度はジュニアでも変わらない", () => {
    expect(skillDifficulty("b_backsalto", true)).toBe("B");
    expect(skillDifficulty("a_cartwheel", true)).toBe("A");
    expect(skillDifficulty("e_doublelay", true)).toBe("E");
  });

  it("calcTumblingDifficulty がジュニア難度を使う", () => {
    expect(calcTumblingDifficulty(["b_backhalf"], false)).toBe("B");
    expect(calcTumblingDifficulty(["b_backhalf"], false, true)).toBe("C");
    // 2技目以降は (難度-1) 加算：B+B → C、ジュニアは C+C → E
    expect(calcTumblingDifficulty(["b_divefront", "b_backhalf"], false)).toBe("C");
    expect(calcTumblingDifficulty(["b_divefront", "b_backhalf"], false, true)).toBe("E");
  });

  it("analyzeSeries のユニット難度に反映される", () => {
    const ser = S({ kind: "skill", skillId: "b_divefront" }, { kind: "catch" });
    expect(analyzeSeries(ser).units[0].finalDiff).toBe("B");
    expect(analyzeSeries(ser, true).units[0].finalDiff).toBe("C");
  });

  it("computeScore の難度点に反映される（B=0.2 → C=0.3）", () => {
    const routine = [S({ kind: "skill", skillId: "b_backhalf" }, { kind: "catch" })];
    expect(computeScore(routine, "stick").tumblingScore).toBeCloseTo(0.2, 5);
    expect(computeScore(routine, "stick", { junior: true }).tumblingScore).toBeCloseTo(0.3, 5);
  });
});

describe("ジュニア適用規則 — 投げ上げの最低回数", () => {
  it("必要回数は一般3回・ジュニア2回", () => {
    expect(THROW_COUNT_REQUIRED).toBe(3);
    expect(JUNIOR_THROW_COUNT_REQUIRED).toBe(2);
    expect(computeScore([], "stick").requiredThrowCount).toBe(3);
    expect(computeScore([], "stick", { junior: true }).requiredThrowCount).toBe(2);
  });

  it("投げ2回：一般は減点、ジュニアは減点なし", () => {
    // 同一構成の重複シリーズは投げ回数に不算入のため、技術タグで別シリーズにする
    const routine = [
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
    ];
    const normal = computeScore(routine, "stick");
    expect(normal.totalThrowCount).toBe(2);
    expect(normal.throwCountDeduction).toBeCloseTo(0.3, 5);
    expect(normal.required.find((c) => c.key === "count3")?.passed).toBe(false);

    const junior = computeScore(routine, "stick", { junior: true });
    expect(junior.totalThrowCount).toBe(2);
    expect(junior.throwCountDeduction).toBe(0);
    expect(junior.required.find((c) => c.key === "count3")?.passed).toBe(true);
    expect(junior.required.find((c) => c.key === "count3")?.label).toBe("投げを2回以上実施");
  });

  it("投げ1回はジュニアでも減点", () => {
    const r = computeScore([throwOnce()], "stick", { junior: true });
    expect(r.totalThrowCount).toBe(1);
    expect(r.throwCountDeduction).toBeCloseTo(0.3, 5);
    expect(r.required.find((c) => c.key === "count3")?.passed).toBe(false);
  });

  it("A減点の差はちょうど投げ回数不足分（0.3）", () => {
    const routine = [
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
    ];
    const normal = computeScore(routine, "stick");
    const junior = computeScore(routine, "stick", { junior: true });
    expect(normal.aDeduction - junior.aDeduction).toBeCloseTo(0.3, 5);
    expect(junior.aScore - normal.aScore).toBeCloseTo(0.3, 5);
  });
});

describe("ジュニア適用規則 — 投げ上げの上限回数（5回）", () => {
  /** 内容が重ならないよう動作数を変えた投げ受けをn個並べる */
  const throws = (n: number): Series => {
    const items: Item[] = [];
    const motions = ["m1", "m2", "m3", "m4", "mv3", "m1", "m2", "m3"];
    for (let i = 0; i < n; i++) {
      items.push({ kind: "throw" }, { kind: "motion", motionId: motions[i] }, { kind: "catch" });
    }
    return { executionDeduction: 0, items };
  };

  it("上限は一般なし・ジュニア5回", () => {
    expect(computeScore([], "stick").maxThrowCount).toBeNull();
    expect(computeScore([], "stick", { junior: true }).maxThrowCount).toBe(5);
  });

  it("ジュニアで5回までは減点なし", () => {
    const r = computeScore([throws(5)], "stick", { junior: true });
    expect(r.performedThrowCount).toBe(5);
    expect(r.totalThrowCount).toBe(5);
    expect(r.overThrowCount).toBe(0);
    expect(r.throwCountOverDeduction).toBe(0);
    expect(r.required.find((c) => c.key === "countMax")?.passed).toBe(true);
  });

  it("6回目は要素として数えず、超過1回につき −0.30", () => {
    const r = computeScore([throws(6)], "stick", { junior: true });
    expect(r.performedThrowCount).toBe(6);
    expect(r.totalThrowCount).toBe(5); // 6回目は要素にカウントしない
    expect(r.overThrowCount).toBe(1);
    expect(r.throwCountOverDeduction).toBeCloseTo(0.3, 5);
    expect(r.required.find((c) => c.key === "countMax")?.passed).toBe(false);
  });

  it("多かった分だけ減点が増える（2回超過で0.6）", () => {
    const r = computeScore([throws(7)], "stick", { junior: true });
    expect(r.overThrowCount).toBe(2);
    expect(r.throwCountOverDeduction).toBeCloseTo(0.6, 5);
    expect(r.totalThrowCount).toBe(5);
  });

  it("6回目以降の投げは難度にも算入しない", () => {
    // 1〜5投げ目は1〜4動作＋縦3動作、6投げ目に4動作(E)を置いても採用されない
    const ser: Series = {
      executionDeduction: 0,
      items: [
        ...["m1", "m1", "m1", "m1", "m1"].flatMap((m) => [
          { kind: "throw" as const },
          { kind: "motion" as const, motionId: m },
          { kind: "catch" as const },
        ]),
        { kind: "throw" as const, throwTypes: ["noview"] },
        { kind: "motion" as const, motionId: "m4" },
        { kind: "catch" as const, catchTypes: ["noview"] },
      ],
    };
    const r = computeScore([ser], "stick", { junior: true });
    // 1〜5投げ目はすべて1動作(B)で内容が同じなので難度は1つ分だけ、
    // 6投げ目のE難度(0.7)は上限超過で不採用
    expect(r.handScore).toBeCloseTo(0.2, 5);
    // 技術加点も6投げ目の分は付かない
    expect(r.techniqueBonus).toBe(0);
  });

  it("一般は6回以上でも減点なし・チェック項目も出ない", () => {
    const r = computeScore([throws(6)], "stick");
    expect(r.throwCountOverDeduction).toBe(0);
    expect(r.totalThrowCount).toBe(6);
    expect(r.required.find((c) => c.key === "countMax")).toBeUndefined();
  });

  it("A減点の差はちょうど超過分（0.3）", () => {
    const five = computeScore([throws(5)], "stick", { junior: true });
    const six = computeScore([throws(6)], "stick", { junior: true });
    expect(six.aDeduction - five.aDeduction).toBeCloseTo(0.3, 5);
  });
});

describe("ジュニア適用規則 — 2回宙返り系は禁止", () => {
  const doubles = ["d_doubleback", "e_doublelay", "e_divedouble", "e_moonsault", "e_rudolph"];

  it("一般では選択肢に出る", () => {
    const ids = skillOptions().map((s) => s.id);
    doubles.forEach((id) => expect(ids).toContain(id));
    expect(skillOptions()).toHaveLength(SKILL_LIST.length);
  });

  it("ジュニアでは選択肢から外れる", () => {
    const ids = skillOptions(true).map((s) => s.id);
    doubles.forEach((id) => expect(ids).not.toContain(id));
    expect(ids).toContain("b_front");
    expect(ids).toContain("d_back2twist"); // ひねり技は2回宙返りではないので残る
    expect(skillOptions(true)).toHaveLength(SKILL_LIST.length - doubles.length);
  });

  it("skillAllowed が実施可否を返す", () => {
    expect(skillAllowed("d_doubleback")).toBe(true);
    expect(skillAllowed("d_doubleback", true)).toBe(false);
    expect(skillAllowed("b_front", true)).toBe(true);
  });
});

describe("ジュニア適用規則 — 実施減点(E)の上限は団体のみ", () => {
  it("個人はジュニアでも1シリーズの実施減点に上限を設けない", () => {
    const ser: Series = { ...throwOnce(), executionDeduction: 1.5 };
    expect(computeScore([ser], "stick").executionDeduction).toBeCloseTo(1.5, 5);
    expect(computeScore([ser], "stick", { junior: true }).executionDeduction).toBeCloseTo(1.5, 5);
  });
});
