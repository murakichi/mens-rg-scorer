import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { techOptionKind, THROW_OPTIONS_COMMON, CATCH_OPTIONS_COMMON, THROW_OPTIONS_SIDE, THROW_OPTIONS_NO_ROTATION } from "../constants";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

// 入力画面の目印：どのチェックが技術加点になるか（採点の bonusThrowTypes と同じ分け方）
describe("投げ方・受け方のチェックの分類", () => {
  it("視野外・手以外・手具を使ったは加点、横投げ・無回転は種類だけ", () => {
    [...THROW_OPTIONS_COMMON, ...CATCH_OPTIONS_COMMON].forEach((o) => expect(techOptionKind(o.id)).toBe("bonus"));
    expect(techOptionKind("useapp")).toBe("bonus");
    [...THROW_OPTIONS_SIDE, ...THROW_OPTIONS_NO_ROTATION].forEach((o) => expect(techOptionKind(o.id)).toBe("kind"));
  });

  it("分類と実際の採点が一致する（kind のチェックだけの投げは加点0）", () => {
    const side = computeScore([S({ kind: "throw", throwTypes: ["side"] }, { kind: "catch" })], "stick");
    expect(side.techniqueBonus).toBe(0);
    const noview = computeScore([S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" })], "stick");
    expect(noview.techniqueBonus).toBeCloseTo(0.1, 5);
  });
});

// その投げ・受けが実際に技術加点になったか（SeriesBreakdown.techItems）
describe("投げ・受けごとの技術加点の状況", () => {
  it("加点・加点済みの重複・チェックなしを見分ける", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview", "nonhand"], nonHandKind: "neckShoulder" }),
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "motion", motionId: "chene", count: 1 }, { kind: "catch" }),
      ],
      "stick",
    );
    const [a, b] = r.seriesBreakdowns.map((x) => x.techItems);
    expect(a[0]).toEqual({ status: "earned", points: 0.1, bonusTags: 1 });
    expect(a[1]?.status).toBe("earned");
    expect(a[1]?.points).toBeCloseTo(0.2, 5);
    expect(b[0]).toEqual({ status: "duplicate", points: 0, bonusTags: 1 });
    expect(b[1]).toBeNull(); // 徒手動作は対象外
    expect(b[2]).toEqual({ status: "none", points: 0, bonusTags: 0 });
    // 合計とも一致する
    const sum = r.seriesBreakdowns.flatMap((x) => x.techItems).reduce((s, t) => s + (t?.points ?? 0), 0);
    expect(sum).toBeCloseTo(r.techniqueBonus, 5);
  });

  it("技の最中の投げ・受けにも状況が付き、重複シリーズは dupSeries", () => {
    const s = () => S({ kind: "skill", skillId: "b_kirimomi", isThrow: true, throwTypes: ["noview"] }, { kind: "catch" });
    const r = computeScore([s(), s()], "stick");
    expect(r.seriesBreakdowns[0].techItems[0]?.status).toBe("earned");
    expect(r.seriesBreakdowns[1].techItems[0]?.status).toBe("dupSeries");
  });

  it("ジュニアの上限を超えた投げは over", () => {
    const thr = (n: number) => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "motion", motionId: "chene", count: n }, { kind: "catch" });
    const r = computeScore([thr(1), thr(2), thr(3), thr(4), S({ kind: "throw" }, { kind: "catch" }), thr(5)], "stick", { junior: true });
    expect(r.seriesBreakdowns[5].techItems[0]?.status).toBe("over");
  });
});
