import { useMemo, useState } from "react";
import { X, GitCompare } from "lucide-react";
import { computeScore } from "../scoring/score";
import { parseRoutineText, type IndividualDraft } from "../scoring/draft";
import { apparatusName, loadTemplates } from "../scoring/templates";
import { APPARATUS } from "../scoring/constants";
import { compareScores, type CompareRow } from "./compare";
import { useNarrow } from "./useNarrow";
import type { ApparatusKey, Series } from "../scoring/types";

interface Props {
  open: boolean;
  /** 左側＝いま編集している構成 */
  series: Series[];
  apparatus: ApparatusKey;
  junior: boolean;
  onClose: () => void;
}

/** 差を「+0.3」「−0.2」「±0」で出す。`better` は増えたほうが良いか。 */
function Delta({ value, better = true }: { value: number; better?: boolean }) {
  const cls = value === 0 ? "cmp-same" : (value > 0) === better ? "cmp-up" : "cmp-down";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return (
    <span className={`cmp-delta ${cls}`}>
      {sign}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}

function Rows({ rows, better, negate }: { rows: CompareRow[]; better: boolean; negate?: boolean }) {
  if (rows.length === 0) return <p className="hint">差はありません。</p>;
  const show = (n: number) => `${negate ? "-" : ""}${n.toFixed(1)}`;
  return (
    <div className="cmp-rows">
      {rows.map((r) => (
        <div key={r.label} className={r.delta === 0 ? "cmp-row" : "cmp-row is-diff"}>
          <span className="cmp-label">{r.label}</span>
          <span className="cmp-val">{show(r.left)}</span>
          <span className="cmp-val">{show(r.right)}</span>
          <Delta value={r.delta} better={better} />
        </div>
      ))}
    </div>
  );
}

/**
 * いまの構成と、もう1つの構成を並べて差を見る（#70）。
 * 採点はしない — `computeScore` を2回呼んで引き算するだけ。
 * シリーズ単位の対応づけはしない（順序が変わると破綻するため）。
 */
export function CompareModal({ open, series, apparatus, junior, onClose }: Props) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<IndividualDraft | null>(null);
  const [note, setNote] = useState("");
  const narrow = useNarrow();
  // 構成テンプレートは開いたときに読む（localStorage なので毎回でよい）
  const routines = useMemo(() => (open ? loadTemplates().routines : []), [open]);

  const left = useMemo(
    () => (open ? computeScore(series, apparatus, { junior }) : null),
    [open, series, apparatus, junior],
  );
  const right = useMemo(
    () => (picked ? computeScore(picked.series, picked.apparatus, { junior: picked.junior }) : null),
    [picked],
  );
  const diff = useMemo(() => (left && right ? compareScores(left, right) : null), [left, right]);

  if (!open) return null;

  const applyText = () => {
    const d = parseRoutineText(text);
    if (!d) {
      setNote("共有URL か、エクスポートしたJSONを貼り付けてください（構成が読み取れませんでした）。");
      return;
    }
    setPicked(d);
    setNote("");
  };

  const pickRoutine = (id: string) => {
    const t = routines.find((x) => x.id === id);
    if (!t) return;
    // 構成テンプレートは手具を持つ（共通テンプレートは今の手具で採点する）
    const ap = t.apparatus in APPARATUS ? (t.apparatus as ApparatusKey) : apparatus;
    setPicked({
      version: 1,
      apparatus: ap,
      junior,
      series: t.series,
      executionDeduction: 0,
      apparatusElements: [],
      violations: [],
      artDeductions: {},
      basicHands: [],
      handOps: [],
      offBodyCount: 0,
      handElements: [],
      future: null,
      ropeJumps: [],
    } as IndividualDraft);
    setNote("");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            <GitCompare size={15} /> 構成を比べる
          </span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="gen-body">
          <p className="hint">
            いま編集している構成（左）と、もう1つの構成（右）の差を出します。
            <b>シリーズ単位の対応づけはしません</b> — 並び替えると破綻するので、集計の差だけを見ます。
            E残点は審判が付けるものなので、構成の比較では参考値です。
          </p>

          <div className="line-head">比べる相手</div>
          {routines.length > 0 && (
            <select className="select" defaultValue="" onChange={(e) => pickRoutine(e.target.value)}>
              <option value="">構成テンプレートから選ぶ…</option>
              {routines.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{apparatusName(t.apparatus)}・{t.series.length}シリーズ）
                </option>
              ))}
            </select>
          )}
          <textarea
            className="modal-textarea"
            rows={3}
            placeholder="共有URL、またはエクスポートしたJSONを貼り付け"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="io-wrap">
            <button className="io-btn" onClick={applyText} disabled={!text.trim()}>
              読み込んで比べる
            </button>
          </div>
          {note && <div className="warn-box">{note}</div>}

          {diff && right && picked && (
            <div className={narrow ? "cmp-body is-narrow" : "cmp-body"}>
              <div className="cmp-head">
                <span className="cmp-label" />
                <span className="cmp-val">左：いまの構成（{APPARATUS[apparatus].name}）</span>
                <span className="cmp-val">右：{APPARATUS[picked.apparatus].name}</span>
                <span className="cmp-delta">差</span>
              </div>

              <div className="line-head">合計</div>
              <Rows rows={diff.totals} better />

              <div className="line-head">D（難度）の内訳</div>
              <Rows rows={diff.d} better />

              <div className="line-head">A（減点）の内訳</div>
              <p className="hint">減点なので、右のほうが小さいほど良いです。</p>
              <Rows rows={diff.a} better={false} negate />

              <div className="line-head">必須要素（片方だけ満たしているもの）</div>
              {diff.required.length === 0 ? (
                <p className="hint">充足状況は同じです。</p>
              ) : (
                <div className="cmp-rows">
                  {diff.required.map((r) => (
                    <div key={r.key} className="cmp-row is-diff">
                      <span className="cmp-label">{r.label}</span>
                      <span className="cmp-val">{r.leftPassed === false ? "×" : r.leftPassed === null ? "?" : "✓"}</span>
                      <span className="cmp-val">
                        {r.rightPassed === false ? "×" : r.rightPassed === null ? "?" : "✓"}
                      </span>
                      <span className="cmp-delta" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="io-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
