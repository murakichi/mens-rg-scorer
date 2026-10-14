import { useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { SKILL_CATEGORY_ORDER, skillDifficulty } from "../scoring/constants";
import {
  SKILL_WEIGHT_DEFAULT,
  SKILL_WEIGHT_MAX,
  SKILL_WEIGHT_MIN,
  SKILL_WEIGHT_STEP,
  changedSkillCount,
  resetSkillWeight,
  resetSkillWeights,
  setSkillWeight,
  userSkillWeight,
  weightableSkills,
  type SkillWeightStore,
} from "../scoring/skillWeights";
import type { FutureLevel } from "../scoring/types";

interface Props {
  open: boolean;
  store: SkillWeightStore;
  junior: boolean;
  future: FutureLevel;
  onChange: (store: SkillWeightStore) => void;
  onClose: () => void;
}

/**
 * 技ごとの「選ばれやすさ」をユーザーが決める画面。
 * 既定（実測どおり＝1）からの**倍率**だけを持つので、リセットは保存した分を捨てるだけ。
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
            ランダム生成でその技が選ばれる<b>倍率</b>です（1＝実際の演技での多さどおり、0＝使わない）。
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
            <button className="io-btn" onClick={() => onChange(resetSkillWeights())} disabled={changed === 0}>
              <RotateCcw size={14} /> すべて既定に戻す{changed > 0 ? `（${changed}件）` : ""}
            </button>
          </div>

          {groups.map((g) => (
            <div key={g.category}>
              <div className="line-head">{g.category}</div>
              {g.list.map((s) => {
                const w = userSkillWeight(store, s.id);
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
                      min={SKILL_WEIGHT_MIN}
                      max={SKILL_WEIGHT_MAX}
                      step={SKILL_WEIGHT_STEP}
                      value={w}
                      onChange={(e) => onChange(setSkillWeight(store, s.id, parseFloat(e.target.value)))}
                      aria-label={`${s.name}の出やすさ`}
                    />
                    <span className={w === SKILL_WEIGHT_DEFAULT ? "weight-value" : "weight-value is-changed"}>
                      ×{w.toFixed(1)}
                    </span>
                    <button
                      className="remove-btn-xs"
                      onClick={() => onChange(resetSkillWeight(store, s.id))}
                      disabled={w === SKILL_WEIGHT_DEFAULT}
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
