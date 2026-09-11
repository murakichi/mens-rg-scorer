import { describe, it, expect } from "vitest";
import {
  AUTO_THROW_PATTERNS,
  autoCatchStyles,
  autoHandsVariants,
  autoThrowName,
  autoThrowSpecs,
  autoThrowStyles,
  autoThrowTemplates,
  buildAutoThrowSeries,
  type AutoThrowSpec,
} from "../autoThrows";
import { analyzeSeries, checkApparatusFlow } from "../analysis";
import { DEFAULT_MAX_AUTO_THROWS, generateRoutine } from "../generate";
import { computeScore } from "../score";
import { newTemplateId, type SeriesTemplate, type TemplateApparatus } from "../templates";
import type { ApparatusKey, Item, Series } from "../types";

const APPARATUS_KEYS: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];

/** 決まった順に進む疑似乱数（テストを安定させる） */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string, hasApparatus = true): Item => ({ kind: "skill", skillId, hasApparatus, isThrow: false });
const tpl = (name: string, apparatus: TemplateApparatus, series: Series): SeriesTemplate => ({
  id: newTemplateId(),
  name,
  apparatus,
  updatedAt: 0,
  series,
});

/** 投げを含まないタンブリングだけのテンプレート（投げは自動生成に任せる） */
const tumblingOnly = (): SeriesTemplate[] => [
  tpl("三宙", "common", S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"), { kind: "catch" })),
  tpl("前方", "common", S(skill("a_handspring"), skill("b_front"), { kind: "catch" })),
  tpl("側方", "common", S(skill("a_roundoff"), skill("b_sidesalto"), { kind: "catch" })),
];

const spec = (patternId: string, over: Partial<AutoThrowSpec> = {}): AutoThrowSpec => ({
  pattern: AUTO_THROW_PATTERNS.find((p) => p.id === patternId)!,
  cheneCount: AUTO_THROW_PATTERNS.find((p) => p.id === patternId)!.chene.min,
  hands: null,
  throwStyle: autoThrowStyles("stick")[0],
  catchStyle: autoCatchStyles("stick")[0],
  ...over,
});

/** シリーズの中身を「投げ/シェネ×n/前転/…」の並びで表す */
const shape = (series: Series): string[] =>
  series.items.map((item) => {
    if (item.kind === "throw") return "投げ";
    if (item.kind === "catch") return "キャッチ";
    if (item.kind === "motion") return item.motionId === "chene" ? `chene×${item.count}` : item.motionId;
    return item.kind;
  });

describe("自動生成の投げの形", () => {
  it("投げ→シェネ→前転→転がり→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("cheneRollRoll", { cheneCount: 2 }));
    expect(shape(s)).toEqual(["投げ", "chene×2", "fwd_roll", "roll", "キャッチ"]);
  });

  it("投げ→シェネ→前転→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("cheneRoll", { cheneCount: 3 }));
    expect(shape(s)).toEqual(["投げ", "chene×3", "fwd_roll", "キャッチ"]);
  });

  it("投げ→シェネ→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("chene", { cheneCount: 4 }));
    expect(shape(s)).toEqual(["投げ", "chene×4", "キャッチ"]);
  });

  it("視野外のパターンはキャッチのあとに視野外の投げ受けを足す", () => {
    const s = buildAutoThrowSeries(spec("cheneNoView", { cheneCount: 3 }));
    expect(shape(s)).toEqual(["投げ", "chene×3", "キャッチ", "投げ", "キャッチ"]);
    const [, , , thr, cat] = s.items;
    expect(thr.kind === "throw" && thr.throwTypes).toEqual(["noview"]);
    expect(cat.kind === "catch" && cat.catchTypes).toEqual(["noview"]);
  });

  it("シェネの回数は形ごとの範囲に収まる", () => {
    APPARATUS_KEYS.forEach((app) => {
      autoThrowSpecs(app, { random: seeded(5) }).forEach((sp) => {
        expect(sp.cheneCount).toBeGreaterThanOrEqual(sp.pattern.chene.min);
        expect(sp.cheneCount).toBeLessThanOrEqual(sp.pattern.chene.max);
      });
    });
  });
});

describe("投げ方・受け方の網羅", () => {
  it("手具ごとの必須投げが入る（スティックは左手投げ、クラブ・リングは二つ投げ）", () => {
    expect(autoThrowStyles("stick").map((t) => t.id)).toContain("lefthand");
    expect(autoThrowStyles("clubs").map((t) => t.id)).toContain("twothrow");
    expect(autoThrowStyles("ring").map((t) => t.id)).toContain("twothrow");
    expect(autoThrowStyles("rope").some((t) => t.reqTypes)).toBe(false);
  });

  it("手具を使った投げ・キャッチは2つ持つ手具だけ", () => {
    expect(autoThrowStyles("clubs").map((t) => t.id)).toContain("useapp");
    expect(autoCatchStyles("ring").map((c) => c.id)).toContain("useapp");
    expect(autoThrowStyles("stick").map((t) => t.id)).not.toContain("useapp");
    expect(autoCatchStyles("rope").map((c) => c.id)).not.toContain("useapp");
  });

  it("候補にはその手具の投げ方がひととおり出る", () => {
    APPARATUS_KEYS.forEach((app) => {
      const used = new Set(autoThrowSpecs(app, { random: seeded(13) }).map((s) => s.throwStyle.id));
      autoThrowStyles(app).forEach((t) => expect(used).toContain(t.id));
    });
  });

  it("二つ投げは2つ同時キャッチで受ける（手具の流れが破綻しない）", () => {
    APPARATUS_KEYS.forEach((app) => {
      autoThrowTemplates(app, { random: seeded(17) }).forEach((t) => {
        expect(checkApparatusFlow(t.series, app)).toEqual([]);
      });
    });
  });
});

describe("シェネの手", () => {
  it("手なしと手ありの各種類を使う", () => {
    const hands = autoThrowSpecs("clubs", { random: seeded(3) }).map((s) => s.hands);
    autoHandsVariants().forEach((v) => expect(hands).toContain(v));
  });

  it("できる限り被らせない（ひと回りするまで同じ手を使わない）", () => {
    const variants = autoHandsVariants().length;
    const hands = autoThrowSpecs("stick", { random: seeded(29) }).map((s) => s.hands);
    // 連続する variants 個を切り出すと、どの周も同じ手は1回ずつ
    for (let i = 0; i + variants <= hands.length; i += variants) {
      expect(new Set(hands.slice(i, i + variants)).size).toBe(variants);
    }
  });

  it("手ありのシェネには種類が付く（手なしには付かない）", () => {
    const withHands = buildAutoThrowSeries(spec("chene", { hands: "spin" })).items[1];
    expect(withHands.kind === "motion" && withHands.hands).toBe(true);
    expect(withHands.kind === "motion" && withHands.handsType).toBe("spin");
    const noHands = buildAutoThrowSeries(spec("chene", { hands: null })).items[1];
    expect(noHands.kind === "motion" && noHands.hands).toBe(false);
    expect(noHands.kind === "motion" && noHands.handsType).toBeUndefined();
  });
});

describe("自動生成の投げの採点", () => {
  it("徒手系の難度が付く（シェネ3回＝D、4回＝E）", () => {
    const three = analyzeSeries(buildAutoThrowSeries(spec("chene", { cheneCount: 3 })));
    expect(three.units.map((u) => u.finalDiff)).toEqual(["D"]);
    const four = analyzeSeries(buildAutoThrowSeries(spec("chene", { cheneCount: 4 })));
    expect(four.units.map((u) => u.finalDiff)).toEqual(["E"]);
  });

  it("シェネ2回→前転→転がりは4動作でE難度", () => {
    const a = analyzeSeries(buildAutoThrowSeries(spec("cheneRollRoll", { cheneCount: 2 })));
    expect(a.units.map((u) => u.finalDiff)).toEqual(["E"]);
  });

  it("視野外のパターンは投げ2回・技術加点0.2", () => {
    const series = buildAutoThrowSeries(spec("cheneNoView", { cheneCount: 4 }));
    expect(analyzeSeries(series).throwCount).toBe(2);
    expect(computeScore([series], "stick").techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("表示名に投げ方・受け方・シェネの手が出る", () => {
    const name = autoThrowName(
      spec("chene", {
        hands: "both",
        throwStyle: autoThrowStyles("stick").find((t) => t.id === "lefthand")!,
        catchStyle: autoCatchStyles("stick").find((c) => c.id === "noview")!,
      }),
    );
    expect(name).toContain("左手投げ");
    expect(name).toContain("視野外のキャッチ");
    expect(name).toContain("両手上げ");
  });
});

describe("ランダム生成への組み込み", () => {
  it("タンブリングのテンプレートだけでも投げの必須要素を満たせる", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", random: seeded(7) })!;
    const score = computeScore(r.series, "stick");
    const passed = (key: string) => score.required.find((x) => x.key === key)?.passed;
    // 3回以上の投げ上げ・左投げ左受け・右投げ右受けは自動生成の投げで満たす
    expect(passed("count3")).toBe(true);
    const element = (id: string) => score.apparatusElementChecks.find((x) => x.key === `appEl_${id}`)?.passed;
    expect(element("stick_left")).toBe(true);
    expect(element("stick_right")).toBe(true);
    expect(r.used.some((t) => t.auto)).toBe(true);
  });

  it("投げ方・受け方の多様性（各3種類）も満たしやすくなる", () => {
    const score = computeScore(
      generateRoutine(tumblingOnly(), { apparatus: "clubs", random: seeded(11) })!.series,
      "clubs",
    );
    expect(score.varietyDeduction).toBe(0);
  });

  it("入れる本数は上限まで（テンプレートを押しのけない）", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", random: seeded(23) })!;
    expect(r.used.filter((t) => t.auto).length).toBeLessThanOrEqual(DEFAULT_MAX_AUTO_THROWS);
    expect(r.used.some((t) => !t.auto)).toBe(true);
  });

  it("上限は変えられる", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", maxAutoThrows: 1, random: seeded(23) })!;
    expect(r.used.filter((t) => t.auto).length).toBe(1);
  });

  it("候補数を絞れる", () => {
    expect(autoThrowSpecs("stick", { limit: 4, random: seeded(5) })).toHaveLength(4);
    expect(autoThrowTemplates("stick", { limit: 0 })).toHaveLength(0);
  });

  it("ジュニアでも投げの上限（5回）を超えない", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", junior: true, random: seeded(19) })!;
    expect(computeScore(r.series, "stick", { junior: true }).totalThrowCount).toBeLessThanOrEqual(5);
  });

  it("autoThrows: false なら使わない", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", autoThrows: false, random: seeded(7) })!;
    expect(r.used.some((t) => t.auto)).toBe(false);
  });

  it("テンプレートが1つも無ければ生成しない（投げだけの構成にはしない）", () => {
    expect(generateRoutine([], { apparatus: "stick", random: seeded(7) })).toBeNull();
  });
});
