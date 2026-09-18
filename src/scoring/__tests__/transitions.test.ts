import { describe, it, expect } from "vitest";
import {
  AUTO_TUMBLING_PATTERNS,
  AFTER_BACK_LAYOUT_BACKWARD_SALTOS,
  AFTER_BACK_LAYOUT_SALTOS,
  CHAIN_END_SKILLS,
  KIRIMOMI_THROW_SKILL_ID,
  RARE_CHAIN_END_SKILLS,
  ROLL_AFTER_FORWARD_CHANCE,
  ROLL_AFTER_FRONT_CHANCE,
  ROLL_AFTER_SWITCH_CHANCE,
  ROUNDOFF_ENTRY_WEIGHT,
  SIDE_SALTO_ID,
  TENCHU_SKILL_ID,
  THROW_FINISH_SALTOS,
  THROW_IN_SALTO_WEIGHT,
  THROW_IN_SIDE_SALTO_WEIGHT,
  THROW_IN_TWIST_SALTO_WEIGHT,
  throwInSaltoWeight,
  THROW_IN_SKILL_ROUNDOFF_WEIGHT,
  buildTransitions,
  canEndWith,
  canThrowAt,
  edgeCanEnd,
  edgeCanThrow,
  usableSkills,
  type AutoTumblingPattern,
  type SaltoEdge,
} from "../autoTumblings";
import {
  DIFF_VALUE,
  DIVING_SKILL_ID,
  ROUNDOFF_SKILL_ID,
  isBackwardSalto,
  skillDifficulty,
} from "../constants";
import {
  AFTER_BACK_LAYOUT_SALTOS,
  AFTER_FORWARD_KIRIMOMI,
  HARDER_THAN_RATED,
  HARDER_THAN_RATED_WEIGHT,
  frequencyDiffValue,
  harderThanRatedWeight,
  maxSkillDiffValue,
  saltoWeights,
  SWITCH_SIDE_SALTO_WEIGHT,
  CONNECT_FINISH_HALF_WEIGHT,
  isBackHalfTwistSalto,
  SIDE_SALTO_ID,
  TENCHU_SKILL_ID,
  THROW_AFTER_CONNECT_SALTOS,
  THROW_AFTER_CONNECT_WEIGHT,
  THROW_FINISH_SALTOS,
} from "../autoTumblings";

const pattern = (id: string): AutoTumblingPattern =>
  AUTO_TUMBLING_PATTERNS.find((p) => p.id === id) as AutoTumblingPattern;

/** 既定の条件（上級者・手具の指定なし）の遷移表 */
const table = (patternId: string, over: Record<string, unknown> = {}) =>
  buildTransitions({ pattern: pattern(patternId), ...over });

const ids = (edges: SaltoEdge[]) => edges.map((e) => e.id);
const find = (edges: SaltoEdge[], id: string) => edges.find((e) => e.id === id);
const value = (id: string) => {
  const d = skillDifficulty(id);
  return d ? DIFF_VALUE[d] : 0;
};

describe("遷移表（連鎖のルール × 選ばれやすさ）", () => {
  it("表を引くだけで、その技に何が続けられるか分かる", () => {
    const tr = table("chain");
    // 後方伸身宙返りの後は 前宙・きりもみ・きりもみ転回（＋難度が上がらない後方系）
    expect(ids(tr.next("b_backlayout"))).toEqual(
      expect.arrayContaining(AFTER_BACK_LAYOUT_SALTOS.map((x) => x.id)),
    );
    // 首から背中に着地する技・側宙の後には何も続かない
    CHAIN_END_SKILLS.forEach((id) => expect(tr.next(id)).toEqual([]));
    // テンポ以外の後方系（後ろ向きに降りる）の後も続かない
    expect(tr.next("b_backsalto")).toEqual([]);
  });

  it("連続の難度はだんだん下がる（テンポと例外を除く）", () => {
    const tr = table("chain");
    ["c_back15", "b_fronthalf", "b_backhalf"].forEach((prev) => {
      tr.next(prev).forEach((e) => {
        // 後方宙返り半ひねり→前方宙返り1回ひねり だけが上がってよい例外
        if (prev === "b_backhalf" && e.id === "c_front1full") return;
        // きりもみ系は連続の中でだけ宙返りになる技なので、難度の上下は問わない
        if (AFTER_FORWARD_KIRIMOMI.includes(e.id)) return;
        expect(value(e.id)).toBeLessThanOrEqual(value(prev));
      });
    });
    // テンポは例外（そのあと難度が上がってよい）
    expect(tr.next("b_tempo").some((e) => value(e.id) > value("b_tempo"))).toBe(true);
    expect(tr.next("c_tempotwist").some((e) => value(e.id) > value("c_tempotwist"))).toBe(true);
  });

  it("ロンダート入り（後方系の1本目）の重みは、宙返りの途中で投げる形でいちばん高い", () => {
    const backward = (edges: SaltoEdge[]) => edges.filter((e) => isBackwardSalto(e.id));
    const plain = table("chain", { targetScore: 4.5 });
    const inSkill = table("chainThrowInSkill", { targetScore: 4.5 });
    const w = (edges: SaltoEdge[]) => backward(edges)[0]?.weight ?? 0;
    expect(w(inSkill.first)).toBeGreaterThan(w(plain.first));
    // 目標Dスコアが上がるほど、ロンダート入りの優先は弱まる
    const low = w(table("chain", { targetScore: 1.5 }).first);
    const high = w(table("chain", { targetScore: 4.5 }).first);
    expect(low).toBeGreaterThan(high);
    expect(ROUNDOFF_ENTRY_WEIGHT).toBeGreaterThan(1);
    expect(THROW_IN_SKILL_ROUNDOFF_WEIGHT).toBeGreaterThan(1);
  });

  it("投げてから跳ぶ投げ受けは、1本目が前方系・続きは側宙か転宙だけ", () => {
    const tr = table("throwSalto");
    tr.first.forEach((e) => expect(isBackwardSalto(e.id)).toBe(false));
    ids(tr.next("b_front")).forEach((id) => expect(THROW_FINISH_SALTOS).toContain(id));
  });

  it("側宙・きりもみ転回で投げる形は稀（辺の重みが下がる）", () => {
    const inSkill = table("chainThrowInSkill");
    const plain = table("chain");
    // 実施中に投げるのが稀な技はどれも同じだけ下がる（下げ忘れると、側宙を下げたぶん
    // その技が繰り上がってしまう）
    Object.keys(THROW_IN_SALTO_WEIGHT).forEach((id) => {
      const a = find(inSkill.next("b_front"), id) ?? find(inSkill.next("c_back15"), id);
      const b = find(plain.next("b_front"), id) ?? find(plain.next("c_back15"), id);
      expect(a).toBeDefined();
      expect(a!.weight).toBeCloseTo((b?.weight ?? 0) * throwInSaltoWeight(id), 6);
      expect(throwInSaltoWeight(id)).toBeLessThan(1);
    });
    // ひねりのある前方系も下げる（1つ下げると隣が繰り上がるので、ひねりの有無で判定する）
    ["c_front1full", "d_frontlay1", "e_frontlay2"].forEach((id) =>
      expect(throwInSaltoWeight(id)).toBe(THROW_IN_TWIST_SALTO_WEIGHT),
    );
    // 実施例のある「ひねりの無い前宙で投げる」形は下げない
    expect(throwInSaltoWeight("b_front")).toBe(1);
    expect(throwInSaltoWeight("b_divefront")).toBe(1);
    // 実施例が無い技（側宙・きりもみ転回）のほうが低い
    expect(THROW_IN_SIDE_SALTO_WEIGHT).toBeLessThan(THROW_IN_TWIST_SALTO_WEIGHT);
    // 遷移表の辺にも効く
    const a = find(table("chainThrowInSkill").next("b_backhalf"), "c_front1full");
    const b = find(table("chain").next("b_backhalf"), "c_front1full");
    expect(a).toBeDefined();
    expect(a!.weight).toBeCloseTo((b?.weight ?? 0) * THROW_IN_TWIST_SALTO_WEIGHT, 6);
  });

  it("辺に「終われるか」が載っている（抽選が要るものは印が付く）", () => {
    const tr = table("chain");
    const front = find(tr.next("c_back15"), "b_front");
    expect(front && edgeCanEnd(front)).toBe(true);
    // 後ろ向きで終わる後方宙返りは、抽選が通ったときだけ終われる
    const back = find(tr.first, "b_backsalto");
    expect(back?.endNeedsBackwardDraw).toBe(true);
    expect(back && edgeCanEnd(back)).toBe(false);
    expect(back && edgeCanEnd(back, { backwardEnd: true })).toBe(true);
    // 後方宙返り半ひねりで終わるのは稀
    RARE_CHAIN_END_SKILLS.forEach((id) => {
      expect(canEndWith(id)).toBe(false);
      expect(canEndWith(id, { rareEnd: true })).toBe(true);
    });
    // 前方の半ひねりは抽選が通っても終われない
    expect(canEndWith("b_fronthalf", { backwardEnd: true, rareEnd: true })).toBe(false);
  });

  it("辺に「その位置で投げてよいか」が載っている", () => {
    const tr = table("chainThrowInSkill");
    // 後ろ向きで終わる宙返り（後方伸身）→ 前方系 の位置では投げない（きりもみだけ抽選で残る）
    const kirimomi = find(tr.next("b_backlayout"), KIRIMOMI_THROW_SKILL_ID);
    expect(kirimomi?.throwRule).toBe("kirimomiDraw");
    expect(kirimomi && edgeCanThrow(kirimomi)).toBe(false);
    expect(kirimomi && edgeCanThrow(kirimomi, { backToForwardThrow: true })).toBe(true);
    expect(find(tr.next("b_backlayout"), "b_front")?.throwRule).toBe("never");
    // 前向きに降りた後（半ひねり系）は普通に投げられる
    expect(find(tr.next("c_back15"), "b_front")?.throwRule).toBe("ok");
    expect(find(tr.next("b_backhalf"), "b_front")?.throwRule).toBe("ok");
    expect(canThrowAt(undefined, "b_front")).toBe(true);
  });

  it("辺に「そのあと前転を付ける確率」が載っている", () => {
    const tr = table("chain");
    // 前宙はありなし半々、それ以外の前方系はほぼ必ず前転
    expect(find(tr.next("b_backhalf"), "b_front")?.rollChance).toBeCloseTo(ROLL_AFTER_FRONT_CHANCE, 6);
    expect(find(tr.next("c_back15"), "c_front1full")?.rollChance).toBeCloseTo(
      ROLL_AFTER_FORWARD_CHANCE,
      6,
    );
    // 切り返し（後ろ向きで終わる宙返り → 前方系）のあとは前転をしないことが多い
    expect(find(tr.next("b_backlayout"), "b_front")?.rollChance).toBeCloseTo(
      ROLL_AFTER_SWITCH_CHANCE,
      6,
    );
    // 側宙・きりもみ系のあとは前転をしない
    expect(find(tr.next("b_backlayout"), "b_kirimomi")?.rollChance).toBe(0);
  });

  it("後方伸身宙返りの後は前方系が主流だが、後方系を続ける形も残る（頻度は低い）", () => {
    const tr = table("chain");
    // 後方伸身2回ひねり→抱え込みの1回半ひねり を実施する選手がいる
    const back = find(tr.next("d_backlay2twist"), "c_back15");
    expect(back).toBeDefined();
    // 主流の前方系より十分選ばれにくい
    const front = find(tr.next("d_backlay2twist"), "b_front");
    expect(back && front && back.weight).toBeLessThan((front?.weight ?? 0) / 5);
    AFTER_BACK_LAYOUT_BACKWARD_SALTOS.forEach((x) => expect(x.weight).toBeLessThan(1));
    // 連続は難度が下がるので、直前より難度の高い後方系は出さない
    // （後方伸身宙返り＝B の後に C難度の1回半ひねりは続けない）
    expect(find(tr.next("b_backlayout"), "c_back15")).toBeUndefined();
  });

  it("ダイビングは自動生成では組み立てない（頭から着地するので後にも続かない）", () => {
    const tr = table("chain");
    expect(tr.first.some((e) => e.id === DIVING_SKILL_ID)).toBe(false);
    expect(tr.next("d_backlay2twist").some((e) => e.id === DIVING_SKILL_ID)).toBe(false);
    expect(usableSkills({})([DIVING_SKILL_ID])).toEqual([]);
    // 指定に入れても自動生成では使わない
    expect(usableSkills({ skillIds: [DIVING_SKILL_ID] })([DIVING_SKILL_ID])).toEqual([]);
    // 連続の終わりの技なので、後にも何も続かない
    expect(tr.next(DIVING_SKILL_ID)).toEqual([]);
    expect(tr.connects(DIVING_SKILL_ID)).toEqual([]);
  });

  it("転宙の後は側宙だけ（つなぎも前転も続けない）", () => {
    const tr = table("chain");
    // 続けられる宙返りは側宙だけ
    expect(ids(tr.next(TENCHU_SKILL_ID))).toEqual([SIDE_SALTO_ID]);
    // つなぎ技も挟まない
    expect(tr.connects(TENCHU_SKILL_ID)).toEqual([]);
    // 転宙でそのまま終われる
    expect(canEndWith(TENCHU_SKILL_ID)).toBe(true);
    // 転宙のあとに前転は付けない（`NO_ROLL_AFTER_SKILLS`）
    expect(find(tr.next("b_backhalf"), TENCHU_SKILL_ID)?.rollChance).toBe(0);
  });

  it("つなぎ技は前向きに降りた後だけ（テンポの後はバク転）", () => {
    const tr = table("connect");
    expect(ids(tr.connects("b_front") as SaltoEdge[])).toContain(ROUNDOFF_SKILL_ID);
    expect(ids(tr.connects("b_tempo") as SaltoEdge[])).toEqual(["a_flicflac"]);
    expect(tr.connects("b_backsalto")).toEqual([]);
    expect(tr.connects("b_kirimomi")).toEqual([]);
  });

  it("つなぎの後に難度が上がる辺は重みが下がる", () => {
    const tr = table("connect");
    // つなぎの前が B難度なら、C難度に上がる辺だけ重みが落ちる
    const afterB = tr.afterConnect(ROUNDOFF_SKILL_ID, "b_front");
    const afterC = tr.afterConnect(ROUNDOFF_SKILL_ID, "c_back15");
    const id = "c_back1full";
    const rise = find(afterB, id);
    const flat = find(afterC, id);
    expect(rise && flat && rise.weight).toBeLessThan(flat?.weight ?? 0);
  });

  it("切り返しからの側宙は少し珍しい寄り（その位置の辺だけ重みが下がる）", () => {
    const tr = table("chain");
    // 切り返し＝後ろ向きで終わる宙返り（後方伸身2回ひねり＝整数ひねり）→ 前方系（前宙）
    const afterSwitch = find(tr.next("b_front", "d_backlay2twist"), SIDE_SALTO_ID);
    // 同じ前宙でも、その前が無い／前向きで終わる技なら下げない
    const plain = find(tr.next("b_front"), SIDE_SALTO_ID);
    expect(afterSwitch && plain).toBeTruthy();
    expect(afterSwitch!.weight).toBeCloseTo(plain!.weight * SWITCH_SIDE_SALTO_WEIGHT);
    expect(SWITCH_SIDE_SALTO_WEIGHT).toBeLessThan(1);
    // 側宙以外はその位置でも下がらない
    const other = "b_kirimomi";
    const o1 = find(tr.next("b_front", "d_backlay2twist"), other);
    const o2 = find(tr.next("b_front"), other);
    if (o1 && o2) expect(o1.weight).toBeCloseTo(o2.weight);
  });

  it("つなぎのあとの宙返りにハーフ（後方の半ひねり）を使う辺は重みが下がる", () => {
    expect(isBackHalfTwistSalto("b_backhalf")).toBe(true);
    expect(isBackHalfTwistSalto("b_backlayhalf")).toBe(true);
    // 1回半ひねりは「ハーフ」ではない（下げる対象は半ひねりだけ）
    expect(isBackHalfTwistSalto("c_back15")).toBe(false);
    expect(isBackHalfTwistSalto("b_front")).toBe(false);

    const tr = table("connect");
    const afters = tr.afterConnect(ROUNDOFF_SKILL_ID, "b_front");
    const half = find(afters, "b_backhalf");
    // 同じ難度・同じ位置に置ける普通の後方系（後方伸身宙返り）と比べる
    const plain = find(afters, "b_backlayout");
    expect(half && plain).toBeTruthy();
    expect(half!.weight).toBeLessThan(plain!.weight);
    expect(CONNECT_FINISH_HALF_WEIGHT).toBeLessThan(1);
    // 基本的な構成（ジュニア・低いDスコア）では下げない
    const basic = table("connect", { basicLevel: true });
    const basicAfters = basic.afterConnect(ROUNDOFF_SKILL_ID, "b_front");
    const basicHalf = find(basicAfters, "b_backhalf");
    if (basicHalf && half) expect(basicHalf.weight).toBeGreaterThan(half.weight);
  });

  it("基本的な構成（低いDスコア）ではD難度以上が表に出ない", () => {
    const tr = table("chain", { basicLevel: true, targetScore: 1.5 });
    ids(tr.first).forEach((id) => expect(value(id)).toBeLessThanOrEqual(DIFF_VALUE.C));
    // つなぎの形自体が作られないので、ここでは連続だけを見る
    ids(tr.next("c_back15")).forEach((id) => expect(value(id)).toBeLessThanOrEqual(DIFF_VALUE.C));
  });

  it("使ってよい技を絞ると、表もその範囲だけになる", () => {
    const allowed = ["b_front", SIDE_SALTO_ID, "c_back15"];
    const tr = table("chain", { skillIds: allowed });
    ids(tr.first).forEach((id) => expect(allowed).toContain(id));
    ids(tr.next("c_back15")).forEach((id) => expect(allowed).toContain(id));
    // 2回宙返り系は、実際に実施している（指定に入っている）ときだけ使う
    expect(usableSkills({})(["d_doubleback"])).toEqual([]);
    expect(usableSkills({ skillIds: ["d_doubleback"] })(["d_doubleback"])).toEqual(["d_doubleback"]);
  });

  it("同じ条件の表は1回だけ作れば足りる（引き直しても同じ辺が返る）", () => {
    const tr = table("chain");
    expect(tr.next("c_back15")).toBe(tr.next("c_back15"));
    expect(tr.connects("b_front")).toBe(tr.connects("b_front"));
    expect(tr.afterConnect(ROUNDOFF_SKILL_ID, "b_front")).toBe(
      tr.afterConnect(ROUNDOFF_SKILL_ID, "b_front"),
    );
    // つなぎの前の技が変われば別の表
    expect(tr.afterConnect(ROUNDOFF_SKILL_ID, "b_front")).not.toBe(
      tr.afterConnect(ROUNDOFF_SKILL_ID, "c_back15"),
    );
  });
});

describe("つなぎの後の宙返りで投げる形（`connectThrowInSkill`）", () => {
  it("つなぎの後の宙返りは、ダイビング前宙・前宙の重みが上がる", () => {
    const plain = table("connect");
    const throwing = table("connectThrowInSkill");
    // ロンダートで繋いだ後の選択肢（＝後方系）にダイビング前宙が入っている
    const after = (tr: ReturnType<typeof table>) => tr.afterConnect(ROUNDOFF_SKILL_ID, "b_backlayout");
    expect(ids(after(plain))).toContain("b_divefront");
    // 投げる形では、その技の重みが `THROW_AFTER_CONNECT_WEIGHT` 倍になる
    const plainW = find(after(plain), "b_divefront")!.weight;
    const throwW = find(after(throwing), "b_divefront")!.weight;
    expect(throwW).toBeCloseTo(plainW * THROW_AFTER_CONNECT_WEIGHT, 6);
    // 対象外の技は変わらない
    const other = ids(after(plain)).find((id) => !THROW_AFTER_CONNECT_SALTOS.includes(id))!;
    expect(find(after(throwing), other)!.weight).toBeCloseTo(find(after(plain), other)!.weight, 6);
  });
});

describe("前方系のあとのきりもみ転回", () => {
  it("前宙のあとに出て、側宙より選ばれにくい（きりもみは出ない）", () => {
    const tr = table("chain");
    const after = tr.next("b_front");
    expect(ids(after)).toContain("c_kirimomiten");
    // きりもみは首から背中にかけて着地するので、ここには出さない
    expect(ids(after)).not.toContain("b_kirimomi");
    // 難度は上がる（前宙B→きりもみ転回C）が、きりもみ系は連続の中でだけ宙返りになるので許す
    expect(value("c_kirimomiten")).toBeGreaterThan(value("b_front"));
    // 側宙 ＞ きりもみ転回 ＞ 転宙
    expect(find(after, "c_kirimomiten")!.weight).toBeLessThan(find(after, SIDE_SALTO_ID)!.weight);
    expect(find(after, "c_kirimomiten")!.weight).toBeGreaterThan(find(after, TENCHU_SKILL_ID)!.weight);
  });

  it("投げてから跳ぶ投げタンの2本目にも出る", () => {
    // 投げ受けの2本目は `THROW_FINISH_SALTOS` に絞られる
    expect(THROW_FINISH_SALTOS).toContain("c_kirimomiten");
    const after = table("throwSalto").next("b_front");
    expect(ids(after).sort()).toEqual([SIDE_SALTO_ID, TENCHU_SKILL_ID, "c_kirimomiten"].sort());
  });
});

describe("狙うDスコアごとの技の難度の上限", () => {
  it("上限が上がるほど難しい技を実施できる（段はひとつずつ上がる）", () => {
    // 2点台まではC難度まで、3点台はD難度まで、4点台以上は制限しない
    expect(maxSkillDiffValue(1.5)).toBe(DIFF_VALUE.C);
    expect(maxSkillDiffValue(2.9)).toBe(DIFF_VALUE.C);
    expect(maxSkillDiffValue(3.0)).toBe(DIFF_VALUE.D);
    expect(maxSkillDiffValue(3.9)).toBe(DIFF_VALUE.D);
    expect(maxSkillDiffValue(4.0)).toBe(DIFF_VALUE.E);
    // 上限を指定しない＝難度を狙いきる構成なので制限しない
    expect(maxSkillDiffValue(null)).toBe(DIFF_VALUE.E);
    // 単調（下がることはない）
    const steps = [0, 1, 2, 2.9, 3, 3.9, 4, 5, 9].map((s) => maxSkillDiffValue(s));
    steps.forEach((v, i) => i > 0 && expect(v).toBeGreaterThanOrEqual(steps[i - 1]));
    // 十年後モードの上限を超えない／低い要求値では十年後モードでも上がらない
    expect(maxSkillDiffValue(null, "G")).toBe(DIFF_VALUE.G);
    expect(maxSkillDiffValue(2.0, "G")).toBe(DIFF_VALUE.C);
  });

  it("遷移表の候補からも上限を超える技が消える", () => {
    const value = (id: string) => {
      const d = skillDifficulty(id);
      return d ? DIFF_VALUE[d] : 0;
    };
    const low = table("chain", { targetScore: 2.5 });
    ids(low.first).forEach((id) => expect(value(id)).toBeLessThanOrEqual(DIFF_VALUE.C));
    ids(low.next("c_back15")).forEach((id) => expect(value(id)).toBeLessThanOrEqual(DIFF_VALUE.C));
    // 上限なしならE難度も候補に出る
    expect(ids(table("chain").first).some((id) => value(id) === DIFF_VALUE.E)).toBe(true);
    // 3点台はD難度まで
    ids(table("chain", { targetScore: 3.5 }).first).forEach((id) =>
      expect(value(id)).toBeLessThanOrEqual(DIFF_VALUE.D),
    );
  });
});

describe("表記より難しい技（転宙・きりもみ・きりもみ転回）", () => {
  it("頻度は難度1段上として扱う（難度点は規則どおり）", () => {
    // 対象は3つ。難度そのものは変えていない
    expect(HARDER_THAN_RATED).toEqual(
      expect.arrayContaining([TENCHU_SKILL_ID, "b_kirimomi", "c_kirimomiten"]),
    );
    expect(skillDifficulty("b_tenchu")).toBe("B");
    expect(skillDifficulty("c_kirimomiten")).toBe("C");
    // 頻度の計算では1段上
    expect(frequencyDiffValue("b_tenchu")).toBe(DIFF_VALUE.C);
    expect(frequencyDiffValue("b_kirimomi")).toBe(DIFF_VALUE.C);
    expect(frequencyDiffValue("c_kirimomiten")).toBe(DIFF_VALUE.D);
    // 対象外の技は変わらない
    expect(frequencyDiffValue("b_front")).toBe(DIFF_VALUE.B);
    expect(harderThanRatedWeight("b_front")).toBe(1);
    expect(harderThanRatedWeight("b_kirimomi")).toBe(HARDER_THAN_RATED_WEIGHT);
  });

  it("重みは位置ごとの重みのあとにも掛かる（きりもみが実際に出る位置）", () => {
    // 後方伸身宙返りの後は `AFTER_BACK_LAYOUT_SALTOS` が重みを上書きする位置
    const w = saltoWeights("b_backlayout");
    const listed = (id: string) => AFTER_BACK_LAYOUT_SALTOS.find((x) => x.id === id)!.weight;
    expect(w["b_front"]).toBe(listed("b_front"));
    expect(w["b_kirimomi"]).toBeCloseTo(listed("b_kirimomi") * HARDER_THAN_RATED_WEIGHT, 6);
    expect(w["c_kirimomiten"]).toBeCloseTo(listed("c_kirimomiten") * HARDER_THAN_RATED_WEIGHT, 6);
    // 前宙より少ない関係は保たれる
    expect(w["b_kirimomi"]).toBeLessThan(w["b_front"]);
    expect(w["c_kirimomiten"]).toBeLessThan(w["b_kirimomi"]);
  });

  it("難度の上限も1段上で見る（C止まりの構成にきりもみ転回は出ない）", () => {
    const low = table("chain", { targetScore: 2.5 });
    expect(ids(low.next("b_front"))).not.toContain("c_kirimomiten");
    // 転宙・きりもみはC扱いなので、C止まりでも実施できる
    expect(ids(low.next("b_front"))).toContain(TENCHU_SKILL_ID);
    // 3点台（D止まり）なら出る
    expect(ids(table("chain", { targetScore: 3.5 }).next("b_front"))).toContain("c_kirimomiten");
  });
});
