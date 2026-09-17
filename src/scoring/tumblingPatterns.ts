// =====================================================================
// 自動生成するタンブリングの「形」
//
// どんな並びを組むか（宙返りの本数・つなぎ技の有無・投げ受けかどうか）の定義だけを置く。
// 何に何が続けられるかは `tumblingChain.ts`、選ばれやすさ・抽選の確率は `tumblingWeights.ts`、
// その2つから導いた遷移表は `tumblingTransitions.ts`、実際の候補づくりは `autoTumblings.ts`。
// =====================================================================

import { DIFF_VALUE, hasTwoThrow } from "./constants";
import { NON_HAND_TAG, autoThrowStyles, type AutoThrowStyle } from "./autoThrows";
import type { ApparatusKey } from "./types";

/** 自動生成するタンブリングの形 */
export interface AutoTumblingPattern {
  id: string;
  /** 宙返りの本数（最小・最大とも含む） */
  saltos: { min: number; max: number };
  /** 1本目の宙返りのあとにつなぎ技（A難度）を挟むか */
  connect: boolean;
  /** 投げ受け（投げタン）か */
  throwCatch: boolean;
  /**
   * 投げを**最後の宙返りの最中**に実施するか（`throwCatch` と併用）。
   * 投げてから跳ぶ形は手具の滞空時間に縛られるが、連続の最後に投げるなら
   * 前に何本入れても自由で、三宙と投げタンを1シリーズで両方満たせる。
   */
  throwInSkill?: boolean;
  /** 最後に前転でつなぐか（投げ受けの着地） */
  rollFinish: boolean;
}

export const AUTO_TUMBLING_PATTERNS: AutoTumblingPattern[] = [
  // 宙返りの連続（3本で三宙）。難度はだんだん下がる
  { id: "chain", saltos: { min: 1, max: 3 }, connect: false, throwCatch: false, rollFinish: false },
  // 1本目の後につなぎ技を挟む（前向きに降りて → ロンダート等 → もう1本）
  { id: "connect", saltos: { min: 2, max: 3 }, connect: true, throwCatch: false, rollFinish: false },
  // 投げタン：投げ→前方系→前転→キャッチ
  { id: "throwRoll", saltos: { min: 1, max: 1 }, connect: false, throwCatch: true, rollFinish: true },
  // 投げタン：投げ→前方系→側宙（転宙）→キャッチ
  { id: "throwSalto", saltos: { min: 2, max: 2 }, connect: false, throwCatch: true, rollFinish: false },
  // 投げタン：連続の最後の宙返りの最中に投げて、前転→キャッチ（三宙と投げタンを1本で両立）
  {
    id: "chainThrowInSkill",
    saltos: { min: 2, max: 3 },
    connect: false,
    throwCatch: true,
    throwInSkill: true,
    rollFinish: true,
  },
];

/**
 * 投げタンのキャッチのあとに**連続投げ**を続ける確率。現実にあり得る形で、
 * 投げてから宙返りを実施する形（`throwRoll`・`throwSalto`）のほうが、
 * 宙返りの最中に投げる形（`throwInSkill`）より多い。

/** その手具・その形で投げタンの投げを二つ投げにできるか */
export const canTwoThrowTumbling = (
  apparatus: ApparatusKey | undefined,
  pattern: AutoTumblingPattern,
): boolean => !!apparatus && hasTwoThrow(apparatus) && !!pattern.throwCatch && !pattern.throwInSkill;

/**
 * 連続投げの2回目に使える投げ方。手以外の投げは2回目には実施できない。
 * スティックの左手投げ・クラブとリングの二つ投げもここに入る（手元に戻っているので実施できる）。
 */
export function secondThrowStyles(apparatus: ApparatusKey): AutoThrowStyle[] {
  return autoThrowStyles(apparatus).filter((t) => t.id !== NON_HAND_TAG);
}

/**
 * つなぎ技を挟む位置の既定（1＝1本目の宙返りの後）。
 * 2本目の後に挟む確率は `CONNECT_AT_SECOND_CHANCE`（`tumblingWeights.ts`）。
 */
export const DEFAULT_CONNECT_AT = 1;

/** その形で取り得る宙返りの本数 */
export function saltoCountRange(pattern: AutoTumblingPattern): number[] {
  const range: number[] = [];
  for (let n = pattern.saltos.min; n <= pattern.saltos.max; n++) range.push(n);
  return range;
}


/** 基本的な構成の選手が実施する技の難度の上限（D難度なし） */
export const BASIC_LEVEL_MAX_DIFF = DIFF_VALUE.C;
/** 基本的な構成の選手の連続宙返りの本数（三宙なし・2回で終わり） */
export const BASIC_LEVEL_MAX_SALTOS = 2;

/**
 * 基本的な構成（Dスコアの低い選手）に合わせた形。
 * つなぎ技は実施しないので null（その形は作らない）、連続も2本までに詰める。
 */
export function basicLevelPattern(pattern: AutoTumblingPattern): AutoTumblingPattern | null {
  if (pattern.connect) return null;
  if (pattern.saltos.max <= BASIC_LEVEL_MAX_SALTOS) return pattern;
  return {
    ...pattern,
    saltos: {
      min: Math.min(pattern.saltos.min, BASIC_LEVEL_MAX_SALTOS),
      max: BASIC_LEVEL_MAX_SALTOS,
    },
  };
}
