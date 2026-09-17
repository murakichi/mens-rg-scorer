// =====================================================================
// 同じ難度に到達する組み方の優先度（実際の演技での多さ）
//
// 難度点が同じでも、実際によく実施される組み方とそうでない組み方がある。
// 生成の評価では順位ぶんだけ僅かに差を付ける（`SHAPE_PRIORITY_WEIGHT`。点数は犠牲にしない）。
// =====================================================================

import { skillDef, skillDifficulty } from "./constants";
import { THROW_FINISH_SALTOS, THROW_ROLL_MOTION } from "./tumblingChain";
import type { Difficulty, Series } from "./types";

/**
 * タンブリングで同じ難度に到達する組み方の並び（前が実施が多い。同じ配列内は同順位）。
 * 難度点は同じなので、生成の評価では順位ぶんだけ僅かに差を付ける
 * （`SHAPE_PRIORITY_WEIGHT`。点数は犠牲にしない）。
 *  - E難度：C→B→B ＞ D→B ＝ C→C ＞ C→C→B ＞ B→B→B→B ＞ その他 ＞ 単発E
 *  - D難度：C→B ＝ B→B→B ＞ その他 ＞ 単発D
 */
export const TUMBLING_SHAPE_ORDER: Partial<Record<Difficulty, Difficulty[][][]>> = {
  E: [[["C", "B", "B"]], [["D", "B"], ["C", "C"]], [["C", "C", "B"]], [["B", "B", "B", "B"]]],
  D: [[["C", "B"], ["B", "B", "B"]]],
};

/** タンブリングの組み方の内容（難度の並びと、組み方の見分けに使う情報） */
export interface TumblingShape {
  /** A難度以外（宙返り）の難度の並び */
  seq: Difficulty[];
  /** 連続の最後の宙返りの最中に投げたか（false＝投げてから実施する／投げなし） */
  throwInSkill: boolean;
  /** つなぎ技（宙返りの間のA難度）を挟んだか */
  hasConnect: boolean;
  /** 最後の宙返りが側宙・転宙か */
  finishSide: boolean;
  /** 受けの直前を前転でつないだか */
  rollFinish: boolean;
}

/** シリーズの組み方を読み取る（宙返りが無ければ null） */
export function readTumblingShape(series: Series, junior = false): TumblingShape | null {
  const seq: Difficulty[] = [];
  let throwInSkill = false;
  let hasConnect = false;
  let finishSide = false;
  let rollFinish = false;
  series.items.forEach((item) => {
    if (item.kind === "skill" && item.skillId) {
      const d = skillDifficulty(item.skillId, junior);
      if (item.isThrow) throwInSkill = true;
      if (d === "A") {
        // 宙返りの間に入ったA難度＝つなぎ技（入りの技は宙返りの前なので数えない）
        if (seq.length > 0 && skillDef(item.skillId)?.isConnectA) hasConnect = true;
        return;
      }
      if (d) seq.push(d);
      finishSide = THROW_FINISH_SALTOS.includes(item.skillId);
      rollFinish = false;
      return;
    }
    if (item.kind === "motion" && item.motionId === THROW_ROLL_MOTION && seq.length > 0) rollFinish = true;
  });
  return seq.length > 0 ? { seq, throwInSkill, hasConnect, finishSide, rollFinish } : null;
}

/** 投げのないタンブリングの組み方の順位（0が最上位） */
export function tumblingShapeRank(shape: TumblingShape, unitDiff: Difficulty): number {
  const ranks = TUMBLING_SHAPE_ORDER[unitDiff];
  if (!ranks) return 0;
  const key = shape.seq.join(",");
  const i = ranks.findIndex((group) => group.some((sh) => sh.join(",") === key));
  if (i >= 0) return i;
  // 単発（その難度の技1本）が最後、表に無い組み方はその1つ前（＝その他）
  return shape.seq.length === 1 ? ranks.length + 1 : ranks.length;
}

/**
 * 投げタンの組み方の順位（0が最上位）。実際の演技での多さは
 *  - E難度：C＋側宙 ＝ D＋前転 ＞ つなぎを挟んで最後のBで投げ ＞ 連続の最後のBで投げ
 *    ＞ C＋側宙以外の宙返り ＞ その他 ＞ 単発E
 *  - D難度：前方のC＋前転 ＝ 前方のB＋側宙（転宙） ＞ C難度のシリーズ中に投げ ＞ その他
 */
export function throwTumblingShapeRank(shape: TumblingShape, unitDiff: Difficulty): number {
  const { seq, throwInSkill, hasConnect, finishSide, rollFinish } = shape;
  const single = seq.length === 1 && seq[0] === unitDiff;
  if (unitDiff === "E") {
    if (single) return 5;
    if (!throwInSkill) {
      if (seq.length === 2 && seq[0] === "C" && finishSide) return 0;
      if (seq.length === 1 && seq[0] === "D" && rollFinish) return 0;
      if (seq.length === 2 && seq[0] === "C") return 3;
      return 4;
    }
    return hasConnect ? 1 : 2;
  }
  if (unitDiff === "D") {
    if (!throwInSkill) {
      if (seq.length === 1 && seq[0] === "C" && rollFinish) return 0;
      if (seq.length === 2 && seq[0] === "B" && finishSide) return 0;
    }
    if (throwInSkill && seq.includes("C")) return 1;
    return 2;
  }
  return 0;
}
