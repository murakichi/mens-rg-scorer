// =====================================================================
// シリーズの編集操作のうち、React に依存しない部分。
// 入力画面（`SeriesListEditor`）から呼ぶ。
// =====================================================================

import type { Series } from "../scoring/types";

/**
 * `sIdx` のシリーズをコピーして**直後に挿した**新しい配列を返す。
 *
 * 写すのは構成だけ:
 * - `executionDeduction` は引き継がない（採点ごとの入力。テンプレート保存と同じ考え方）
 * - `notDuplicate`（「同じ入力だが実際は別内容」の宣言）も引き継がない —
 *   コピー直後は文字どおり同一内容なので、重複判定はそのまま効かせたほうが誤解がない（#69）
 *
 * 範囲外の添字なら元の配列をそのまま返す。
 */
export function duplicateSeriesAt(list: Series[], sIdx: number): Series[] {
  const src = list[sIdx];
  if (!src) return list;
  const copy = structuredClone(src);
  copy.executionDeduction = 0;
  delete copy.notDuplicate;
  return [...list.slice(0, sIdx + 1), copy, ...list.slice(sIdx + 1)];
}
