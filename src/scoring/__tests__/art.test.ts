import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { artAutoDeductions } from "../art";
import { analyzeSeries } from "../analysis";
import { ART_DEDUCTION_ITEMS, stepDeduction } from "../constants";
import type { ApparatusKey, Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string, hasApparatus = true, isThrow = false): Item => ({
  kind: "skill",
  skillId,
  hasApparatus,
  isThrow,
});
const motion = (motionId: string, count = 1): Item => ({ kind: "motion", motionId, count });

/** 自動判定だけを取り出す（投げ方・受け方の種類数は computeScore の集計をそのまま渡す） */
const auto = (series: Series[], apparatus: ApparatusKey = "stick") => {
  const r = computeScore(series, apparatus);
  const rows = artAutoDeductions({
    series,
    analysis: series.map((s) => analyzeSeries(s, false)),
    apparatus,
    junior: false,
    throwKindCount: r.throwKindCount,
    catchKindCount: r.catchKindCount,
  });
  return new Map(rows.map((x) => [x.id, x]));
};
const value = (series: Series[], id: string, apparatus: ApparatusKey = "stick") =>
  auto(series, apparatus).get(id)!.value;

describe("stepDeduction", () => {
  it("境界を満たした数だけ 0.1 ずつ減点する", () => {
    expect(stepDeduction(5, [5, 3])).toBe(0);
    expect(stepDeduction(4, [5, 3])).toBeCloseTo(0.1, 5);
    expect(stepDeduction(3, [5, 3])).toBeCloseTo(0.1, 5);
    expect(stepDeduction(2, [5, 3])).toBeCloseTo(0.2, 5);
    expect(stepDeduction(0, [0.8, 0.6, 0.4, 0.2])).toBeCloseTo(0.4, 5);
  });
});

describe("自動判定する項目・しない項目", () => {
  it("5項目が自動、4項目（リズム・空間・独創性・運動量）は手入力のまま", () => {
    const autoIds = ART_DEDUCTION_ITEMS.filter((x) => x.auto).map((x) => x.id);
    const manualIds = ART_DEDUCTION_ITEMS.filter((x) => !x.auto).map((x) => x.id);
    expect(autoIds).toEqual(["handVariety", "tumVariety", "appVariety", "appInTumbling", "handRatio"]);
    expect(manualIds).toEqual(["rhythm", "space", "originality", "volume"]);
  });

  it("自動判定は項目の上限で丸める", () => {
    // 何も入力していない演技は全観点が最低評価になるが、項目の上限は超えない
    const rows = auto([]);
    ART_DEDUCTION_ITEMS.filter((x) => x.auto).forEach((item) => {
      expect(rows.get(item.id)!.value).toBeLessThanOrEqual(item.max);
    });
  });
});

describe("転回系の種類・組み合わせの多様性", () => {
  const line = (...ids: string[]) => S(...ids.map((id) => skill(id)));

  it("技の種類・姿勢・形がそろっていれば減点なし", () => {
    const series = [
      line("a_roundoff", "c_back15", "b_front"),
      line("a_roundoff", "b_backlayout", "a_flicflac", "b_backsalto"),
      S({ kind: "throw" }, skill("b_sidesalto", true, true), { kind: "catch" }),
    ];
    expect(value(series, "tumVariety")).toBe(0);
  });

  it("同じ宙返りだけの構成は3観点とも減点になる", () => {
    const series = [line("a_roundoff", "b_backsalto"), line("a_roundoff", "b_backsalto")];
    // 技の種類1（−0.2）＋姿勢1種類（−0.1）＋形1種類（−0.2）＝0.5（上限）
    expect(value(series, "tumVariety")).toBeCloseTo(0.5, 5);
  });

  it("宙返りの種類が3〜4なら中間の減点", () => {
    const series = [line("a_roundoff", "c_back15", "b_front"), line("b_sidesalto")];
    const notes = auto(series).get("tumVariety")!.notes;
    expect(notes[0]).toContain("3種類");
    expect(value(series, "tumVariety")).toBeCloseTo(0.2, 5); // 種類0.1＋形0.1
  });
});

describe("徒手系の種類・組み合わせの多様性", () => {
  const thrown = (...items: Item[]) => S({ kind: "throw" }, ...items, { kind: "catch" });

  it("動作の種類・回転軸・組み合わせがそろえば減点なし", () => {
    const series = [
      thrown(motion("chene", 2), motion("fwd_roll", 1)),
      thrown(motion("back_roll", 1), motion("roll", 1)),
      thrown(motion("gambi", 1)),
      thrown(motion("td_rise", 1), motion("chene", 1)),
    ];
    expect(value(series, "handVariety")).toBe(0);
  });

  it("シェネだけの構成は種類・軸・組み合わせで減点する", () => {
    const series = [thrown(motion("chene", 2)), thrown(motion("chene", 2))];
    // 種類1（−0.2）＋軸1種類（−0.1）＋組み合わせ1種類（−0.2）
    expect(value(series, "handVariety")).toBeCloseTo(0.5, 5);
  });

  it("シェネは腕の使い方が違えば別の種類として数える（Q&A Q28）", () => {
    const hands = (handsType: string): Item => ({ kind: "motion", motionId: "chene", count: 1, hands: true, handsType });
    const one = [thrown(motion("chene", 1)), thrown(motion("chene", 1))];
    const two = [thrown(motion("chene", 1)), thrown(hands("oneup"))];
    expect(auto(two).get("handVariety")!.notes[0]).toContain("2種類");
    expect(value(two, "handVariety")).toBeLessThan(value(one, "handVariety"));
  });

  it("0回の徒手動作は数えない", () => {
    const series = [thrown(motion("chene", 1)), thrown(motion("fwd_roll", 0))];
    expect(auto(series).get("handVariety")!.notes[0]).toContain("1種類");
  });

  it("側転など徒手扱いの転回技も徒手動作として数える", () => {
    const series = [S(skill("a_cartwheel")), S({ kind: "throw" }, motion("chene", 1), { kind: "catch" })];
    expect(auto(series).get("handVariety")!.notes[0]).toContain("2種類");
  });
});

describe("さまざまな操作", () => {
  it("投げ方・受け方の種類と組み合わせが多ければ減点なし", () => {
    const series = [
      S({ kind: "throw" }, { kind: "catch" }),
      S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }),
      S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch", catchTypes: ["nonhand"] }),
      S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch", catchTypes: ["other"] }),
      S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch" }),
    ];
    expect(value(series, "appVariety")).toBe(0);
  });

  it("同じ投げ受けの繰り返しは種類・組み合わせとも減点になる", () => {
    const series = [S({ kind: "throw" }, { kind: "catch" }), S({ kind: "throw" }, { kind: "catch" })];
    expect(value(series, "appVariety")).toBeCloseTo(0.4, 5);
  });
});

describe("転回中の操作", () => {
  const tumbling = (...items: Item[]) => S(...items);

  it("手具を持てる転回技をすべて操作していれば減点なし", () => {
    const series = [tumbling(skill("a_roundoff"), skill("b_backsalto"))];
    expect(value(series, "appInTumbling")).toBe(0);
    expect(auto(series).get("appInTumbling")!.notes[0]).toContain("2/2");
  });

  it("操作の割合が下がるほど段階的に減点する", () => {
    const of = (ops: boolean[]) => value([S(...ops.map((on) => skill("b_front", on)))], "appInTumbling");
    expect(of([true, true, true, true, true])).toBe(0); // 10割
    expect(of([true, true, true, true, false])).toBe(0); // 8割はしきい値ちょうどで減点なし
    expect(of([true, true, true, false, false])).toBeCloseTo(0.1, 5); // 6割
    expect(of([true, true, false, false, false])).toBeCloseTo(0.2, 5); // 4割
    expect(of([true, false, false, false, false])).toBeCloseTo(0.3, 5); // 2割
    expect(of([false, false, false, false, false])).toBeCloseTo(0.4, 5); // 操作なし
  });

  it("手具が空中にある間の技は操作できないので分母に入れない", () => {
    // 投げ→（手元が空の間の技）→キャッチ。操作できるのは投げを実施した技だけ
    const series = [
      S({ kind: "throw" }, skill("b_front", false), skill("a_roundoff", false), { kind: "catch" }),
    ];
    expect(value(series, "appInTumbling")).toBe(0);
    expect(auto(series).get("appInTumbling")!.notes[0]).toBe("手具を持てる転回技なし");
  });

  it("技の最中の投げは、その技自体は操作ありとして数える", () => {
    const series = [S(skill("a_roundoff"), skill("b_front", true, true), { kind: "catch" })];
    expect(auto(series).get("appInTumbling")!.notes[0]).toContain("2/2");
  });

  it("側転（徒手扱い）は転回中の操作に数えない", () => {
    const series = [S(skill("a_cartwheel", false), skill("b_front", true))];
    expect(auto(series).get("appInTumbling")!.notes[0]).toContain("1/1");
  });
});

describe("徒手の割合", () => {
  const tum = () => S(skill("a_roundoff"), skill("b_backsalto"));
  const thr = () => S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 2 }, { kind: "catch" });

  it("徒手系ユニットが半分以上なら減点なし", () => {
    expect(value([tum(), tum(), tum(), thr(), thr(), thr()], "handRatio")).toBe(0);
  });

  it("徒手系が少ないほど段階的に減点する", () => {
    expect(value([tum(), tum(), tum(), thr(), thr()], "handRatio")).toBeCloseTo(0.1, 5); // 2/5
    expect(value([tum(), tum(), tum(), thr()], "handRatio")).toBeCloseTo(0.3, 5); // 1/4
    expect(value([tum(), tum(), tum(), tum(), tum()], "handRatio")).toBeCloseTo(0.4, 5); // 0/5
  });
});

describe("computeScore への反映", () => {
  it("自動判定した分がA減点に入る", () => {
    const poor = [S(skill("a_roundoff"), skill("b_backsalto", false))];
    const r = computeScore(poor, "stick");
    const sum = r.artRows.reduce((s, x) => s + x.value, 0);
    expect(r.artDeduction).toBeCloseTo(sum, 5);
    expect(r.artRows.filter((x) => x.auto).some((x) => x.value > 0)).toBe(true);
  });

  it("その手具で入力できない内容は自動判定にも効かない（stripForApparatus 後を見る）", () => {
    // ロープ跳びはスティックでは入力できないので、徒手系ユニットとして数えない
    const series = [S({ kind: "ropeJump", jumpId: "3fc", isMoving6m: false }), S(skill("b_front"))];
    const stick = computeScore(series, "stick");
    const rope = computeScore(series, "rope");
    const of = (r: ReturnType<typeof computeScore>) => r.artRows.find((x) => x.id === "handRatio")!.value;
    expect(of(stick)).toBeGreaterThan(of(rope));
  });
});
