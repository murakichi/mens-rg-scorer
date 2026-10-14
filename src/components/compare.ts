// =====================================================================
// 2つの構成の突き合わせ（React に依存しない部分）。
//
// 採点はしない — `computeScore` の結果を2つ並べて引き算するだけ。
// シリーズ単位の対応づけはしない（順序が変わると破綻するため、#70）。
// =====================================================================

import type { ScoreResult } from "../scoring/score";
import { aRows, dRows, type ScoreRow } from "./scoreRows";

export interface CompareRow {
  label: string;
  left: number;
  right: number;
  /** right - left。A側は「減点が増えた＝悪くなった」なので符号の意味が逆になる */
  delta: number;
}

/** 片方でも0でない行だけ残す（両方0の分類は見ても仕方がない） */
const meaningful = (rows: CompareRow[]): CompareRow[] => rows.filter((r) => r.left !== 0 || r.right !== 0);

const round1 = (n: number) => Math.round(n * 10) / 10;

function pair(left: ScoreRow[], right: ScoreRow[]): CompareRow[] {
  // 同じ関数が作る同じ並びなので添字で対応づけられる。
  // ラベルは件数を含んで左右で違いうるので、表示は左側のものを使う。
  return left.map((row, i) => ({
    label: row.label,
    left: row.value,
    right: right[i]?.value ?? 0,
    delta: round1((right[i]?.value ?? 0) - row.value),
  }));
}

export interface RequiredDiff {
  key: string;
  label: string;
  /** 充足状況。null は「判定できない（手動チェック待ち）」 */
  leftPassed: boolean | null;
  rightPassed: boolean | null;
}

/**
 * 必須要素のうち、**片方だけ満たしている**ものを拾う。
 *
 * 左右の**和集合**で見る — 項目は適用規則で増減する（ジュニアだけに出る投げ上限など）ので、
 * 片方にしか無い項目も「片方だけの要求」として見せる。表示名も、その項目を持っている側のものを使う
 * （必要回数が規則で違う項目があるため、左の名前を右に当てると嘘になる）。
 */
export function requiredDiffs(left: ScoreResult, right: ScoreResult): RequiredDiff[] {
  const leftByKey = new Map(left.required.map((c) => [c.key, c]));
  const rightByKey = new Map(right.required.map((c) => [c.key, c]));
  const keys = [...leftByKey.keys(), ...[...rightByKey.keys()].filter((k) => !leftByKey.has(k))];
  return keys.flatMap((key) => {
    const l = leftByKey.get(key);
    const r = rightByKey.get(key);
    const leftPassed = l ? l.passed : null;
    const rightPassed = r ? r.passed : null;
    if (l && r && l.passed === r.passed) return [];
    const label = l && r && l.label !== r.label ? `${l.label}／${r.label}` : (l ?? r)!.label;
    return [{ key, label, leftPassed, rightPassed }];
  });
}

export interface Comparison {
  /** 合計・D・A残点・E残点の差 */
  totals: CompareRow[];
  /** D（難度点と加点）の内訳の差 */
  d: CompareRow[];
  /** A（減点）の内訳の差。値は減点の大きさ（正の数） */
  a: CompareRow[];
  /** 片方だけ満たしている必須要素 */
  required: RequiredDiff[];
}

export function compareScores(left: ScoreResult, right: ScoreResult): Comparison {
  return {
    totals: [
      { label: "合計", left: left.grandTotal, right: right.grandTotal, delta: round1(right.grandTotal - left.grandTotal) },
      { label: "D（難度）", left: left.dScore, right: right.dScore, delta: round1(right.dScore - left.dScore) },
      { label: "A残点", left: left.aScore, right: right.aScore, delta: round1(right.aScore - left.aScore) },
      { label: "E残点", left: left.eScore, right: right.eScore, delta: round1(right.eScore - left.eScore) },
    ],
    d: meaningful(pair(dRows(left), dRows(right))),
    a: meaningful(pair(aRows(left), aRows(right))),
    required: requiredDiffs(left, right),
  };
}
