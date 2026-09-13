import { describe, it, expect } from "vitest";
import {
  REQUIRE_ALL_ELEMENTS_MIN_SCORE,
  generateRoutine,
  requiresAllElements,
  saltoRepeatCount,
  usableTemplates,
} from "../generate";
import { analyzeSeries, seriesSignature } from "../analysis";
import { computeScore } from "../score";
import { newTemplateId, type SeriesTemplate } from "../templates";
import type { ApparatusKey, Item, Series } from "../types";
import type { TemplateApparatus } from "../templates";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string, hasApparatus = true): Item => ({ kind: "skill", skillId, hasApparatus, isThrow: false });
const tpl = (name: string, apparatus: TemplateApparatus, series: Series): SeriesTemplate => ({
  id: newTemplateId(),
  name,
  apparatus,
  updatedAt: Date.now(),
  series,
});

/** 候補を登録したテンプレートだけに固定する（自動生成の投げ・タンブリングを使わない） */
const noAuto = { autoThrows: false, autoTumblings: false } as const;

/** 決まった順に進む疑似乱数（テストを安定させる） */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// 必須要素をひととおり満たせるだけのテンプレート群
const throwFront = () => S({ kind: "throw" }, skill("b_front"), { kind: "catch" });
const throwSide = () => S({ kind: "throw" }, skill("b_sidesalto"), { kind: "catch" });
const throwBack = () => S({ kind: "throw" }, skill("b_backsalto"), { kind: "catch" });
const triple = () => S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"), { kind: "catch" });
const connect = () => S(skill("b_backsalto"), skill("a_flicflac"), skill("b_backsalto"), { kind: "catch" });
const cheap = () => S(skill("a_cartwheel"), { kind: "catch" });

/** 投げタンではない投げ（投げ→徒手動作→キャッチ） */
const throwMotion = (motionId: string, count: number) =>
  S({ kind: "throw" }, { kind: "motion", motionId, count }, { kind: "catch" });

const pool = (): SeriesTemplate[] => [
  tpl("投げ前", "common", throwFront()),
  tpl("投げ側", "common", throwSide()),
  tpl("投げ4シェネ", "common", throwMotion("chene", 4)),
  tpl("投げ3前転", "common", throwMotion("fwd_roll", 3)),
  tpl("投げ後", "common", throwBack()),
  tpl("三宙", "common", triple()),
  tpl("前方タンブリング", "common", S(skill("a_handspring"), skill("b_front"), { kind: "catch" })),
  tpl("側方タンブリング", "common", S(skill("a_roundoff"), skill("b_sidesalto"), { kind: "catch" })),
  tpl("つなぎ", "common", connect()),
  tpl("側転だけ", "common", cheap()),
  tpl("左手投げ", "stick", S({ kind: "throw", reqTypes: ["lefthand"] }, skill("b_front"), { kind: "catch" })),
  tpl("二つ投げ", "clubs", S({ kind: "throw", reqTypes: ["twothrow"] }, skill("b_front"), { kind: "catch" })),
];

describe("使えるテンプレートの絞り込み", () => {
  it("指定した手具のものと共通だけを使う", () => {
    const names = usableTemplates(pool(), "stick").map((t) => t.name);
    expect(names).toContain("左手投げ");
    expect(names).toContain("投げ前");
    expect(names).not.toContain("二つ投げ");
  });

  it("使えるテンプレートも自動生成も無ければ null", () => {
    expect(generateRoutine([], { apparatus: "stick", ...noAuto })).toBeNull();
    expect(generateRoutine([tpl("二つ投げ", "clubs", throwFront())], { apparatus: "rope", ...noAuto })).toBeNull();
  });

  it("テンプレートが無くても自動生成だけで組める", () => {
    const r = generateRoutine([], { apparatus: "stick", random: seeded(7) })!;
    expect(r).not.toBeNull();
    expect(r.used.every((t) => t.auto)).toBe(true);
    // 投げもタンブリングも入る
    expect(r.series.some((ser) => analyzeSeries(ser).units.some((u) => u.type === "tumbling"))).toBe(true);
    expect(r.series.some((ser) => analyzeSeries(ser).throwCount > 0)).toBe(true);
    expect(computeScore(r.series, "stick").dScore).toBeCloseTo(r.dScore, 5);
  });
});

describe("ランダム生成", () => {
  it("必須要素をできるだけ満たす（投げ3回・投げタン・三宙・つなぎ・方向系）", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(7) })!;
    expect(r).not.toBeNull();
    const score = computeScore(r.series, "stick");
    const passed = (key: string) => score.required.find((x) => x.key === key)?.passed;
    expect(passed("count3")).toBe(true);
    expect(passed("throwTum")).toBe(true);
    expect(passed("triple")).toBe(true);
    expect(passed("connect")).toBe(true);
    expect(passed("dir")).toBe(true);
    expect(score.dScore).toBeCloseTo(r.dScore, 5);
    // 投げタンは1本まで
    const throwTum = score.analysis.reduce((n, a) => n + a.units.filter((u) => u.isThrowTumbling).length, 0);
    expect(throwTum).toBe(1);
  });

  it("評価が上がらないシリーズは入れない（空のシリーズは残らない）", () => {
    const withEmpty = [...pool(), tpl("空", "common", S())];
    const r = generateRoutine(withEmpty, { apparatus: "stick", random: seeded(3) })!;
    expect(r.used.map((t) => t.name)).not.toContain("空");
  });

  it("4本目以降のタンブリングは入れない（上位3本しか難度に採用されない）", () => {
    const tums = ["b_backsalto", "b_backtuck", "b_backlayout", "b_tempo", "b_sidesalto"].map((id, i) =>
      tpl(`タンブリング${i}`, "common", S(skill(id), skill("a_flicflac"), skill(id), { kind: "catch" })),
    );
    const r = generateRoutine(tums, { apparatus: "stick", ...noAuto, random: seeded(17) })!;
    expect(r.used.length).toBeLessThanOrEqual(3);
  });

  it("同じ内容のテンプレートを重ねない（重複はDに寄与しないので落ちる）", () => {
    const dup = [tpl("A", "common", throwFront()), tpl("Aのコピー", "common", throwFront())];
    const r = generateRoutine(dup, { apparatus: "stick", ...noAuto, random: seeded(11) })!;
    expect(r.used).toHaveLength(1);
  });

  it("Dスコアの上限を指定すると、その範囲に収める", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", maxScore: 0.8, random: seeded(5) })!;
    expect(r.dScore).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  it("指定がなければ上限ありより高いDを狙う", () => {
    const free = generateRoutine(pool(), { apparatus: "stick", random: seeded(5) })!;
    const capped = generateRoutine(pool(), { apparatus: "stick", maxScore: 0.8, random: seeded(5) })!;
    expect(free.dScore).toBeGreaterThan(capped.dScore);
  });

  it("下限を指定すると、その範囲まで積む", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", minScore: 1.0, random: seeded(9) })!;
    expect(r.dScore).toBeGreaterThanOrEqual(1.0 - 1e-9);
  });

  it("投げタンは1本までにする（必須要素は1本で満たせる）", () => {
    // 投げタンだけのテンプレートを大量に置いても1本しか使わない
    const many = ["b_front", "b_sidesalto", "b_backsalto", "b_backtuck", "b_tempo"].map((id, i) =>
      tpl(`投げタン${i}`, "common", S({ kind: "throw" }, skill(id), { kind: "catch" })),
    );
    const r = generateRoutine([...many, ...pool()], { apparatus: "stick", random: seeded(23) })!;
    const score = computeScore(r.series, "stick");
    const throwTum = score.analysis.reduce((n, a) => n + a.units.filter((u) => u.isThrowTumbling).length, 0);
    expect(throwTum).toBe(1);
  });

  it("上限を変えれば投げタンを増やせる", () => {
    const many = ["b_front", "b_sidesalto", "b_backsalto", "b_backtuck", "b_tempo"].map((id, i) =>
      tpl(`投げタン${i}`, "common", S({ kind: "throw" }, skill(id), { kind: "catch" })),
    );
    const count = (r: { series: Series[] }) =>
      computeScore(r.series, "stick").analysis.reduce(
        (n, a) => n + a.units.filter((u) => u.isThrowTumbling).length,
        0,
      );
    expect(count(generateRoutine(many, { apparatus: "stick", ...noAuto, random: seeded(23) })!)).toBe(1);
    expect(
      count(generateRoutine(many, { apparatus: "stick", ...noAuto, maxThrowTumbling: 3, random: seeded(23) })!),
    ).toBe(3);
  });

  it("ジュニアでは投げが5回を超えない", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      tpl(`投げ${i}`, "common", S({ kind: "throw" }, skill(["b_front", "b_sidesalto", "b_backsalto"][i % 3]), { kind: "catch" })),
    );
    const r = generateRoutine([...many, ...pool()], { apparatus: "stick", junior: true, random: seeded(13) })!;
    const score = computeScore(r.series, "stick", { junior: true });
    expect(score.performedThrowCount).toBeLessThanOrEqual(5);
    expect(score.overThrowCount).toBe(0);
  });

  it("手具固有のテンプレートも使う（スティックの左手投げで必須要素を満たす）", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(21) })!;
    const score = computeScore(r.series, "stick");
    const leftThrow = score.apparatusElementChecks.find((c) => c.key === "appEl_stick_left");
    expect(leftThrow?.passed).toBe(true);
  });
});


describe("DとAの損失の比較", () => {
  /** 手具操作なしの技（シリーズ全体に手具操作が無いと A −0.2） */
  const noApp = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });

  it("同じ難度なら、A減点の少ないほうを選ぶ", () => {
    const withApp = tpl("手具操作あり", "common", triple());
    const withoutApp = tpl(
      "手具操作なし",
      "common",
      S(noApp("b_backsalto"), noApp("b_backsalto"), noApp("b_backsalto"), { kind: "catch" }),
    );
    [3, 7, 11].forEach((seed) => {
      const r = generateRoutine([withApp, withoutApp], {
        apparatus: "stick",
        maxSeries: 1,
        ...noAuto,
        random: seeded(seed),
      })!;
      // Dは同じ（0.5）。A減点0.2のぶんだけ手具操作ありが勝つ
      expect(r.used.map((t) => t.name)).toEqual(["手具操作あり"]);
    });
  });

  it("Dの上がり分よりA減点が大きいシリーズは入れない", () => {
    // 前宙1本（最大でもD +0.2）に手具操作が無い → A −0.2。差し引きで得にならない
    const loss = tpl("手具操作なし前宙", "common", S(noApp("b_front")));
    [3, 7, 11].forEach((seed) => {
      const r = generateRoutine([...pool(), loss], { apparatus: "stick", ...noAuto, random: seeded(seed) })!;
      expect(r.used.map((t) => t.name)).not.toContain("手具操作なし前宙");
      // 手具操作なしのA減点を受けていない
      expect(computeScore(r.series, "stick").noApparatusDeduction).toBe(0);
    });
  });

  it("A減点を取り返せるだけDが上がるなら入れる", () => {
    // 三宙（D +0.5）なら手具操作なしのA −0.2 を上回る
    const gain = tpl("手具操作なし三宙", "common", S(noApp("b_tempo"), noApp("b_tempo"), noApp("b_tempo")));
    const r = generateRoutine([gain], { apparatus: "stick", maxSeries: 1, ...noAuto, random: seeded(3) })!;
    expect(r.used.map((t) => t.name)).toEqual(["手具操作なし三宙"]);
  });
});

describe("必須要素を必ず満たす構成", () => {
  it("狙うDスコアで切り替わる（3点以上・上限なしは必ず満たす）", () => {
    expect(requiresAllElements({ maxScore: null })).toBe(true);
    expect(requiresAllElements({})).toBe(true);
    expect(requiresAllElements({ maxScore: REQUIRE_ALL_ELEMENTS_MIN_SCORE })).toBe(true);
    expect(requiresAllElements({ maxScore: REQUIRE_ALL_ELEMENTS_MIN_SCORE - 0.1 })).toBe(false);
  });

  it("3点以上を狙うと必須要素をすべて満たす", () => {
    [3.5, 4.5].forEach((maxScore) => {
      [3, 7, 11].forEach((seed) => {
        const r = generateRoutine(pool(), { apparatus: "stick", maxScore, random: seeded(seed) })!;
        expect(computeScore(r.series, "stick").missing).toEqual([]);
        expect(r.dScore).toBeLessThanOrEqual(maxScore + 1e-9);
      });
    });
  });

  it("上限を指定しないときも必ず満たす", () => {
    [3, 7, 11].forEach((seed) => {
      const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(seed) })!;
      expect(computeScore(r.series, "stick").missing).toEqual([]);
    });
  });

  it("requireAllElements で明示的に切り替えられる", () => {
    expect(requiresAllElements({ maxScore: 1.0, requireAllElements: true })).toBe(true);
    expect(requiresAllElements({ maxScore: null, requireAllElements: false })).toBe(false);
    // 切ってもDの範囲は守る（必須要素の不足はA減点としてだけ効く）
    const r = generateRoutine(pool(), {
      apparatus: "stick",
      maxScore: 4.0,
      requireAllElements: false,
      random: seeded(3),
    })!;
    expect(r.dScore).toBeLessThanOrEqual(4.0 + 1e-9);
  });

  it("低いDスコアを狙うときは満たせなくてもよい（範囲を優先する）", () => {
    const r = generateRoutine([], { apparatus: "stick", maxScore: 1.5, random: seeded(5) })!;
    expect(r.dScore).toBeLessThanOrEqual(1.5 + 1e-9);
  });
});

describe("並び順", () => {
  /** 転回系（宙返り・投げタン）を含むシリーズか */
  const isTum = (ser: Series) =>
    analyzeSeries(ser).units.some((u) => u.type === "tumbling" || u.isThrowTumbling);
  const kinds = (list: Series[]) => list.map((s) => (isTum(s) ? "T" : "H")).join("");

  it("投げとタンブリングが交互に並ぶ（投げが続かない）", () => {
    [3, 7, 11, 19, 23].forEach((seed) => {
      const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(seed) })!;
      expect(kinds(r.series)).not.toMatch(/HH/);
    });
  });

  it("並べ替えても返す点数は実際の採点と一致する（ジュニアも）", () => {
    [false, true].forEach((junior) => {
      [5, 13, 29].forEach((seed) => {
        const r = generateRoutine(pool(), { apparatus: "stick", junior, random: seeded(seed) })!;
        const score = computeScore(r.series, "stick", { junior });
        expect(score.dScore).toBeCloseTo(r.dScore, 5);
        expect(score.aScore).toBeCloseTo(r.aScore, 5);
      });
    });
  });

  it("使ったテンプレートの並びは生成結果と対応している", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(7) })!;
    expect(r.used).toHaveLength(r.series.length);
    r.used.forEach((t, i) => expect(seriesSignature(t.series)).toBe(seriesSignature(r.series[i])));
  });
});

describe("宙返りの多様性", () => {
  it("同じ宙返りの2回目以降を数える（前宙は数えない）", () => {
    expect(saltoRepeatCount([S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"))])).toBe(2);
    expect(saltoRepeatCount([S(skill("b_backsalto"), skill("b_sidesalto"), skill("b_front"))])).toBe(0);
    // 前宙は何度実施しても数えない
    expect(saltoRepeatCount([S(skill("b_front"), skill("b_front"), skill("b_front"))])).toBe(0);
    // シリーズをまたいでも数える
    expect(saltoRepeatCount([S(skill("b_backsalto")), S(skill("b_backsalto"))])).toBe(1);
    // A難度（宙返りではない）は対象外
    expect(saltoRepeatCount([S(skill("a_flicflac"), skill("a_flicflac"))])).toBe(0);
  });

  it("同じ点数なら宙返りが多様な構成を選ぶ", () => {
    // どちらも B+1+1 = D難度（0.5）だが、片方は後方宙返りの3連続
    const same = tpl("後宙3連続", "common", S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto")));
    const varied = tpl("いろいろ3連続", "common", S(skill("b_backsalto"), skill("b_sidesalto"), skill("b_backtuck")));
    const r = generateRoutine([same, varied], { apparatus: "stick", maxSeries: 1, ...noAuto, random: seeded(31) })!;
    expect(r.used.map((t) => t.name)).toEqual(["いろいろ3連続"]);
  });

  it("点数が上がるなら繰り返しも許す（必須ではない）", () => {
    // 後宙3連続（D難度・0.5）と 前宙1本（B難度・0.2）なら、繰り返しがあっても前者を採る
    const strong = tpl("後宙3連続", "common", S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto")));
    const weak = tpl("前宙1本", "common", S(skill("b_front")));
    const r = generateRoutine([strong, weak], { apparatus: "stick", maxSeries: 1, ...noAuto, random: seeded(31) })!;
    expect(r.used.map((t) => t.name)).toEqual(["後宙3連続"]);
  });
});
