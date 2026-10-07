import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { SeriesListEditor, emptySeries } from "./SeriesListEditor";
import {
  PERFORM_GRADES,
  THROW_GRADES,
  DEFAULT_THROW_GRADE,
  RATING_ADOPT_COUNT,
  RATING_BOOST_MAX,
  RATING_BOOST_STEP,
  clampBoost,
  performConfidence,
  throwConfidence,
  computeRating,
  COMMON_RATING_APPARATUS,
  DEFAULT_RATING_APPARATUS,
  NO_APPARATUS,
  scoringApparatusOf,
  RATING_APPARATUS_OPTIONS,
  loadRatingEntries,
  normalizePerformGrade,
  normalizeRatingApparatus,
  saveRatingEntries,
  seriesForApparatus,
  type RatingApparatus,
  type PerformGrade,
  type RatingEntry,
} from "../scoring/rating";
import type { Series } from "../scoring/types";

const SKIP_LABEL = {
  duplicate: "同じ内容（高いほうを採用）",
  contained: "長い連続に含まれる",
  over: `上位${RATING_ADOPT_COUNT}個の外`,
} as const;

const apparatusName = (a: RatingApparatus) => RATING_APPARATUS_OPTIONS.find((o) => o.id === a)?.name ?? "";
const fmt = (n: number) => n.toFixed(2);

/** 実施できる技・シリーズを好きなだけ入力し、上位10個からレーティングを出す画面。採点には影響しない。 */
export function RatingScreen() {
  const [entries, setEntries] = useState<RatingEntry[]>(() => loadRatingEntries());
  const [sel, setSel] = useState(0);

  useEffect(() => saveRatingEntries(entries), [entries]);
  const result = useMemo(() => computeRating(entries), [entries]);

  const cur = entries[Math.min(sel, entries.length - 1)];
  const curIdx = cur ? entries.indexOf(cur) : -1;
  const curApparatus: RatingApparatus = normalizeRatingApparatus(cur?.apparatus);
  const throwGradeNow = cur?.throwGrade ?? DEFAULT_THROW_GRADE;
  const patch = (i: number, p: Partial<RatingEntry>) =>
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const add = () => {
    setEntries((es) => [
      ...es,
      // 直前に選んでいた手具を引き継ぐ（同じ手具の入力が続くことが多い）
      { apparatus: cur?.apparatus ?? DEFAULT_RATING_APPARATUS, series: emptySeries(), grade: "A", boost: 0 },
    ]);
    setSel(entries.length);
  };
  const remove = (i: number) => {
    setEntries((es) => es.filter((_, j) => j !== i));
    setSel(0);
  };
  const gradeSelect = (
    grades: { id: PerformGrade; name: string; note: string }[],
    value: PerformGrade,
    onChange: (g: PerformGrade) => void,
  ) => (
    <select
      className="select tpl-select"
      value={value}
      onChange={(e) => onChange(normalizePerformGrade(e.target.value))}
    >
      {grades.map((g) => (
        <option key={g.id} value={g.id} title={g.note}>
          {g.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <section className="card">
        <div className="line-head">レーティング</div>
        <div className="rating-total">
          <div className="rating-total-main">
            <strong>{fmt(result.total)}</strong>
            <span>レーティング（上位{RATING_ADOPT_COUNT}個の合計）</span>
          </div>
          <div className="rating-total-sub">ルールのみ（E超え・上乗せなし）{fmt(result.ruleTotal)}</div>
          <div className="rating-total-sub">試合で実施できる（A）だけ {fmt(result.matchTotal)}</div>
        </div>
        <p className="hint">
          評価値＝（ルール難度点＋上乗せ）×確度＋ルールの加点×確度。加点は技術・手具操作・二つ投げの徒手動作で、入力ごとに選んだ手具で数えます。
          E難度を超える評価は、技そのものがF・Gか、C以上だけの連続のうち上位2技の組み合わせが高いとき、または上乗せで認めます。
          同じ宙返りの連続は3つまで数えます。採点には影響しません。
        </p>
      </section>

      <section className="card">
        <div className="line-head">ランクの見方</div>
        <p className="hint">
          ランクは A〜E の5段階ですが、<b>技・シリーズ</b>と<b>投げ</b>で見る観点が違います。技は「どこでできるか」、
          投げは練習場所ではなく「どれだけ正確に決まるか」で付けます。
        </p>
        <div className="rating-table-wrap">
          <table className="rating-table rating-legend">
            <thead>
              <tr>
                <th>ランク</th>
                <th>技・シリーズ（どこでできるか）</th>
                <th>投げ（どれだけ正確に決まるか）</th>
              </tr>
            </thead>
            <tbody>
              {PERFORM_GRADES.map((g, i) => (
                <tr key={g.id}>
                  <td className="rating-legend-rank">{g.id}</td>
                  <td>
                    {g.note}
                    <span className="rating-legend-conf">×{g.confidence}</span>
                  </td>
                  <td>
                    {THROW_GRADES[i].note}
                    <span className="rating-legend-conf">×{THROW_GRADES[i].confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="line-head">
          入力
          <span className="line-head-right">
            <button className="io-btn" onClick={add}>
              <Plus size={14} /> 追加
            </button>
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="hint">実施できる技・シリーズを「追加」で入力します（いくらでも入力できます）。</p>
        ) : (
          <div className="app-wrap">
            {entries.map((e, i) => (
              <button key={i} className={i === curIdx ? "app-btn is-active" : "app-btn"} onClick={() => setSel(i)}>
                {e.name || `入力${i + 1}`}（{apparatusName(e.apparatus)}・{e.grade}）
              </button>
            ))}
          </div>
        )}
      </section>

      {cur && (
        <>
          <section className="card">
            <div className="line-head">手具</div>
            <div className="app-wrap">
              {RATING_APPARATUS_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  className={o.id === curApparatus ? "app-btn is-active" : "app-btn"}
                  onClick={() => patch(curIdx, { apparatus: o.id, series: seriesForApparatus(cur.series, o.id) })}
                >
                  {o.name}
                </button>
              ))}
            </div>
            <p className="hint">
              手具無しは投げ・キャッチ・手具操作を持たない入力、共通はどの手具でも使える入力（二つ投げ・横投げ・手具を使った投げ／キャッチなど
              手具固有の入力を持たない）です。手具で入力できない内容は評価に入りません。
            </p>
          </section>

          <section className="card">
            <div className="line-head">評価</div>
            <div className="exec-row">
              <label className="exec-label">
                名前（任意）
                <input
                  className="exec-input rating-name-input"
                  value={cur.name ?? ""}
                  onChange={(e) => patch(curIdx, { name: e.target.value || undefined })}
                />
              </label>
              <label className="exec-label">
                上乗せ
                <select
                  className="select tpl-select"
                  value={cur.boost ?? 0}
                  onChange={(e) => patch(curIdx, { boost: clampBoost(e.target.value) })}
                >
                  {Array.from({ length: RATING_BOOST_MAX + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "なし" : `+${n}段（+${(n * RATING_BOOST_STEP).toFixed(1)}点）`}
                    </option>
                  ))}
                </select>
              </label>
              <button className="io-btn" onClick={() => remove(curIdx)}>
                この入力を削除
              </button>
            </div>
            <div className="rating-grade-grid">
              <div className="rating-grade-box">
                <div className="rating-grade-title">技・シリーズ：どこでできるか</div>
                {gradeSelect(PERFORM_GRADES, cur.grade, (g) => patch(curIdx, { grade: g }))}
                <p className="hint">
                  {PERFORM_GRADES.find((g) => g.id === cur.grade)?.note}（確度 ×{performConfidence(cur.grade)}）
                </p>
              </div>
              <div className="rating-grade-box">
                <div className="rating-grade-title">投げ：どれだけ正確に決まるか</div>
                {gradeSelect(THROW_GRADES, throwGradeNow, (g) =>
                  patch(curIdx, { throwGrade: g === DEFAULT_THROW_GRADE ? undefined : g }),
                )}
                <p className="hint">
                  {THROW_GRADES.find((g) => g.id === throwGradeNow)?.note}（確度 ×{throwConfidence(throwGradeNow)}）
                </p>
              </div>
            </div>
            <p className="hint">
              <b>上乗せ</b>：ルールの難度点に、自分の見立てで難度を足す段階です（1段＝+{RATING_BOOST_STEP.toFixed(1)}点、最大{RATING_BOOST_MAX}段）。
              ルールではE難度止まりでも実際はもっと難しい技・シリーズや、ルールの難度に表れない出来のよさを評価したいときに使います。
              上乗せ分にも確度が掛かります。
            </p>
            <p className="hint">
              投げの正確性は投げを含む塊だけに効き、投げタンのタンブリング側は技と投げの確度の低いほうを使います。
              投げは練習場所の段階（フロア・エアマット・トランポリン）では評価しません。
            </p>
          </section>

          <SeriesListEditor
            series={[cur.series]}
            apparatus={scoringApparatusOf(curApparatus)}
            common={curApparatus === COMMON_RATING_APPARATUS}
            noApparatus={curApparatus === NO_APPARATUS}
            junior={false}
            future={"G"}
            allowAdd={false}
            showExec={false}
            autoInputEnabled={false}
            onChange={(next: Series[]) => patch(curIdx, { series: next[0] ?? emptySeries() })}
          />
        </>
      )}

      <section className="card">
        <div className="line-head">採用の内訳</div>
        <div className="rating-table-wrap">
          <table className="rating-table">
            <thead>
              <tr>
                <th>入力</th>
                <th>難度</th>
                <th>確度</th>
                <th>評価値</th>
                <th>採用</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((c, k) => (
                <tr key={k} className={c.adopted ? "" : "is-skipped"}>
                  <td>
                    {c.label}（{apparatusName(c.apparatus)}）
                    {c.part && `（投げタンの${c.part === "throw" ? "投げ" : "タンブリング"}）`}
                  </td>
                  <td>
                    {c.ruleDiff}
                    {c.ratedDiff !== c.ruleDiff &&
                      ` → ${c.ratedDiff}（${c.raise === "skill" ? "技そのもの" : "質の高い連続"}）`}
                    {c.boost > 0 && ` +${c.boost}段`}
                    {c.bonus > 0 && ` ＋加点${c.bonus.toFixed(1)}`}
                  </td>
                  <td>
                    {c.byThrow ? "投げの正確性 " : "技 "}
                    {c.grade}（×{c.confidence}）
                  </td>
                  <td>{fmt(c.value)}</td>
                  <td>
                    {c.adopted ? "○" : c.skipped ? SKIP_LABEL[c.skipped] : ""}
                    {c.trimmed > 0 && `（同じ宙返り${c.trimmed}個は不算入）`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.candidates.length === 0 && <p className="hint">技を入力すると、ここに採用の内訳が出ます。</p>}
      </section>
    </>
  );
}
