import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { SeriesListEditor, emptySeries } from "./SeriesListEditor";
import {
  PERFORM_GRADES,
  RATING_ADOPT_COUNT,
  RATING_BOOST_MAX,
  RATING_BOOST_STEP,
  clampBoost,
  computeRating,
  loadRatingEntries,
  normalizePerformGrade,
  saveRatingEntries,
  type PerformGrade,
  type RatingEntry,
} from "../scoring/rating";
import { APPARATUS } from "../scoring/constants";
import type { ApparatusKey, Series } from "../scoring/types";

const APPARATUS_STORAGE_KEY = "mens-rg-scorer:rating:apparatus:v1";

function loadApparatus(): ApparatusKey {
  try {
    const v = localStorage.getItem(APPARATUS_STORAGE_KEY);
    return v && v in APPARATUS ? (v as ApparatusKey) : "stick";
  } catch {
    return "stick";
  }
}

const SKIP_LABEL = {
  duplicate: "同じ内容（高いほうを採用）",
  contained: "長い連続に含まれる",
  over: `上位${RATING_ADOPT_COUNT}個の外`,
} as const;

const fmt = (n: number) => n.toFixed(2);

/** 実施できる技・シリーズを好きなだけ入力し、上位10個からレーティングを出す画面。採点には影響しない。 */
export function RatingScreen() {
  const [apparatus, setApparatus] = useState<ApparatusKey>(() => loadApparatus());
  const [entries, setEntries] = useState<RatingEntry[]>(() => loadRatingEntries());
  const [sel, setSel] = useState(0);

  useEffect(() => saveRatingEntries(entries), [entries]);
  useEffect(() => {
    try {
      localStorage.setItem(APPARATUS_STORAGE_KEY, apparatus);
    } catch {
      // 保存できなくても使える
    }
  }, [apparatus]);
  const result = useMemo(() => computeRating(entries, undefined, apparatus), [entries, apparatus]);

  const cur = entries[Math.min(sel, entries.length - 1)];
  const curIdx = cur ? entries.indexOf(cur) : -1;
  const patch = (i: number, p: Partial<RatingEntry>) =>
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const add = () => {
    setEntries((es) => [...es, { series: emptySeries(), grade: "A", boost: 0 }]);
    setSel(entries.length);
  };
  const remove = (i: number) => {
    setEntries((es) => es.filter((_, j) => j !== i));
    setSel(0);
  };
  const gradeSelect = (value: PerformGrade, onChange: (g: PerformGrade) => void) => (
    <select value={value} onChange={(e) => onChange(normalizePerformGrade(e.target.value))}>
      {PERFORM_GRADES.map((g) => (
        <option key={g.id} value={g.id} title={g.note}>
          {g.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rating-screen">
      <div className="rating-apparatus">
        {(Object.keys(APPARATUS) as ApparatusKey[]).map((k) => (
          <button key={k} className={k === apparatus ? "io-btn is-active" : "io-btn"} onClick={() => setApparatus(k)}>
            {APPARATUS[k].name}
          </button>
        ))}
      </div>
      <div>
        <p className="note">
          実施できる技・シリーズを好きなだけ入力すると、重複を畳んだ評価値の上位{RATING_ADOPT_COUNT}個の合計を出します
          （評価値＝（ルール難度点＋上乗せ）×確度＋ルールの加点×確度。加点は技術・手具操作・二つ投げの徒手動作で、
          選択中の手具で数えます。採点には影響しません）。E難度を超える評価は、技そのものがF・Gか、
          C以上だけの連続のうち上位2技の組み合わせが高いとき、または上乗せで認めます。同じ宙返りの連続は3つまで数えます。
        </p>

        <div className="rating-total">
          <div>
            <strong>{fmt(result.total)}</strong> レーティング
          </div>
          <div>ルールのみ（E超え・上乗せなし）{fmt(result.ruleTotal)}</div>
          <div>試合で実施できる（A）だけ {fmt(result.matchTotal)}</div>
        </div>

        <div className="rating-list">
          {entries.map((e, i) => (
            <button key={i} className={i === curIdx ? "io-btn is-active" : "io-btn"} onClick={() => setSel(i)}>
              {e.name || `入力${i + 1}`}（{e.grade}）
            </button>
          ))}
          <button className="io-btn" onClick={add}>
            <Plus size={14} /> 追加
          </button>
        </div>

        {cur && (
          <div className="rating-edit">
            <div className="rating-fields">
              <input
                placeholder="名前（任意）"
                value={cur.name ?? ""}
                onChange={(e) => patch(curIdx, { name: e.target.value || undefined })}
              />
              <label>
                技・シリーズ {gradeSelect(cur.grade, (g) => patch(curIdx, { grade: g }))}
              </label>
              <label>
                投げ{" "}
                {gradeSelect(cur.throwGrade ?? cur.grade, (g) =>
                  patch(curIdx, { throwGrade: g === cur.grade ? undefined : g }),
                )}
              </label>
              <label>
                上乗せ
                <select value={cur.boost ?? 0} onChange={(e) => patch(curIdx, { boost: clampBoost(e.target.value) })}>
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
            <SeriesListEditor
              series={[cur.series]}
              apparatus={apparatus}
              junior={false}
              future={"G"}
              allowAdd={false}
              showExec={false}
              autoInputEnabled={false}
              onChange={(next: Series[]) => patch(curIdx, { series: next[0] ?? emptySeries() })}
            />
          </div>
        )}

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
                  {c.label}
                  {c.part && `（投げタンの${c.part === "throw" ? "投げ" : "タンブリング"}）`}
                </td>
                <td>
                  {c.ruleDiff}
                  {c.ratedDiff !== c.ruleDiff && ` → ${c.ratedDiff}（${c.raise === "skill" ? "技そのもの" : "質の高い連続"}）`}
                  {c.boost > 0 && ` +${c.boost}段`}
                  {c.bonus > 0 && ` ＋加点${c.bonus.toFixed(1)}`}
                </td>
                <td>
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
    </div>
  );
}
