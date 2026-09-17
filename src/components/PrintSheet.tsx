import { APPARATUS } from "../scoring/constants";
import { describeSeries } from "../scoring/templates";
import type { DiffRow, ScoreResult } from "../scoring/score";
import type { ApparatusKey, Series } from "../scoring/types";

interface Props {
  result: ScoreResult;
  apparatus: ApparatusKey;
  junior: boolean;
  series: Series[];
}

/** 難度点の内訳1行。採用されなかった行は画面と同じく理由を添えて薄く出す。 */
function Row({ label, row }: { label: string; row: DiffRow }) {
  const counted = row.adopted && row.inTop;
  return (
    <div className={counted ? "print-row" : "print-row is-excluded"}>
      <span>
        {label}（{row.label}・{row.diff}難度）
        {!counted && <span className="print-note">{row.adopted ? "上位3つ外" : "難度不採用"}</span>}
      </span>
      <span>{row.score.toFixed(1)}</span>
    </div>
  );
}

/**
 * 印刷（およびブラウザの「PDFとして保存」）専用の採点表。
 * 画面では `hidden`、`@media print` のときだけ出す。採点はしない —
 * `computeScore` の結果をそのまま並べるだけ。
 */
export function PrintSheet({ result, apparatus, junior, series }: Props) {
  const { seriesBreakdowns, required, missing, dScore, aScore, eScore, grandTotal } = result;
  const stamp = new Date().toLocaleDateString("ja-JP");

  return (
    <div className="print-sheet" hidden>
      <div className="print-head">
        <h2 className="print-title">男子新体操 採点表</h2>
        <span className="print-meta">
          {APPARATUS[apparatus].name}
          {junior ? "／ジュニア適用規則" : ""}・{stamp}
        </span>
      </div>

      <div className="print-total">
        <span className="print-total-main">
          合計 <b>{grandTotal.toFixed(1)}</b>
        </span>
        <span className="print-total-sub">
          D {dScore.toFixed(1)}　A残点 {aScore.toFixed(1)}　E残点 {eScore.toFixed(1)}
        </span>
      </div>

      <div className="print-section">
        <h3 className="print-h">シリーズ構成</h3>
        {series.map((ser, i) => (
          <div key={i} className="print-row">
            <span>
              <b>シリーズ{i + 1}</b>　{describeSeries(ser, 12)}
            </span>
            <span>{(seriesBreakdowns[i]?.dPart ?? 0).toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div className="print-section">
        <h3 className="print-h">D（難度点）の内訳</h3>
        {seriesBreakdowns.map((b, i) => {
          if (b.tumRows.length === 0 && b.handRows.length === 0) return null;
          return (
            <div key={i} className="print-group">
              <div className="print-group-head">シリーズ{i + 1}</div>
              {b.tumRows.map((row, k) => (
                <Row key={`t${k}`} label={`タンブリング${k + 1}`} row={row} />
              ))}
              {b.handRows.map((row, k) => (
                <Row key={`h${k}`} label={`投げ${k + 1}`} row={row} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="print-section">
        <h3 className="print-h">必須要素</h3>
        {required.map((r) => (
          <div key={r.key} className="print-row">
            <span>
              <span className="print-mark">{r.passed === false ? "×" : r.passed === null ? "?" : "✓"}</span>
              {r.label}
            </span>
            <span>{r.passed === false && !!r.deduction ? `-${r.deduction.toFixed(1)}` : ""}</span>
          </div>
        ))}
        {missing.length > 0 && <div className="print-missing">不足要素 {missing.length} 件</div>}
      </div>
    </div>
  );
}
