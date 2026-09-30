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
  jumps: RopeJumpItem[];
  rows: RopeJumpRow[];
  onChange: (next: RopeJumpItem[]) => void;
}

/**
 * ロープの跳びリスト（徒手・構成タブ）。跳び1つごとに難度を評価し、続けて並べたものが
 * 連続した跳びになる。跳んだ回数とクロスの有無は入力で、難度は §3.5.5.3 の表から引く。
 */
export function RopeJumpList({ jumps, rows, onChange }: Props) {
  const update = (i: number, patch: Partial<RopeJumpItem>) =>
    onChange(jumps.map((item, k) => (k === i ? { ...item, ...patch } : item)));

  return (
    <section className="card">
      <div className="line-head">ロープ跳び</div>
      {jumps.map((item, i) => {
        // 旧データ（クロス・回数を id に含んでいた）も、今の表現に直して表示する
        const r = resolveRopeJump(item);
        const cross = r?.cross ?? false;
        const count = r?.count ?? ropeJumpTimes(item.count);
        // 編集のたびに、解決した値ごと書き戻す（旧 id はここで今の表現に置き換わる）
        const edit = (patch: Partial<RopeJumpItem>) =>
          update(i, { jumpId: r?.def.id ?? item.jumpId, cross, count, ...patch });
        const row = rows.find((x) => x.index === i);
        return (
          <div key={i} className="basic-hand-row">
            <select
              className="select"
              value={r?.def.id ?? ""}
              aria-label={`ロープ跳び ${i + 1}`}
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
              onClick={() => onChange(jumps.filter((_, k) => k !== i))}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        className="add-btn"
        onClick={() => onChange([...jumps, { kind: "ropeJump", jumpId: "", isMoving6m: false }])}
      >
        <Plus size={14} /> 跳びを追加
      </button>
      <p className="hint">
        実施した跳びを、<b>続けて跳んだ順に</b>並べます。跳んだ回数（3重跳び2回・3回以上の連続、4重跳びの連続2回以上は
        回数で難度が変わります）とクロスの有無を入れると、跳びごとに難度が決まり、
        <b>難度（D）に入ります</b>（投げ受けの徒手と合わせて上位3つ。同じ跳びは何度実施しても1回だけ）。
        6m以上移動・その場の前回し／後ろ回しの連続は、隣り合って並べた跳びの回数の合計で判定します
        （間に別の跳びを挟むと途切れます）。
      </p>
    </section>
  );
}
