import { describe, it, expect } from "vitest";
import { generateRoutine, saltoRepeatCount, usableTemplates } from "../generate";
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

  it("使えるテンプレートが無ければ null", () => {
    expect(generateRoutine([], { apparatus: "stick" })).toBeNull();
    expect(generateRoutine([tpl("二つ投げ", "clubs", throwFront())], { apparatus: "rope" })).toBeNull();
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
    const r = generateRoutine(tums, { apparatus: "stick", random: seeded(17) })!;
    expect(r.used.length).toBeLessThanOrEqual(3);
  });

  it("同じ内容のテンプレートを重ねない（重複はDに寄与しないので落ちる）", () => {
    const dup = [tpl("A", "common", throwFront()), tpl("Aのコピー", "common", throwFront())];
    const r = generateRoutine(dup, { apparatus: "stick", random: seeded(11) })!;
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
    expect(count(generateRoutine(many, { apparatus: "stick", random: seeded(23) })!)).toBe(1);
    expect(count(generateRoutine(many, { apparatus: "stick", maxThrowTumbling: 3, random: seeded(23) })!)).toBe(3);
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
    const r = generateRoutine([same, varied], { apparatus: "stick", maxSeries: 1, random: seeded(31) })!;
    expect(r.used.map((t) => t.name)).toEqual(["いろいろ3連続"]);
  });

  it("点数が上がるなら繰り返しも許す（必須ではない）", () => {
    // 後宙3連続（D難度・0.5）と 前宙1本（B難度・0.2）なら、繰り返しがあっても前者を採る
    const strong = tpl("後宙3連続", "common", S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto")));
    const weak = tpl("前宙1本", "common", S(skill("b_front")));
    const r = generateRoutine([strong, weak], { apparatus: "stick", maxSeries: 1, random: seeded(31) })!;
    expect(r.used.map((t) => t.name)).toEqual(["後宙3連続"]);
  });
});
