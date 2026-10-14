// =====================================================================
// 採点結果を「ラベル付きの行」に並べ直す（表示側の共通部品）。
//
// 印刷の採点表と構成の比較が同じ分類を使うようにするためのもの。
// #67 で、採点側に減点の分類が増えたときに紙面の明細だけ取り残されて
// 合計と合わなくなった — 分類の一覧を2箇所に書かないこと。
// 採点はしない（`ScoreResult` を読むだけ）。
// =====================================================================

import type { ScoreResult } from "../scoring/score";

export interface ScoreRow {
  /** 表示名。件数など文脈を添える */
  label: string;
  /** 点数（A側も正の数で返す。符号は表示側が付ける） */
  value: number;
}

/** D（難度点と加点）の内訳。合計すると `dScore` になる。 */
export function dRows(r: ScoreResult): ScoreRow[] {
  return [
    { label: "タンブリング難度点", value: r.tumblingScore },
    { label: "徒手難度点", value: r.handScore },
    { label: "連続投げ加点", value: r.seriesBonus },
    { label: `投げ受けの技術加点（${r.techniqueCount}種）`, value: r.techniqueBonus },
    { label: "手具操作加点", value: r.apparatusOpBonus },
    { label: "二つ投げ徒手加点", value: r.twoThrowMotionBonus },
    { label: "様々な跳び加点", value: r.jumpVarietyBonus },
  ];
}

/**
 * A（減点）の内訳。合計すると `aDeduction` になる。
 * 最後の「その他の減点」は、採点側に分類が増えたときに明細と合計が黙ってずれないための保険
 * （通常は0。ここに数字が出たら、この一覧に分類を足す合図）。
 */
export function aRows(r: ScoreResult): ScoreRow[] {
  const rows: ScoreRow[] = [
    { label: "手具操作不足（投げなしタンブリング＋つなぎ技）", value: r.noApparatusDeduction },
    { label: `方向系不足（不足 ${r.missingDirCount} 系統）`, value: r.directionDeduction },
    { label: `投げ回数不足（${r.totalThrowCount}回／必要 ${r.requiredThrowCount}回）`, value: r.throwCountDeduction },
    {
      label: `投げ回数超過（${r.performedThrowCount}回／上限 ${r.maxThrowCount ?? "—"}回）`,
      value: r.throwCountOverDeduction,
    },
    { label: `連続宙返り（最大 ${r.maxChainAll} 回連続）`, value: r.saltoChainDeduction },
    {
      label: `投げ方・受け方の種類不足（投げ${r.throwKindCount}/3・受け${r.catchKindCount}/3）`,
      value: r.varietyDeduction,
    },
    { label: "必須要素の欠如（投げタン・つなぎ技・タンブリング本数）", value: r.missingElementDeduction },
    { label: "深い徒手動作の不足", value: r.deepMotionDeduction },
    { label: "柔軟の徒手の不足", value: r.flexDeduction },
    { label: "手具操作の不足", value: r.handOpDeduction },
    { label: "手具別必須要素の欠如（§3.2）", value: r.apparatusElementDeduction },
    { label: "違反・欠如（§3.5.6.3）", value: r.violationDeduction },
    { label: "芸術と多様性の欠点（§3.5.6.4）", value: r.artDeduction },
  ];
  const listed = rows.reduce((n, row) => n + row.value, 0);
  const other = Math.max(0, Math.round((r.aDeduction - listed) * 10) / 10);
  return [...rows, { label: "その他の減点", value: other }];
}

/** 0点の行を落とす（紙・画面を詰めるため） */
export const nonZero = (rows: ScoreRow[]): ScoreRow[] => rows.filter((row) => row.value > 0);
