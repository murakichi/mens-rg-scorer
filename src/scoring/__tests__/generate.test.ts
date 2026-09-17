import { describe, it, expect } from "vitest";
import { LIMITED_SKILL_MAX } from "../autoTumblings";
import {
  A_PRIORITY,
  limitedSkillCounts,
  A_PRIORITY_WEIGHT,
  REQUIRE_ALL_ELEMENTS_MIN_SCORE,
  generateRoutine,
  DEFAULT_MAX_AUTO_THROWS,
  hardThrowCount,
  suppressHardThrow,
  HARD_THROW_WEIGHT,
  HARD_THROW_FREE_SCORE,
  HARD_THROW_MAX_MOTIONS,
  endsWithFinishCatch,
  missesFinishCatch,
  FINISH_CATCH_TAG,
  FINISH_CATCH_WEIGHT,
  DEFAULT_MAX_SERIES,
  autoSeriesMax,
  otherStyleCount,
  OTHER_STYLE_WEIGHT,
  requiresAllElements,
  saltoRepeatCount,
  SHAPE_PRIORITY_WEIGHT,
  shapeRankTotal,
  THROW_ORDER_WEIGHT,
  reversedThrowOrderCount,
  preferredThrowCount,
  throwCountPenalty,
  extraThrowOperation,
  verticalThreeThrowCount,
  DIFFICULTY_PREFERENCE_WEIGHT,
  TUMBLING_PREFERENCE_WEIGHT,
  VERTICAL_THREE_THROW_WEIGHT,
  shortfallPenalty,
  usableTemplates,
} from "../generate";
import { ADOPT_COUNT, DIFF_SCORE, TECHNIQUE_BONUS } from "../constants";
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
// 後方系はロンダートから入る（入力画面と同じ）。ロンダートは側方系なので方向系にも効く
const triple = () =>
  S(skill("a_roundoff"), skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"), { kind: "catch" });
const connect = () =>
  S(skill("a_roundoff"), skill("b_backsalto"), skill("a_flicflac"), skill("b_backsalto"), { kind: "catch" });
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

describe("実施が少ない技（ハンドスプリング・転宙）", () => {
  it("演技内で1回まで", () => {
    [3, 7, 11, 19].forEach((seed) => {
      [null, 3.0, 4.5].forEach((maxScore) => {
        const r = generateRoutine([], { apparatus: "stick", maxScore, random: seeded(seed) })!;
        limitedSkillCounts(r.series).forEach((n) => expect(n).toBeLessThanOrEqual(LIMITED_SKILL_MAX));
      });
    });
  }, 60_000);

  it("技としても徒手動作としても数える", () => {
    const counts = limitedSkillCounts([
      S(skill("a_handspring"), skill("b_front")),
      S({ kind: "motion", motionId: "a_handspring", count: 1 }, skill("b_tenchu")),
    ]);
    expect(counts.get("a_handspring")).toBe(2);
    expect(counts.get("b_tenchu")).toBe(1);
  });

  it("同じ点数なら使わない構成を選ぶ", () => {
    // 前宙→側宙（D 0.3）と 転宙→前宙（同じくD 0.3）なら、転宙を使わないほうを採る
    // （どちらも別の技の組み合わせなので、転回系の多様性の減点は両方0）
    const plain = tpl("前宙側宙", "common", S(skill("b_front"), skill("b_sidesalto")));
    const limited = tpl("転宙入り", "common", S(skill("b_tenchu"), skill("b_front")));
    [3, 7, 11].forEach((seed) => {
      const r = generateRoutine([plain, limited], {
        apparatus: "stick",
        maxSeries: 1,
        ...noAuto,
        random: seeded(seed),
      })!;
      expect(r.used.map((t) => t.name)).toEqual(["前宙側宙"]);
    });
  });
});

describe("タンブリングの本数", () => {
  const tumblingCount = (list: Series[], apparatus: ApparatusKey = "stick") =>
    computeScore(list, apparatus).nonDupTumblingCount;

  it("投げタンを含めて3本まで（4本目は評価されないので入れない）", () => {
    [3, 7, 11, 19].forEach((seed) => {
      const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(seed) })!;
      expect(tumblingCount(r.series)).toBeLessThanOrEqual(3);
    });
    // テンプレートが無くても同じ
    [3, 7].forEach((seed) => {
      const r = generateRoutine([], { apparatus: "stick", random: seeded(seed) })!;
      expect(tumblingCount(r.series)).toBeLessThanOrEqual(3);
    });
  });

  it("3本の中で必須要素（三宙・つなぎ・投げタン・方向系）を満たす", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(7) })!;
    const score = computeScore(r.series, "stick");
    expect(score.missing).toEqual([]);
    expect(score.nonDupTumblingCount).toBe(3);
  });

  it("上限は変えられる", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", maxTumblings: 2, random: seeded(7) })!;
    expect(tumblingCount(r.series)).toBeLessThanOrEqual(2);
  });
});

describe("A側の要求を満たす優先順位", () => {
  const penalty = (ser: Series[], mandatory = false) =>
    shortfallPenalty(computeScore(ser, "stick"), "stick", mandatory);
  /** その要求だけを落とした構成を作るのは難しいので、空の構成からの差で順位を見る */
  const only = (key: keyof typeof A_PRIORITY) => A_PRIORITY[key];

  it("現実の感覚の順（投げの回数＝必須投げ受け＞投げタン＞多様性＞つなぎ＞三宙＞つなぎの手具操作）", () => {
    expect(only("throwCount")).toBe(only("apparatusThrow"));
    expect(only("apparatusThrow")).toBeGreaterThan(only("throwTumbling"));
    expect(only("throwTumbling")).toBeGreaterThan(only("variety"));
    expect(only("variety")).toBeGreaterThan(only("connect"));
    expect(only("connect")).toBeGreaterThan(only("triple"));
    expect(only("triple")).toBeGreaterThan(only("connectApparatus"));
  });

  it("順位の重みは難度点の刻み（0.1）より小さい＝同点のときだけ効く", () => {
    expect(A_PRIORITY.throwCount * A_PRIORITY_WEIGHT).toBeLessThan(DIFF_SCORE.A);
  });

  it("満たした要求が多いほど引き算が小さい", () => {
    const nothing = penalty([]);
    const withThrows = penalty([throwFront(), throwSide(), throwBack()]);
    expect(withThrows).toBeLessThan(nothing);
    expect(penalty(pool().map((t) => t.series))).toBeLessThan(withThrows);
  });

  it("必ず満たす設定では、要求1つにつき難度点より大きく引く", () => {
    const one = penalty([], true) - penalty([], false);
    expect(one).toBeGreaterThan(1);
  });

  it("同じ点数の不足なら優先順位の低いほうを落とす（三宙よりつなぎを残す）", () => {
    // つなぎだけ欠けた構成と、三宙だけ欠けた構成を比べる
    const base = [throwFront(), throwSide(), throwBack(), triple(), connect()];
    const noConnect = base.filter((s) => s !== base[4]);
    const noTriple = base.filter((s) => s !== base[3]);
    // どちらも1つ欠けだが、つなぎ（優先度3）を落とすほうが損が大きい
    expect(penalty(noConnect)).toBeGreaterThan(penalty(noTriple));
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
    // Dスコアの上限いっぱいでも満たす（足す代わりに抜く必要がある形でも組み直して詰める）
    [3.5, 4.5].forEach((maxScore) => {
      [3, 7, 11, 13, 17].forEach((seed) => {
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

describe("同じ難度に到達する組み方の優先度", () => {
  it("順位ぶんの重みは難度点の刻みより小さい（点数は犠牲にしない）", () => {
    // 順位は最大5、採用されるタンブリングは3本まで
    expect(SHAPE_PRIORITY_WEIGHT * 5 * ADOPT_COUNT).toBeLessThan(0.1);
  });

  it("同じE難度でも、実施される組み方のほうが順位合計が小さい", () => {
    const better = [S(skill("a_roundoff"), skill("c_back15"), skill("b_front"), skill("b_sidesalto"))];
    // C→C→B も同じE難度だが、C→B→B より実施されない
    const worse = [S(skill("a_roundoff"), skill("c_back15"), skill("c_backlay1full"), skill("b_front"))];
    const rank = (list: Series[]) => shapeRankTotal(list, computeScore(list, "stick"));
    // どちらもE難度のタンブリング1本
    expect(computeScore(better, "stick").tumblingScore).toBe(computeScore(worse, "stick").tumblingScore);
    expect(rank(better)).toBeLessThan(rank(worse));
  });

  it("転回系のユニットが1つでないシリーズは数えない", () => {
    const twoUnits = [S(skill("b_front"), { kind: "motion", motionId: "fwd_roll", count: 1 }, skill("b_front"))];
    expect(shapeRankTotal(twoUnits, computeScore(twoUnits, "stick"))).toBe(0);
  });
});

describe("連続投げの難度の並び", () => {
  const throwSeries = (motions: number) =>
    S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: motions, hands: false }, { kind: "catch" });
  /** 1つのシリーズに投げ受けを2つ並べる */
  const pair = (first: number, second: number): Series =>
    S(...throwSeries(first).items, ...throwSeries(second).items);

  it("2回目以降のほうが難度が高いシリーズを数える", () => {
    const normal = [pair(4, 0)]; // 1回目が高い（普通）
    const reversed = [pair(0, 4)]; // 2回目が高い
    expect(reversedThrowOrderCount(computeScore(normal, "stick"))).toBe(0);
    expect(reversedThrowOrderCount(computeScore(reversed, "stick"))).toBe(1);
    // 難度が同じなら数えない
    expect(reversedThrowOrderCount(computeScore([pair(2, 2)], "stick"))).toBe(0);
    // 投げ受けが1つだけのシリーズは対象外
    expect(reversedThrowOrderCount(computeScore([throwSeries(4)], "stick"))).toBe(0);
  });

  it("重みは難度点の刻みより小さい（逆順の構成も現実にあるので禁止しない）", () => {
    expect(THROW_ORDER_WEIGHT).toBeLessThan(0.1);
    // 同じ内容なら1回目が高い並びのほうが評価が高い（D・Aは同じ）
    const normal = [pair(4, 0)];
    const reversed = [pair(0, 4)];
    expect(computeScore(normal, "stick").dScore).toBe(computeScore(reversed, "stick").dScore);
  });
});

describe("投げ上げの回数", () => {
  const minimalThrow = (): Series => S({ kind: "throw" }, { kind: "catch" });
  const cheneThrow = (n: number): Series =>
    S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: n, hands: false }, { kind: "catch" });

  it("最頻値はDスコアが上がるほど増え、最小はルールの回数", () => {
    // 最小はルールの回数（一般3回・ジュニア2回）
    expect(preferredThrowCount(0)).toBe(3);
    expect(preferredThrowCount(1.9)).toBe(3);
    expect(preferredThrowCount(0, true)).toBe(2);
    // 上がるほど増える
    expect(preferredThrowCount(2.0)).toBe(4);
    expect(preferredThrowCount(3.9)).toBe(4);
    expect(preferredThrowCount(4.0)).toBe(5);
    // Dスコア5でも最頻値は5のまま
    expect(preferredThrowCount(5.0)).toBe(5);
    expect(preferredThrowCount(6.0)).toBe(5);
    // 単調に増える
    for (let d = 0; d <= 6; d += 0.5)
      expect(preferredThrowCount(d + 0.5)).toBeGreaterThanOrEqual(preferredThrowCount(d));
  });

  it("最頻値から離れるほど評価が下がる（多い側のほうを強く嫌う）", () => {
    expect(throwCountPenalty(5, 4.5)).toBe(0);
    expect(throwCountPenalty(4, 4.5)).toBeGreaterThan(0);
    // 技術加点で稼げてしまうので、多い側のほうを強く嫌う
    expect(throwCountPenalty(6, 4.5)).toBeGreaterThan(throwCountPenalty(4, 4.5));
    // 1回多いのは十分ありえる（4点台でも6回）。2回以上多いぶんは強く嫌う
    expect(throwCountPenalty(7, 4.5) - throwCountPenalty(6, 4.5)).toBeGreaterThan(
      throwCountPenalty(6, 4.5),
    );
    // Dスコア5以上は6回を実施する確率が上がる（最頻値は5のまま）ので、1回多い側は弱くなる
    expect(throwCountPenalty(6, 5.0)).toBeLessThan(throwCountPenalty(6, 4.5));
    expect(preferredThrowCount(5.0)).toBe(preferredThrowCount(4.5));
    // 2回以上多いぶんはDスコアに関わらず強く嫌う
    expect(throwCountPenalty(7, 5.0)).toBeGreaterThan(throwCountPenalty(6, 5.0) * 2);
  });

  it("加点のための投げは本数を増やしてよい（最頻値は5のまま）", () => {
    // 難度に採用されるのは投げタン＋上位3本だけ。自動生成の投げの本数の上限は
    // それより多く取れるようにしてあり、本数は最頻値の重みで決まる
    expect(DEFAULT_MAX_AUTO_THROWS).toBeGreaterThan(ADOPT_COUNT);
    const routines: { count: number; mode: number }[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const r = generateRoutine(pool(), { apparatus: "stick", maxScore: 4.5, random: seeded(seed * 13 + 5) });
      if (!r) continue;
      const sc = computeScore(r.series, "stick");
      routines.push({ count: sc.totalThrowCount, mode: preferredThrowCount(sc.dScore) });
    }
    expect(routines.length).toBeGreaterThan(0);
    // 回数はその構成のDスコアの最頻値の近くに収まる
    routines.forEach(({ count, mode }) => {
      expect(count).toBeGreaterThanOrEqual(mode - 1);
      expect(count).toBeLessThanOrEqual(mode + 2);
    });
    // 大半は最頻値以上で、最頻値より多い構成も出る（加点のために投げを足す）
    expect(routines.filter((r) => r.count >= r.mode).length).toBeGreaterThanOrEqual(routines.length / 2);
    expect(routines.some((r) => r.count > r.mode)).toBe(true);
  }, 120_000);

  it("Dスコアの上限が低くてもルールの回数は満たす", () => {
    [3, 7, 11].forEach((seed) => {
      const r = generateRoutine(pool(), { apparatus: "stick", maxScore: 1.5, random: seeded(seed) })!;
      const sc = computeScore(r.series, "stick");
      expect(sc.performedThrowCount).toBeGreaterThanOrEqual(3);
      expect(sc.dScore).toBeLessThanOrEqual(1.5 + 1e-9);
    });
  }, 60_000);

  it("難度に採用されない投げの操作を数える（加点だけを狙う投げは操作を足さない）", () => {
    // 徒手系ユニットは上位3つだけが難度に採用される
    const four = [cheneThrow(4), cheneThrow(3), cheneThrow(2), cheneThrow(1)];
    expect(extraThrowOperation(computeScore(four, "stick"))).toBeGreaterThan(0);
    // 4本目を操作なしにすれば0
    const withMinimal = [cheneThrow(4), cheneThrow(3), cheneThrow(2), minimalThrow()];
    expect(extraThrowOperation(computeScore(withMinimal, "stick"))).toBe(0);
    // 3本以下なら全部採用されるので0
    expect(extraThrowOperation(computeScore([cheneThrow(4), cheneThrow(3)], "stick"))).toBe(0);
  });
});

describe("手以外の投げ・手具を使った投げのあと", () => {
  const after = (throwTypes: string[], motions: number, skills = 0): Series =>
    S(
      { kind: "throw", throwTypes },
      { kind: "motion", motionId: "chene", count: motions },
      ...Array.from({ length: skills }, () => skill("b_front")),
      { kind: "catch" },
    );

  it("2動作以上か転回系を挟む形だけを数える", () => {
    // 手以外の投げ・手具を使った投げのあとに実施できるのは徒手0〜1動作まで
    expect(HARD_THROW_MAX_MOTIONS).toBe(1);
    expect(hardThrowCount([after(["nonhand"], 0)])).toBe(0);
    expect(hardThrowCount([after(["nonhand"], HARD_THROW_MAX_MOTIONS)])).toBe(0);
    expect(hardThrowCount([after(["nonhand"], HARD_THROW_MAX_MOTIONS + 1)])).toBe(1);
    expect(hardThrowCount([after(["useapp"], 3)])).toBe(1);
    // 転回系を挟むのも難しい（動作が少なくても数える）
    expect(hardThrowCount([after(["nonhand"], 0, 1)])).toBe(1);
    // 通常の投げ・視野外の投げは対象外
    expect(hardThrowCount([after([], 4)])).toBe(0);
    expect(hardThrowCount([after(["noview"], 4)])).toBe(0);
    // シリーズごとに数える
    expect(hardThrowCount([after(["nonhand"], 3), after(["useapp"], 3)])).toBe(2);
  });

  it("Dスコアの要求値が5.0を超えるまでは嫌う（その形が足せる点数より強い重み）", () => {
    expect(suppressHardThrow({ apparatus: "ring" })).toBe(true);
    expect(suppressHardThrow({ apparatus: "ring", minScore: HARD_THROW_FREE_SCORE })).toBe(true);
    expect(suppressHardThrow({ apparatus: "ring", minScore: HARD_THROW_FREE_SCORE + 0.1 })).toBe(false);
    // 徒手系の最高難度（E＝0.7）より強いので、点数のためだけには実施しない
    expect(HARD_THROW_WEIGHT).toBeGreaterThan(DIFF_SCORE.E);
  });

  it("要求値が無ければほとんど生成せず、5.0を超える要求では実施する", () => {
    const hard = (minScore: number | null) => {
      let n = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const r = generateRoutine(pool(), {
          apparatus: "ring",
          minScore,
          autoTumblingSkills: [],
          random: seeded(seed * 13 + 5),
        });
        if (r) n += hardThrowCount(r.series);
      }
      return n;
    };
    // 要求値なし＝かなり稀（1構成あたり0.5本未満）
    expect(hard(null) / 5).toBeLessThan(0.5);
    // 5.0を超える要求では点数を稼ぐために実施する
    expect(hard(HARD_THROW_FREE_SCORE + 0.1)).toBeGreaterThan(hard(null));
  }, 180_000);
});

describe("転回系の多様性の減点（自動計算）", () => {
  it("A減点には自動では入れない（手動入力の値だけを見る）", () => {
    const repeated = [
      S(skill("a_roundoff"), skill("b_front"), skill("b_front"), skill("b_front")),
    ];
    const r = computeScore(repeated, "stick");
    // 自動計算の結果は返すが、A減点には入っていない
    expect(r.tumVariety.deduction).toBeGreaterThan(0);
    expect(r.artDeduction).toBe(0);
    // 入力すればA減点に入る
    const withInput = computeScore(repeated, "stick", {
      artDeductions: { tumVariety: r.tumVariety.deduction },
    });
    expect(withInput.artDeduction).toBe(r.tumVariety.deduction);
  });

  it("上級者の構成ほど宙返りの種類が増えて減点が小さくなる", () => {
    const run = (maxScore: number | null) => {
      const ded: number[] = [];
      const totals: number[] = [];
      for (let seed = 1; seed <= 8; seed++) {
        const r = generateRoutine(pool(), {
          apparatus: "stick",
          maxScore,
          autoTumblingSkills: [],
          random: seeded(seed * 13 + 5),
        });
        if (!r) continue;
        const sc = computeScore(r.series, "stick");
        ded.push(sc.tumVariety.deduction);
        totals.push(sc.tumVariety.total);
      }
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return { deduction: avg(ded), total: avg(totals), n: ded.length };
    };
    const mid = run(3.5);
    const top = run(null);
    expect(mid.n).toBeGreaterThan(0);
    // 上限なし（難度を狙いきる構成）は宙返りが6〜10個入り、種類が増えるので減点が小さい
    expect(top.total).toBeGreaterThanOrEqual(6);
    expect(top.total).toBeLessThanOrEqual(10);
    expect(top.deduction).toBeLessThanOrEqual(mid.deduction);
    // どのレベルでも上限（0.5）に張り付くことはない
    expect(top.deduction).toBeLessThan(0.3);
  }, 180_000);
});

describe("演技の締め方（クラブ＝押さえてキャッチ／ロープ＝足に絡めたキャッチ）", () => {
  const press = (): Series => S({ kind: "throw" }, { kind: "catch", catchTypes: ["useapp"] });
  const foot = (): Series => S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"] });
  const plain = (): Series => S({ kind: "throw" }, { kind: "catch" });

  it("手具ごとの締めの受け方だけを締めとみなす", () => {
    expect(FINISH_CATCH_TAG.clubs).toBe("useapp");
    expect(FINISH_CATCH_TAG.rope).toBe("nonhand");
    // スティック・リングには決まった締め方が無い
    expect(FINISH_CATCH_TAG.stick).toBeUndefined();
    expect(FINISH_CATCH_TAG.ring).toBeUndefined();
    expect(endsWithFinishCatch(press(), "clubs")).toBe(true);
    expect(endsWithFinishCatch(foot(), "clubs")).toBe(false);
    expect(endsWithFinishCatch(foot(), "rope")).toBe(true);
    expect(endsWithFinishCatch(press(), "stick")).toBe(false);
    // キャッチで終わらないシリーズは締めにならない
    expect(endsWithFinishCatch(S(skill("b_front")), "clubs")).toBe(false);
    // 締め方の無い手具では「締めていない」とも判定しない
    expect(missesFinishCatch([plain()], "stick")).toBe(false);
    expect(missesFinishCatch([plain()], "clubs")).toBe(true);
    expect(missesFinishCatch([plain(), press()], "clubs")).toBe(false);
    // 締めのシリーズが最後でなければ締めていない
    expect(missesFinishCatch([press(), plain()], "clubs")).toBe(true);
  });

  it("難度を捨ててまで締めの形にはしない（重みは難度の刻みより小さい）", () => {
    expect(FINISH_CATCH_WEIGHT).toBeLessThan(0.1);
  });

  it("クラブ・ロープの構成は締めの受け方で終わる", () => {
    (["clubs", "rope"] as ApparatusKey[]).forEach((apparatus) => {
      let finished = 0;
      let routines = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const r = generateRoutine(pool(), { apparatus, random: seeded(seed * 13 + 5) });
        if (!r) continue;
        routines += 1;
        if (endsWithFinishCatch(r.series[r.series.length - 1], apparatus)) finished += 1;
      }
      expect(routines).toBeGreaterThan(0);
      // だいたい締めの形で終わる。登録テンプレートが締めの形を持たないと、
      // テンプレート優先（`AUTO_SERIES_WEIGHT`）で外れることもある
      // （実測：締めの形を作れる候補が入る構成では25/25、この pool では6割）
      expect(finished / routines).toBeGreaterThanOrEqual(0.5);
    });
  }, 120_000);
});

describe("自動生成の割合（ユーザー指定）", () => {
  it("割合をシリーズ数の上限に対する本数に換算する", () => {
    // 既定（1）は割合では制限しない
    expect(autoSeriesMax({ apparatus: "stick" })).toBeNull();
    expect(autoSeriesMax({ apparatus: "stick", autoRatio: 1 })).toBeNull();
    expect(autoSeriesMax({ apparatus: "stick", autoRatio: 0 })).toBe(0);
    expect(autoSeriesMax({ apparatus: "stick", autoRatio: 0.5 })).toBe(DEFAULT_MAX_SERIES / 2);
    // シリーズ数の上限を変えれば本数も変わる
    expect(autoSeriesMax({ apparatus: "stick", autoRatio: 0.5, maxSeries: 4 })).toBe(2);
    // 負の値でも0を下回らない
    expect(autoSeriesMax({ apparatus: "stick", autoRatio: -1 })).toBe(0);
  });

  it("0%なら登録テンプレートだけで組む", () => {
    const r = generateRoutine(pool(), { apparatus: "stick", autoRatio: 0, random: seeded(7) })!;
    expect(r).toBeTruthy();
    expect(r.used.some((t) => t.auto)).toBe(false);
  }, 60_000);

  it("指定した割合ぶんの本数までしか自動生成を入れない", () => {
    [0.25, 0.5].forEach((autoRatio) => {
      const max = autoSeriesMax({ apparatus: "stick", autoRatio })!;
      [3, 7, 11].forEach((seed) => {
        const r = generateRoutine(pool(), { apparatus: "stick", autoRatio, random: seeded(seed) })!;
        expect(r.used.filter((t) => t.auto).length).toBeLessThanOrEqual(max);
      });
    });
  }, 120_000);

  it("割合を上げるほど自動生成のシリーズが増える（減ることはない）", () => {
    const autoCount = (autoRatio: number) =>
      [3, 7, 11]
        .map((seed) => {
          const r = generateRoutine(pool(), { apparatus: "stick", autoRatio, random: seeded(seed) })!;
          return r.used.filter((t) => t.auto).length;
        })
        .reduce((a, b) => a + b, 0);
    // 0%は必ず0本。上げても減ることはない（テンプレートで足りていれば増えないこともある）
    expect(autoCount(0)).toBe(0);
    expect(autoCount(0.25)).toBeGreaterThan(0);
    expect(autoCount(0.25)).toBeLessThanOrEqual(autoCount(0.75));
    // テンプレートが少ない構成では割合を上げたぶんだけ増える
    const few = (autoRatio: number) =>
      generateRoutine([tpl("三宙", "common", triple())], { apparatus: "stick", autoRatio, random: seeded(7) })!.used.filter(
        (t) => t.auto,
      ).length;
    expect(few(0.25)).toBeLessThan(few(0.75));
  }, 120_000);
});

describe("その他の投げ・その他のキャッチ", () => {
  it("数えるのは投げ・キャッチ・技の最中の投げに付いたその他だけ", () => {
    expect(
      otherStyleCount([
        S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch", catchTypes: ["other"] }),
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
      ]),
    ).toBe(2);
    expect(otherStyleCount([S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"] })])).toBe(0);
  });

  it("技術加点より強い重みで嫌う（加点のためだけには実施しない）", () => {
    expect(OTHER_STYLE_WEIGHT).toBeGreaterThan(TECHNIQUE_BONUS);
  });

  it("生成される構成にはほとんど出ない", () => {
    let others = 0;
    let routines = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(seed * 13 + 5) });
      if (!r) continue;
      routines += 1;
      others += otherStyleCount(r.series);
    }
    expect(routines).toBeGreaterThan(0);
    expect(others).toBeLessThanOrEqual(routines);
  }, 120_000);
});

describe("前転3回（縦3動作）の投げ", () => {
  const rolls = (catchTypes?: string[]): Series =>
    S(
      { kind: "throw" },
      { kind: "motion", motionId: "fwd_roll", count: 3 },
      { kind: "catch", ...(catchTypes ? { catchTypes } : {}) },
    );

  it("手具を使ったキャッチ以外の縦3動作の投げを数える", () => {
    expect(verticalThreeThrowCount([rolls()])).toBe(1);
    // 手具で押さえつけて受ける形は主流なので数えない
    expect(verticalThreeThrowCount([rolls(["useapp"])])).toBe(0);
    // 視野外・手以外は「それ以外の操作」なので数える
    expect(verticalThreeThrowCount([rolls(["noview"])])).toBe(1);
    // 横回転（シェネ）は縦3動作ではない
    expect(
      verticalThreeThrowCount([
        S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 4 }, { kind: "catch" }),
      ]),
    ).toBe(0);
    // 前転2回では足りない
    expect(
      verticalThreeThrowCount([
        S({ kind: "throw" }, { kind: "motion", motionId: "fwd_roll", count: 2 }, { kind: "catch" }),
      ]),
    ).toBe(0);
  });

  it("重みは難度点より大きい（Dスコアの範囲に必要なときだけ入る）", () => {
    // 難度の刻み（0.1）より大きく、範囲外のペナルティ（×100）より小さい
    expect(VERTICAL_THREE_THROW_WEIGHT).toBeGreaterThan(0.1);
    expect(VERTICAL_THREE_THROW_WEIGHT).toBeLessThan(1);
  });

  it("基本的には構成に入らない", () => {
    let count = 0;
    const seeds = [3, 7, 11, 13, 17, 19, 23, 29];
    seeds.forEach((seed) => {
      const r = generateRoutine(pool(), { apparatus: "stick", random: seeded(seed) })!;
      count += verticalThreeThrowCount(r.series);
    });
    // Dスコアの範囲に必要なときだけなので、稀にしか入らない（実測20構成に0〜2本）
    expect(count / seeds.length).toBeLessThanOrEqual(0.25);
  }, 60_000);
});

describe("難度点と加点の優先度", () => {
  // どちらもDスコアは同じ0.7だが、中身が違う
  //  A：シェネ4動作＝徒手E難度 0.7（難度点だけ）
  //  B：シェネ3動作＝D難度 0.5 ＋ 手以外の投げ0.1 ＋ 視野外のキャッチ0.1（加点で0.2）
  const byDifficulty = () =>
    S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 4 }, { kind: "catch" });
  // 視野外の投げは「右投げ右受け」を満たすので、A側はどちらも同じになる
  const byBonus = () =>
    S(
      { kind: "throw", throwTypes: ["noview"] },
      { kind: "motion", motionId: "chene", count: 3 },
      { kind: "catch", catchTypes: ["noview"] },
    );

  it("同じDスコアなら難度点で取っている構成を選ぶ", () => {
    expect(DIFFICULTY_PREFERENCE_WEIGHT).toBeGreaterThan(0);
    const a = computeScore([byDifficulty()], "stick");
    const b = computeScore([byBonus()], "stick");
    // 前提：Dスコアは同じで、内訳（難度点と加点）が違い、A側は同じ
    expect(a.dScore).toBeCloseTo(b.dScore, 5);
    expect(a.handScore).toBeGreaterThan(b.handScore);
    expect(a.techniqueBonus).toBeLessThan(b.techniqueBonus);
    expect(a.aScore).toBeCloseTo(b.aScore, 5);
    // 1シリーズしか入れられないなら、難度点で取るほうを選ぶ
    const templates = [
      tpl("加点で取る", "common", byBonus()),
      tpl("難度点で取る", "common", byDifficulty()),
    ];
    [1, 5, 9].forEach((seed) => {
      const r = generateRoutine(templates, {
        apparatus: "stick",
        maxSeries: 1,
        random: seeded(seed),
        ...noAuto,
      })!;
      expect(r.used.map((t) => t.name)).toEqual(["難度点で取る"]);
    });
  });

  it("タンブリングの難度点は徒手より優先する（上級者のタンブリングはほぼE難度）", () => {
    // タンブリング1点＝0.6、徒手1点＝0.3
    expect(TUMBLING_PREFERENCE_WEIGHT).toBeGreaterThan(0);
    expect(DIFFICULTY_PREFERENCE_WEIGHT + TUMBLING_PREFERENCE_WEIGHT).toBeGreaterThan(
      DIFFICULTY_PREFERENCE_WEIGHT,
    );
    // Dスコアの上限を指定しない＝難度を狙いきる構成では、タンブリングはほぼE難度になる
    let e = 0;
    let all = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = generateRoutine(pool(), {
        apparatus: "stick",
        autoTumblingSkills: [],
        random: seeded(seed * 13 + 5),
      });
      if (!r) continue;
      computeScore(r.series, "stick").analysis.forEach((a) =>
        a.units.forEach((u) => {
          if (u.type !== "tumbling" && !u.isThrowTumbling) return;
          all += 1;
          if (u.finalDiff === "E") e += 1;
        }),
      );
    }
    expect(all).toBeGreaterThan(0);
    // 登録テンプレート自体が低難度なら残ることもあるので、ほぼE難度＝7割以上で見る
    // （実測：この pool で20構成なら88%、自動生成だけで組めば100%）
    expect(e / all).toBeGreaterThanOrEqual(0.7);
  }, 120_000);

  it("難度点の上乗せはDスコアの刻みより小さい（Dを下げてまで難度点は取らない）", () => {
    // 難度点0.1ぶんの上乗せ（0.03）＜ Dスコア0.1
    expect(DIFFICULTY_PREFERENCE_WEIGHT * 0.1).toBeLessThan(0.1);
    // 加点込みで0.7取れる構成と、難度点だけで0.1の構成なら、点数の高いほうを選ぶ
    const cheap = () => S({ kind: "throw" }, { kind: "catch" }); // 徒手A難度 0.1
    const templates = [
      tpl("加点で取る", "common", byBonus()), // 0.7
      tpl("難度点だけ少し", "common", cheap()), // 0.1
    ];
    [1, 3, 5].forEach((seed) => {
      const r = generateRoutine(templates, {
        apparatus: "stick",
        maxSeries: 1,
        random: seeded(seed),
        ...noAuto,
      })!;
      expect(r.used.map((t) => t.name)).toEqual(["加点で取る"]);
    });
  });
});

describe("ロープは手以外のキャッチで締める", () => {
  const nonHand = () =>
    S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 3 }, { kind: "catch", catchTypes: ["nonhand"] });
  const plain = () =>
    S({ kind: "throw" }, { kind: "motion", motionId: "chene", count: 4 }, { kind: "catch" });
  const tumbling = () => S(skill("a_roundoff"), skill("b_backsalto"), skill("b_front"), { kind: "catch" });

  it("手以外のキャッチで終わるシリーズを最後に置く", () => {
    const templates = [
      tpl("足に絡めて受ける", "rope", nonHand()),
      tpl("投げ4シェネ", "common", plain()),
      tpl("三宙", "common", tumbling()),
    ];
    [1, 5, 9].forEach((seed) => {
      const r = generateRoutine(templates, { apparatus: "rope", random: seeded(seed), ...noAuto })!;
      // 3本とも使う構成なら、手以外のキャッチのシリーズが最後
      if (!r.used.some((t) => t.name === "足に絡めて受ける")) return;
      expect(r.used[r.used.length - 1].name).toBe("足に絡めて受ける");
    });
  });

  it("他の手具では並べ替えない", () => {
    const templates = [
      tpl("手以外で受ける", "common", nonHand()),
      tpl("投げ4シェネ", "common", plain()),
      tpl("三宙", "common", tumbling()),
    ];
    // スティックでは投げとタンブリングの交互並べだけが効く（最後が手以外とは限らない）
    const last = [1, 5, 9, 13].map((seed) => {
      const r = generateRoutine(templates, { apparatus: "stick", random: seeded(seed), ...noAuto })!;
      return r.used[r.used.length - 1].name;
    });
    expect(last.some((n) => n !== "手以外で受ける")).toBe(true);
  });
});
