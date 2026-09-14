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
  catchStylesForThrow,
  catchStylesForPattern,
  NO_VIEW_TAG,
  LEFT_HAND_TAG,
  LEFT_HAND_NO_VIEW_CATCH_WEIGHT,
  catchStyleWeight,
  NON_HAND_TAG,
  NON_HAND_CATCH_MAX_MOTIONS,
  patternMotions,
  rollFinishShape,
  ROLL_FINISH_OTHER_CATCH_WEIGHT,
  throwStylesForPattern,
  VERTICAL_THREE_OTHER_CATCH_WEIGHT,
  cheneCountRange,
  isAutoThrowTemplate,
  withCheneCount,
  CATCH_USE_APPARATUS,
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

/** 自動生成のタンブリングを混ぜずに、投げの挙動だけを見る */
const noTumblings = { autoTumblings: false } as const;

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** 構成に入っているシェネの回数（シリーズごとの合計ではなく1つずつ） */
const cheneCounts = (r: { series: Series[] }): number[] =>
  r.series.flatMap((ser) =>
    ser.items.flatMap((item) => (item.kind === "motion" && item.motionId === "chene" ? [item.count ?? 1] : [])),
  );

/** シリーズの中身を「投げ/シェネ×n/前転/…」の並びで表す */
const shape = (series: Series): string[] =>
  series.items.map((item) => {
    if (item.kind === "throw") return "投げ";
    if (item.kind === "catch") return "キャッチ";
    if (item.kind === "motion") return `${item.motionId}×${item.count}`;
    return item.kind;
  });

describe("自動生成の投げの形", () => {
  it("投げ→シェネ→前転→転がり→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("cheneRollRoll", { cheneCount: 2 }));
    expect(shape(s)).toEqual(["投げ", "chene×2", "fwd_roll×1", "roll×1", "キャッチ"]);
  });

  it("投げ→シェネ→前転→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("cheneRoll", { cheneCount: 3 }));
    expect(shape(s)).toEqual(["投げ", "chene×3", "fwd_roll×1", "キャッチ"]);
  });

  it("投げ→シェネ→キャッチ", () => {
    const s = buildAutoThrowSeries(spec("chene", { cheneCount: 4 }));
    expect(shape(s)).toEqual(["投げ", "chene×4", "キャッチ"]);
  });

  it("投げ→前転3回→キャッチ（シェネなし）", () => {
    const s = buildAutoThrowSeries(spec("rolls"));
    expect(shape(s)).toEqual(["投げ", "fwd_roll×3", "キャッチ"]);
  });

  it("最低限の操作で必須投げを満たす形（徒手0〜1動作）", () => {
    expect(shape(buildAutoThrowSeries(spec("minimalChene")))).toEqual(["投げ", "chene×1", "キャッチ"]);
    expect(shape(buildAutoThrowSeries(spec("minimalRoll")))).toEqual(["投げ", "fwd_roll×1", "キャッチ"]);
    // 徒手なし（通常・視野外投げ→手以外のキャッチ など）
    expect(shape(buildAutoThrowSeries(spec("minimalNone")))).toEqual(["投げ", "キャッチ"]);
    expect(
      autoThrowSpecs("stick", { random: seeded(5) }).some(
        (sp) => sp.pattern.id === "minimalNone" && sp.catchStyle.id === "nonhand",
      ),
    ).toBe(true);
    // 手具の必須投げ（左手投げ・二つ投げ）とも組み合わせて出る
    const minimalWith = (app: ApparatusKey, throwId: string) =>
      autoThrowSpecs(app, { random: seeded(3) }).some(
        (sp) => sp.pattern.id.startsWith("minimal") && sp.throwStyle.id === throwId,
      );
    expect(minimalWith("stick", "lefthand")).toBe(true);
    expect(minimalWith("clubs", "twothrow")).toBe(true);
    expect(minimalWith("ring", "twothrow")).toBe(true);
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

  it("手具で押さえつけてキャッチはクラブ・リングだけ（二つ投げには付けない）", () => {
    // 手具が2つとも空中にある二つ投げでは、押さえつける手具が手元に無い
    expect(catchStylesForThrow("clubs", false).map((c) => c.id)).toContain(CATCH_USE_APPARATUS);
    expect(catchStylesForThrow("clubs", true).map((c) => c.id)).not.toContain(CATCH_USE_APPARATUS);
    expect(catchStylesForThrow("stick", false).map((c) => c.id)).not.toContain(CATCH_USE_APPARATUS);
    (["clubs", "ring"] as ApparatusKey[]).forEach((app) => {
      autoThrowSpecs(app, { random: seeded(41) }).forEach((sp) => {
        if (sp.throwStyle.two) expect(sp.catchStyle.id).not.toBe(CATCH_USE_APPARATUS);
      });
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
    const hands = autoThrowSpecs("clubs", { random: seeded(3) })
      .filter((s) => s.cheneCount > 0)
      .map((s) => s.hands);
    autoHandsVariants().forEach((v) => expect(hands).toContain(v));
  });

  it("できる限り被らせない（ひと回りするまで同じ手を使わない）", () => {
    const variants = autoHandsVariants().length;
    // シェネのある形だけが手の種類を消費する
    const hands = autoThrowSpecs("stick", { random: seeded(29) })
      .filter((s) => s.cheneCount > 0)
      .map((s) => s.hands);
    // 連続する variants 個を切り出すと、どの周も同じ手は1回ずつ
    for (let i = 0; i + variants <= hands.length; i += variants) {
      expect(new Set(hands.slice(i, i + variants)).size).toBe(variants);
    }
  });

  it("シェネのない形は手の種類を持たない（名前にも出さない）", () => {
    const specs = autoThrowSpecs("stick", { random: seeded(3) }).filter((s) => s.cheneCount === 0);
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach((sp) => {
      expect(sp.hands).toBeNull();
      expect(autoThrowName(sp)).not.toContain("シェネ");
    });
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

  it("前転3回は縦3動作でE難度", () => {
    const a = analyzeSeries(buildAutoThrowSeries(spec("rolls")));
    expect(a.units.map((u) => u.finalDiff)).toEqual(["E"]);
  });

  it("視野外のパターンは投げ2回・技術加点0.2", () => {
    const series = buildAutoThrowSeries(spec("cheneNoView", { cheneCount: 4 }));
    expect(analyzeSeries(series).throwCount).toBe(2);
    expect(computeScore([series], "stick").techniqueBonus).toBeCloseTo(0.2, 5);
  });

  it("表示名は種類だけ（中身はシリーズの内容で分かるので解説は付けない）", () => {
    expect(autoThrowName()).toBe("自動生成の投げ");
    autoThrowTemplates("stick", { random: seeded(3) }).forEach((t) => expect(t.name).toBe("自動生成の投げ"));
  });
});

describe("ランダム生成への組み込み", () => {
  it("タンブリングのテンプレートだけでも投げの必須要素を満たせる", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, random: seeded(7) })!;
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
      generateRoutine(tumblingOnly(), { apparatus: "clubs", ...noTumblings, random: seeded(11) })!.series,
      "clubs",
    );
    expect(score.varietyDeduction).toBe(0);
  });

  it("入れる本数は上限まで（テンプレートを押しのけない）", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, random: seeded(23) })!;
    expect(r.used.filter((t) => t.auto).length).toBeLessThanOrEqual(DEFAULT_MAX_AUTO_THROWS);
    expect(r.used.some((t) => !t.auto)).toBe(true);
  });

  it("上限は変えられる", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, maxAutoThrows: 1, random: seeded(23) })!;
    expect(r.used.filter((t) => t.auto).length).toBe(1);
  });

  it("候補数を絞れる", () => {
    expect(autoThrowSpecs("stick", { limit: 4, random: seeded(5) })).toHaveLength(4);
    expect(autoThrowTemplates("stick", { limit: 0 })).toHaveLength(0);
  });

  it("ジュニアでも投げの上限（5回）を超えない", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, junior: true, random: seeded(19) })!;
    expect(computeScore(r.series, "stick", { junior: true }).totalThrowCount).toBeLessThanOrEqual(5);
  });

  it("Dスコアの上限を指定すると、シェネの回数を減らして収める", () => {
    const seeds = [3, 7, 11, 19, 23];
    const run = (maxScore: number | null) =>
      seeds.map((seed) => generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, maxScore, random: seeded(seed) })!);
    const free = run(null);
    const capped = run(2.5);
    // 上限内に収まる
    capped.forEach((r) => expect(r.dScore).toBeLessThanOrEqual(2.5 + 1e-9));
    // シェネの回数の合計は上限ありのほうが少ない（丸ごと落とすのではなく回数で調整する）
    expect(sum(capped.map(cheneCounts).map(sum))).toBeLessThan(sum(free.map(cheneCounts).map(sum)));
  });

  it("シェネの回数は形ごとの範囲から外れない（調整後も）", () => {
    [null, 3.0, 2.0].forEach((maxScore) => {
      [3, 7, 11].forEach((seed) => {
        const r = generateRoutine(tumblingOnly(), { apparatus: "stick", ...noTumblings, maxScore, random: seeded(seed) })!;
        r.used.forEach((t, i) => {
          if (!isAutoThrowTemplate(t)) return;
          expect(cheneCountRange(t.spec.pattern)).toContain(t.spec.cheneCount);
          // 組み立てた内容とシリーズの中身が食い違わない
          const item = r.series[i].items.find((x) => x.kind === "motion" && x.motionId === "chene");
          if (item?.kind === "motion") expect(item.count).toBe(t.spec.cheneCount);
        });
      });
    });
  });

  it("シェネの回数だけを差し替えられる（範囲外・変化なしは null）", () => {
    const t = autoThrowTemplates("stick").find((x) => x.spec.pattern.id === "chene")!; // シェネ3〜4回
    const other = t.spec.cheneCount === 3 ? 4 : 3;
    const tuned = withCheneCount(t, other)!;
    expect(tuned.spec.cheneCount).toBe(other);
    expect(tuned.id).toBe(t.id); // 同じ候補として扱う
    const chene = tuned.series.items.find((x) => x.kind === "motion");
    expect(chene?.kind === "motion" && chene.count).toBe(other);
    expect(withCheneCount(t, t.spec.cheneCount)).toBeNull();
    expect(withCheneCount(t, 1)).toBeNull(); // この形の範囲外
  });

  it("先に最低限の投げ受けを1本置く形がある（日本トップのロープの1シリーズ目）", () => {
    const list = autoThrowTemplates("rope").filter((t) => t.spec.pattern.leadPair);
    expect(list.length).toBeGreaterThan(0);
    list.forEach((t) => {
      const items = t.series.items;
      // 投げ→キャッチ（徒手なし）→本体の投げ→…→キャッチ
      expect(items[0].kind).toBe("throw");
      expect(items[1].kind).toBe("catch");
      expect(items[2].kind).toBe("throw");
      expect(items[1].kind === "catch" && items[1].catchTypes).toBeUndefined();
      // 先の投げは二つ投げにしない（2つ同時キャッチが要るので通常のキャッチで受けられない）
      expect(t.spec.leadThrowStyle?.two).toBeFalsy();
      expect(analyzeSeries(t.series).throwCount).toBe(2);
      expect(checkApparatusFlow(t.series, "rope")).toEqual([]);
    });
    // 手以外の投げ→キャッチ→視野外の投げ→シェネ→キャッチ のような組み合わせが出る
    const styles = new Set(list.map((t) => t.spec.leadThrowStyle?.id));
    expect(styles.size).toBeGreaterThan(1);
  });

  it("視野外のキャッチ→視野外の投げは作らない（物理的に実施できない）", () => {
    // 視野外の投げ受けを足す形では、その直前の受けを視野外にしない
    const pattern = AUTO_THROW_PATTERNS.find((x) => x.noViewPair)!;
    expect(catchStylesForPattern("stick", false, pattern).map((c) => c.id)).not.toContain(NO_VIEW_TAG);
    // 足さない形では視野外のキャッチも使う
    const plain = AUTO_THROW_PATTERNS.find((x) => !x.noViewPair)!;
    expect(catchStylesForPattern("stick", false, plain).map((c) => c.id)).toContain(NO_VIEW_TAG);
    // 組み立てた候補にも並びが現れない
    (["stick", "clubs", "ring", "rope"] as ApparatusKey[]).forEach((app) =>
      autoThrowTemplates(app).forEach((t) =>
        t.series.items.forEach((item, i) => {
          const next = t.series.items[i + 1];
          if (item.kind !== "catch" || next?.kind !== "throw") return;
          const noViewCatch = (item.catchTypes || []).includes(NO_VIEW_TAG);
          const noViewThrow = (next.throwTypes || []).includes(NO_VIEW_TAG);
          expect(noViewCatch && noViewThrow).toBe(false);
        }),
      ),
    );
  });

  it("連続投げの前の受けは手以外にしない／2回目の投げは手以外にしない", () => {
    const paired = AUTO_THROW_PATTERNS.find((x) => x.noViewPair)!;
    const lead = AUTO_THROW_PATTERNS.find((x) => x.leadPair)!;
    // 手以外のキャッチから次の投げには繋げない
    expect(catchStylesForPattern("stick", false, paired).map((c) => c.id)).not.toContain(NON_HAND_TAG);
    // 連続投げの2回目（先に1本置く形の本体の投げ）は手以外にしない
    expect(throwStylesForPattern("stick", lead).map((t) => t.id)).not.toContain(NON_HAND_TAG);
    // 1本だけの形では手以外の投げ受けも使う
    const plain = AUTO_THROW_PATTERNS.find((x) => !x.noViewPair && !x.leadPair)!;
    expect(catchStylesForPattern("stick", false, plain).map((c) => c.id)).toContain(NON_HAND_TAG);
    expect(throwStylesForPattern("stick", plain).map((t) => t.id)).toContain(NON_HAND_TAG);
    // 組み立てた候補にも並びが現れない（先に置く1本目の投げが手以外なのは可）
    (["stick", "clubs", "ring", "rope"] as ApparatusKey[]).forEach((app) =>
      autoThrowTemplates(app).forEach((t) => {
        const items = t.series.items;
        items.forEach((item, i) => {
          const next = items[i + 1];
          if (item.kind !== "catch" || next?.kind !== "throw") return;
          // 手以外のキャッチ → 次の投げ
          expect((item.catchTypes || []).includes(NON_HAND_TAG)).toBe(false);
          // 2回目の投げが手以外
          expect((next.throwTypes || []).includes(NON_HAND_TAG)).toBe(false);
        });
      }),
    );
  });

  it("手以外のキャッチは手具ごとに実施しやすさが違う", () => {
    const plain = AUTO_THROW_PATTERNS.find((x) => !x.noViewPair && !x.verticalThree && !rollFinishShape(x))!;
    const normalThrow = autoThrowStyles("stick").find((t) => t.id === "normal")!;
    const nonHand = autoCatchStyles("stick").find((c) => c.id === NON_HAND_TAG)!;
    const w = (apparatus: ApparatusKey, motions: number) =>
      catchStyleWeight({ throwStyle: normalThrow, catchStyle: nonHand, pattern: plain, apparatus, motions });
    // スティックは低難度の投げ（徒手0〜1動作）で実施する
    expect(w("stick", 0)).toBe(1);
    expect(w("stick", NON_HAND_CATCH_MAX_MOTIONS)).toBe(1);
    expect(w("stick", NON_HAND_CATCH_MAX_MOTIONS + 1)).toBe(0);
    // クラブは低難度の投げで、しかも低確率
    expect(w("clubs", 0)).toBeLessThan(1);
    expect(w("clubs", 0)).toBeGreaterThan(0);
    expect(w("clubs", NON_HAND_CATCH_MAX_MOTIONS + 1)).toBe(0);
    // リング・ロープは普通に実施する
    expect(w("ring", 4)).toBe(1);
    expect(w("rope", 4)).toBe(1);
    // 組み立てた候補でも、スティックの手以外のキャッチは徒手0〜1動作のものだけ
    (["stick", "clubs"] as ApparatusKey[]).forEach((app) =>
      autoThrowSpecs(app).forEach((sp) => {
        if (sp.catchStyle.id !== NON_HAND_TAG) return;
        expect(patternMotions(sp.pattern, sp.cheneCount)).toBeLessThanOrEqual(NON_HAND_CATCH_MAX_MOTIONS);
      }),
    );
    // リング・ロープは徒手の多い投げでも手以外で受ける候補が出る
    const many = (app: ApparatusKey) =>
      autoThrowSpecs(app).some(
        (sp) =>
          sp.catchStyle.id === NON_HAND_TAG &&
          patternMotions(sp.pattern, sp.cheneCount) > NON_HAND_CATCH_MAX_MOTIONS,
      );
    expect(many("ring")).toBe(true);
    expect(many("rope")).toBe(true);
  });

  it("クラブ・リングは転がり・前転のあと手具を使ったキャッチが定番", () => {
    expect(ROLL_FINISH_OTHER_CATCH_WEIGHT).toBeLessThan(1);
    // 動作の最後が転がり・前転の形
    const roll = AUTO_THROW_PATTERNS.find((x) => rollFinishShape(x) && !x.verticalThree)!;
    const plain = AUTO_THROW_PATTERNS.find((x) => !rollFinishShape(x) && !x.verticalThree)!;
    const throwStyle = autoThrowStyles("clubs").find((t) => t.id === "normal")!;
    const w = (apparatus: ApparatusKey, pattern: typeof roll, catchId: string) =>
      catchStyleWeight({
        throwStyle,
        catchStyle: autoCatchStyles(apparatus).find((c) => c.id === catchId)!,
        pattern,
        apparatus,
        motions: 2,
      });
    // クラブ・リングは押さえつけ以外を引きにくくする
    (["clubs", "ring"] as ApparatusKey[]).forEach((app) => {
      expect(w(app, roll, CATCH_USE_APPARATUS)).toBe(1);
      expect(w(app, roll, "normal")).toBe(ROLL_FINISH_OTHER_CATCH_WEIGHT);
      // 転がり・前転で終わらない形は変えない
      expect(w(app, plain, "normal")).toBe(1);
    });
    // 実際に組み立てた候補でも、その形の受け方は押さえつけが最も多い
    const count = new Map<string, number>();
    for (let seed = 0; seed < 20; seed++)
      autoThrowSpecs("clubs", { random: seeded(seed) })
        .filter((sp) => rollFinishShape(sp.pattern) && !sp.pattern.verticalThree)
        .forEach((sp) => count.set(sp.catchStyle.id, (count.get(sp.catchStyle.id) ?? 0) + 1));
    const useapp = count.get(CATCH_USE_APPARATUS) ?? 0;
    expect(useapp).toBeGreaterThan(0);
    [...count.entries()]
      .filter(([id]) => id !== CATCH_USE_APPARATUS)
      .forEach(([, n]) => expect(useapp).toBeGreaterThan(n));
  });

  it("前転3回（縦3動作）は手具を使ったキャッチが主流", () => {
    expect(VERTICAL_THREE_OTHER_CATCH_WEIGHT).toBeLessThan(1);
    const pattern = AUTO_THROW_PATTERNS.find((x) => x.verticalThree)!;
    expect(pattern.id).toBe("rolls");
    // クラブは手具で押さえつけて受けられるので、受け方の中でそれが最も多くなる
    const count = new Map<string, number>();
    for (let seed = 0; seed < 20; seed++)
      autoThrowSpecs("clubs", { random: seeded(seed) })
        .filter((sp) => sp.pattern.verticalThree)
        .forEach((sp) => count.set(sp.catchStyle.id, (count.get(sp.catchStyle.id) ?? 0) + 1));
    const useapp = count.get(CATCH_USE_APPARATUS) ?? 0;
    expect(useapp).toBeGreaterThan(0);
    [...count.entries()]
      .filter(([id]) => id !== CATCH_USE_APPARATUS)
      .forEach(([, n]) => expect(useapp).toBeGreaterThan(n));
  });

  it("左手投げを視野外で受ける候補はかなり少ない", () => {
    expect(LEFT_HAND_NO_VIEW_CATCH_WEIGHT).toBeLessThan(1);
    const plain = AUTO_THROW_PATTERNS.find((x) => !x.noViewPair && !x.verticalThree && !rollFinishShape(x))!;
    const left = autoThrowStyles("stick").find((t) => (t.reqTypes || []).includes(LEFT_HAND_TAG))!;
    const noView = autoCatchStyles("stick").find((c) => c.id === NO_VIEW_TAG)!;
    const normal = autoCatchStyles("stick").find((c) => c.id === "normal")!;
    const w = (throwStyle: typeof left, catchStyle: typeof noView, motions = 0) =>
      catchStyleWeight({ throwStyle, catchStyle, pattern: plain, apparatus: "stick", motions });
    expect(w(left, noView)).toBe(LEFT_HAND_NO_VIEW_CATCH_WEIGHT);
    expect(w(left, normal)).toBe(1);
    // 左手投げ以外なら視野外のキャッチも普通に出る
    const nomal = autoThrowStyles("stick").find((t) => t.id === "normal")!;
    expect(w(nomal, noView)).toBe(1);
    // 実際に組み立てた候補でも、左手投げの視野外キャッチは他の受け方より少ない
    let noViewCatch = 0;
    let other = 0;
    for (let seed = 0; seed < 20; seed++)
      autoThrowSpecs("stick", { random: seeded(seed) })
        .filter((sp) => (sp.throwStyle.reqTypes || []).includes(LEFT_HAND_TAG))
        .forEach((sp) => {
          if (sp.catchStyle.id === NO_VIEW_TAG) noViewCatch += 1;
          else other += 1;
        });
    expect(noViewCatch * 3).toBeLessThan(other);
  });

  it("autoThrows: false なら使わない", () => {
    const r = generateRoutine(tumblingOnly(), { apparatus: "stick", autoThrows: false, random: seeded(7) })!;
    expect(r.used.some(isAutoThrowTemplate)).toBe(false);
  });
});
