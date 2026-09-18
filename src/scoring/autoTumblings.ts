// =====================================================================
// タンブリングシリーズの自動生成（ランダム生成用）
//
// 投げ（`autoThrows.ts`）と同じく、よくあるタンブリングの形をシステム側で組む。
// 中身は4つに分かれている：
//  - `tumblingPatterns.ts`：組む形（宙返りの本数・つなぎの有無・投げ受けかどうか）
//  - `tumblingChain.ts`：連鎖のルール（何に何が続けられるか／どこで終われるか）
//  - `tumblingWeights.ts`：選ばれやすさと抽選の確率（実際の演技での多さ）
//  - `tumblingTransitions.ts`：その2つから導いた遷移表（直前の技 → 続けて実施できる技）
// このファイルは**候補の組み立て**だけを受け持つ：遷移表を歩いて宙返りの並びを決め、
// 1本ぶんの内容（`AutoTumblingSpec`）にして、シリーズ（`Series`）に起こす。
//
// 1本ぶんの候補で1回だけ引く抽選（終わり方・前転・押さえつけ等）は `AutoTumblingSpec.draws`
// にまとめてある。宙返りの本数を変えても同じ判断を使う（`withSaltoCount`）ため。
// 組み立てたシリーズは `tumblingFlowErrors` で入力画面の制約を検算できる。
// =====================================================================

import {
  LEFT_HAND_THROW_TAG,
  ROUNDOFF_SKILL_ID,
  TWO_THROW_TAG,
  hasLeftHandThrow,
  skillDef,
  skillDifficulty,
  canOperateApparatus,
} from "./constants";
import { calcTumblingDifficulty, needsRoundoffBefore, prevSkillId, stripForApparatus } from "./analysis";
import {
  CATCH_USE_APPARATUS,
  NO_VIEW_TAG,
  canThrowAfterCatch,
  type AutoThrowStyle,
} from "./autoThrows";
import { cycler, pickDifferent, rarityChance, rarityExponent, shuffled } from "./pick";
import { unseenShapeChance } from "./unseenShapes";
import { userSkillWeight, type SkillWeightStore } from "./skillWeights";
import {
  AUTO_TUMBLING_PATTERNS,
  DEFAULT_CONNECT_AT,
  basicLevelPattern,
  canTwoThrowTumbling,
  saltoCountRange,
  secondThrowStyles,
  type AutoTumblingPattern,
} from "./tumblingPatterns";
import {
  THROW_ROLL_MOTION,
  TUMBLING_ENTRIES,
  layoutOnlyAfterConnect,
  noRollAfter,
  throwInSkillTypes,
} from "./tumblingChain";
import {
  BACK_TO_FORWARD_THROW_CHANCE,
  CONNECT_AT_SECOND_CHANCE,
  LAYOUT_AFTER_CONNECT_CHANCE,
  LIMITED_SKILLS,
  RARE_CHAIN_END_CHANCE,
  RARE_PICK_WEIGHT,
  ROLL_FINISH_PRESS_CATCH_CHANCE,
  SKILL_PICK_WEIGHT,
  TWO_THROW_IN_TUMBLING_CHANCE,
  backwardEndChance,
  pairAfterChance,
  rollAfterChance,
} from "./tumblingWeights";
import {
  buildTransitions,
  canEndWith,
  canThrowAt,
  edgeIds,
  edgeWeights,
  usableSkills,
} from "./tumblingTransitions";
import { newTemplateId, type SeriesTemplate } from "./templates";
import { CATEGORY } from "./constants";
import type { ApparatusKey, FutureLevel, Item, Series } from "./types";

// 入力画面・生成側から今までどおり `autoTumblings` 1か所で参照できるようにしておく
export * from "./tumblingPatterns";
export * from "./tumblingChain";
export * from "./tumblingWeights";
export * from "./tumblingShape";
export * from "./tumblingTransitions";

/**
 * 1本ぶんの候補で**1回だけ引く**抽選の結果。宙返りの本数を変えても同じ判断を使うので、
 * 候補（`AutoTumblingSpec`）に持たせる（`withSaltoCount`）。
 */
export interface TumblingDraws {
  /** 後ろ向きで終わる後方宙返りで終わってよいか（`backwardEndChance`） */
  backwardEnd: boolean;
  /** 後方宙返り半ひねりで終わってよいか（`RARE_CHAIN_END_CHANCE`） */
  rareEnd: boolean;
  /** つなぎのあとに伸身を1本だけ実施して終わってよいか（`LAYOUT_AFTER_CONNECT_CHANCE`） */
  layoutAfterConnect: boolean;
  /** 後ろ向きで終わる宙返り→前方系の位置で投げてよいか（きりもみの視野外投げだけ） */
  backToForwardThrow: boolean;
  /** 最後の前方系のあとに前転を付けるかの抽選値（0〜1。`rollAfterChance` と比べる） */
  roll: number;
  /** 前転でつないだ着地を手具を使ったキャッチ（押さえつけ）で受けるか */
  pressCatch: boolean;
  /** 投げタンの投げを二つ投げにするか（クラブ・リングで、投げてから跳ぶ形だけ） */
  twoThrow: boolean;
  /**
   * 投げタンの投げを**左手投げ**にするか（スティックで、投げてから跳ぶ形だけ）。
   * 実施例が無い形なので `unseenShapes.ts` の `throwTumLeftHandThrow` の低い確率で引く。
   */
  leftHandThrow: boolean;
  /**
   * 投げタンの受けを**背面キャッチ（視野外のキャッチ）**にするか（投げてから跳ぶ形だけ）。
   * こちらも実施例が無い形なので `unseenShapes.ts` の `throwTumBackCatch` で引く。
   */
  backCatch: boolean;
  /** 投げタンのキャッチのあとに続ける投げ受けの投げ方（未指定なら続けない） */
  secondThrow?: AutoThrowStyle;
}

/** 1本ぶんの自動生成の内容 */
export interface AutoTumblingSpec {
  pattern: AutoTumblingPattern;
  /** 実施する宙返りの本数 */
  saltoCount: number;
  /** 入りの技 */
  entry: string[];
  /** 宙返りの並び（`saltoCount` 本ぶんを前から使う） */
  saltoIds: string[];
  /** つなぎ技のid（`pattern.connect` のときだけ） */
  connectId: string;
  /** つなぎ技を何本目の宙返りの後に入れるか（既定1＝1本目の後。2なら2本目の後） */
  connectAt?: number;
  /** 候補を作ったときの抽選の結果 */
  draws: TumblingDraws;
}

type SkillItem = Extract<Item, { kind: "skill" }>;

const skillItem = (skillId: string, isThrow = false): SkillItem => ({
  kind: "skill",
  skillId,
  // 手具操作はこのあと `applyApparatusOps` が付け直す（きりもみ系には付かない）
  hasApparatus: canOperateApparatus(skillId),
  isThrow,
});

/** 自動生成の内容からシリーズを組み立てる */
/**
 * 手具操作を付ける位置。**加点を狙わないタンブリングでは最低限**にする。
 *  - 減点を避けるのに必要なのは、宙返り1本（`NO_APP_SALTO_DEDUCTION`・
 *    `NO_APP_ALL_DEDUCTION` を避ける＝最後の宙返り）と、つなぎ技のA難度
 *    （`connectNoApparatus` の −0.2 を避ける）だけ
 *  - 手具操作加点（§3.5.5.5(3)）が狙えるのはE難度のときだけなので、そのときだけ
 *    宙返り2本（＝1本目にも付ける）にする
 *  - 投げタンは手具操作なしでも減点されない（A減点は投げの無いシリーズだけを見る）ので
 *    最低限＝0。技の最中に投げる形でE難度になるときだけ、その技に付けて加点を狙う
 */
function applyApparatusOps(items: Item[], pattern: AutoTumblingPattern, junior: boolean): void {
  const skills = items.flatMap((it, i) => (it.kind === "skill" && it.skillId ? [{ it, i }] : []));
  skills.forEach(({ it }) => {
    if (it.kind === "skill") it.hasApparatus = false;
  });
  const isA = (id: string) => skillDifficulty(id, junior) === "A";
  // きりもみ系は実施中に手具を操作できないので、操作を付ける位置の候補から外す
  const saltoIdx = skills.filter(
    ({ it }) => it.kind === "skill" && !isA(it.skillId) && canOperateApparatus(it.skillId),
  );
  if (saltoIdx.length === 0) return;
  const setOp = (item: Item | undefined) => {
    if (item?.kind === "skill" && canOperateApparatus(item.skillId)) item.hasApparatus = true;
  };
  const ids = saltoIdx.map(({ it }) => (it.kind === "skill" ? it.skillId : ""));
  const isE = calcTumblingDifficulty(ids, !!pattern.throwCatch, junior) === "E";
  if (pattern.throwCatch) {
    // 技の最中に投げる形は、その技を保持していればE難度で加点が付く
    if (isE && pattern.throwInSkill) setOp(items.find((it) => it.kind === "skill" && it.isThrow));
    return;
  }
  // 最後の宙返り（手具操作なしの減点を避ける最低限）
  setOp(saltoIdx[saltoIdx.length - 1].it);
  // つなぎ技のA難度（宙返りの間に入ったもの）
  const first = saltoIdx[0].i;
  const last = saltoIdx[saltoIdx.length - 1].i;
  skills
    .filter(({ it, i }) => i > first && i < last && it.kind === "skill" && isA(it.skillId))
    .forEach(({ it }) => setOp(it));
  // E難度なら手具操作加点（操作2回以上）を狙う
  if (isE && saltoIdx.length >= 2) setOp(saltoIdx[0].it);
}

export function buildAutoTumblingSeries(spec: AutoTumblingSpec, junior = false): Series {
  const { pattern, draws } = spec;
  const items: Item[] = [];
  // 技の最中に投げる形では、先頭に投げを置かず最後の宙返りに投げを付ける
  if (pattern.throwCatch && !pattern.throwInSkill) {
    // 必須投げ（二つ投げ／左手投げ）はどちらか一方だけ（手具が違うので同時には起きない）
    const reqTypes = draws.twoThrow
      ? [TWO_THROW_TAG]
      : draws.leftHandThrow
        ? [LEFT_HAND_THROW_TAG]
        : [];
    items.push({ kind: "throw", ...(reqTypes.length > 0 ? { reqTypes } : {}) });
  }
  spec.entry.forEach((id) => items.push(skillItem(id)));
  const saltos = spec.saltoIds.slice(0, spec.saltoCount);
  saltos.forEach((id, i) => {
    if (pattern.connect && i === (spec.connectAt ?? DEFAULT_CONNECT_AT) && spec.connectId)
      items.push(skillItem(spec.connectId));
    // 入力画面と同じで、そのままでは後方系に入れない位置ではロンダートを補う
    const throwsHere = !!pattern.throwInSkill && i === saltos.length - 1;
    const next = skillItem(id, throwsHere);
    // 後ろ向きで終わる宙返りのあとに前方系で投げるのは、きりもみの視野外投げだけ
    if (throwsHere) {
      // 直前の技は並びから取る（つなぎ技が間に入るとそこで向きが変わる）
      const types = throwInSkillTypes(prevSkillId(items, items.length), id);
      if (types) next.throwTypes = [...types];
    }
    if (needsRoundoffBefore([...items, next], items.length)) items.push(skillItem(ROUNDOFF_SKILL_ID));
    items.push(next);
  });
  // 前方系で終わったあとは、大抵そのまま前転をする（前宙・前向きで終わる後方宙返りは半々、
  // 切り返しのあとは少ない）。直前の技はつなぎ技を挟めば向きが変わるので、並びから取る
  const lastSalto = saltos[saltos.length - 1];
  const beforeLast = prevSkillId(items, items.length - 1);
  if (!pattern.throwCatch && draws.roll < rollAfterChance(lastSalto, beforeLast))
    items.push({ kind: "motion", motionId: THROW_ROLL_MOTION, count: 1 });
  // 投げ受けの着地は前転でつなぐ（側宙の後は前転を実施しないので、そのまま受ける）
  const rolled = !!pattern.rollFinish && !noRollAfter(saltos[saltos.length - 1]);
  if (rolled) items.push({ kind: "motion", motionId: THROW_ROLL_MOTION, count: 1 });
  // 転がり・前転のあとは手具を使ったキャッチ（押さえつけ）で受けるのが定番。
  // 背面キャッチ（視野外）を引いたときはそちらで受ける（押さえつけとは同時に実施しない）
  if (pattern.throwCatch) {
    const press = rolled && draws.pressCatch && !draws.twoThrow && !draws.secondThrow;
    // 背面キャッチ（視野外）は、続く投げが**視野外でなければ**実施できる
    // （視野外で受けて視野外に投げることだけができない＝`canThrowAfterCatch`）。
    // 2つ同時キャッチを視野外で受けることはしない
    const back =
      draws.backCatch &&
      !draws.twoThrow &&
      (!draws.secondThrow || canThrowAfterCatch({ id: NO_VIEW_TAG, name: "", catchTypes: [NO_VIEW_TAG] }, draws.secondThrow));
    const catchTypes = back ? [NO_VIEW_TAG] : press ? [CATCH_USE_APPARATUS] : [];
    items.push({
      kind: "catch",
      // 二つ投げは2つとも空中にあるので、押さえつけては受けられない（2つ同時キャッチで受ける）。
      // 連続投げを続ける形でも押さえつけない（押さえた状態からは投げられない）
      ...(catchTypes.length > 0 ? { catchTypes } : {}),
      ...(draws.twoThrow ? { catchTwo: true } : {}),
    });
  }
  // 投げタンのキャッチのあとに連続投げを続ける形
  if (pattern.throwCatch && draws.secondThrow) {
    const style = draws.secondThrow;
    items.push({
      kind: "throw",
      ...(style.reqTypes ? { reqTypes: [...style.reqTypes] } : {}),
      ...(style.throwTypes ? { throwTypes: [...style.throwTypes] } : {}),
    });
    items.push({ kind: "catch", ...(style.two ? { catchTwo: true } : {}) });
  }
  applyApparatusOps(items, pattern, junior);
  return { executionDeduction: 0, items };
}

/** 表示名。中身はシリーズの内容で分かるので、種類だけを出す。 */
export const autoTumblingName = (spec: AutoTumblingSpec): string =>
  spec.pattern.throwCatch ? "自動生成の投げタン" : "自動生成のタンブリング";

/**
 * 連続の終わり方に関わる抽選（候補ごとに1回だけ引く）。
 * Dスコアの低い選手（`basicLevel`）は、稀とされる終わり方をどれも普通に実施する。
 */
function drawChainEnd(
  rand: () => number,
  basicLevel: boolean,
  targetScore?: number | null,
  rarity?: number,
) {
  /** 珍しさを掛けた確率（既定50なら素の確率） */
  const chance = (p: number) => rarityChance(p, rarity);
  // 後ろ向きで終わる後方宙返りで終わるかは、狙うDスコアで決まる確率で抽選する
  const backwardEnd = rand() < chance(backwardEndChance(targetScore));
  // 後方宙返り半ひねりで終わるのは稀（大抵そのあとに前宙か側宙を実施する）
  const rareEnd = basicLevel || rand() < chance(RARE_CHAIN_END_CHANCE);
  // つなぎのあとに伸身を1本だけ実施して終わる形は、上級者ではあまり実施しない
  const layoutAfterConnect = basicLevel || rand() < chance(LAYOUT_AFTER_CONNECT_CHANCE);
  // 最後の前方系のあとに前転を付けるかの抽選（本数を変えても同じ判断を使う）
  const roll = rand();
  // 後ろ向きで終わる宙返り→前方系の位置で投げるのは、きりもみの視野外投げだけ低確率で残す
  const backToForwardThrow = rand() < chance(BACK_TO_FORWARD_THROW_CHANCE);
  return { backwardEnd, rareEnd, layoutAfterConnect, roll, backToForwardThrow };
}

/**
 * `n` 本の宙返りで連続を終えてよいか。候補を作ったときの抽選（`draws`）に従うので、
 * 本数を変える `withSaltoCount` からも同じ判定を使う。
 */
export function chainEndsOk(
  pattern: AutoTumblingPattern,
  saltoIds: string[],
  n: number,
  connectAt: number,
  draws: Pick<TumblingDraws, "backwardEnd" | "rareEnd" | "layoutAfterConnect" | "backToForwardThrow">,
  connectId = "",
): boolean {
  const last = saltoIds[n - 1];
  // 投げる位置の直前の技。つなぎ技が間に入るとそこで向きが変わるので、つなぎを見る
  const beforeLast =
    pattern.connect && connectId && connectAt === n - 1 ? connectId : saltoIds[n - 2];
  return (
    // つなぎの後の宙返りは必ず残す（つなぎで終わる形は作らない）
    (!pattern.connect || n > connectAt) &&
    canEndWith(last, draws) &&
    (draws.layoutAfterConnect || !layoutOnlyAfterConnect(pattern, saltoIds, n, connectAt)) &&
    (!pattern.throwInSkill || canThrowAt(beforeLast, last, draws))
  );
}

/**
 * タンブリングの候補を作る。形ごとに**遷移表を1つ導出**し（`buildTransitions`）、
 * その表を歩いて宙返りの並びを決める。1本目・本数・入りの技はできる限り被らないように配り
 * （`cycler`）、続く技は表の重みで引く（`pickDifferent`）。
 */
export function autoTumblingSpecs(opts: AutoTumblingOptions = {}): AutoTumblingSpec[] {
  const rand = opts.random ?? Math.random;
  const junior = !!opts.junior;
  const basicLevel = !!opts.basicLevel;
  const apparatus = opts.apparatus;
  /** 珍しさ：抽選の重みに掛ける指数と、0〜1の確率に掛ける変換 */
  const exp = rarityExponent(opts.rarity);
  const chance = (p: number) => rarityChance(p, opts.rarity);
  const ctxBase = {
    junior,
    future: opts.future ?? null,
    basicLevel,
    apparatus,
    targetScore: opts.targetScore,
    skillIds: opts.skillIds,
    skillWeights: opts.skillWeights,
  };

  const specs: AutoTumblingSpec[] = [];
  // 連続投げの2回目の投げ方は、できる限り被らないように配る
  const secondThrowCyclers = new Map<string, () => AutoThrowStyle>();
  const nextSecondThrow = (app: ApparatusKey): AutoThrowStyle => {
    let next = secondThrowCyclers.get(app);
    if (!next) {
      next = cycler(secondThrowStyles(app), rand);
      secondThrowCyclers.set(app, next);
    }
    return next();
  };
  AUTO_TUMBLING_PATTERNS.forEach((rawPattern) => {
    // 基本的な構成ではつなぎ技を実施せず、連続も2本まで
    const pattern = basicLevel ? basicLevelPattern(rawPattern) : rawPattern;
    if (!pattern) return;
    const tr = buildTransitions({ ...ctxBase, pattern });
    if (tr.first.length === 0) return;
    const nextCount = cycler(saltoCountRange(pattern), rand);
    /** 1本目：できるだけ別の技を使いつつ、遷移表の重みで引く */
    const firstIds = edgeIds(tr.first);
    const firstWeights = edgeWeights(tr.first);
    const firstsUsed: string[] = [];
    const nextFirst = () => {
      const id = pickDifferent(firstIds, firstsUsed, rand, firstWeights, exp);
      if (id) firstsUsed.push(id);
      return id;
    };
    for (let v = 0; v < AUTO_TUMBLING_VARIANTS; v++) {
      const count = nextCount();
      let saltoIds: string[] = [];
      let connectId = "";
      // つなぎ技を挟む位置：1本目の後（既定）か、2本目の後
      // （「前向きで終わる後方系→前宙→つなぎ→宙返り」はよくあるシリーズ）。
      // 2本目の後に挟むには宙返りが3本必要なので、その本数を取れる形だけ
      // つなぎの後の宙返りで投げる形は、投げるのが最後の宙返り＝つなぎの直後になるように挟む
      const connectAt = pattern.throwInSkill
        ? count - 1
        : pattern.connect &&
            pattern.saltos.max >= 3 &&
            count >= 3 &&
            rand() < chance(CONNECT_AT_SECOND_CHANCE)
          ? 2
          : DEFAULT_CONNECT_AT;
      // 目標の本数まで続く1本目が引けるまで何回か引き直す（後ろ向きに降りる技は連続しない）
      for (let attempt = 0; attempt < firstIds.length && saltoIds.length < count; attempt++) {
        const first = nextFirst();
        if (!first) break;
        const ids = [first];
        // つなぎ技も含めた実際の並び。遷移表に「その前の技」を渡すのに使う
        // （切り返しの判定。つなぎ技を挟むとそこで向きが変わる）
        const flow = [first];
        let cid = "";
        /** 遷移表を1つ進める（同じ技の繰り返しは避ける） */
        const step = () => {
          const edges = tr.next(flow[flow.length - 1], flow[flow.length - 2]);
          const id = pickDifferent(edgeIds(edges), ids, rand, edgeWeights(edges), exp);
          if (id) {
            ids.push(id);
            flow.push(id);
          }
          return id;
        };
        // つなぎ技の前に置く宙返り（2本目の後に挟む形では、ここでもう1本積む）
        while (pattern.connect && ids.length < connectAt) {
          if (!step()) break;
        }
        if (pattern.connect && ids.length < connectAt) continue;
        if (pattern.connect) {
          const beforeConnect = ids[ids.length - 1];
          const connects = tr.connects(beforeConnect);
          cid = pickDifferent(edgeIds(connects), [], rand, edgeWeights(connects), exp) ?? "";
          if (!cid) continue;
          const afters = tr.afterConnect(cid, beforeConnect);
          const after = pickDifferent(edgeIds(afters), ids, rand, edgeWeights(afters), exp);
          if (!after) continue;
          ids.push(after);
          flow.push(cid, after);
        }
        // 残りは遷移表のとおりに続ける
        while (ids.length < pattern.saltos.max) {
          if (!step()) break;
        }
        if (ids.length > saltoIds.length) {
          saltoIds = ids;
          connectId = cid;
        }
      }
      if (saltoIds.length < pattern.saltos.min) continue;
      // 続かなかったぶんは本数を減らす
      let saltoCount = Math.max(pattern.saltos.min, Math.min(count, saltoIds.length));
      const ends = drawChainEnd(rand, basicLevel, opts.targetScore, opts.rarity);
      const endsOk = (n: number) => chainEndsOk(pattern, saltoIds, n, connectAt, ends, connectId);
      // 終われる本数を探す：まず伸ばして（前宙・側宙に続ける）、だめなら縮める
      let end = saltoCount;
      while (end < saltoIds.length && !endsOk(end)) end += 1;
      if (!endsOk(end)) {
        end = saltoCount;
        while (end > pattern.saltos.min && !endsOk(end)) end -= 1;
      }
      if (!endsOk(end)) continue;
      saltoCount = end;
      // 投げタンのキャッチのあとに連続投げを続けるか（投げてから跳ぶ形のほうが多い）
      const secondThrow =
        pattern.throwCatch && apparatus && rand() < chance(pairAfterChance(pattern))
          ? nextSecondThrow(apparatus)
          : undefined;
      // クラブ・リングは投げタンの投げを二つ投げにすることがある（投げてから跳ぶ形だけ）
      const twoThrow =
        canTwoThrowTumbling(apparatus, pattern) && rand() < chance(TWO_THROW_IN_TUMBLING_CHANCE);
      // 実施例の無い投げ受け（左手投げ・背面キャッチ）は要求値が上がるほど出やすい。
      // どちらも「投げてから跳ぶ」通常の投げタンだけ
      const plainThrowTum = !!pattern.throwCatch && !pattern.throwInSkill;
      const leftHandThrow =
        plainThrowTum &&
        !!apparatus &&
        hasLeftHandThrow(apparatus) &&
        !twoThrow &&
        rand() < chance(unseenShapeChance("throwTumLeftHandThrow", opts.demandScore));
      const backCatch =
        plainThrowTum && rand() < chance(unseenShapeChance("throwTumBackCatch", opts.demandScore));
      specs.push({
        pattern,
        saltoCount,
        entry: [],
        saltoIds,
        connectId,
        ...(connectAt !== DEFAULT_CONNECT_AT ? { connectAt } : {}),
        draws: {
          ...ends,
          pressCatch: rand() < chance(ROLL_FINISH_PRESS_CATCH_CHANCE),
          twoThrow,
          leftHandThrow,
          backCatch,
          ...(secondThrow ? { secondThrow } : {}),
        },
      });
    }
  });

  // 入りの技は1本目の系統に合わせて配る（投げてから実施する投げタンには付けない）。
  // 入りの技も実施の多さで選ぶ（ロンダート＞バク転＞ハンドスプリング）。
  // 実施が少ない技（ハンドスプリング）は `LIMITED_SKILLS` の重みも掛ける
  const usable = usableSkills(ctxBase);
  const entryUsed = new Map<string, string[]>();
  const entryWeight = (entry: string[]) =>
    entry.reduce(
      (w, id) =>
        w *
        (SKILL_PICK_WEIGHT[id] ?? 1) *
        (LIMITED_SKILLS.includes(id) ? RARE_PICK_WEIGHT : 1) *
        // 入りの技（ロンダート・ハンドスプリング）にもユーザーの倍率を掛ける
        userSkillWeight(opts.skillWeights, id),
      1,
    );
  specs.forEach((spec) => {
    if (spec.pattern.throwCatch && !spec.pattern.throwInSkill) return;
    const category = skillDef(spec.saltoIds[0])?.category ?? CATEGORY.FORWARD;
    const entries = (TUMBLING_ENTRIES[category] ?? [[]]).filter(
      (entry) => entry.length === 0 || usable(entry).length === entry.length,
    );
    const list = entries.length > 0 ? entries : [[]];
    const keys = list.map((_, i) => String(i));
    const weights = Object.fromEntries(list.map((entry, i) => [String(i), entryWeight(entry)]));
    // 実施が少ない技の入りは「ひと回り」の順番では回さない（回すと必ず1本は出てしまう）。
    // 使用済み扱いにしておき、重みだけで引く
    const rare = keys.filter((k) => list[Number(k)].some((id) => LIMITED_SKILLS.includes(id)));
    const used = entryUsed.get(category) ?? [];
    const key = pickDifferent(keys, [...used, ...rare], rand, weights, exp) ?? keys[0];
    used.push(key);
    entryUsed.set(category, used);
    spec.entry = list[Number(key)];
  });

  const limit = Math.max(0, opts.limit ?? specs.length);
  return shuffled(specs, rand).slice(0, limit);
}

export interface AutoTumblingOptions {
  junior?: boolean;
  /** 十年後モードの上限難度（"F" / "G"）。F・G難度の技も候補に含める。 */
  future?: FutureLevel;
  /**
   * 組む手具。単発で高難度な技の出やすさが手具で変わる
   * （`APPARATUS_HIGH_DIFFICULTY_WEIGHT`：リングは重く持ったままひねりにくい）。
   */
  apparatus?: ApparatusKey;
  /**
   * 基本的な構成の選手か（低いDスコアを狙う構成）。
   * Dスコアの低い選手は、ルールの要求を満たしきれない単純なタンブリングを実施する：
   * ロンダート→宙返り1本で終わり／三宙なし（2本まで）／つなぎなし／D難度なし。
   * ただの後方宙返りのような基本技も普通に実施するので、稀な技の重み付けもしない。
   */
  basicLevel?: boolean;
  /**
   * 狙うDスコアの上限（`maxScore`）。後ろ向きで終わる後方宙返りで終わる確率に使う
   * （`backwardEndChance`）。未指定＝上限なしは難度を狙いきる構成として扱う。
   */
  targetScore?: number | null;
  /**
   * **要求するDスコアの下限**（`minScore`）。実施例の無い投げ受け（背面キャッチ・左手投げ）は
   * 要求値が上がるほど出やすくする（`unseenShapeChance`）。
   */
  demandScore?: number | null;
  /**
   * 使ってよい転回技のid。登録テンプレートに出てくる技を渡すと、その選手が
   * 実際に実施している技だけで組み立てる（技そのものではなく**組み合わせ**を自動化する）。
   * 未指定・空なら技の一覧すべてを使う。
   */
  skillIds?: string[];
  /**
   * **珍しさ**（0〜100、既定50）。抽選の重みと0〜1の確率にまとめて掛かる
   * （`rarityExponent` / `rarityChance`）。0＝最も遷移しやすい形だけ、
   * 50＝実測どおり、100＝珍しい形を優先。
   */
  rarity?: number;
  /**
   * ユーザーが設定した技ごとの倍率（`skillWeights.ts`）。実測の重みの上に掛かる。
   * 0 にした技は候補に出てこない。
   */
  skillWeights?: SkillWeightStore;
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 作る候補の数の上限（既定＝形 × 宙返りの組み合わせ） */
  limit?: number;
}

/** 1つの形につき作る候補の数（宙返りの種類を変えた別案） */
export const AUTO_TUMBLING_VARIANTS = 5;

/**
 * 構成のなかで実際に使っている転回技のid。
 * 自動生成のタンブリングをこの範囲に絞ると、その選手が実施できる技だけで組める。
 * 徒手として入れた転回技（側転・きりもみ等）も実施している技なので含める。
 */
export function usedSkillIds(list: Series[]): string[] {
  const ids = new Set<string>();
  list.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId) ids.add(item.skillId);
      if (item.kind === "motion" && skillDef(item.motionId)) ids.add(item.motionId);
    }),
  );
  return [...ids];
}

/**
 * ランダム生成の候補として渡す自動生成のタンブリング。
 * 組み立てた内容（`spec`）を持たせて、生成側が宙返りの本数を調整できるようにする。
 */
export interface AutoTumblingTemplate extends SeriesTemplate {
  auto: true;
  apparatus: ApparatusKey;
  spec: AutoTumblingSpec;
}

const autoTemplate = (
  apparatus: ApparatusKey,
  spec: AutoTumblingSpec,
  id = newTemplateId(),
): AutoTumblingTemplate => ({
  id,
  name: autoTumblingName(spec),
  apparatus,
  updatedAt: 0,
  auto: true,
  spec,
  // 手具が1つの種目では投げている間に手具操作ができないので、その手具に合わせて落とす
  series: stripForApparatus([buildAutoTumblingSeries(spec)], apparatus)[0],
});

/** 自動生成のタンブリングを、ランダム生成の候補（シリーズテンプレート）として返す */
export function autoTumblingTemplates(
  apparatus: ApparatusKey,
  opts: AutoTumblingOptions = {},
): AutoTumblingTemplate[] {
  return autoTumblingSpecs({ apparatus, ...opts }).map((spec) => autoTemplate(apparatus, spec));
}

/** 自動生成のタンブリングの候補か */
export function isAutoTumblingTemplate(t: SeriesTemplate): t is AutoTumblingTemplate {
  return !!t.auto && Array.isArray((t as AutoTumblingTemplate).spec?.saltoIds);
}

/** 宙返りの本数だけを変えた候補。形の範囲外・組み立てた本数より多い・変化なしなら null。 */
export function withSaltoCount(t: AutoTumblingTemplate, saltoCount: number): AutoTumblingTemplate | null {
  if (saltoCount === t.spec.saltoCount) return null;
  if (!saltoCountRange(t.spec.pattern).includes(saltoCount)) return null;
  if (saltoCount > t.spec.saltoIds.length) return null;
  // 連続の終わり方・投げる位置は、候補を作ったときの抽選に従う
  const connectAt = t.spec.connectAt ?? DEFAULT_CONNECT_AT;
  if (!chainEndsOk(t.spec.pattern, t.spec.saltoIds, saltoCount, connectAt, t.spec.draws, t.spec.connectId))
    return null;
  return autoTemplate(t.apparatus, { ...t.spec, saltoCount }, t.id);
}
