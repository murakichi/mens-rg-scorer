import { useMemo } from "react";
import { X, Lightbulb } from "lucide-react";
import {
  DEFAULT_SUGGESTION_LIMIT,
  SUGGESTION_KIND_NAMES,
  suggestImprovements,
  type Suggestion,
} from "../scoring/suggest";
import type { ApparatusKey, FutureLevel, Series } from "../scoring/types";

interface Props {
  open: boolean;
  series: Series[];
  apparatus: ApparatusKey;
  junior: boolean;
  /** 十年後モードの上限難度（null＝OFF） */
  future?: FutureLevel;
  /**
   * 採点画面で入力済みのA側の減点。これを渡さないと A残点 の基準がずれる
   * （とくに減点が10点に達していると、実際には増えない分を「上がる」と出してしまう）。
   */
  apparatusElements: string[];
  violations: string[];
  artDeductions: Record<string, number>;
  onClose: () => void;
}

const signed = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/** 「あと0.1上げる1手」を並べるダイアログ。表示だけで、構成は変更しない。 */
export function SuggestModal({
  open,
  series,
  apparatus,
  junior,
  future = null,
  apparatusElements,
  violations,
  artDeductions,
  onClose,
}: Props) {
  // 開いている間だけ計算する（候補ごとに computeScore を回すので閉じているときは走らせない）
  const list = useMemo<Suggestion[]>(
    () =>
      open
        ? suggestImprovements(series, apparatus, {
            junior,
            future,
            apparatusElements,
            violations,
            artDeductions,
          })
        : [],
    [open, series, apparatus, junior, future, apparatusElements, violations, artDeductions],
  );
  if (!open) return null;

  const jump = (seriesIndex: number) => {
    onClose();
    // モーダルが閉じてから移動する
    requestAnimationFrame(() =>
      document.getElementById(`series-${seriesIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            <Lightbulb size={15} /> 改善提案
          </span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="gen-body">
          {list.length === 0 ? (
            <p className="hint">
              1手だけ変えて点数が上がる候補は見つかりませんでした。
              シリーズを足す・投げを増やすなど、構成そのものを変える必要があります。
            </p>
          ) : (
            <>
              <p className="hint">
                今の構成を<b>1手だけ</b>変えた候補を、効果の大きい順に{DEFAULT_SUGGESTION_LIMIT}件まで出します。
                D（難度点＋加点）と A残点 の増減で、E（実施減点）は審判が付けるものなので含みません。
                <b>提案を選んでも構成は変わりません</b> — 内容を見て、自分で入力してください。
              </p>
              <div className="suggest-list">
                {list.map((s) => (
                  <div key={s.id} className="suggest-row">
                    <span className="suggest-kind">{SUGGESTION_KIND_NAMES[s.kind]}</span>
                    <span className="suggest-label">{s.label}</span>
                    <span className="suggest-delta">
                      <b>合計 {signed(s.totalDelta)}</b>
                      <span className="suggest-delta-sub">
                        D {signed(s.dDelta)}／A {signed(s.aDelta)}
                      </span>
                    </span>
                    <button className="io-btn" onClick={() => jump(s.seriesIndex)}>
                      シリーズ{s.seriesIndex + 1}へ
                    </button>
                  </div>
                ))}
              </div>
            </>
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
