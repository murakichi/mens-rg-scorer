import { describe, it, expect } from "vitest";
import { computeTeamScore, emptySeries, type TeamState, type Cell } from "../team";

const skill = (id: string): Cell => ({ type: "skill", skillId: id });

/** 同時実施(allTogether)シリーズ：1レーンに連続技を並べる＝5人全員が同時同技 */
function allTogether(...ids: string[]): TeamState {
  const ser = emptySeries(ids.length);
  ser.mode = "allTogether";
  ser.lanes = [ids.map(skill)];
  return { series: [ser] };
}
/** 通常シリーズ：5レーン全員が同じ連続技を同一スロットで実施 */
function normalAll5(...ids: string[]): TeamState {
  const ser = emptySeries(ids.length);
  for (let l = 0; l < 5; l++) ids.forEach((id, s) => (ser.lanes[l][s] = skill(id)));
  return { series: [ser] };
}

const seriesDiff = (t: TeamState) => computeTeamScore(t).analysis[0].seriesDiff;

describe("団体 §6.2 5人同時同技の格上げ（格上げ後の実効難度で連続再計算）", () => {
  it("単発の5人同時同技は技+1（後方宙返りB→C）", () => {
    expect(seriesDiff(normalAll5("b_backsalto"))).toBe("C");
  });

  it("A難度の同時連続技も格上げして算入（ロンダート→バク転→ハンドスプリング→とび前転＝E）", () => {
    // 各A→B、B×4連続 = 2+1+1+1 = 5 = E
    expect(seriesDiff(allTogether("a_roundoff", "a_flicflac", "a_handspring", "a_frontroll"))).toBe("E");
    expect(seriesDiff(normalAll5("a_roundoff", "a_flicflac", "a_handspring", "a_frontroll"))).toBe("E");
  });

  it("B難度×3の同時連続は格上げ後(C×3)で再計算＝E", () => {
    // 各B→C、C×3連続 = 3+2+2 = 7→上限5 = E
    expect(seriesDiff(allTogether("b_backsalto", "b_backsalto", "b_backsalto"))).toBe("E");
  });

  it("非同時（通常の1人分の連続）は格上げなし：B×3連続＝D", () => {
    const ser = emptySeries(3);
    // 1レーンだけに技を入れる＝5人同時ではない
    ["b_backsalto", "b_backsalto", "b_backsalto"].forEach((id, s) => (ser.lanes[0][s] = skill(id)));
    expect(computeTeamScore({ series: [ser] }).analysis[0].lanes[0][0].adjDiff).toBe("D");
  });
});

describe("団体の徒手（§3.6.1 徒手系難度表）", () => {
  const motion = (id: string): Cell => ({ type: "motion", motionId: id });
  /** 5レーン全員が同じ内容を同一スロットで実施するシリーズを組む */
  const all5 = (...cells: Cell[]): TeamState => {
    const ser = emptySeries(cells.length);
    for (let l = 0; l < 5; l++) cells.forEach((c, s) => (ser.lanes[l][s] = { ...c }));
    return { series: [ser] };
  };

  it("徒手は表の団体列の難度になる", () => {
    expect(seriesDiff(all5(motion("j1")))).toBe("A"); // 閉脚から大の字とび
    expect(seriesDiff(all5(motion("j2")))).toBe("B"); // とびあがって1回以上のひねり
    expect(seriesDiff(all5(motion("b8")))).toBe("D"); // 足を保持しない180°以上の開脚片足平均立ち
    expect(seriesDiff(all5(motion("h4")))).toBe("D"); // 十字倒立
    expect(seriesDiff(all5(motion("f7")))).toBe("C"); // 開脚座（180度）仰臥位
  });

  it("徒手は5人同時でも格上げしない（団体列が5名実施の値）", () => {
    const ser = emptySeries(1);
    ser.mode = "allTogether";
    ser.lanes = [[motion("j2")]];
    expect(seriesDiff({ series: [ser] })).toBe("B");
  });

  it("徒手は連続しない（隣の技と繋がらず、高い方がシリーズ難度になる）", () => {
    // 前宙(B)→バランス(B) を並べても連続加算されない
    expect(seriesDiff(all5(skill("b_front"), motion("b1")))).toBe("C"); // 前宙は5人同時で B→C
    // 徒手を挟んだ技どうしも繋がらない
    expect(seriesDiff(all5(skill("b_front"), motion("b1"), skill("b_front")))).toBe("C");
  });

  it("徒手どうしも連続しない（最も高い徒手の難度）", () => {
    expect(seriesDiff(all5(motion("j1"), motion("b8")))).toBe("D");
  });

  it("未選択の徒手は難度なし", () => {
    expect(seriesDiff(all5(motion("")))).toBeNull();
  });
});
