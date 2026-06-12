import type { ScoreResult } from "../scoring/score";

/** 必須要素チェック + 点数集計の表示 */
export function ScoreSummary({ result }: { result: ScoreResult }) {
  const {
    required,
    missing,
    connectNoApparatus,
    tumblingScore,
    handScore,
    seriesBonus,
    techniqueCount,
    techniqueBonus,
    apparatusOpBonus,
    twoThrowMotionBonus,
    dScore,
    noApparatusDeduction,
    missingDirCount,
    directionDeduction,
    totalThrowCount,
    throwCountDeduction,
    maxChainAll,
    saltoChainDeduction,
    throwKindCount,
    catchKindCount,
    varietyDeduction,
    aDeduction,
    aScore,
    seriesExecutionDeduction,
    overallExecutionDeduction,
    executionDeduction,
    eScore,
    grandTotal,
  } = result;

  return (
    <>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="line-head">必須要素チェック</div>
        <ul className="check-list">
          {required.map((r) => (
            <li key={r.key} className="check-item">
              <span className={`mark ${r.passed === false ? "ng" : r.passed === null ? "pending" : "ok"}`}>
                {r.passed === false ? "×" : r.passed === null ? "?" : "✓"}
              </span>
              <span className={r.passed === false ? "ng-text" : "ok-text"}>{r.label}</span>
            </li>
          ))}
        </ul>
        {missing.length > 0 && <div className="missing-box">不足要素 {missing.length} 件</div>}
        {connectNoApparatus && <div className="warn-box">つなぎ技のA難度に手具操作がありません（減点対象）</div>}
      </section>

      <section className="card card-total">
        <div className="line-head">点数集計</div>

        <div className="category-head">D（難度）— 加点</div>
        <div className="total-row">
          <span>タンブリング難度点（上位3本）</span>
          <span>{tumblingScore.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>徒手難度点（上位3つ）</span>
          <span>{handScore.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>連続投げ加点</span>
          <span>{seriesBonus.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>技術加点（視野外・手以外・手具｜{techniqueCount}件）</span>
          <span>{techniqueBonus.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>手具操作加点（シリーズ最終難度E＋手具操作2回以上）</span>
          <span>{apparatusOpBonus.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>二つ投げ4動作加点</span>
          <span>{twoThrowMotionBonus.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>D 小計</span>
          <span>{dScore.toFixed(1)} 点</span>
        </div>

        <div className="category-head">A（芸術と多様性）— 10点満点から減点</div>
        <div className="total-row">
          <span>手具操作不足減点（投げなしタンブリング＋つなぎ技不足｜上限0.4）</span>
          <span>-{noApparatusDeduction.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>方向系不足減点（不足 {missingDirCount} 系統）</span>
          <span>-{directionDeduction.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>投げ回数不足減点（投げ {totalThrowCount} 回）</span>
          <span>-{throwCountDeduction.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>連続宙返り減点（最大 {maxChainAll} 回連続）</span>
          <span>-{saltoChainDeduction.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>
            投げ方・受け方の種類不足減点（投げ{throwKindCount}/3・受け{catchKindCount}/3｜上限0.5）
          </span>
          <span>-{varietyDeduction.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>A 残点（10 − {aDeduction.toFixed(1)}）</span>
          <span>{aScore.toFixed(1)} 点</span>
        </div>

        <div className="category-head">E（実施）— 10点満点から減点</div>
        <div className="total-row">
          <span>各シリーズの実施減点合計</span>
          <span>-{seriesExecutionDeduction.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>演技全体の実施減点</span>
          <span>-{overallExecutionDeduction.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>E 残点（10 − {executionDeduction.toFixed(1)}）</span>
          <span>{eScore.toFixed(1)} 点</span>
        </div>

        <div className="total-row">
          <span>投げ回数</span>
          <span>{totalThrowCount} 回</span>
        </div>
        <div className="grand-row">
          <span>合計（D + A残点 + E残点）</span>
          <span className="grand-score">{grandTotal.toFixed(1)}</span>
        </div>
      </section>
    </>
  );
}
