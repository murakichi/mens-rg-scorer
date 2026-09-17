import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_FUTURE_LEVEL,
  DIFF_SCORE,
  DIFF_VALUE,
  FUTURE_LEVELS,
  FUTURE_TWIST_OPTIONS,
  MAX_DIFF,
  SKILL_LIST,
  TWIST_OPTIONS,
  buildTwistSkillId,
  clampDifficulty,
  futureSkillIds,
  maxDiff,
  normalizeFutureLevel,
  skillAllowed,
  skillDef,
  skillDifficulty,
  skillOptions,
  twistDifficulty,
  twistOptions,
} from "../constants";
import { analyzeSeries, calcHandDifficulty, calcTumblingDifficulty } from "../analysis";
import { computeScore } from "../score";
import { computeTeamScore, initialTeamState, normalizeTeamState } from "../team";
import { generateRoutine } from "../generate";
import { autoTumblingSpecs } from "../autoTumblings";
import {
  FUTURE_UNLOCK_TOGGLES,
  loadFutureUnlock,
  normalizeIndividualDraft,
  saveFutureUnlock,
} from "../draft";
import type { Item, Series, TwistParams } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });
const back = (twist: number, posture: TwistParams["posture"] = "layout"): TwistParams => ({
  base: "back",
  twist,
  posture,
});
const front = (twist: number, posture: TwistParams["posture"] = "layout"): TwistParams => ({
  base: "front",
  twist,
  posture,
});

describe("十年後モード — 難度スケール", () => {
  it("F・Gの価値点は0.9・1.1", () => {
    expect(DIFF_SCORE.F).toBe(0.9);
    expect(DIFF_SCORE.G).toBe(1.1);
    // E(0.7) から上に伸びる（難度が上がるほど価値点も上がる）
    expect(DIFF_SCORE.E).toBeLessThan(DIFF_SCORE.F);
    expect(DIFF_SCORE.F).toBeLessThan(DIFF_SCORE.G);
    expect(DIFF_VALUE.F).toBe(MAX_DIFF + 1);
    expect(DIFF_VALUE.G).toBe(MAX_DIFF + 2);
  });

  it("上限は現行規則がE、モードONで選んだF・Gになる", () => {
    expect(maxDiff(null)).toBe(DIFF_VALUE.E);
    expect(maxDiff("F")).toBe(DIFF_VALUE.F);
    expect(maxDiff("G")).toBe(DIFF_VALUE.G);
    expect(clampDifficulty(DIFF_VALUE.G, null)).toBe("E");
    expect(clampDifficulty(DIFF_VALUE.G, "F")).toBe("F");
    expect(clampDifficulty(DIFF_VALUE.G, "G")).toBe("G");
  });

  it("保存データの上限難度は F・G 以外なら OFF に倒す", () => {
    expect(normalizeFutureLevel("F")).toBe("F");
    expect(normalizeFutureLevel("G")).toBe("G");
    expect(normalizeFutureLevel(undefined)).toBeNull();
    expect(normalizeFutureLevel("E")).toBeNull();
    expect(normalizeFutureLevel(true)).toBeNull();
    expect(FUTURE_LEVELS.map((l) => l.id)).toEqual(["F", "G"]);
    expect(FUTURE_LEVELS.some((l) => l.id === DEFAULT_FUTURE_LEVEL)).toBe(true);
  });
});

describe("十年後モード — ひねりの難度", () => {
  it("半ひねりごとに1段の刻みをF・Gまで伸ばす", () => {
    expect(twistDifficulty(back(3), "G")).toBe("E");
    expect(twistDifficulty(back(3.5), "G")).toBe("E");
    expect(twistDifficulty(back(4), "G")).toBe("F");
    expect(twistDifficulty(back(4.5), "G")).toBe("F");
    expect(twistDifficulty(back(5), "G")).toBe("G");
    // 前方の伸身は1段階上（§3.6.2）
    expect(twistDifficulty(front(3), "G")).toBe("F");
    expect(twistDifficulty(front(4), "G")).toBe("G");
    expect(twistDifficulty(front(3, "tuck"), "G")).toBe("E");
  });

  it("モードOFF・上限Fでは上限で丸める（現行規則の難度は変わらない）", () => {
    expect(twistDifficulty(back(4))).toBe("E");
    expect(twistDifficulty(back(5))).toBe("E");
    expect(twistDifficulty(back(5), "F")).toBe("F");
    // 現行規則で表せる範囲は従来どおり
    expect(twistDifficulty(back(1.5))).toBe("C");
    expect(twistDifficulty(front(2))).toBe("E");
  });

  it("ひねりの選択肢は上限に収まるものだけ増える", () => {
    expect(twistOptions(null)).toEqual(TWIST_OPTIONS);
    expect(twistOptions("G", { base: "back", posture: "layout" })).toEqual([
      ...TWIST_OPTIONS,
      ...FUTURE_TWIST_OPTIONS,
    ]);
    // 上限FではG難度になる5回ひねりを出さない
    expect(twistOptions("F", { base: "back", posture: "layout" })).toEqual([...TWIST_OPTIONS, 4, 4.5]);
    // 前方の伸身は1段階上なので、同じ上限でも選べるひねりが少ない
    expect(twistOptions("F", { base: "front", posture: "layout" })).toEqual(TWIST_OPTIONS);
    expect(twistOptions("G", { base: "front", posture: "layout" })).toEqual([...TWIST_OPTIONS, 4, 4.5]);
  });

  it("組み立てた技のidは一覧のF・G難度の技に一致する", () => {
    expect(buildTwistSkillId(back(4))).toBe("f_backlay4twist");
    expect(buildTwistSkillId(back(5))).toBe("g_backlay5twist");
    expect(buildTwistSkillId(front(3))).toBe("f_frontlay3");
    SKILL_LIST.filter((s) => s.future && s.twist).forEach((s) => {
      expect(skillDef(s.id)!.difficulty).toBe(twistDifficulty(s.twist!, "G"));
    });
  });
});

describe("十年後モード — 技の選択肢", () => {
  const futureListed = SKILL_LIST.filter((s) => s.future);

  it("F・G難度の技は現行規則の選択肢に出ない", () => {
    expect(futureListed.length).toBeGreaterThan(0);
    const ids = skillOptions().map((s) => s.id);
    futureListed.forEach((s) => expect(ids).not.toContain(s.id));
    futureListed.forEach((s) => expect(skillAllowed(s.id)).toBe(false));
  });

  it("上限Fでは F難度の技だけ、上限Gでは両方出る", () => {
    const f = skillOptions(false, undefined, "F").map((s) => s.id);
    const g = skillOptions(false, undefined, "G").map((s) => s.id);
    futureListed.forEach((s) => {
      expect(f.includes(s.id)).toBe(s.difficulty === "F");
      expect(g).toContain(s.id);
    });
  });

  it("ジュニアの2回宙返り禁止は十年後モードでも効く", () => {
    const ids = skillOptions(true, undefined, "G").map((s) => s.id);
    expect(ids).not.toContain("g_tripleback"); // 後方3回宙返り
    expect(ids).toContain("g_backlay5twist");
    expect(futureSkillIds("G", true)).not.toContain("f_double3twist");
    expect(futureSkillIds(null)).toEqual([]);
  });

  it("技の難度は適用中の上限で丸める（OFFのまま残ったF難度の技はE止め）", () => {
    expect(skillDifficulty("f_backlay4twist")).toBe("E");
    expect(skillDifficulty("f_backlay4twist", false, "F")).toBe("F");
    expect(skillDifficulty("g_backlay5twist", false, "F")).toBe("F");
    expect(skillDifficulty("g_backlay5twist", false, "G")).toBe("G");
    expect(skillDifficulty("b_front", false, "G")).toBe("B");
  });
});

describe("十年後モード — 難度計算", () => {
  it("タンブリングの連続加算がF・Gまで伸びる", () => {
    // C→B→B→B＝3+1+1+1＝6（F）、C→B→B→B→B＝7（G）
    const chain = ["c_back15", "b_front", "b_front", "b_front"];
    expect(calcTumblingDifficulty(chain, false)).toBe("E");
    expect(calcTumblingDifficulty(chain, false, false, "F")).toBe("F");
    expect(calcTumblingDifficulty(chain, false, false, "G")).toBe("F");
    expect(calcTumblingDifficulty([...chain, "b_front"], false, false, "G")).toBe("G");
    // 上限Fでは F で止まる
    expect(calcTumblingDifficulty([...chain, "b_front"], false, false, "F")).toBe("F");
  });

  it("徒手系難度も上限まで伸びる（縦3動作は従来どおりE）", () => {
    expect(calcHandDifficulty(4, false)).toBe("E");
    expect(calcHandDifficulty(5, false)).toBe("E");
    expect(calcHandDifficulty(5, false, "G")).toBe("F");
    expect(calcHandDifficulty(6, false, "G")).toBe("G");
    expect(calcHandDifficulty(6, false, "F")).toBe("F");
    expect(calcHandDifficulty(6, true, "G")).toBe("E");
  });

  it("F難度の宙返り1本は難度点0.9（モードOFFなら0.7のまま）", () => {
    const series = [S(skill("a_roundoff"), skill("f_backlay4twist"))];
    expect(computeScore(series, "stick").tumblingScore).toBeCloseTo(DIFF_SCORE.E, 5);
    expect(computeScore(series, "stick", { future: "F" }).tumblingScore).toBeCloseTo(DIFF_SCORE.F, 5);
    // 上限FではG難度の技もF止め、上限Gなら1.1
    const g = [S(skill("a_roundoff"), skill("g_backlay5twist"))];
    expect(computeScore(g, "stick", { future: "F" }).tumblingScore).toBeCloseTo(DIFF_SCORE.F, 5);
    expect(computeScore(g, "stick", { future: "G" }).tumblingScore).toBeCloseTo(DIFF_SCORE.G, 5);
  });

  it("難度以外の判定（宙返りの本数・つなぎ）は変わらない", () => {
    const series = S(skill("a_roundoff"), skill("f_backlay4twist"), skill("b_front"));
    const a = analyzeSeries(series, false, "G");
    expect(a.units).toHaveLength(1);
    expect(a.units[0].type).toBe("tumbling");
    expect(a.units[0].finalDiff).toBe("G"); // F(6)+B(2)-1 = 7
    expect(analyzeSeries(series).units[0].finalDiff).toBe("E");
  });

  it("E難度以上の転回系なら手具操作加点が付く（§3.5.5.5(3)）", () => {
    const held = (id: string): Item => ({ kind: "skill", skillId: id, hasApparatus: true, isThrow: false });
    const series = [S(held("a_roundoff"), held("f_backlay4twist"), held("b_front"))];
    expect(computeScore(series, "stick", { future: "G" }).apparatusOpBonus).toBeCloseTo(0.1, 5);
  });

  it("団体も上限難度を共有する", () => {
    const team = initialTeamState();
    // 3人以上が同じ難度に到達するとシリーズ難度になる（団体のD）
    team.series[0].lanes.forEach((lane) => {
      lane[0] = { type: "skill", skillId: "a_roundoff" };
      lane[1] = { type: "skill", skillId: "g_backlay5twist" };
    });
    const off = computeTeamScore({ ...team, future: null });
    const on = computeTeamScore({ ...team, future: "G" });
    expect(off.analysis[0].lanes[0][0].adjDiff).toBe("E");
    expect(on.analysis[0].lanes[0][0].adjDiff).toBe("G");
    expect(on.dScore).toBeGreaterThan(off.dScore);
    // 保存データからの復元
    expect(normalizeTeamState({ ...team, future: "G" })!.future).toBe("G");
    expect(normalizeTeamState({ ...team, future: "X" })!.future).toBeNull();
  });
});

describe("十年後モード — ランダム生成", () => {
  /** 決まった順に進む疑似乱数（テストを安定させる） */
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  it("候補のタンブリングにF・G難度の技が入る（モードOFFでは入らない）", () => {
    const usedIds = (future: Parameters<typeof autoTumblingSpecs>[0]["future"]) =>
      autoTumblingSpecs({ apparatus: "stick", future, skillIds: ["a_roundoff", "b_front"], random: seeded(5) })
        .flatMap((s) => s.saltoIds);
    expect(usedIds(null).some((id) => skillDef(id)?.future)).toBe(false);
    const g = usedIds("G");
    expect(g.some((id) => skillDef(id)?.future)).toBe(true);
    // 上限Fの候補にG難度の技は出てこない
    const f = usedIds("F");
    expect(f.every((id) => skillDifficulty(id, false, "G") !== "G")).toBe(true);
  });

  it("生成した構成の難度がモードONで上がる", () => {
    const opts = { apparatus: "stick" as const, random: seeded(7) };
    const off = generateRoutine([], { ...opts, random: seeded(7) })!;
    const on = generateRoutine([], { ...opts, random: seeded(7), future: "G" as const })!;
    expect(on.dScore).toBeGreaterThan(off.dScore);
    // 採点と生成の見立てが一致する（同じ上限で採点し直しても同じD）
    expect(computeScore(on.series, "stick", { future: "G" }).dScore).toBeCloseTo(on.dScore, 5);
    const diffs = computeScore(on.series, "stick", { future: "G" }).analysis.flatMap((a) =>
      a.units.map((u) => u.finalDiff),
    );
    expect(diffs.some((d) => d === "F" || d === "G")).toBe(true);
  });
});

describe("十年後モード — 解放（ジュニアモードの切り替え回数）", () => {
  class MemoryStorage {
    map = new Map<string, string>();
    getItem(k: string) {
      return this.map.has(k) ? this.map.get(k)! : null;
    }
    setItem(k: string, v: string) {
      this.map.set(k, v);
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
  }
  const g = globalThis as { localStorage?: unknown };
  beforeEach(() => {
    g.localStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("初期状態は未解放で、10回でも解放になる", () => {
    expect(FUTURE_UNLOCK_TOGGLES).toBe(10);
    expect(loadFutureUnlock()).toEqual({ toggles: 0, unlocked: false });
    saveFutureUnlock({ toggles: FUTURE_UNLOCK_TOGGLES - 1, unlocked: false });
    expect(loadFutureUnlock().unlocked).toBe(false);
    saveFutureUnlock({ toggles: FUTURE_UNLOCK_TOGGLES, unlocked: true });
    expect(loadFutureUnlock()).toEqual({ toggles: FUTURE_UNLOCK_TOGGLES, unlocked: true });
  });

  it("回数だけ保存された古いデータからも解放を判定する", () => {
    saveFutureUnlock({ toggles: 12, unlocked: false } as never);
    expect(loadFutureUnlock().unlocked).toBe(true);
  });

  it("壊れた保存データでも落ちない", () => {
    (g.localStorage as MemoryStorage).setItem("mens-rg-scorer:future-unlock:v1", "{");
    expect(loadFutureUnlock()).toEqual({ toggles: 0, unlocked: false });
  });
});

describe("十年後モード — 保存データ", () => {
  it("上限難度がドラフト・共有URLの形に含まれる", () => {
    const d = normalizeIndividualDraft({ apparatus: "stick", future: "G", series: [] })!;
    expect(d.future).toBe("G");
    expect(normalizeIndividualDraft({ apparatus: "stick", series: [] })!.future).toBeNull();
    expect(normalizeIndividualDraft({ apparatus: "stick", future: "Z", series: [] })!.future).toBeNull();
  });
});
