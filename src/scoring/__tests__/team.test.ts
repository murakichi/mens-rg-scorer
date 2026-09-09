import { describe, it, expect } from "vitest";
import {
  computeTeamScore,
  emptySeries,
  motionSeries,
  normalizeTeamState,
  type TeamState,
  type Cell,
} from "../team";
import { handElementDef } from "../constants";

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

describe("伸腕屈身力倒立（シンピ）は閉脚と開脚で難度が違う", () => {
  const motion = (id: string): Cell => ({ type: "motion", motionId: id });
  const all5 = (...cells: Cell[]): TeamState => {
    const ser = emptySeries(cells.length);
    for (let l = 0; l < 5; l++) cells.forEach((c, s) => (ser.lanes[l][s] = { ...c }));
    return { series: [ser] };
  };

  it("閉脚は団体D、開脚は団体C", () => {
    expect(seriesDiff(all5(motion("h8")))).toBe("D");
    expect(seriesDiff(all5(motion("h8b")))).toBe("C");
  });

  it("個人の難度は閉脚C・開脚B", () => {
    expect(handElementDef("h8")).toMatchObject({ solo: "C", team: "D" });
    expect(handElementDef("h8b")).toMatchObject({ solo: "B", team: "C" });
  });
});

describe("徒手シリーズ（全員実施・content: motion）", () => {
  const motionSer = (motionId: string): TeamState => {
    const ser = motionSeries();
    ser.lanes[0][0] = { type: "motion", motionId };
    return { series: [ser] };
  };

  it("徒手シリーズは1レーン・1スロットの同時実施シリーズ", () => {
    const ser = motionSeries();
    expect(ser.mode).toBe("allTogether");
    expect(ser.content).toBe("motion");
    expect(ser.slots).toBe(1);
    expect(ser.lanes).toHaveLength(1);
  });

  it("選んだ徒手要素の団体列の難度がシリーズ難度になる", () => {
    expect(seriesDiff(motionSer("j2"))).toBe("B");
    expect(seriesDiff(motionSer("h4"))).toBe("D");
    expect(seriesDiff(motionSer(""))).toBeNull();
  });

  it("転回シリーズの content は skill", () => {
    expect(emptySeries(3).content).toBe("skill");
  });
});

describe("normalizeTeamState — 徒手シリーズとジュニアの復元", () => {
  it("content 未指定でも徒手セルがあれば徒手シリーズに正規化する（旧データ互換）", () => {
    const legacy = {
      series: [
        {
          mode: "normal",
          slots: 3,
          lanes: [
            [{ type: "motion", motionId: "h4" }, { type: "skill", skillId: "b_front" }, { type: "empty" }],
            ...Array.from({ length: 4 }, () => [{ type: "empty" }, { type: "empty" }, { type: "empty" }]),
          ],
          crossGroups: [],
          unionGroups: [],
          executionDeduction: 0.5,
        },
      ],
    };
    const n = normalizeTeamState(legacy)!;
    const ser = n.series[0];
    expect(ser.content).toBe("motion");
    expect(ser.mode).toBe("allTogether");
    expect(ser.slots).toBe(1);
    expect(ser.lanes).toEqual([[{ type: "motion", motionId: "h4" }]]);
    expect(ser.executionDeduction).toBe(0.5);
  });

  it("ジュニアフラグを往復できる", () => {
    const base = { series: [emptySeries(2)], junior: true };
    expect(normalizeTeamState(base)!.junior).toBe(true);
    expect(normalizeTeamState({ series: [emptySeries(2)] })!.junior).toBe(false);
  });
});

describe("団体のジュニア適用規則（§10 変更規則1）", () => {
  const chunk = (...ids: string[]): TeamState => {
    const ser = emptySeries(ids.length);
    ids.forEach((id, s) => (ser.lanes[0][s] = skill(id)));
    return { series: [ser] };
  };
  const laneDiff = (t: TeamState) => computeTeamScore(t).analysis[0].lanes[0][0].adjDiff;

  it("バク転→後方伸身宙返りは一般でB、ジュニアでC", () => {
    const t = chunk("a_flicflac", "b_backlayout");
    expect(laneDiff(t)).toBe("B");
    expect(laneDiff({ ...t, junior: true })).toBe("C");
  });

  it("バク転単独・後方伸身宙返り単独はジュニアでも変わらない", () => {
    expect(laneDiff({ ...chunk("b_backlayout"), junior: true })).toBe("B");
    expect(laneDiff({ ...chunk("a_flicflac"), junior: true })).toBeNull();
  });

  it("技ごとの難度認定（ダイビング前宙＝C）も団体に効く", () => {
    expect(laneDiff(chunk("b_divefront"))).toBe("B");
    expect(laneDiff({ ...chunk("b_divefront"), junior: true })).toBe("C");
  });

  it("5人同時の格上げとジュニアの連続技認定は高い方を採る", () => {
    // 5人同時：バク転A→B・後方伸身宙返りB→C の連続 = 2+(3-1) = 4 = D。
    // ジュニアの連続技認定（まとめてC）より格上げの方が高いので D のまま。
    const t = normalAll5("a_flicflac", "b_backlayout");
    expect(seriesDiff(t)).toBe("D");
    expect(seriesDiff({ ...t, junior: true })).toBe("D");
  });
});

describe("実施減点(E)はジュニアのみ1シリーズ最大1.0点", () => {
  const withExec = (exec: number, junior: boolean): TeamState => {
    const ser = emptySeries(1);
    ser.executionDeduction = exec;
    return { series: [ser], junior };
  };

  it("一般は上限なし", () => {
    expect(computeTeamScore(withExec(1.5, false)).seriesExecutionDeduction).toBeCloseTo(1.5, 5);
  });

  it("ジュニアは1.0点で頭打ち", () => {
    expect(computeTeamScore(withExec(1.5, true)).seriesExecutionDeduction).toBeCloseTo(1.0, 5);
    expect(computeTeamScore(withExec(0.7, true)).seriesExecutionDeduction).toBeCloseTo(0.7, 5);
  });
});
