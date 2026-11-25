import { useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { SKILL_CATEGORY_ORDER, skillDifficulty } from "../scoring/constants";
import {
  SKILL_VALUE_MAX,
  SKILL_VALUE_MIN,
  SKILL_VALUE_STEP,
  changedSkillCount,
  defaultSkillPickValue,
  setSkillValue,
  skillValue,
  weightableSkills,
  type SkillValueStore,
} from "../scoring/skillWeights";
import type { FutureLevel } from "../scoring/types";

interface Props {
  open: boolean;
  store: SkillValueStore;
  junior: boolean;
  future: FutureLevel;
  onChange: (store: SkillValueStore) => void;
  onClose: () => void;
}

/**
 * 技ごとの「選ばれやすさ」をユーザーが決める画面。
 * 倍率ではなく**その技の出やすさの値そのもの**（用意済みの値＝`defaultSkillPickValue`）を見せて変える。
 * 用意済みの値から変えた技だけを持つので、リセットは保存した分を捨てるだけ。
 * 採点には影響せず、ランダム生成の候補づくりにだけ効く。
 */
export default function SkillWeightModal({ open, store, junior, future, onChange, onClose }: Props) {
  const [filter, setFilter] = useState("");
  if (!open) return null;

  const changed = changedSkillCount(store);
  const skills = weightableSkills().filter(
    (s) => !filter || s.name.includes(filter) || s.id.includes(filter),
  );
  const groups = SKILL_CATEGORY_ORDER.map((category) => ({
    category,
    list: skills.filter((s) => s.category === category),
  })).filter((g) => g.list.length > 0);

  return (
    <div className="modal-overlay is-nested" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>技ごとの出やすさ</span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="gen-body">
          <p className="hint">
            ランダム生成でその技が選ばれる<b>出やすさの値</b>です。初めは実際の演技での多さどおりの値（既定）が入っています。
            値どうしの比で選ばれやすさが決まり、0にするとその技は使いません。難度（D以上は少なめ）や位置（後方伸身のあとのきりもみなど）による重みは、この値にさらに掛かります。
            採点には影響しません。変更した技だけが端末に保存されます。
          </p>
          <div className="weight-head">
            <input
              className="tpl-search-input"
              type="text"
              value={filter}
              placeholder="技名で絞り込み"
              onChange={(e) => setFilter(e.target.value)}
            />
            <button className="io-btn" onClick={() => onChange({})} disabled={changed === 0}>
              <RotateCcw size={14} /> すべて既定に戻す{changed > 0 ? `（${changed}件）` : ""}
            </button>
          </div>

          {groups.map((g) => (
            <div key={g.category}>
              <div className="line-head">{g.category}</div>
              {g.list.map((s) => {
                const v = skillValue(store, s.id);
                const def = defaultSkillPickValue(s.id);
                const changedOne = v !== def;
                const d = skillDifficulty(s.id, junior, future);
                return (
                  <div key={s.id} className="weight-row">
                    <span className="weight-name">
                      {s.name}
                      {d ? `（${d}）` : ""}
                    </span>
                    <input
                      className="gen-ratio-range"
                      type="range"
                      min={SKILL_VALUE_MIN}
                      max={SKILL_VALUE_MAX}
                      step={SKILL_VALUE_STEP}
                      value={v}
                      onChange={(e) => onChange(setSkillValue(store, s.id, parseFloat(e.target.value)))}
                      aria-label={`${s.name}の出やすさ`}
                    />
                    <input
                      className={changedOne ? "weight-value weight-input is-changed" : "weight-value weight-input"}
                      type="number"
                      min={SKILL_VALUE_MIN}
                      max={SKILL_VALUE_MAX}
                      step={SKILL_VALUE_STEP}
                      value={v}
                      title={`既定 ${def.toFixed(2)}`}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n)) onChange(setSkillValue(store, s.id, n));
                      }}
                      aria-label={`${s.name}の出やすさの値`}
                    />
                    <span className="weight-default">既定 {def.toFixed(2)}</span>
                    <button
                      className="remove-btn-xs"
                      onClick={() => onChange(setSkillValue(store, s.id, def))}
                      disabled={!changedOne}
                      aria-label={`${s.name}を既定に戻す`}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
