import { describe, it, expect } from "vitest";
import { generateRoutine, usableTemplates } from "../generate";
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

const pool = (): SeriesTemplate[] => [
  tpl("投げ前", "common", throwFront()),
  tpl("投げ側", "common", throwSide()),
  tpl("投げ後", "common", throwBack()),
  tpl("三宙", "common", triple()),
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
