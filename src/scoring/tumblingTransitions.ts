// =====================================================================
// タンブリングの遷移表（連鎖のルール × 選ばれやすさ）
//
// `tumblingChain.ts` の「何に何が続けられるか」と `tumblingWeights.ts` の
// 「どれくらいの頻度で実施されるか」を突き合わせて、**直前の技 → 続けて実施できる技**の
// 表に畳んだもの。候補づくり（`autoTumblings.ts`）はこの表を歩くだけにする。
//
// 表そのものは**ルールから導出する**（手で書いた遷移グラフは持たない）。入力画面の制約は
// `skillOptions` / `needsRoundoffBefore` に聞いたままなので、プルダウンの絞り込みが
// 変われば表も追随する。「なぜこの技が生成されないのか」は、この表を1つ引けば分かる：
// 候補に出ていないのか（連鎖のルール）、重みが小さいのか（頻度）、終われないのか
// （`endNever` ／ 抽選待ち）、投げられない位置なのか（`throwRule`）。
// =====================================================================

import { futureSkillIds, isBackwardSalto, skillDef } from "./constants";
import {
  KIRIMOMI_THROW_SKILL_ID,
  RARE_CHAIN_END_SKILLS,
  SIDE_SALTO_ID,
  TEMPO_SKILLS,
  THROW_FINISH_SALTOS,
  canEndChain,
  connectOptionsAfter,
  difficultyValue,
  firstSaltoOptions,
  isBackToForwardThrow,
  isForwardSalto,
  nextSaltoOptions,
  saltoOptionsAfterConnect,
} from "./tumblingChain";
import {
  CONNECT_RISE_WEIGHT,
  TEMPO_CONNECT_WEIGHT,
  THROW_AFTER_CONNECT_SALTOS,
  THROW_AFTER_CONNECT_WEIGHT,
  THROW_IN_SIDE_SALTO_WEIGHT,
  THROW_IN_SKILL_ROUNDOFF_WEIGHT,
  baseSkillWeights,
  connectFinishWeights,
  rollAfterChance,
  roundoffEntryWeight,
  saltoWeights,
  withJuniorBoost,
} from "./tumblingWeights";
import { BASIC_LEVEL_MAX_DIFF, type AutoTumblingPattern } from "./tumblingPatterns";
import type { ApparatusKey, FutureLevel } from "./types";

/** その位置で投げてよいか（連続の最後の宙返りで投げる形だけ関係する） */
export type ThrowRule =
  /** 投げてよい */
  | "ok"
  /** 後ろ向きで終わる宙返り → 前方系の位置なので投げない */
  | "never"
  /** 同じ位置だが、きりもみの視野外投げだけは抽選が通れば残す */
  | "kirimomiDraw";

/** 遷移表の1本の辺（直前の技 → 続けて実施する技） */
export interface SaltoEdge {
  /** 続けて実施する技 */
  id: string;
  /** 選ばれやすさ（実際の演技での多さ。1が既定） */
  weight: number;
  /** この技では連続を終われない（抽選でも許されない） */
  endNever: boolean;
  /** 終わるには「後ろ向きで終わってよい」抽選が要る（`TumblingDraws.backwardEnd`） */
  endNeedsBackwardDraw: boolean;
  /** 終わるには「稀な終わり方をしてよい」抽選が要る（`TumblingDraws.rareEnd`） */
  endNeedsRareDraw: boolean;
  /** この技で終わったあとに前転を付ける確率（`rollAfterChance`） */
  rollChance: number;
  /** この位置で投げてよいか */
  throwRule: ThrowRule;
}

/** つなぎ技の候補（重み付き） */
export interface ConnectEdge {
  id: string;
  weight: number;
}

/** 遷移表を引くための条件 */
export interface TransitionContext {
  pattern: AutoTumblingPattern;
  junior?: boolean;
  /** 十年後モードの上限難度（"F" / "G"）。F・G難度の技も候補に含める。 */
  future?: FutureLevel;
  basicLevel?: boolean;
  apparatus?: ApparatusKey;
  /** 狙うDスコアの上限（入り方・終わり方の頻度が変わる） */
  targetScore?: number | null;
  /** 使ってよい転回技のid（未指定・空なら一覧すべて） */
  skillIds?: string[] | null;
}

/** 導出した遷移表 */
export interface TumblingTransitions {
  /** 連続の1本目に実施できる宙返り */
  first: SaltoEdge[];
  /** その宙返りに続けて実施できる宙返り */
  next(prevId: string): SaltoEdge[];
  /** その宙返りのあとに挟めるつなぎ技 */
  connects(prevId: string): ConnectEdge[];
  /** つなぎ技のあとに実施できる宙返り（つなぎの前の技より難度が上がると選ばれにくい） */
  afterConnect(connectId: string, beforeId: string): SaltoEdge[];
}

/**
 * その条件で使ってよい転回技に絞り込む。
 *  - 登録テンプレートに出てくる技だけ（`skillIds`。未指定なら一覧すべて）
 *  - 基本的な構成の選手はD難度以上を実施しない（`BASIC_LEVEL_MAX_DIFF`）
 *  - 個人で2回宙返り系を実施することはほぼない。実際に実施している（テンプレートに
 *    出てくる）ときだけ使い、技の一覧からは組み立てない
 *  - 十年後モードのF・G難度は**まだ誰も実施していない技**なので、`skillIds` に出てこなくても
 *    使ってよい（2回宙返り系はこの例外に入れない）
 *  - `noAuto` の技（ダイビング）は自動生成では組み立てない
 */
export function usableSkills(
  ctx: Pick<TransitionContext, "junior" | "future" | "basicLevel" | "skillIds">,
): (ids: string[]) => string[] {
  const junior = !!ctx.junior;
  const future = ctx.future ?? null;
  const basicLevel = !!ctx.basicLevel;
  const newSkills = futureSkillIds(future, junior).filter((id) => !skillDef(id)?.isDoubleSalto);
  const allowed =
    ctx.skillIds && ctx.skillIds.length > 0 ? new Set([...ctx.skillIds, ...newSkills]) : null;
  return (ids) =>
    ids.filter(
      (id) =>
        !skillDef(id)?.noAuto &&
        (!allowed || allowed.has(id)) &&
        (!basicLevel || difficultyValue(id, junior, future) <= BASIC_LEVEL_MAX_DIFF) &&
        (!skillDef(id)?.isDoubleSalto || !!allowed?.has(id)),
    );
}

/** 抽選なしで終われるか／どの抽選が要るか */
const endRule = (id: string) => ({
  endNever: !canEndChain(id, true),
  endNeedsBackwardDraw: !canEndChain(id, false) && canEndChain(id, true),
  endNeedsRareDraw: RARE_CHAIN_END_SKILLS.includes(id),
});

/** その位置（直前の技 → この技）で投げてよいか */
export const throwRuleFor = (prevId: string | undefined, id: string): ThrowRule => {
  if (!isBackToForwardThrow(prevId, id)) return "ok";
  return id === KIRIMOMI_THROW_SKILL_ID ? "kirimomiDraw" : "never";
};

/** 辺1本を組み立てる */
const edge = (prevId: string | undefined, id: string, weight: number): SaltoEdge => ({
  id,
  weight,
  ...endRule(id),
  rollChance: rollAfterChance(id, prevId),
  throwRule: throwRuleFor(prevId, id),
});

/** 抽選の結果を踏まえて、この技で連続を終われるか */
export const edgeCanEnd = (
  e: SaltoEdge,
  draws: { backwardEnd?: boolean; rareEnd?: boolean } = {},
): boolean =>
  !e.endNever &&
  (!e.endNeedsBackwardDraw || !!draws.backwardEnd) &&
  (!e.endNeedsRareDraw || !!draws.rareEnd);

/** 抽選の結果を踏まえて、この位置で投げてよいか */
export const edgeCanThrow = (e: SaltoEdge, draws: { backToForwardThrow?: boolean } = {}): boolean =>
  e.throwRule === "ok" || (e.throwRule === "kirimomiDraw" && !!draws.backToForwardThrow);

/**
 * 表を引かずに、技idから直接同じ判定をする版（候補を組み立て終わったあとの検算に使う）。
 * 判定の中身は `edgeCanEnd` / `edgeCanThrow` と同じ。
 */
export const canEndWith = (
  id: string,
  draws: { backwardEnd?: boolean; rareEnd?: boolean } = {},
): boolean => edgeCanEnd({ ...endRule(id) } as SaltoEdge, draws);

export const canThrowAt = (
  prevId: string | undefined,
  id: string,
  draws: { backToForwardThrow?: boolean } = {},
): boolean => edgeCanThrow({ throwRule: throwRuleFor(prevId, id) } as SaltoEdge, draws);

/**
 * 遷移表を導出する。表そのものは条件ごとに1回だけ作り、以降は引くだけにする
 * （`next` / `connects` / `afterConnect` は直前の技ごとにメモ化する）。
 */
export function buildTransitions(ctx: TransitionContext): TumblingTransitions {
  const { pattern, apparatus } = ctx;
  const junior = !!ctx.junior;
  const future = ctx.future ?? null;
  const basicLevel = !!ctx.basicLevel;
  const target = ctx.targetScore;
  const usable = usableSkills(ctx);

  const base = withJuniorBoost(baseSkillWeights(junior, apparatus, future), junior, target);

  // ---- 連続の1本目 ----
  let firstWeights = base;
  // つなぎの形でテンポ系を1本目にすると、つなぎ技はバク転しかない（`connectOptionsAfter`）。
  // バク転を挟むより宙返りを続けるほうが多いので、その形は選ばれにくくする
  if (pattern.connect)
    firstWeights = {
      ...firstWeights,
      ...Object.fromEntries(
        TEMPO_SKILLS.map((id) => [id, (firstWeights[id] ?? 1) * TEMPO_CONNECT_WEIGHT]),
      ),
    };
  // ロンダートから入る（＝後方系から始める）ことを優先する。宙返りの途中で投げる投げタンは
  // 目標Dスコアに関わらず優先し、通常のタンブリングは目標Dスコアで減衰させる
  const roundoff = Math.max(
    roundoffEntryWeight(target, !!pattern.connect),
    pattern.throwInSkill ? THROW_IN_SKILL_ROUNDOFF_WEIGHT : 1,
  );
  const firstIds = usable(firstSaltoOptions(junior, future))
    // 投げてから実施する投げ受けの1本目は前方系（手具の滞空時間の都合で後方系は実施しない）。
    // 連続の最後に投げる形は投げる前が普通のタンブリングなので、この制限は無い
    .filter((id) => !pattern.throwCatch || pattern.throwInSkill || isForwardSalto(id))
    // つなぎの形は、つなぎ技を挟める技（前向きに降りる技・テンポ）だけを1本目にする
    .filter((id) => !pattern.connect || usable(connectOptionsAfter(id, junior, future)).length > 0);
  const first = firstIds.map((id) =>
    edge(
      undefined,
      id,
      (firstWeights[id] ?? 1) * (roundoff !== 1 && isBackwardSalto(id) ? roundoff : 1),
    ),
  );

  // ---- 続けて実施できる宙返り ----
  /** 投げてから跳ぶ投げ受けは側宙・転宙だけ */
  const continuations = (prevId: string) =>
    usable(nextSaltoOptions(prevId, junior, future)).filter(
      (id) => !pattern.throwCatch || pattern.throwInSkill || THROW_FINISH_SALTOS.includes(id),
    );
  const nextCache = new Map<string, SaltoEdge[]>();
  const next = (prevId: string): SaltoEdge[] => {
    const hit = nextCache.get(prevId);
    if (hit) return hit;
    const w = withJuniorBoost(saltoWeights(prevId, junior, apparatus, future), junior, target);
    const edges = continuations(prevId).map((id) =>
      edge(
        prevId,
        id,
        // 側宙の実施中に投げる構成は稀（連続の最後の宙返りで投げる形だけ側宙を下げる）
        (w[id] ?? 1) *
          (pattern.throwInSkill && id === SIDE_SALTO_ID ? THROW_IN_SIDE_SALTO_WEIGHT : 1),
      ),
    );
    nextCache.set(prevId, edges);
    return edges;
  };

  // ---- つなぎ技 ----
  const connectCache = new Map<string, ConnectEdge[]>();
  const connects = (prevId: string): ConnectEdge[] => {
    const hit = connectCache.get(prevId);
    if (hit) return hit;
    // つなぎ技も実施の多さで選ぶ（ロンダート＞バク転＞ハンドスプリング）
    const edges = usable(connectOptionsAfter(prevId, junior, future)).map((id) => ({
      id,
      weight: base[id] ?? 1,
    }));
    connectCache.set(prevId, edges);
    return edges;
  };

  // ---- つなぎ技のあとの宙返り ----
  const finishWeights = withJuniorBoost(
    connectFinishWeights(junior || basicLevel, junior, apparatus, future),
    junior,
    target,
  );
  const afterCache = new Map<string, SaltoEdge[]>();
  const afterConnect = (connectId: string, beforeId: string): SaltoEdge[] => {
    const key = `${connectId}>${beforeId}`;
    const hit = afterCache.get(key);
    if (hit) return hit;
    // つなぎの後に難度が上がる組み方は少ない（C→B→B ＞ B→C→B）
    const beforeValue = difficultyValue(beforeId, junior, future);
    const edges = usable(saltoOptionsAfterConnect(connectId, junior, future)).map((id) =>
      edge(
        connectId,
        id,
        (finishWeights[id] ?? 1) *
          (difficultyValue(id, junior, future) > beforeValue ? CONNECT_RISE_WEIGHT : 1) *
          // つなぎのあとの宙返りで投げる形は、大抵ダイビング前宙か前宙で実施する
          (pattern.throwInSkill && THROW_AFTER_CONNECT_SALTOS.includes(id)
            ? THROW_AFTER_CONNECT_WEIGHT
            : 1),
      ),
    );
    afterCache.set(key, edges);
    return edges;
  };

  return { first, next, connects, afterConnect };
}

/** 重み付きの抽選に渡すための、辺の並びとその重み */
export const edgeIds = (edges: { id: string }[]): string[] => edges.map((e) => e.id);
export const edgeWeights = (edges: { id: string; weight: number }[]): Record<string, number> =>
  Object.fromEntries(edges.map((e) => [e.id, e.weight]));
