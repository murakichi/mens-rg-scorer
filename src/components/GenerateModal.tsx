import { useState } from "react";
import { X, Shuffle } from "lucide-react";
import { APPARATUS } from "../scoring/constants";
import {
  DEFAULT_MAX_AUTO_THROWS,
  DEFAULT_MAX_AUTO_TUMBLINGS,
  generateForApparatus,
  usableTemplates,
  type GenerateResult,
} from "../scoring/generate";
import { apparatusName, describeSeries, type SeriesTemplate } from "../scoring/templates";
import type { ApparatusKey } from "../scoring/types";

interface Props {
  open: boolean;
  /** シリーズテンプレート（構成テンプレートは使わない） */
  templates: SeriesTemplate[];
  /** 採点画面で選択中の手具（既定値） */
  apparatus: ApparatusKey;
  junior: boolean;
  onClose: () => void;
  onApply: (apparatus: ApparatusKey, result: GenerateResult) => void;
}

/** テンプレートから演技構成をランダムに組み立てるダイアログ */
export function GenerateModal({ open, templates, apparatus, junior, onClose, onApply }: Props) {
  const [target, setTarget] = useState<ApparatusKey | "">(apparatus);
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [autoThrows, setAutoThrows] = useState(true);
  const [autoTumblings, setAutoTumblings] = useState(true);
  const [result, setResult] = useState<(GenerateResult & { apparatus: ApparatusKey }) | null>(null);
  const [note, setNote] = useState("");
  if (!open) return null;

  const usable = target ? usableTemplates(templates, target).length : templates.length;

  const run = () => {
    const r = generateForApparatus(templates, {
      apparatus: target || null,
      junior,
      autoThrows,
      autoTumblings,
      minScore: minScore ? parseFloat(minScore) : null,
      maxScore: maxScore ? parseFloat(maxScore) : null,
    });
    setResult(r);
    setNote(
      r
        ? ""
        : "組める候補がありません（自動生成をオンにするか、シリーズテンプレートを登録してください）。",
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>ランダム生成</span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="gen-body">
          <div className="line-head">手具</div>
          <div className="app-wrap">
            <button className={target === "" ? "app-btn is-active" : "app-btn"} onClick={() => setTarget("")}>
              指定なし
            </button>
            {(Object.entries(APPARATUS) as [ApparatusKey, { name: string }][]).map(([k, v]) => (
              <button key={k} className={k === target ? "app-btn is-active" : "app-btn"} onClick={() => setTarget(k)}>
                {v.name}
              </button>
            ))}
          </div>
          <p className="hint">
            指定した手具のテンプレートと「共通」テンプレートから選びます（使えるテンプレート {usable} 件）。
            指定なしのときは全手具で組んで、いちばん良かったものを出します。
          </p>

          <div className="line-head">自動生成で補う</div>
          <label className="check">
            <input type="checkbox" checked={autoThrows} onChange={(e) => setAutoThrows(e.target.checked)} />
            投げシリーズ（最大{DEFAULT_MAX_AUTO_THROWS}本）
          </label>
          <label className="check">
            <input type="checkbox" checked={autoTumblings} onChange={(e) => setAutoTumblings(e.target.checked)} />
            タンブリング（最大{DEFAULT_MAX_AUTO_TUMBLINGS}本）
          </label>
          <p className="hint">
            テンプレートを先に使い、足りないところをシステム側で組んだシリーズで補います（点数が上がらなければ使われません）。
            投げは 投げ→シェネ→前転→キャッチ などの形を、投げ方（左手投げ・二つ投げ・視野外・手以外…）と
            受け方（クラブ・リングは手具で押さえつけてキャッチも）、シェネの手を変えて組みます。
            タンブリングは<b>テンプレートに出てくる技だけ</b>を使い、入力画面と同じ制約
            （後方系はロンダートから入る、ロンダート・バク転の直後は後方系）で並べます。
            テンプレートが1つも無いときは技の一覧から組みます。
          </p>

          <div className="line-head">Dスコアの範囲</div>
          <div className="tpl-range">
            <input
              className="tpl-range-input"
              type="number"
              step="0.1"
              min="0"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="下限"
            />
            〜
            <input
              className="tpl-range-input"
              type="number"
              step="0.1"
              min="0"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              placeholder="上限"
            />
          </div>
          <p className="hint">
            未指定なら最大を目指します。必須要素をできるだけ満たし、評価されない要素（4本目のタンブリング、
            ジュニアの6回目以降の投げ、重複するシリーズなど）は入れません。
            範囲を指定したときは、自動生成の量（シェネの回数・宙返りの本数）も増減して範囲に合わせます。
          </p>

          <button className="add-btn" onClick={run}>
            <Shuffle size={14} /> 生成する
          </button>

          {note && <div className="warn-box">{note}</div>}

          {result && (
            <div className="gen-result">
              <div className="line-head">
                生成結果（{apparatusName(result.apparatus)}・{result.series.length}シリーズ）
                <span className="diff-badge">
                  D {result.dScore.toFixed(1)}／A残 {result.aScore.toFixed(1)}
                </span>
              </div>
              <ol className="gen-list">
                {result.series.map((ser, i) => (
                  <li key={i}>
                    <b>{result.used[i]?.name}</b>
                    {result.used[i]?.auto && <span className="tag">自動</span>}
                    <span className="gen-list-detail">{describeSeries(ser)}</span>
                  </li>
                ))}
              </ol>
              {result.missing.length > 0 ? (
                <div className="missing-box">満たせなかった必須要素：{result.missing.join("・")}</div>
              ) : (
                <div className="ok-text">必須要素はすべて満たしています</div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {result && (
            <>
              <button className="io-btn" onClick={run}>
                もう一度生成
              </button>
              <button className="io-btn" onClick={() => onApply(result.apparatus, result)}>
                採点画面に反映
              </button>
            </>
          )}
          <button className="io-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
