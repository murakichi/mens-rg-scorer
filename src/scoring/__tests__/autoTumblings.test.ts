import { describe, it, expect } from "vitest";
import {
  AUTO_TUMBLING_PATTERNS,
  BASIC_LEVEL_MAX_DIFF,
  CHAIN_END_SKILLS,
  TUMBLING_CONNECTS,
  TUMBLING_ENTRIES,
  endsChain,
  BASIC_LEVEL_MAX_SALTOS,
  CONNECT_FINISH_RARE,
  connectFinishWeights,
  THROW_FINISH_SALTOS,
  THROW_ROLL_MOTION,
  autoTumblingName,
  autoTumblingSpecs,
  autoTumblingTemplates,
  buildAutoTumblingSeries,
  AFTER_BACK_LAYOUT_SALTOS,
  connectOptionsAfter,
  firstSaltoOptions,
  isBackLayoutSalto,
  isAutoTumblingTemplate,
  isTempoSalto,
  nextSaltoOptions,
  saltoCountRange,
  saltoOptionsAfterConnect,
  saltoWeights,
  tumblingFlowErrors,
  usedSkillIds,
  withSaltoCount,
  type AutoTumblingSpec,
} from "../autoTumblings";
import { analyzeSeries, hasConnect, maxSaltoChain, prevSkillId } from "../analysis";
import { CATEGORY, DIFF_VALUE, ROUNDOFF_SKILL_ID, skillDef, skillDifficulty, skillFlowAfter, skillOptions } from "../constants";
import { BASIC_LEVEL_MAX_SCORE, DEFAULT_MAX_AUTO_TUMBLINGS, generateRoutine } from "../generate";
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

/** 後方1回半ひねり・前方1回ひねり・前宙・側宙・前転 を使うテンプレート群 */
const myTemplates = (): SeriesTemplate[] => [
  tpl("三宙", "common", S(skill("a_roundoff"), skill("c_back15"), skill("c_front1full"), skill("b_front"))),
  tpl("投げタン", "common", S({ kind: "throw" }, skill("b_front"), { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch" })),
  tpl("側方", "common", S(skill("a_cartwheel"), skill("b_sidesalto"))),
];

const pattern = (id: string) => AUTO_TUMBLING_PATTERNS.find((p) => p.id === id)!;
const diff = (id: string, junior = false) => DIFF_VALUE[skillDifficulty(id, junior)!];
const names = (series: Series) =>
  series.items.map((it) =>
    it.kind === "skill"
      ? skillDef(it.skillId)?.name ?? it.skillId
      : it.kind === "motion"
        ? it.motionId
        : it.kind,
  );
const skillsOf = (series: Series) => analyzeSeries(series).units.flatMap((u) => u.skills);
/** 候補すべて（一般・ジュニア × いくつかの乱数） */
const allTemplates = (junior = false) =>
  [3, 7, 11, 19].flatMap((seed) => autoTumblingTemplates("stick", { junior, random: seeded(seed) }));

describe("入力画面の制約", () => {
  it("どの技もその位置のプルダウンに出る（一般・ジュニア）", () => {
    [false, true].forEach((junior) => {
      allTemplates(junior).forEach((t) => {
        expect(tumblingFlowErrors(t.series, junior)).toEqual([]);
        t.series.items.forEach((item, i) => {
          if (item.kind !== "skill") return;
          const options = skillOptions(junior, skillFlowAfter(prevSkillId(t.series.items, i)));
          expect(options.map((s) => s.id)).toContain(item.skillId);
        });
      });
    });
  });

  it("後方系はロンダートから入る（手前が無ければ補う）", () => {
    const s = buildAutoTumblingSeries({
      pattern: pattern("chain"),
      saltoCount: 1,
      entry: [],
      saltoIds: ["b_backsalto"],
      connectId: "",
    });
    expect(names(s)).toEqual(["ロンダート", "後方宙返り"]);
    expect(tumblingFlowErrors(s)).toEqual([]);
  });

  it("個人では2回宙返り系を組み立てない（テンプレートに出てくるときだけ使う）", () => {
    const isDouble = (id: string) => !!skillDef(id)?.isDoubleSalto;
    // 技の一覧から組むときは使わない
    allTemplates().forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind === "skill") expect(isDouble(item.skillId)).toBe(false);
      }),
    );
    // 実際に実施している（テンプレートにある）なら使う
    const own = autoTumblingSpecs({ skillIds: ["d_doubleback", "a_roundoff", "a_flicflac"], random: seeded(3) });
    expect(own.some((sp) => sp.saltoIds.some(isDouble))).toBe(true);
  });

  it("とび前転・きりもみの後には技を続けない（首から背中にかけて着地する技）", () => {
    CHAIN_END_SKILLS.forEach((id) => {
      expect(endsChain(id)).toBe(true);
      expect(nextSaltoOptions(id)).toEqual([]);
      expect(connectOptionsAfter(id)).toEqual([]);
    });
    // 入りの技・つなぎ技にも使わない
    Object.values(TUMBLING_ENTRIES).forEach((entries) =>
      entries.forEach((entry) => entry.forEach((id) => expect(endsChain(id)).toBe(false))),
    );
    TUMBLING_CONNECTS.forEach((c) => expect(endsChain(c.id)).toBe(false));
    // 組み立てた並びでも、着地技の後に技が来ない
    [false, true].forEach((junior) =>
      allTemplates(junior).forEach((t) => {
        const ids = t.series.items.flatMap((item) => (item.kind === "skill" ? [item.skillId] : []));
        ids.forEach((id, i) => {
          if (i === 0) return;
          expect(endsChain(ids[i - 1])).toBe(false);
        });
      }),
    );
  });

  it("2回宙返りの後は連続もつなぎも続かない", () => {
    ["d_doubleback", "e_doublelay", "e_divedouble", "e_moonsault", "e_rudolph"].forEach((id) => {
      expect(nextSaltoOptions(id)).toEqual([]);
      expect(connectOptionsAfter(id)).toEqual([]);
    });
  });

  it("ジュニアは2回宙返り系を使わない", () => {
    allTemplates(true).forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind === "skill") expect(skillDef(item.skillId)?.isDoubleSalto).toBeFalsy();
      }),
    );
  });

  it("制約に反する並びは検出できる", () => {
    expect(tumblingFlowErrors(S(skill("b_backsalto")))).toHaveLength(1);
    // バク転の直後は後方系だけ
    expect(tumblingFlowErrors(S(skill("a_flicflac"), skill("b_front")))).toHaveLength(1);
    // ジュニアで実施しない技も選択肢に出ない
    expect(tumblingFlowErrors(S(skill("a_roundoff"), skill("d_doubleback")), true)).toHaveLength(1);
    expect(tumblingFlowErrors(S(skill("a_roundoff"), skill("d_doubleback")), false)).toEqual([]);
  });
});

describe("宙返りの連続の組み方", () => {
  it("次の系統は直前の技が降りる向きで決まる", () => {
    // 前向きに降りる → 前方系・側方系
    nextSaltoOptions("b_front").forEach((id) => expect(skillDef(id)?.category).not.toBe(CATEGORY.BACKWARD));
    // 後方1回半ひねりは前向きに降りるので、次は前方系・側方系
    nextSaltoOptions("c_back15").forEach((id) => expect(skillDef(id)?.category).not.toBe(CATEGORY.BACKWARD));
    // テンポは後ろ向きに降りるので、次は後方系
    nextSaltoOptions("b_tempo").forEach((id) => expect(skillDef(id)?.category).toBe(CATEGORY.BACKWARD));
  });

  it("難度はだんだん下がる（テンポだけ例外）", () => {
    ["b_front", "c_back15", "d_backlay25", "b_sidesalto"].forEach((prev) =>
      nextSaltoOptions(prev).forEach((id) => expect(diff(id)).toBeLessThanOrEqual(diff(prev))),
    );
    // テンポの後は難度が上がってよい
    expect(isTempoSalto("b_tempo")).toBe(true);
    expect(nextSaltoOptions("b_tempo").some((id) => diff(id) > diff("b_tempo"))).toBe(true);
  });

  it("後方系を続けて実施しない（テンポ・後方伸身宙返りは例外）", () => {
    expect(nextSaltoOptions("b_backsalto")).toEqual([]);
    expect(nextSaltoOptions("b_backtuck")).toEqual([]);
    expect(nextSaltoOptions("b_tempo").length).toBeGreaterThan(0);
  });

  it("後方伸身宙返りの後は 前宙・きりもみ・きりもみ転回（ひねっても同じ）", () => {
    ["b_backlayout", "b_backlayhalf", "c_backlay1full", "d_backlay25", "e_backlay35twist"].forEach((id) => {
      expect(isBackLayoutSalto(id)).toBe(true);
      expect(nextSaltoOptions(id)).toEqual(AFTER_BACK_LAYOUT_SALTOS.map((x) => x.id));
    });
    // 側宙はその前宙に続けて実施する
    expect(nextSaltoOptions("b_front")).toContain("b_sidesalto");
    // 伸身以外の後方宙返りは連続しない
    expect(isBackLayoutSalto("b_backsalto")).toBe(false);
    expect(isBackLayoutSalto("b_backtuck")).toBe(false);
  });

  it("後方伸身宙返りの後は 前宙＞きりもみ＞＞きりもみ転回 の順に選ばれやすい", () => {
    const weights = saltoWeights("b_backlayout");
    expect(weights["b_front"]).toBeGreaterThan(weights["b_kirimomi"]);
    expect(weights["b_kirimomi"]).toBeGreaterThan(weights["c_kirimomiten"] * 2);
    // 実際に組み立てた並びでも、その順に多くなる
    const count = new Map<string, number>();
    for (let seed = 0; seed < 120; seed++) {
      autoTumblingSpecs({ random: seeded(seed) }).forEach((sp) =>
        sp.saltoIds.forEach((id, i) => {
          const prev = sp.saltoIds[i - 1];
          if (!prev || !isBackLayoutSalto(prev)) return;
          count.set(id, (count.get(id) ?? 0) + 1);
        }),
      );
    }
    const n = (id: string) => count.get(id) ?? 0;
    expect(n("b_front")).toBeGreaterThan(n("b_kirimomi"));
    expect(n("b_kirimomi")).toBeGreaterThan(n("c_kirimomiten"));
  });

  it("つなぎの最後の後方伸身宙返りはそのまま前宙に続けられる", () => {
    expect(saltoOptionsAfterConnect(ROUNDOFF_SKILL_ID)).toContain("b_backlayout");
    const s = buildAutoTumblingSeries({
      pattern: pattern("connect"),
      saltoCount: 3,
      entry: [],
      saltoIds: ["b_front", "b_backlayout", "b_front"],
      connectId: ROUNDOFF_SKILL_ID,
    });
    expect(names(s)).toEqual(["前宙", "ロンダート", "後方伸身宙返り", "前宙"]);
    expect(tumblingFlowErrors(s)).toEqual([]);
    expect(hasConnect(skillsOf(s))).toBe(true);
  });

  it("実際の連続の例どおりに組める", () => {
    // 後方1回半ひねり→前方1回ひねり→前宙
    expect(nextSaltoOptions("c_back15")).toContain("c_front1full");
    expect(nextSaltoOptions("c_front1full")).toContain("b_front");
    // 後方2回半ひねり→前宙→側宙
    expect(nextSaltoOptions("d_backlay25")).toContain("b_front");
    expect(nextSaltoOptions("b_front")).toContain("b_sidesalto");
  });

  it("生成した連続も向きと難度のルールを守っている", () => {
    allTemplates().forEach((t) => {
      const ids = skillsOf(t.series)
        .map((s) => s.skillId)
        .filter((id) => skillDef(id)?.isSalto);
      ids.forEach((id, i) => {
        if (i === 0) return;
        const prev = ids[i - 1];
        // つなぎ技を挟んだ位置は勢いを作り直すので、連続しているところだけ見る
        const chained = nextSaltoOptions(prev);
        if (chained.length === 0) return;
        if (!chained.includes(id)) return; // つなぎ後の入り直し
        // テンポの後と後方伸身宙返りの後（前宙・きりもみ系）は難度の上下を問わない
        if (isTempoSalto(prev) || isBackLayoutSalto(prev)) return;
        expect(diff(id)).toBeLessThanOrEqual(diff(prev));
      });
    });
  });
});

describe("つなぎ技", () => {
  it("宙返りのあとのバク転はテンポの後だけ", () => {
    expect(connectOptionsAfter("b_tempo")).toEqual(["a_flicflac"]);
    expect(connectOptionsAfter("b_front")).not.toContain("a_flicflac");
    expect(connectOptionsAfter("c_back15")).not.toContain("a_flicflac");
    // 後ろ向きに降りる宙返り（テンポ以外）の後にはつなぎ技を入れない
    expect(connectOptionsAfter("b_backsalto")).toEqual([]);
  });

  it("前向きに降りた後はロンダート・側転・ハンドスプリング（とび前転は着地技なので使わない）", () => {
    expect(connectOptionsAfter("b_front").sort()).toEqual(
      ["a_cartwheel", "a_handspring", ROUNDOFF_SKILL_ID].sort(),
    );
  });

  it("つなぎの最後のただの後方宙返りは選ばれにくい（Dスコアの低い選手・ジュニアは実施する）", () => {
    // B難度がほしいときはダイビング前宙・後方伸身宙返り
    expect(saltoOptionsAfterConnect(ROUNDOFF_SKILL_ID)).toContain("b_divefront");
    expect(saltoOptionsAfterConnect(ROUNDOFF_SKILL_ID)).toContain("b_backlayout");
    // 候補からは外さず、重みで選ばれにくくする
    CONNECT_FINISH_RARE.forEach((id) => {
      expect(saltoOptionsAfterConnect(ROUNDOFF_SKILL_ID)).toContain(id);
      expect(connectFinishWeights()[id]).toBeLessThan(1);
      // 基本技も普通に実施する選手（ジュニア・低いDスコア）には重みを付けない
      expect(connectFinishWeights(true)[id]).toBeUndefined();
    });
  });

  it("基本的な構成の選手は単純なタンブリングだけ（D難度なし・三宙なし・つなぎなし）", () => {
    const specs = autoTumblingSpecs({ basicLevel: true, random: seeded(3) });
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach((sp) => {
      // つなぎ技を実施しない
      expect(sp.pattern.connect).toBe(false);
      // 連続は2本まで（三宙なし）
      expect(sp.saltoCount).toBeLessThanOrEqual(BASIC_LEVEL_MAX_SALTOS);
      // D難度以上の技を実施しない
      sp.saltoIds.slice(0, sp.saltoCount).forEach((id) => expect(diff(id)).toBeLessThanOrEqual(BASIC_LEVEL_MAX_DIFF));
    });
    // 上級者の構成では大技も連続もつなぎも出る
    const all = autoTumblingSpecs({ random: seeded(3) });
    expect(all.some((sp) => sp.pattern.connect)).toBe(true);
    expect(all.some((sp) => sp.saltoIds.some((id) => diff(id) > BASIC_LEVEL_MAX_DIFF))).toBe(true);
  });

  it("Dスコア1点台までを狙うと基本的な構成になる", () => {
    const r = generateRoutine([], { apparatus: "stick", maxScore: 1.5, random: seeded(5) })!;
    expect(r.dScore).toBeLessThanOrEqual(1.5 + 1e-9);
    // 自動生成のタンブリングにD難度以上の技が入らない
    r.used.forEach((t) => {
      if (!isAutoTumblingTemplate(t)) return;
      t.spec.saltoIds.slice(0, t.spec.saltoCount).forEach((id) => expect(diff(id)).toBeLessThanOrEqual(BASIC_LEVEL_MAX_DIFF));
    });
    // 2点台以上を狙うなら上級者の構成のまま（候補にD難度以上が残る）
    expect(BASIC_LEVEL_MAX_SCORE).toBe(2.0);
    expect(
      autoTumblingSpecs({ random: seeded(5) }).some((sp) =>
        sp.saltoIds.some((id) => diff(id) > BASIC_LEVEL_MAX_DIFF),
      ),
    ).toBe(true);
  });

  it("タンブリングの実施中には投げない（投げてから実施する）", () => {
    autoTumblingTemplates("stick", { random: seeded(9) }).forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind === "skill") expect(item.isThrow).toBeFalsy();
      }),
    );
  });

  it("つなぎの形は宙返りの間にA難度技が入る", () => {
    const specs = autoTumblingSpecs({ random: seeded(5) }).filter((sp) => sp.pattern.connect);
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach((sp) => {
      const s = buildAutoTumblingSeries(sp);
      expect(hasConnect(skillsOf(s))).toBe(true);
      // つなぎ技にも手具操作を付ける（§3.5.6.3 の −0.2 を受けないように）
      expect(skillsOf(s).every((x) => x.hasApparatus)).toBe(true);
    });
  });
});

describe("投げタン", () => {
  it("投げのあとにロンダートを入れない（1本目は前方系）", () => {
    autoTumblingSpecs({ random: seeded(7) })
      .filter((sp) => sp.pattern.throwCatch)
      .forEach((sp) => {
        expect(skillDef(sp.saltoIds[0])?.category).toBe(CATEGORY.FORWARD);
        expect(names(buildAutoTumblingSeries(sp))).not.toContain("ロンダート");
      });
  });

  it("前方系→前転、または 前方系→側宙（転宙）", () => {
    const roll = buildAutoTumblingSeries({
      pattern: pattern("throwRoll"),
      saltoCount: 1,
      entry: [],
      saltoIds: ["b_front"],
      connectId: "",
    });
    expect(names(roll)).toEqual(["throw", "前宙", THROW_ROLL_MOTION, "catch"]);
    autoTumblingSpecs({ random: seeded(11) })
      .filter((sp) => sp.pattern.id === "throwSalto")
      .forEach((sp) => expect(THROW_FINISH_SALTOS).toContain(sp.saltoIds[1]));
  });

  it("投げ受けとして数える（投げタン）", () => {
    const s = buildAutoTumblingSeries({
      pattern: pattern("throwSalto"),
      saltoCount: 2,
      entry: [],
      saltoIds: ["b_front", "b_sidesalto"],
      connectId: "",
    });
    expect(analyzeSeries(s).units.some((u) => u.isThrowTumbling)).toBe(true);
  });
});

describe("候補と調整", () => {
  it("三宙（宙返り3回連続）を作れる", () => {
    // つなぎ技を挟む形は連続が切れるので、連続の形だけを見る
    const chains = autoTumblingSpecs({ random: seeded(3) }).filter(
      (sp) => !sp.pattern.connect && sp.saltoCount >= 3,
    );
    expect(chains.length).toBeGreaterThan(0);
    chains.forEach((sp) =>
      expect(maxSaltoChain(skillsOf(buildAutoTumblingSeries(sp)).map((x) => x.skillId))).toBeGreaterThanOrEqual(3),
    );
  });

  it("宙返りの本数は形ごとの範囲に収まる", () => {
    autoTumblingSpecs({ random: seeded(13) }).forEach((sp) => {
      expect(saltoCountRange(sp.pattern)).toContain(sp.saltoCount);
      expect(sp.saltoIds.length).toBeGreaterThanOrEqual(sp.saltoCount);
    });
  });

  it("宙返りの本数だけを差し替えられる（範囲外・変化なしは null）", () => {
    const t = autoTumblingTemplates("stick", { random: seeded(3) }).find(
      (x) => saltoCountRange(x.spec.pattern).length > 1 && x.spec.saltoIds.length > x.spec.pattern.saltos.min,
    )!;
    const other = saltoCountRange(t.spec.pattern).find(
      (n) => n !== t.spec.saltoCount && n <= t.spec.saltoIds.length,
    )!;
    const tuned = withSaltoCount(t, other)!;
    expect(tuned.spec.saltoCount).toBe(other);
    expect(tuned.id).toBe(t.id);
    expect(tumblingFlowErrors(tuned.series)).toEqual([]);
    expect(withSaltoCount(t, t.spec.saltoCount)).toBeNull();
    expect(withSaltoCount(t, 99)).toBeNull();
  });

  it("表示名に最後の技と連続本数が出る", () => {
    const name = autoTumblingName({
      pattern: pattern("chain"),
      saltoCount: 2,
      entry: [],
      saltoIds: ["c_back15", "b_front"],
      connectId: "",
    } as AutoTumblingSpec);
    expect(name).toContain("前宙");
    expect(name).toContain("2連続");
  });
});

describe("使ってよい技の範囲", () => {
  it("指定した技だけで組む（後方系に補うロンダートは除く）", () => {
    const allowed = ["b_front", "b_sidesalto", "c_back15", "a_cartwheel", "b_tenchu"];
    autoTumblingTemplates("stick", { skillIds: allowed, random: seeded(7) }).forEach((t) =>
      t.series.items.forEach((item) => {
        if (item.kind !== "skill") return;
        expect([...allowed, ROUNDOFF_SKILL_ID]).toContain(item.skillId);
      }),
    );
  });

  it("実施する技が無ければその形は作らない", () => {
    // 側宙しか実施しないなら、投げ受け（1本目は前方系）の形は作れない
    const specs = autoTumblingSpecs({ skillIds: ["b_sidesalto"], random: seeded(7) });
    expect(specs.every((sp) => !sp.pattern.throwCatch)).toBe(true);
    expect(firstSaltoOptions()).toContain("b_sidesalto");
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
    expect(computeScore(r.series, "stick").missing).toEqual([]);
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
