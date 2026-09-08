import { Trash2, X } from "lucide-react";
import {
  THROW_OPTIONS_COMMON,
  THROW_OPTIONS_APPARATUS,
  SKILL_THROW_OPTIONS_COMMON,
  CATCH_OPTIONS_COMMON,
  CATCH_OPTIONS_APPARATUS,
  REQUIRED_THROW_OPTIONS,
  APPARATUS_USE,
  SKILL_LIST,
  skillDifficulty,
  hasTwoThrow,
  MOTION_OPTIONS,
  legacyMotionDef,
  ROPE_JUMPS,
} from "../scoring/constants";
import { checkApparatusFlow, maxSaltoChain } from "../scoring/analysis";
import type { ApparatusKey, Item, Series, SeriesAnalysis } from "../scoring/types";
import type { SeriesBreakdown } from "../scoring/score";

type ItemKind = Item["kind"];

interface Props {
  series: Series;
  sIdx: number;
  apparatus: ApparatusKey;
  /** ジュニア適用規則で採点中か（技の難度表示に反映） */
  junior: boolean;
  analysis: SeriesAnalysis;
  /** analysis.units と同じ並びで、そのユニットが難度点に採用されたか */
  unitAdopted: boolean[];
  breakdown: SeriesBreakdown;
  /** 採点上の重複扱いか（「重複ではない」チェックで解除された場合 false） */
  isDup: boolean;
  /** 構成が既出のシリーズと一致したか（解除チェックの表示条件） */
  isDupSignature: boolean;
  canRemove: boolean;
  onUpdateField: (patch: Partial<Series>) => void;
  onAddItem: (kind: ItemKind) => void;
  onUpdateItem: (iIdx: number, patch: Partial<Item>) => void;
  onRemoveItem: (iIdx: number) => void;
  onRemoveSeries: () => void;
}

/** 配列トグル用ヘルパ：id を含めば除去、なければ追加 */
function toggle(list: string[] | undefined, id: string, checked: boolean): string[] {
  const cur = list || [];
  return checked ? [...cur, id] : cur.filter((x) => x !== id);
}

function ItemEditor({
  item,
  apparatus,
  junior,
  onUpdate,
}: {
  item: Item;
  apparatus: ApparatusKey;
  junior: boolean;
  onUpdate: (patch: Partial<Item>) => void;
}) {
  if (item.kind === "throw") {
    return (
      <>
        <div className="throw-tag">投げ</div>
        {[...THROW_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? THROW_OPTIONS_APPARATUS : [])].map((opt) => (
          <label key={opt.id} className="check">
            <input
              type="checkbox"
              checked={(item.throwTypes || []).includes(opt.id)}
              onChange={(e) => onUpdate({ throwTypes: toggle(item.throwTypes, opt.id, e.target.checked) })}
            />
            {opt.name}
          </label>
        ))}
        {REQUIRED_THROW_OPTIONS[apparatus].map((opt) => (
          <label key={opt.id} className="check-req">
            <input
              type="checkbox"
              checked={(item.reqTypes || []).includes(opt.id)}
              onChange={(e) => onUpdate({ reqTypes: toggle(item.reqTypes, opt.id, e.target.checked) })}
            />
            {opt.name}
          </label>
        ))}
      </>
    );
  }
  if (item.kind === "catch") {
    return (
      <>
        <div className="catch-tag">キャッチ</div>
        {[...CATCH_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? CATCH_OPTIONS_APPARATUS : [])].map((opt) => (
          <label key={opt.id} className="check">
            <input
              type="checkbox"
              checked={(item.catchTypes || []).includes(opt.id)}
              onChange={(e) => onUpdate({ catchTypes: toggle(item.catchTypes, opt.id, e.target.checked) })}
            />
            {opt.name}
          </label>
        ))}
        {APPARATUS_USE[apparatus] && (
          <label className="check-req">
            <input
              type="checkbox"
              checked={item.catchTwo || false}
              onChange={(e) => onUpdate({ catchTwo: e.target.checked })}
            />
            2つ同時キャッチ
          </label>
        )}
      </>
    );
  }
  if (item.kind === "skill") {
    return (
      <>
        <div className="sel-wrap">
          <select
            className="select"
            value={item.skillId}
            onChange={(e) => onUpdate({ skillId: e.target.value })}
          >
            <option value="">タンブリング技</option>
            {SKILL_LIST.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{skillDifficulty(s.id, junior)}）
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={item.hasApparatus || false}
            onChange={(e) => onUpdate({ hasApparatus: e.target.checked })}
          />
          手具操作
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={item.isThrow || false}
            onChange={(e) =>
              onUpdate(e.target.checked ? { isThrow: true } : { isThrow: false, throwTypes: [] })
            }
          />
          この技の最中に投げ
        </label>
        {item.isThrow &&
          [...SKILL_THROW_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? THROW_OPTIONS_APPARATUS : [])].map(
            (opt) => (
              <label key={opt.id} className="check">
                <input
                  type="checkbox"
                  checked={(item.throwTypes || []).includes(opt.id)}
                  onChange={(e) => onUpdate({ throwTypes: toggle(item.throwTypes, opt.id, e.target.checked) })}
                />
                {opt.name}
              </label>
            ),
          )}
      </>
    );
  }
  if (item.kind === "ropeJump") {
    return (
      <>
        <select className="select" value={item.jumpId} onChange={(e) => onUpdate({ jumpId: e.target.value })}>
          <option value="">ロープ跳び</option>
          {ROPE_JUMPS.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}（{j.difficulty}）
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={item.isMoving6m || false}
            onChange={(e) => onUpdate({ isMoving6m: e.target.checked })}
          />
          6m以上移動
        </label>
      </>
    );
  }
  // motion
  const motionOpt = MOTION_OPTIONS.find((m) => m.id === item.motionId);
  // 選択肢から外した旧項目（n動作）でも、読み込んだ構成では選択値として表示する
  const legacy = !motionOpt ? legacyMotionDef(item.motionId) : undefined;
  return (
    <>
      <select
        className="select"
        value={item.motionId}
        onChange={(e) => onUpdate({ motionId: e.target.value, hands: false })}
      >
        <option value="">徒手動作</option>
        {legacy && <option value={legacy.id}>{legacy.name}（旧）</option>}
        {MOTION_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {item.motionId && (
        <label className="motion-count">
          ×
          <input
            className="count-input"
            type="number"
            min="1"
            step="1"
            value={item.count ?? 1}
            onChange={(e) => onUpdate({ count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
          回
        </label>
      )}
      {motionOpt?.hasHandsOption && (
        <label className="check">
          <input
            type="checkbox"
            checked={item.hands || false}
            onChange={(e) => onUpdate({ hands: e.target.checked })}
          />
          手あり
        </label>
      )}
    </>
  );
}

export function SeriesCard({
  series: ser,
  sIdx,
  apparatus,
  junior,
  analysis: a,
  unitAdopted,
  breakdown: b,
  isDup,
  isDupSignature,
  canRemove,
  onUpdateField,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onRemoveSeries,
}: Props) {
  const seriesQualifies = a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus);
  const flowErrors = checkApparatusFlow(ser, apparatus);

  return (
    <section className="card">
      <div className="line-head">
        <span>
          シリーズ {sIdx + 1}
          {isDup ? "（重複：D・本数・投げ回数に不算入）" : isDupSignature ? "（重複扱いを解除中）" : ""}
        </span>
        {canRemove && (
          <button className="remove-btn-sm" onClick={onRemoveSeries}>
            <Trash2 size={13} /> 削除
          </button>
        )}
      </div>
      <label className="exec-label">
        実施減点(E)：
        <input
          className="exec-input"
          type="number"
          step="0.1"
          min="0"
          value={ser.executionDeduction || 0}
          onChange={(e) => onUpdateField({ executionDeduction: parseFloat(e.target.value) || 0 })}
        />
        点
      </label>
      {isDupSignature && (
        <div className="dup-override">
          <label className="check-req">
            <input
              type="checkbox"
              checked={ser.notDuplicate || false}
              onChange={(e) => onUpdateField({ notDuplicate: e.target.checked })}
            />
            前のシリーズと同じ構成だが、実際は別の内容（重複として扱わない）
          </label>
          <p className="hint">
            シェネで腕の使い方を変える、動作の内訳を変える（4シェネ→3シェネ＋前転 など）といった、
            入力項目に現れない違いがある場合にチェックします。チェックすると難度点・加点・本数・投げ回数に算入されます。
          </p>
        </div>
      )}
      <div className="skill-row">
        {ser.items.map((item, iIdx) => (
          <div key={iIdx} className="skill-block">
            <ItemEditor
              item={item}
              apparatus={apparatus}
              junior={junior}
              onUpdate={(patch) => onUpdateItem(iIdx, patch)}
            />
            <button className="remove-btn-xs" onClick={() => onRemoveItem(iIdx)} aria-label="削除">
              <X size={12} />
            </button>
            {iIdx < ser.items.length - 1 && <div className="arrow">→</div>}
          </div>
        ))}
      </div>
      <div className="add-row">
        <button className="add-btn-sm" onClick={() => onAddItem("throw")}>
          ＋ 投げ
        </button>
        <button className="add-btn-sm" onClick={() => onAddItem("skill")}>
          ＋ タンブリング技
        </button>
        <button className="add-btn-sm" onClick={() => onAddItem("motion")}>
          ＋ 徒手動作
        </button>
        {apparatus === "rope" && (
          <button className="add-btn-sm" onClick={() => onAddItem("ropeJump")}>
            ＋ ロープ跳び
          </button>
        )}
        <button className="add-btn-sm" onClick={() => onAddItem("catch")}>
          ＋ キャッチ
        </button>
      </div>
      {a.units.map((u, ui) => (
        <div key={ui} className="unit-result">
          {u.type === "tumbling"
            ? `タンブリング塊：難度 ${u.finalDiff}`
            : u.isThrow
              ? `投げ：難度 ${u.finalDiff}（${
                  u.isThrowTumbling ? "転回系としてカウント・投げタン" : "徒手系としてカウント"
                }｜難度は${u.diffFromHand ? "徒手系" : "転回系"}由来｜徒手${u.handDiff}/転回${
                  u.tumblingDiff ?? "—"
                }）`
              : `徒手：難度 ${u.finalDiff}（徒手系としてカウント）`}
          {`　／ 最大連続宙返り ${maxSaltoChain(u.skills.map((s) => s.skillId))} 回`}
          {!unitAdopted[ui] && <span className="unit-unadopted">難度不採用</span>}
        </div>
      ))}
      {a.units.some((_, ui) => !unitAdopted[ui]) && (
        <p className="hint">
          ※「難度不採用」は同じ内容の難度を既に数えているため難度点に算入しないという意味で、
          実施しなかった扱いにはなりません（技術加点・連続投げ加点・本数・投げ回数には算入されます）。
        </p>
      )}
      {seriesQualifies && <div className="bonus-note">連続投げ加点の対象（投げ2回以上＋D難度以上）</div>}
      {flowErrors.map((err, ei) => (
        <div key={ei} className="flow-error">
          ⚠ {err}
        </div>
      ))}
      <div className="series-breakdown">
        <div className="breakdown-title">シリーズの加点・減点</div>
        <div className="breakdown-row">
          <span>D：タンブリング難度点</span>
          <span>{b.tumDiff.toFixed(1)}</span>
        </div>
        {b.handRows.length === 0 ? (
          <div className="breakdown-row">
            <span>D：徒手難度点</span>
            <span>0.0</span>
          </div>
        ) : (
          b.handRows.map((row, ri) => {
            const counted = row.adopted && row.inTop;
            return (
              <div key={ri} className={counted ? "breakdown-row" : "breakdown-row is-excluded"}>
                <span>
                  D：徒手難度点（{row.label}・{row.diff}難度）
                  {!counted && (
                    <span className="excluded-note">
                      {row.adopted ? "上位3つ外" : "難度不採用"}
                    </span>
                  )}
                </span>
                <span className="excluded-value">{row.score.toFixed(1)}</span>
              </div>
            );
          })
        )}
        <div className="breakdown-row">
          <span>D：連続投げ加点</span>
          <span>{b.sBonus.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>D：技術加点</span>
          <span>{b.tech.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>D：手具操作加点</span>
          <span>{b.appOp.toFixed(1)}</span>
        </div>
        {hasTwoThrow(apparatus) && (
          <div className="breakdown-row">
            <span>D：二つ投げ4動作加点</span>
            <span>{b.twoMot.toFixed(1)}</span>
          </div>
        )}
        <div className="breakdown-row">
          <span>A：手具操作不足減点</span>
          <span>-{b.noApp.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>E：実施減点</span>
          <span>-{b.exec.toFixed(1)}</span>
        </div>
        <div className="breakdown-total">
          <span>D寄与</span>
          <span>{b.dPart.toFixed(1)} 点</span>
        </div>
        {isDup && (
          <p className="hint">※重複シリーズのため、難度点・加点ともにDに不算入（本数・投げ回数にも不算入）</p>
        )}
        {!isDup && isDupSignature && (
          <p className="hint">※同一構成ですが「別の内容」として重複扱いを解除中（通常のシリーズとして算入）</p>
        )}
      </div>
    </section>
  );
}
