import { describe, it, expect } from "vitest";
import {
  AUTO_TUMBLING_PATTERNS,
  autoTumblingName,
  autoTumblingSpecs,
  autoTumblingTemplates,
  buildAutoTumblingSeries,
  canChainAfter,
  isAutoTumblingTemplate,
  saltoCountRange,
  saltoOptions,
  tumblingFlowErrors,
  usedSkillIds,
  withSaltoCount,
  type AutoTumblingSpec,
} from "../autoTumblings";
import { analyzeSeries, hasConnect, maxSaltoChain } from "../analysis";
import { CATEGORY, ROUNDOFF_SKILL_ID, skillDef } from "../constants";
import { DEFAULT_MAX_AUTO_TUMBLINGS, generateRoutine } from "../generate";
import { computeScore } from "../score";
import { newTemplateId, type SeriesTemplate, type TemplateApparatus } from "../templates";
import type { Item, Series } from "../types";

/** 決まった順に進む疑似乱数（テストを安定させる） */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: true, isThrow: false });
const tpl = (name: string, apparatus: TemplateApparatus, series: Series): SeriesTemplate => ({
  id: newTemplateId(),
  name,
  apparatus,
  updatedAt: 0,
  series,
});

/** 後方宙返り・前宙・バク転・側転・側宙 だけを使うテンプレート群 */
const myTemplates = (): SeriesTemplate[] => [
  tpl("三宙", "common", S(skill("a_roundoff"), skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"))),
  tpl("つなぎ", "common", S(skill("a_roundoff"), skill("b_backsalto"), skill("a_flicflac"), skill("b_backsalto"))),
  tpl("側方", "common", S(skill("a_cartwheel"), skill("b_sidesalto"))),
  tpl("投げタン", "common", S({ kind: "throw" }, skill("b_front"), { kind: "catch" })),
];

const pattern = (id: string) => AUTO_TUMBLING_PATTERNS.find((p) => p.id === id)!;
const spec = (patternId: string, over: Partial<AutoTumblingSpec> = {}): AutoTumblingSpec => {
  const p = pattern(patternId);
  return {
    pattern: p,
    saltoCount: p.saltos.max,
    entry: [],
    saltoIds: [...Array(p.saltos.max)].map(() => saltoOptions(p, false, false)[0] ?? saltoOptions(p, false, true)[0]),
    connectId: saltoOptions(p, false, true)[0],
    ...over,
  };
};
const names = (series: Series) =>
  series.items.map((it) =>
    it.kind === "skill" ? skillDef(it.skillId)?.name ?? it.skillId : it.kind === "throw" ? "投げ" : "キャッチ",
  );
const skillsOf = (series: Series) => analyzeSeries(series).units.flatMap((u) => u.skills);

describe("入力画面の制約", () => {
  it("どの候補も入力画面でそのまま入力できる並びになっている（一般・ジュニア）", () => {
    [false, true].forEach((junior) => {
      [3, 7, 11, 19].forEach((seed) => {
        autoTumblingTemplates("stick", { junior, random: seeded(seed) }).forEach((t) => {
          expect(tumblingFlowErrors(t.series, junior)).toEqual([]);
        });
      });
    });
  });

  it("後方系はロンダートから入る（手前が無ければ補う）", () => {
    const s = buildAutoTumblingSeries(spec("back", { entry: [], saltoIds: ["b_backsalto"], saltoCount: 1 }));
    expect(names(s)).toEqual(["ロンダート", "後方宙返り"]);
    expect(tumblingFlowErrors(s)).toEqual([]);
  });

  it("宙返りを続けられるのは同じ向きで降りる技だけ", () => {
    // 後方系：ひねりなし・整数ひねりは続けられる、半ひねりは最後だけ
    expect(canChainAfter("b_backsalto", CATEGORY.BACKWARD)).toBe(true);
    expect(canChainAfter("c_back1full", CATEGORY.BACKWARD)).toBe(true);
    expect(canChainAfter("b_backhalf", CATEGORY.BACKWARD)).toBe(false);
    // 前方系はその逆（半ひねりで後ろ向きになる）
    expect(canChainAfter("b_front", CATEGORY.FORWARD)).toBe(true);
    expect(canChainAfter("b_fronthalf", CATEGORY.FORWARD)).toBe(false);
    // 連続の途中に使う技は続けられるものだけ
    AUTO_TUMBLING_PATTERNS.filter((p) => p.saltos.max >= 2).forEach((p) => {
      saltoOptions(p, false, false).forEach((id) => expect(canChainAfter(id, p.category)).toBe(true));
    });
  });

  it("ジュニアは2回宙返り系を使わない", () => {
    autoTumblingTemplates("stick", { junior: true, random: seeded(5) }).forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind === "skill") expect(skillDef(item.skillId)?.isDoubleSalto).toBeFalsy();
      }),
    );
  });

  it("制約に反する並びは検出できる", () => {
    // ロンダート無しでいきなり後方宙返り／バク転の直後に前方系
    expect(tumblingFlowErrors(S(skill("b_backsalto")))).toHaveLength(1);
    expect(tumblingFlowErrors(S(skill("a_flicflac"), skill("b_front")))).toHaveLength(1);
    expect(tumblingFlowErrors(S(skill("a_roundoff"), skill("b_backsalto")))).toEqual([]);
  });
});

describe("自動生成のタンブリングの形", () => {
  it("宙返りの連続（三宙）になる", () => {
    const s = buildAutoTumblingSeries(spec("back", { saltoIds: ["b_backsalto", "b_backsalto", "b_backsalto"], saltoCount: 3 }));
    expect(maxSaltoChain(skillsOf(s).map((x) => x.skillId))).toBe(3);
  });

  it("つなぎの形は宙返りの間にA難度技が入る", () => {
    const s = buildAutoTumblingSeries(
      spec("backConnect", { saltoIds: ["b_backsalto", "b_backsalto"], saltoCount: 2, connectId: "a_flicflac" }),
    );
    expect(hasConnect(skillsOf(s))).toBe(true);
    // つなぎ技にも手具操作を付ける（§3.5.6.3 の −0.2 を受けないように）
    expect(skillsOf(s).every((x) => x.hasApparatus)).toBe(true);
  });

  it("投げ受けの形は投げタンになる", () => {
    const s = buildAutoTumblingSeries(spec("throwFront", { saltoIds: ["b_front"], saltoCount: 1 }));
    expect(names(s)[0]).toBe("投げ");
    expect(names(s).at(-1)).toBe("キャッチ");
    expect(analyzeSeries(s).units.some((u) => u.isThrowTumbling)).toBe(true);
  });

  it("宙返りの本数は形ごとの範囲に収まる", () => {
    autoTumblingSpecs({ random: seeded(13) }).forEach((sp) => {
      expect(saltoCountRange(sp.pattern)).toContain(sp.saltoCount);
      expect(sp.saltoIds.length).toBeGreaterThanOrEqual(sp.saltoCount);
    });
  });

  it("宙返りの本数だけを差し替えられる（範囲外・変化なしは null）", () => {
    const t = autoTumblingTemplates("stick", { random: seeded(3) }).find(
      (x) => saltoCountRange(x.spec.pattern).length > 1,
    )!;
    const other = saltoCountRange(t.spec.pattern).find((n) => n !== t.spec.saltoCount)!;
    const tuned = withSaltoCount(t, other)!;
    expect(tuned.spec.saltoCount).toBe(other);
    expect(tuned.id).toBe(t.id);
    expect(tumblingFlowErrors(tuned.series)).toEqual([]);
    expect(withSaltoCount(t, t.spec.saltoCount)).toBeNull();
    expect(withSaltoCount(t, 99)).toBeNull();
  });

  it("表示名に最後の技と連続本数が出る", () => {
    const name = autoTumblingName(spec("back", { saltoIds: ["b_backsalto", "b_backsalto"], saltoCount: 2 }));
    expect(name).toContain("後方宙返り");
    expect(name).toContain("2連続");
  });
});

describe("使ってよい技の範囲", () => {
  it("指定した技だけで組む（後方系に補うロンダートは除く）", () => {
    const allowed = ["b_backsalto", "b_front", "a_flicflac", "a_cartwheel", "b_sidesalto"];
    autoTumblingTemplates("stick", { skillIds: allowed, random: seeded(7) }).forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind !== "skill") return;
        expect([...allowed, ROUNDOFF_SKILL_ID]).toContain(item.skillId);
      }),
    );
  });

  it("実施する技が無い系統の形は作らない", () => {
    // 後方系の宙返りしか使わないなら、前方系・側方系の形は出さない
    const specs = autoTumblingSpecs({ skillIds: ["b_backsalto", "a_flicflac"], random: seeded(7) });
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach((sp) => expect(sp.pattern.category).toBe(CATEGORY.BACKWARD));
  });

  it("構成で使っている転回技を拾える（徒手として入れた技も含む）", () => {
    const ids = usedSkillIds([
      S(skill("b_backsalto"), { kind: "motion", motionId: "a_cartwheel", count: 1 }),
      S({ kind: "throw" }, skill("b_front"), { kind: "catch" }),
    ]);
    expect(ids.sort()).toEqual(["a_cartwheel", "b_backsalto", "b_front"]);
  });
});

describe("ランダム生成への組み込み", () => {
  it("テンプレートに出てくる技だけで組む", () => {
    const allowed = usedSkillIds(myTemplates().map((t) => t.series));
    const r = generateRoutine(myTemplates(), { apparatus: "stick", random: seeded(7) })!;
    usedSkillIds(r.series).forEach((id) => expect([...allowed, ROUNDOFF_SKILL_ID]).toContain(id));
  });

  it("テンプレートを先に使い、足りないところを自動生成が補う", () => {
    const r = generateRoutine(myTemplates(), { apparatus: "stick", random: seeded(11) })!;
    expect(r.used.some((t) => !t.auto)).toBe(true);
    expect(r.used.some((t) => t.auto)).toBe(true);
  });

  it("テンプレートが無ければ技の一覧から組み、必須要素を満たす", () => {
    const r = generateRoutine([], { apparatus: "stick", random: seeded(13) })!;
    const score = computeScore(r.series, "stick");
    expect(score.missing).toEqual([]);
    // 生成したタンブリングはどれも入力画面の制約を満たす
    r.series.forEach((ser) => expect(tumblingFlowErrors(ser)).toEqual([]));
  });

  it("入れる本数は上限まで", () => {
    const r = generateRoutine(myTemplates(), { apparatus: "stick", random: seeded(23) })!;
    expect(r.used.filter(isAutoTumblingTemplate).length).toBeLessThanOrEqual(DEFAULT_MAX_AUTO_TUMBLINGS);
    const one = generateRoutine(myTemplates(), { apparatus: "stick", maxAutoTumblings: 1, random: seeded(23) })!;
    expect(one.used.filter(isAutoTumblingTemplate).length).toBeLessThanOrEqual(1);
  });

  it("autoTumblings: false なら使わない", () => {
    const r = generateRoutine(myTemplates(), { apparatus: "stick", autoTumblings: false, random: seeded(7) })!;
    expect(r.used.some(isAutoTumblingTemplate)).toBe(false);
  });

  it("Dスコアの上限を指定すると宙返りの本数も減らして収める", () => {
    [2.0, 3.0].forEach((maxScore) => {
      const r = generateRoutine([], { apparatus: "stick", maxScore, random: seeded(17) })!;
      expect(r.dScore).toBeLessThanOrEqual(maxScore + 1e-9);
      r.used.forEach((t) => {
        if (isAutoTumblingTemplate(t)) expect(saltoCountRange(t.spec.pattern)).toContain(t.spec.saltoCount);
      });
    });
  });
});
