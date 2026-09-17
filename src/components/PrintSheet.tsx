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
  const {
    seriesBreakdowns,
    required,
    missing,
    apparatusElementChecks,
    violationChecks,
    artDeduction,
    aDeduction,
    noApparatusDeduction,
    missingDirCount,
    directionDeduction,
    totalThrowCount,
    performedThrowCount,
    requiredThrowCount,
    maxThrowCount,
    throwCountDeduction,
    throwCountOverDeduction,
    maxChainAll,
    saltoChainDeduction,
    throwKindCount,
    catchKindCount,
    varietyDeduction,
    missingElementDeduction,
    apparatusElementDeduction,
    violationDeduction,
    executionDeduction,
    tumblingScore,
    handScore,
    seriesBonus,
    techniqueCount,
    techniqueBonus,
    apparatusOpBonus,
    twoThrowMotionBonus,
    jumpVarietyBonus,
    dScore,
    aScore,
    eScore,
    grandTotal,
  } = result;
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
        {/* シリーズ別のD寄与（dPart）は載せない — 連続投げ加点・手具操作加点は
            演技に1回きりなので足し合わせるとDと合わなくなる。点はD集計のほうで出す。 */}
        {series.map((ser, i) => (
          <div key={i} className="print-row">
            <span>
              <b>シリーズ{i + 1}</b>　{describeSeries(ser, 12)}
            </span>
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
              {/* ラベルは画面（SeriesCard の DiffRowLine）と同じ固定の種別名。
                  位置で採番すると ロープ跳び が「投げ1」、投げタンが「タンブリング1」になる。 */}
              {b.tumRows.map((row, k) => (
                <Row key={`t${k}`} label="タンブリング難度点" row={row} />
              ))}
              {b.handRows.map((row, k) => (
                <Row key={`h${k}`} label="徒手難度点" row={row} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="print-section">
        <h3 className="print-h">D（難度点）の合計</h3>
        {[
          ["タンブリング難度点", tumblingScore],
          ["徒手難度点", handScore],
          ["連続投げ加点", seriesBonus],
          [`投げ受けの技術加点（${techniqueCount}種）`, techniqueBonus],
          ["手具操作加点", apparatusOpBonus],
          ["二つ投げ徒手加点", twoThrowMotionBonus],
          ["様々な跳び加点", jumpVarietyBonus],
        ]
          .filter(([, v]) => (v as number) > 0)
          .map(([label, v]) => (
            <div key={label as string} className="print-row">
              <span>{label}</span>
              <span>{(v as number).toFixed(1)}</span>
            </div>
          ))}
        <div className="print-row print-sum">
          <span>D 合計</span>
          <span>{dScore.toFixed(1)}</span>
        </div>
      </div>

      <div className="print-section">
        <h3 className="print-h">必須要素</h3>
        {required.map((r) => (
          <div key={r.key} className="print-row">
            <span>
              <span className="print-mark">{r.passed === false ? "×" : r.passed === null ? "?" : "✓"}</span>
              {r.label}
            </span>
            <span />
          </div>
        ))}
        {missing.length > 0 && <div className="print-missing">不足要素 {missing.length} 件</div>}
      </div>

      {/* A残点が減っている理由が紙の上だけで分かるように、手具別必須要素と違反も載せる */}
      {apparatusElementChecks.length > 0 && (
        <div className="print-section">
          <h3 className="print-h">手具別必須要素（§3.2）</h3>
          {apparatusElementChecks.map((r) => (
            <div key={r.key} className="print-row">
              <span>
                <span className="print-mark">{r.passed ? "✓" : "×"}</span>
                {r.label}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}

      {violationChecks.some((r) => r.passed === false) && (
        <div className="print-section">
          <h3 className="print-h">違反・欠如（§3.5.6.3）</h3>
          {violationChecks
            .filter((r) => r.passed === false)
            .map((r) => (
              <div key={r.key} className="print-row">
                <span>
                  <span className="print-mark">×</span>
                  {r.label}
                </span>
                <span />
              </div>
            ))}
        </div>
      )}

      <div className="print-section">
        <h3 className="print-h">A（減点）の内訳</h3>
        {/* 画面（ScoreSummary）と同じ分類。これを全部足すと aDeduction になる。
            0点の項目は紙を詰めるため省く。 */}
        {[
          ["手具操作不足（投げなしタンブリング＋つなぎ技）", noApparatusDeduction],
          [`方向系不足（不足 ${missingDirCount} 系統）`, directionDeduction],
          [`投げ回数不足（${totalThrowCount}回／必要 ${requiredThrowCount}回）`, throwCountDeduction],
          [`投げ回数超過（${performedThrowCount}回／上限 ${maxThrowCount ?? "—"}回）`, throwCountOverDeduction],
          [`連続宙返り（最大 ${maxChainAll} 回連続）`, saltoChainDeduction],
          [`投げ方・受け方の種類不足（投げ${throwKindCount}/3・受け${catchKindCount}/3）`, varietyDeduction],
          ["必須要素の欠如（投げタン・つなぎ技・タンブリング本数）", missingElementDeduction],
          ["手具別必須要素の欠如（§3.2）", apparatusElementDeduction],
          ["違反・欠如（§3.5.6.3）", violationDeduction],
          ["芸術と多様性の欠点（§3.5.6.4）", artDeduction],
        ]
          .filter(([, v]) => (v as number) > 0)
          .map(([label, v]) => (
            <div key={label as string} className="print-row">
              <span>{label}</span>
              <span>-{(v as number).toFixed(1)}</span>
            </div>
          ))}
        <div className="print-row print-sum">
          <span>A減点 合計（A残点 {aScore.toFixed(1)}）</span>
          <span>-{aDeduction.toFixed(1)}</span>
        </div>
      </div>

      <div className="print-section">
        <div className="print-row print-sum">
          <span>E減点 合計（E残点 {eScore.toFixed(1)}）</span>
          <span>-{executionDeduction.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
