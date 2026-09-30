import { Plus, X } from "lucide-react";
import {
  ROPE_JUMPS,
  resolveRopeJump,
  ropeJumpDifficulty,
  ropeJumpHasCross,
  ropeJumpTimes,
} from "../scoring/constants";
import type { RopeJumpRow } from "../scoring/score";
import type { RopeJumpItem } from "../scoring/types";

interface Props {
  /** 跳びシリーズ（要所ごとの実施）。同じシリーズで隣り合う跳びが連続した跳び */
  series: RopeJumpItem[][];
  rows: RopeJumpRow[];
  onChange: (next: RopeJumpItem[][]) => void;
}

/**
 * ロープの跳び（徒手・構成タブ）。演技の要所ごとに跳びシリーズを分けて入力し、跳び1つごとに
 * 難度を評価する。跳んだ回数とクロスの有無は入力で、難度は §3.5.5.3 の表から引く。
 */
export function RopeJumpList({ series, rows, onChange }: Props) {
  const updateSeries = (g: number, next: RopeJumpItem[]) => onChange(series.map((jumps, k) => (k === g ? next : jumps)));

  return (
    <section className="card">
      <div className="line-head">ロープ跳び</div>
      {series.map((jumps, g) => (
        <div key={g} className="rope-series">
          <div className="rope-series-head">
            <span>跳びシリーズ {g + 1}</span>
            <button
              className="remove-btn-xs"
              aria-label={`跳びシリーズ ${g + 1} を削除`}
              onClick={() => onChange(series.filter((_, k) => k !== g))}
            >
              <X size={12} />
            </button>
          </div>
          {jumps.map((item, i) => {
            // 旧データ（クロス・回数を id に含んでいた）も、今の表現に直して表示する
            const r = resolveRopeJump(item);
            const cross = r?.cross ?? false;
            const count = r?.count ?? ropeJumpTimes(item.count);
            // 編集のたびに、解決した値ごと書き戻す（旧 id はここで今の表現に置き換わる）
            const edit = (patch: Partial<RopeJumpItem>) =>
              updateSeries(
                g,
                jumps.map((x, k) => (k === i ? { ...x, jumpId: r?.def.id ?? item.jumpId, cross, count, ...patch } : x)),
              );
            const row = rows.find((x) => x.group === g && x.index === i);
            return (
              <div key={i} className="basic-hand-row">
                <select
                  className="select"
                  value={r?.def.id ?? ""}
                  aria-label={`跳びシリーズ ${g + 1} の跳び ${i + 1}`}
                  onChange={(e) => edit({ jumpId: e.target.value })}
                >
                  <option value="">ロープ跳び</option>
                  {ROPE_JUMPS.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
                {r && (
                  <label className="motion-count">
                    ×
                    <input
                      className="count-input"
                      type="number"
                      min="0"
                      step="1"
                      // 0回は空欄で表示する（バックスペースで消してそのまま入力し直せる）
                      value={count === 0 ? "" : count}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        edit({ count: Number.isNaN(n) ? 0 : Math.max(0, n) });
                      }}
                    />
                    回
                  </label>
                )}
                {r && ropeJumpHasCross(r.def.rotations) && (
                  <label className="check">
                    <input type="checkbox" checked={cross} onChange={(e) => edit({ cross: e.target.checked })} />
                    クロス
                  </label>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={item.isMoving6m || false}
                    onChange={(e) => edit({ isMoving6m: e.target.checked })}
                  />
                  6m以上移動
                </label>
                {r && count > 0 && row && (
                  <span className={row.inTop ? "check-ok" : "check-ng"}>
                    難度{ropeJumpDifficulty(r)}
                    {row.inTop
                      ? `（+${row.score.toFixed(1)}）`
                      : row.duplicate
                        ? "（同じ跳びは1回のみ）"
                        : "（上位3つ外）"}
                  </span>
                )}
                <button
                  className="remove-btn-xs"
                  aria-label="削除"
                  onClick={() => updateSeries(g, jumps.filter((_, k) => k !== i))}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            className="add-btn"
            onClick={() => updateSeries(g, [...jumps, { kind: "ropeJump", jumpId: "", isMoving6m: false }])}
          >
            <Plus size={14} /> 跳びを追加
          </button>
        </div>
      ))}
      <button
        className="add-btn"
        onClick={() => onChange([...series, [{ kind: "ropeJump", jumpId: "", isMoving6m: false }]])}
      >
        <Plus size={14} /> 跳びシリーズを追加
      </button>
      <p className="hint">
        演技の要所ごとに<b>跳びシリーズ</b>を分けて、実施した跳びを<b>続けて跳んだ順に</b>並べます。
        跳んだ回数（3重跳び2回・3回以上の連続、4重跳びの連続2回以上は回数で難度が変わります）とクロスの有無を
        入れると、跳びごとに難度が決まり、<b>難度（D）に入ります</b>
        （投げ受けの徒手と合わせて上位3つ。同じ跳びは何度実施しても1回だけ）。
        6m以上移動・その場の前回し／後ろ回しの連続は、<b>同じ跳びシリーズの中で</b>隣り合う跳びの回数の合計で
        判定します（シリーズが分かれていれば別々の実施で、つながりません）。
      </p>
    </section>
  );
}
