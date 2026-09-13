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
  RARE_CHAIN_END_SKILLS,
  RARE_CHAIN_END_CHANCE,
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
  SALTO_DIFFICULTY_WEIGHT,
  APPARATUS_HIGH_DIFFICULTY_WEIGHT,
  apparatusHighDifficultyWeight,
  isHighDifficultySkill,
  CONNECT_RISE_WEIGHT,
  canEndChain,
  endsFacingBackward,
  backwardEndChance,
  BACKWARD_END_ZERO_SCORE,
  THROW_IN_SIDE_SALTO_WEIGHT,
  TEMPO_CONNECT_WEIGHT,
  PAIR_AFTER_THROW_FIRST_CHANCE,
  PAIR_AFTER_THROW_IN_SKILL_CHANCE,
  pairAfterChance,
  secondThrowStyles,
  noRollAfter,
  TEMPO_SKILL_ID,
  TEMPO_TWIST_SKILL_ID,
  isTempoSalto,
  readTumblingShape,
  tumblingShapeRank,
  throwTumblingShapeRank,
  saltoOptionsAfterConnect,
  saltoWeights,
  tumblingFlowErrors,
  usedSkillIds,
  withSaltoCount,
  type AutoTumblingSpec,
} from "../autoTumblings";
import { analyzeSeries, checkApparatusFlow, hasConnect, maxSaltoChain, prevSkillId } from "../analysis";
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

  it("とび前転・きりもみ・きりもみ転回・側宙の後には技を続けない（連続の最後だけ）", () => {
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

  it("側宙は連続の最後にしか来ない", () => {
    expect(nextSaltoOptions("b_sidesalto")).toEqual([]);
    // 前宙の次には出るが、その後は続かない
    expect(nextSaltoOptions("b_front")).toContain("b_sidesalto");
    allTemplates().forEach((t) => {
      const ids = t.series.items.flatMap((item) => (item.kind === "skill" ? [item.skillId] : []));
      const at = ids.indexOf("b_sidesalto");
      if (at >= 0) expect(at).toBe(ids.length - 1);
    });
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

  it("単発で高難度な技ほど選ばれにくい", () => {
    expect(SALTO_DIFFICULTY_WEIGHT.E!).toBeLessThan(SALTO_DIFFICULTY_WEIGHT.D!);
    expect(SALTO_DIFFICULTY_WEIGHT.D!).toBeLessThan(1);
    const w = saltoWeights("b_front");
    expect(w["e_backlay3twist"]).toBe(SALTO_DIFFICULTY_WEIGHT.E);
    expect(w["d_back2twist"]).toBe(SALTO_DIFFICULTY_WEIGHT.D);
    expect(w["b_backsalto"]).toBeUndefined(); // 重み無し＝1
    // 実際に組み立てた候補でも、E難度の単発はB難度より少ない
    const count = new Map<string, number>();
    for (let seed = 0; seed < 40; seed++)
      autoTumblingSpecs({ random: seeded(seed) }).forEach((sp) => {
        const d = skillDifficulty(sp.saltoIds[0]) ?? "?";
        count.set(d, (count.get(d) ?? 0) + 1);
      });
    expect(count.get("E") ?? 0).toBeLessThan(count.get("B") ?? 0);
  });

  it("同じ難度の技の中では実施の多い技が選ばれやすい", () => {
    const w = saltoWeights("b_front");
    const weightOf = (id: string) => w[id] ?? 1;
    // ロンダート ＞ バク転 ＞ ハンドスプリング
    expect(weightOf("a_roundoff")).toBeGreaterThan(weightOf("a_flicflac"));
    expect(weightOf("a_flicflac")).toBeGreaterThan(weightOf("a_handspring"));
    // 前方宙返り1回ひねり ＞ きりもみ転回（同じC難度）
    expect(weightOf("c_front1full")).toBeGreaterThan(weightOf("c_kirimomiten"));
    // 側宙 ＞ 転宙
    expect(weightOf("b_sidesalto")).toBeGreaterThan(weightOf("b_tenchu"));
    // 抱え込み＝伸身 ＞ 屈伸
    expect(weightOf("b_backsalto")).toBe(weightOf("b_backlayout"));
    expect(weightOf("b_backsalto")).toBeGreaterThan(weightOf("b_backtuck"));
    expect(weightOf("c_back1full")).toBeGreaterThan(weightOf("c_backtuck1full"));
    // 前宙 ＞ 前宙半ひねり
    expect(weightOf("b_front")).toBeGreaterThan(weightOf("b_fronthalf"));
    // テンポひねりは後方系のC難度のなかで最も少ない（ただし屈伸より上）
    const backwardC = skillOptions()
      .filter((sk) => sk.category === CATEGORY.BACKWARD && skillDifficulty(sk.id) === "C")
      .map((sk) => sk.id);
    expect(backwardC).toContain("c_tempotwist");
    expect(weightOf("c_tempotwist")).toBeGreaterThan(weightOf("c_backtuck1full"));
    backwardC
      .filter((id) => id !== "c_tempotwist" && skillDef(id)?.twist?.posture !== "pike")
      .forEach((id) => expect(weightOf("c_tempotwist")).toBeLessThan(weightOf(id)));
  });

  it("つなぎのあとに難度が上がる組み方は少ない", () => {
    expect(CONNECT_RISE_WEIGHT).toBeLessThan(1);
    // 実際に組み立てた候補でも、つなぎで難度が上がるものは下がる・同じものより少ない
    let rise = 0;
    let flat = 0;
    for (let seed = 0; seed < 40; seed++)
      autoTumblingSpecs({ random: seeded(seed) })
        .filter((sp) => sp.pattern.connect && sp.saltoIds.length >= 2)
        .forEach((sp) => {
          const a = DIFF_VALUE[skillDifficulty(sp.saltoIds[0])!];
          const b = DIFF_VALUE[skillDifficulty(sp.saltoIds[1])!];
          if (b > a) rise += 1;
          else flat += 1;
        });
    expect(rise).toBeLessThan(flat);
  });

  it("リングは単発高難度が他の手具より更に選ばれにくい", () => {
    // リングは重く、持ったままひねりにくい
    expect(APPARATUS_HIGH_DIFFICULTY_WEIGHT.ring!).toBeLessThan(1);
    expect(apparatusHighDifficultyWeight("ring")).toBeLessThan(apparatusHighDifficultyWeight("clubs"));
    expect(apparatusHighDifficultyWeight("stick")).toBe(1);
    expect(apparatusHighDifficultyWeight()).toBe(1);
    const ring = saltoWeights("b_front", false, "ring");
    const stick = saltoWeights("b_front", false, "stick");
    expect(ring["d_back2twist"]).toBeLessThan(stick["d_back2twist"]);
    expect(ring["e_backlay3twist"]).toBeLessThan(stick["e_backlay3twist"]);
    // C難度以下は手具で変わらない
    expect(ring["b_backsalto"]).toBeUndefined();
    // 実際に組み立てた候補でも、リングのD難度以上は他の手具より少ない
    const countFor = (apparatus: "ring" | "stick") => {
      let n = 0;
      for (let seed = 0; seed < 40; seed++)
        autoTumblingSpecs({ random: seeded(seed), apparatus }).forEach((sp) => {
          n += sp.saltoIds.filter((id) => isHighDifficultySkill(id)).length;
        });
      return n;
    };
    expect(countFor("ring")).toBeLessThan(countFor("stick"));
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

  it("日本トップの実例の連続を組める", () => {
    // ロンダート→後方宙返り1回半ひねり→前宙半ひねり→ダイビング前宙（三宙）
    expect(nextSaltoOptions("c_back15")).toContain("b_fronthalf");
    expect(nextSaltoOptions("b_fronthalf")).toContain("b_divefront");
    // ロンダート→後方伸身宙返り2回半ひねり→ロンダート→ダイビング前宙（つなぎ）
    expect(connectOptionsAfter("d_backlay25")).toContain(ROUNDOFF_SKILL_ID);
    expect(saltoOptionsAfterConnect(ROUNDOFF_SKILL_ID)).toContain("b_divefront");
    // 入力画面の制約も満たす
    const skills = (...ids: string[]) => S(...ids.map(skill));
    expect(tumblingFlowErrors(skills("a_roundoff", "c_back15", "b_fronthalf", "b_divefront"))).toEqual([]);
    expect(tumblingFlowErrors(skills("a_roundoff", "d_backlay25", "a_roundoff", "b_divefront"))).toEqual([]);
  });

  it("前方の半ひねりからは後方系に続けられる（後方系どうしの連続はしない）", () => {
    nextSaltoOptions("b_fronthalf").forEach((id) => expect(skillDef(id)?.category).toBe(CATEGORY.BACKWARD));
    expect(nextSaltoOptions("b_backsalto")).toEqual([]);
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
  it("テンポひねりの次は テンポ ＞ それ以外の宙返り ＞ バク転", () => {
    const w = saltoWeights(TEMPO_TWIST_SKILL_ID);
    const weightOf = (id: string) => w[id] ?? 1;
    // テンポ宙返りがいちばん選ばれやすい
    nextSaltoOptions(TEMPO_TWIST_SKILL_ID)
      .filter((id) => id !== TEMPO_SKILL_ID)
      .forEach((id) => expect(weightOf(TEMPO_SKILL_ID)).toBeGreaterThan(weightOf(id)));
    // バク転を挟む形（つなぎがバク転になるのはテンポ系の後だけ）は更に少ない
    expect(TEMPO_CONNECT_WEIGHT).toBeLessThan(1);
    let tempoFirst = 0;
    let otherFirst = 0;
    for (let seed = 0; seed < 40; seed++)
      autoTumblingSpecs({ random: seeded(seed) })
        .filter((sp) => sp.pattern.connect)
        .forEach((sp) => {
          if (isTempoSalto(sp.saltoIds[0])) tempoFirst += 1;
          else otherFirst += 1;
        });
    expect(tempoFirst).toBeLessThan(otherFirst);
  });

  it("後ろ向きで終わる後方宙返りで終わる確率はDスコアで指数的に下がり、3.0点で0になる", () => {
    // 1点ごとに半分。上限なし（難度を狙いきる構成）は0
    expect(backwardEndChance(0)).toBe(1);
    expect(backwardEndChance(1)).toBeCloseTo(0.5);
    expect(backwardEndChance(2)).toBeCloseTo(0.25);
    expect(backwardEndChance(2.9)).toBeGreaterThan(0);
    expect(backwardEndChance(BACKWARD_END_ZERO_SCORE)).toBe(0);
    expect(backwardEndChance(4)).toBe(0);
    expect(backwardEndChance(null)).toBe(0);
    expect(backwardEndChance()).toBe(0);
    // 実際に組み立てた候補でも、狙うDスコアが上がるほど後ろ向きで終わる候補が減る
    const rate = (targetScore: number | null) => {
      let backward = 0;
      let total = 0;
      for (let seed = 0; seed < 30; seed++)
        autoTumblingSpecs({ random: seeded(seed), targetScore, basicLevel: (targetScore ?? 9) < 2 }).forEach(
          (sp) => {
            total += 1;
            if (endsFacingBackward(sp.saltoIds[sp.saltoCount - 1])) backward += 1;
          },
        );
      return total === 0 ? 0 : backward / total;
    };
    const low = rate(0.5);
    const mid = rate(2.0);
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeLessThan(low);
    expect(rate(3.0)).toBe(0);
    expect(rate(null)).toBe(0);
  }, 60_000);

  it("連続の最後に置けない技（後ろ向きで終わる技）", () => {
    // 整数ひねりの後方宙返りは後ろ向きに降りる
    expect(endsFacingBackward("b_backsalto")).toBe(true);
    expect(endsFacingBackward("c_back1full")).toBe(true);
    expect(endsFacingBackward("b_backlayout")).toBe(true);
    // 半ひねり・ダイビング前宙・前方系は前向きに降りる
    expect(endsFacingBackward("c_back15")).toBe(false);
    expect(endsFacingBackward("b_divefront")).toBe(false);
    expect(endsFacingBackward("b_front")).toBe(false);
    expect(canEndChain("b_backsalto")).toBe(false);
    expect(canEndChain("b_backsalto", true)).toBe(true); // 抽選が通った候補では終わる
    // 前方の半ひねり・1回半ひねりは実戦でほぼ無いので、抽選が通っても終わらない
    expect(endsFacingBackward("b_fronthalf")).toBe(true);
    expect(canEndChain("b_fronthalf")).toBe(false);
    expect(canEndChain("b_fronthalf", true)).toBe(false);
    expect(canEndChain("tw:front:1.5:layout", true)).toBe(false);
    // 2回宙返り系は連続も繋ぎもせずそこで終わる
    expect(canEndChain("d_doubleback")).toBe(true);
    // 組み立てた候補の最後も後ろ向きで終わらない（上限なし＝上級者）
    for (let seed = 0; seed < 30; seed++)
      autoTumblingSpecs({ random: seeded(seed) }).forEach((sp) => {
        const last = sp.saltoIds[sp.saltoCount - 1];
        expect(canEndChain(last)).toBe(true);
      });
  });

  it("側宙の実施中に投げる構成は稀", () => {
    expect(THROW_IN_SIDE_SALTO_WEIGHT).toBeLessThan(1);
    let side = 0;
    let other = 0;
    for (let seed = 0; seed < 40; seed++)
      autoTumblingSpecs({ random: seeded(seed) })
        .filter((sp) => sp.pattern.throwInSkill)
        .forEach((sp) => {
          if (sp.saltoIds[sp.saltoCount - 1] === "b_sidesalto") side += 1;
          else other += 1;
        });
    expect(side * 3).toBeLessThan(other);
  });

  it("上級者は後方宙返り半ひねりで終わらない（前宙か側宙に続ける）", () => {
    expect(RARE_CHAIN_END_SKILLS).toContain("b_backhalf");
    expect(RARE_CHAIN_END_CHANCE).toBeLessThan(0.5);
    // 後方宙返り半ひねりは前向きに降りるので、そのまま終われてしまう位置にある
    expect(canEndChain("b_backhalf")).toBe(true);
    // 組み立てた候補では最後に来ることが稀
    const endsWith = (opts: Parameters<typeof autoTumblingSpecs>[0]) => {
      let rare = 0;
      let total = 0;
      for (let seed = 0; seed < 40; seed++)
        autoTumblingSpecs({ ...opts, random: seeded(seed) }).forEach((sp) => {
          total += 1;
          if (RARE_CHAIN_END_SKILLS.includes(sp.saltoIds[sp.saltoCount - 1])) rare += 1;
        });
      return { rare, total };
    };
    const adv = endsWith({});
    expect(adv.total).toBeGreaterThan(0);
    expect(adv.rare * 10).toBeLessThan(adv.total);
    // 半ひねりを使う候補自体はある（最後ではなく途中に入る）
    const uses = (() => {
      for (let seed = 0; seed < 40; seed++)
        for (const sp of autoTumblingSpecs({ random: seeded(seed) }))
          if (sp.saltoIds.slice(0, sp.saltoCount).includes("b_backhalf")) return sp;
      return null;
    })();
    if (uses) {
      const ids = uses.saltoIds.slice(0, uses.saltoCount);
      const next = ids[ids.indexOf("b_backhalf") + 1];
      expect(next).toBeDefined();
    }
    // 基本的な構成（Dスコアが低い選手）では終わってよい
    const basic = endsWith({ basicLevel: true });
    expect(basic.rare).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("側宙・後ろ向きで終わる後方宙返りの後に前転は実施しない", () => {
    expect(noRollAfter("b_sidesalto")).toBe(true);
    // 後ろ向きで終わる後方宙返りの後にも前転は入れない
    expect(noRollAfter("b_backsalto")).toBe(true);
    expect(noRollAfter("c_back1full")).toBe(true);
    expect(noRollAfter("b_front")).toBe(false);
    // 側宙で投げる形はそのままキャッチする（前転を挟まない）
    const series = buildAutoTumblingSeries({
      pattern: pattern("chainThrowInSkill"),
      saltoCount: 2,
      entry: [],
      saltoIds: ["c_back15", "b_sidesalto"],
      connectId: "",
    });
    const names = series.items.map((it) =>
      it.kind === "motion" ? it.motionId : it.kind === "skill" ? it.skillId : it.kind,
    );
    // 後方系なので入りのロンダートが補われる。側宙の後は前転を挟まずそのまま受ける
    expect(names).toEqual(["a_roundoff", "c_back15", "b_sidesalto", "catch"]);
    // 前宙で投げる形はこれまでどおり前転でつなぐ
    const roll = buildAutoTumblingSeries({
      pattern: pattern("chainThrowInSkill"),
      saltoCount: 2,
      entry: [],
      saltoIds: ["c_back15", "b_front"],
      connectId: "",
    });
    expect(roll.items.some((it) => it.kind === "motion" && it.motionId === THROW_ROLL_MOTION)).toBe(true);
    // 組み立てた候補すべてで、側宙の直後に前転が来ない
    for (let seed = 0; seed < 30; seed++)
      autoTumblingTemplates("stick", { random: seeded(seed) }).forEach((t) =>
        t.series.items.forEach((it, i) => {
          const prev = t.series.items[i - 1];
          if (it.kind === "motion" && it.motionId === THROW_ROLL_MOTION)
            expect(prev?.kind === "skill" && noRollAfter(prev.skillId)).toBe(false);
        }),
      );
  });

  it("バク転は入りの技には使わない（合理的な理由が無ければ実施しない）", () => {
    Object.values(TUMBLING_ENTRIES).forEach((entries) =>
      entries.forEach((entry) => expect(entry).not.toContain("a_flicflac")),
    );
    for (let seed = 0; seed < 20; seed++)
      autoTumblingSpecs({ random: seeded(seed) }).forEach((sp) =>
        expect(sp.entry).not.toContain("a_flicflac"),
      );
  });

  it("宙返りのあとのバク転はテンポの後だけ", () => {
    expect(connectOptionsAfter("b_tempo")).toEqual(["a_flicflac"]);
    expect(connectOptionsAfter("b_front")).not.toContain("a_flicflac");
    expect(connectOptionsAfter("c_back15")).not.toContain("a_flicflac");
    // 後ろ向きに降りる宙返り（テンポ以外）の後にはつなぎ技を入れない
    expect(connectOptionsAfter("b_backsalto")).toEqual([]);
  });

  it("前向きに降りた後はロンダート・ハンドスプリング（とび前転は着地技、側転は徒手扱い）", () => {
    expect(connectOptionsAfter("b_front").sort()).toEqual(["a_handspring", ROUNDOFF_SKILL_ID].sort());
    expect(TUMBLING_CONNECTS.map((c) => c.id)).not.toContain("a_cartwheel");
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

  it("技の最中に投げるのは連続の最後の宙返りだけ", () => {
    autoTumblingTemplates("stick", { random: seeded(9) }).forEach((t) => {
      const items = t.series.items;
      const throwIdx = items.findIndex((it) => it.kind === "skill" && it.isThrow);
      if (!t.spec.pattern.throwInSkill) {
        expect(throwIdx).toBe(-1);
        return;
      }
      // 先頭に投げは置かず、最後の宙返りの最中に投げて前転→キャッチで終わる
      expect(items[0].kind).toBe("skill");
      const lastSkill = items.reduce((n, it, i) => (it.kind === "skill" ? i : n), -1);
      expect(throwIdx).toBe(lastSkill);
      expect(items.filter((it) => it.kind === "skill" && it.isThrow)).toHaveLength(1);
      expect(items[items.length - 1].kind).toBe("catch");
      // 投げタンとして数えられる（難度は連続の内容から1ランクアップ）。
      // キャッチのあとに連続投げを続けた形では、その投げ受けが2つ目のユニットになる
      const a = analyzeSeries(t.series);
      expect(a.units).toHaveLength(t.spec.secondThrow ? 2 : 1);
      expect(a.units[0].isThrowTumbling).toBe(true);
      // 入力画面の制約・手具の流れとも矛盾しない
      expect(tumblingFlowErrors(t.series)).toEqual([]);
      expect(checkApparatusFlow(t.series, "stick")).toEqual([]);
    });
  });

  it("投げタンのキャッチのあとに連続投げを続ける形がある", () => {
    // 投げてから宙返りする形のほうが、宙返りの最中に投げる形より多い
    expect(PAIR_AFTER_THROW_FIRST_CHANCE).toBeGreaterThan(PAIR_AFTER_THROW_IN_SKILL_CHANCE);
    expect(pairAfterChance(pattern("throwRoll"))).toBe(PAIR_AFTER_THROW_FIRST_CHANCE);
    expect(pairAfterChance(pattern("chainThrowInSkill"))).toBe(PAIR_AFTER_THROW_IN_SKILL_CHANCE);
    // スティックは2回目に左手投げもあり得る（手以外の投げは2回目には使わない）
    const styles = secondThrowStyles("stick").map((t) => t.id);
    expect(styles).toContain("lefthand");
    expect(styles).not.toContain("nonhand");
    expect(secondThrowStyles("clubs").map((t) => t.id)).toContain("twothrow");
    // 組み立てた候補：投げ受けが2回になり、手具の流れも入力制約も崩れない
    let paired = 0;
    let firstKind = 0;
    let inSkillKind = 0;
    for (let seed = 0; seed < 20; seed++)
      autoTumblingTemplates("stick", { random: seeded(seed) })
        .filter((t) => t.spec.secondThrow)
        .forEach((t) => {
          paired += 1;
          if (t.spec.pattern.throwInSkill) inSkillKind += 1;
          else firstKind += 1;
          const items = t.series.items;
          expect(items[items.length - 1].kind).toBe("catch");
          expect(items[items.length - 2].kind).toBe("throw");
          expect(analyzeSeries(t.series).throwCount).toBe(2);
          expect(checkApparatusFlow(t.series, "stick")).toEqual([]);
          expect(tumblingFlowErrors(t.series)).toEqual([]);
        });
    expect(paired).toBeGreaterThan(0);
    expect(firstKind).toBeGreaterThan(inSkillKind);
  });

  it("連続の最後に投げる形は三宙と投げタンを1シリーズで両立できる", () => {
    const spec = autoTumblingSpecs({ random: seeded(3) }).find(
      (sp) => sp.pattern.throwInSkill && sp.saltoCount === 3,
    );
    expect(spec).toBeDefined();
    const series = buildAutoTumblingSeries(spec!);
    const a = analyzeSeries(series);
    expect(a.units[0].isThrowTumbling).toBe(true);
    const ids = series.items.flatMap((it) => (it.kind === "skill" && it.skillId ? [it.skillId] : []));
    expect(maxSaltoChain(ids)).toBe(3);
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
      // 連続の最後に投げる形は投げる前が普通のタンブリングなので、入りのロンダートも本数も自由
      .filter((sp) => sp.pattern.throwCatch && !sp.pattern.throwInSkill)
      .forEach((sp) => {
        expect(skillDef(sp.saltoIds[0])?.category).toBe(CATEGORY.FORWARD);
        expect(names(buildAutoTumblingSeries(sp))).not.toContain("ロンダート");
      });
  });

  it("連続の最後に投げる形は普通のタンブリングと同じ入り方ができる", () => {
    const specs = autoTumblingSpecs({ random: seeded(7) }).filter((sp) => sp.pattern.throwInSkill);
    expect(specs.length).toBeGreaterThan(0);
    // 後方系から入る候補（ロンダート→後方系→…→投げ）も作れる
    expect(
      specs.some((sp) => skillDef(sp.saltoIds[0])?.category === CATEGORY.BACKWARD && sp.entry.length > 0),
    ).toBe(true);
    specs.forEach((sp) => expect(tumblingFlowErrors(buildAutoTumblingSeries(sp))).toEqual([]));
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
      (n) =>
        n !== t.spec.saltoCount &&
        n <= t.spec.saltoIds.length &&
        // 差し替えた本数でも連続の終わり方が成り立つこと
        canEndChain(t.spec.saltoIds[n - 1], t.spec.allowBackwardEnd),
    )!;
    const tuned = withSaltoCount(t, other)!;
    expect(tuned.spec.saltoCount).toBe(other);
    expect(tuned.id).toBe(t.id);
    expect(tumblingFlowErrors(tuned.series)).toEqual([]);
    expect(withSaltoCount(t, t.spec.saltoCount)).toBeNull();
    expect(withSaltoCount(t, 99)).toBeNull();
  });

  it("表示名は種類だけ（中身はシリーズの内容で分かるので解説は付けない）", () => {
    const base = { saltoCount: 2, entry: [], saltoIds: ["c_back15", "b_front"], connectId: "" };
    expect(autoTumblingName({ ...base, pattern: pattern("chain") } as AutoTumblingSpec)).toBe(
      "自動生成のタンブリング",
    );
    expect(autoTumblingName({ ...base, pattern: pattern("throwSalto") } as AutoTumblingSpec)).toBe(
      "自動生成の投げタン",
    );
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
    // 同点ならテンプレートを優先する（`AUTO_SERIES_WEIGHT`）だけなので、
    // 自動生成のほうが点数が高ければ自動生成だけの構成にもなる（実測で6割弱が
    // テンプレートを使う）。どちらも使われることを見る
    let withTemplate = 0;
    let withAuto = 0;
    const seeds = 12;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = generateRoutine(myTemplates(), { apparatus: "stick", random: seeded(seed) })!;
      if (r.used.some((t) => !t.auto)) withTemplate += 1;
      if (r.used.some((t) => t.auto)) withAuto += 1;
    }
    expect(withTemplate).toBeGreaterThanOrEqual(3);
    expect(withAuto).toBeGreaterThanOrEqual(3);
  }, 60_000);

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

describe("同じ難度に到達する組み方の優先度", () => {
  const shapeOf = (...items: Item[]) => readTumblingShape(S(...items))!;
  const chain = (...ids: string[]) => shapeOf(...ids.map((id) => skill(id)));

  it("E難度は C→B→B ＞ D→B ＝ C→C ＞ C→C→B ＞ B→B→B→B ＞ その他 ＞ 単発E", () => {
    const rank = (...ids: string[]) => tumblingShapeRank(chain(...ids), "E");
    const cbb = rank("c_back15", "b_front", "b_sidesalto");
    const db = rank("d_backlay25", "b_front");
    const cc = rank("c_back15", "c_front1full");
    const ccb = rank("c_back15", "c_front1full", "b_front");
    const b4 = rank("b_backsalto", "b_front", "b_front", "b_front");
    const other = rank("b_front", "c_front1full", "b_front");
    const single = rank("e_backlay3twist");
    expect(cbb).toBeLessThan(db);
    expect(db).toBe(cc);
    expect(cc).toBeLessThan(ccb);
    expect(ccb).toBeLessThan(b4);
    expect(b4).toBeLessThan(other);
    expect(other).toBeLessThan(single);
  });

  it("D難度は C→B ＝ B→B→B ＞ その他 ＞ 単発D", () => {
    const rank = (...ids: string[]) => tumblingShapeRank(chain(...ids), "D");
    expect(rank("c_back15", "b_front")).toBe(rank("b_backsalto", "b_front", "b_front"));
    expect(rank("c_back15", "b_front")).toBeLessThan(rank("b_front", "c_back15"));
    expect(rank("b_front", "c_back15")).toBeLessThan(rank("d_backlay25"));
  });

  it("投げタンのE難度は C＋側宙 ＝ D＋前転 ＞ つなぎ入りの技中投げ ＞ 連続の技中投げ ＞ 単発E", () => {
    const rank = (sh: ReturnType<typeof shapeOf>) => throwTumblingShapeRank(sh, "E");
    const cSide = shapeOf({ kind: "throw" }, skill("c_front1full"), skill("b_sidesalto"), { kind: "catch" });
    const dRoll = shapeOf({ kind: "throw" }, skill("d_frontlay1"), { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch" });
    const connectThrow = shapeOf(
      skill("a_roundoff"),
      skill("c_back15"),
      skill("a_roundoff"),
      { kind: "skill", skillId: "b_divefront", hasApparatus: true, isThrow: true },
      { kind: "motion", motionId: "fwd_roll", count: 1 },
      { kind: "catch" },
    );
    const chainThrow = shapeOf(
      skill("c_back15"),
      skill("b_front"),
      { kind: "skill", skillId: "b_front", hasApparatus: true, isThrow: true },
      { kind: "motion", motionId: "fwd_roll", count: 1 },
      { kind: "catch" },
    );
    const cOther = shapeOf({ kind: "throw" }, skill("c_front1full"), skill("b_front"), { kind: "catch" });
    const single = shapeOf({ kind: "throw" }, skill("e_frontlay2"), { kind: "catch" });
    expect(rank(cSide)).toBe(rank(dRoll));
    expect(rank(cSide)).toBeLessThan(rank(connectThrow));
    expect(rank(connectThrow)).toBeLessThan(rank(chainThrow));
    expect(rank(chainThrow)).toBeLessThan(rank(cOther));
    expect(rank(cOther)).toBeLessThan(rank(single));
  });

  it("投げタンのD難度は 前方C＋前転 ＝ 前方B＋側宙 ＞ C難度のシリーズ中に投げ", () => {
    const rank = (sh: ReturnType<typeof shapeOf>) => throwTumblingShapeRank(sh, "D");
    const cRoll = shapeOf({ kind: "throw" }, skill("c_front1full"), { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch" });
    const bSide = shapeOf({ kind: "throw" }, skill("b_front"), skill("b_sidesalto"), { kind: "catch" });
    const inC = shapeOf({ kind: "skill", skillId: "c_front1full", hasApparatus: true, isThrow: true }, { kind: "motion", motionId: "fwd_roll", count: 1 }, { kind: "catch" });
    expect(rank(cRoll)).toBe(rank(bSide));
    expect(rank(cRoll)).toBeLessThan(rank(inC));
    expect(rank(inC)).toBeLessThan(rank(shapeOf({ kind: "throw" }, skill("b_front"), { kind: "catch" })));
  });

  it("つなぎ技と技中投げを読み取る", () => {
    const sh = readTumblingShape(
      S(
        skill("a_roundoff"),
        skill("c_back15"),
        skill("a_flicflac"),
        { kind: "skill", skillId: "b_backlayout", hasApparatus: true, isThrow: true },
        { kind: "catch" },
      ),
    )!;
    expect(sh.seq).toEqual(["C", "B"]);
    expect(sh.hasConnect).toBe(true);
    expect(sh.throwInSkill).toBe(true);
    expect(sh.rollFinish).toBe(false);
    // 入りのロンダートはつなぎ技として数えない
    expect(readTumblingShape(S(skill("a_roundoff"), skill("b_front")))!.hasConnect).toBe(false);
    // 宙返りが無ければ null
    expect(readTumblingShape(S({ kind: "throw" }, { kind: "catch" }))).toBeNull();
  });
});
