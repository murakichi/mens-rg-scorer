import { S } from "../styles";
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
    executionDeduction,
    eScore,
    grandTotal,
  } = result;

  return (
    <>
      <section style={{ ...S.card, marginTop: 14 }}>
        <div style={S.lineHead}>必須要素チェック</div>
        <ul style={S.checkList}>
          {required.map((r) => (
            <li key={r.key} style={S.checkItem}>
              <span style={r.passed === false ? S.ng : r.passed === null ? S.pending : S.ok}>
                {r.passed === false ? "×" : r.passed === null ? "?" : "✓"}
              </span>
              <span style={r.passed === false ? S.ngText : S.okText}>{r.label}</span>
            </li>
          ))}
        </ul>
        {missing.length > 0 && <div style={S.missingBox}>不足要素 {missing.length} 件</div>}
        {connectNoApparatus && <div style={S.warnBox}>つなぎ技のA難度に手具操作がありません（減点対象）</div>}
      </section>

      <section style={S.cardTotal}>
        <div style={S.lineHead}>点数集計</div>

        <div style={S.categoryHead}>D（難度）— 加点</div>
        <div style={S.totalRow}>
          <span>タンブリング難度点（上位3本）</span>
          <span>{tumblingScore.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>徒手難度点（上位3つ）</span>
          <span>{handScore.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>連続投げ加点</span>
          <span>{seriesBonus.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>技術加点（視野外・手以外・手具｜{techniqueCount}件）</span>
          <span>{techniqueBonus.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>手具操作加点（シリーズ最終難度E＋手具操作2回以上）</span>
          <span>{apparatusOpBonus.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>二つ投げ4動作加点</span>
          <span>{twoThrowMotionBonus.toFixed(1)} 点</span>
        </div>
        <div style={S.subtotalRow}>
          <span>D 小計</span>
          <span>{dScore.toFixed(1)} 点</span>
        </div>

        <div style={S.categoryHead}>A（芸術と多様性）— 10点満点から減点</div>
        <div style={S.totalRow}>
          <span>手具操作不足減点（投げなしタンブリング＋つなぎ技不足｜上限0.4）</span>
          <span>-{noApparatusDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>方向系不足減点（不足 {missingDirCount} 系統）</span>
          <span>-{directionDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>投げ回数不足減点（投げ {totalThrowCount} 回）</span>
          <span>-{throwCountDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>連続宙返り減点（最大 {maxChainAll} 回連続）</span>
          <span>-{saltoChainDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.totalRow}>
          <span>
            投げ方・受け方の種類不足減点（投げ{throwKindCount}/3・受け{catchKindCount}/3｜上限0.5）
          </span>
          <span>-{varietyDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.subtotalRow}>
          <span>A 残点（10 − {aDeduction.toFixed(1)}）</span>
          <span>{aScore.toFixed(1)} 点</span>
        </div>

        <div style={S.categoryHead}>E（実施）— 10点満点から減点</div>
        <div style={S.totalRow}>
          <span>各シリーズの実施減点合計</span>
          <span>-{executionDeduction.toFixed(1)} 点</span>
        </div>
        <div style={S.subtotalRow}>
          <span>E 残点（10 − {executionDeduction.toFixed(1)}）</span>
          <span>{eScore.toFixed(1)} 点</span>
        </div>

        <div style={S.totalRow}>
          <span>投げ回数</span>
          <span>{totalThrowCount} 回</span>
        </div>
        <div style={S.grandRow}>
          <span>合計（D + A残点 + E残点）</span>
          <span>{grandTotal.toFixed(1)} 点</span>
        </div>
      </section>
    </>
  );
}
