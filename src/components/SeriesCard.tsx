import { Trash2, X } from "lucide-react";
import { S } from "../styles";
import {
  THROW_OPTIONS_COMMON,
  THROW_OPTIONS_APPARATUS,
  CATCH_OPTIONS_COMMON,
  CATCH_OPTIONS_APPARATUS,
  REQUIRED_THROW_OPTIONS,
  APPARATUS_USE,
  SKILL_LIST,
  HAND_MOTIONS,
} from "../scoring/constants";
import { checkApparatusFlow, maxSaltoChain } from "../scoring/analysis";
import type { ApparatusKey, Item, Series, SeriesAnalysis } from "../scoring/types";
import type { SeriesBreakdown } from "../scoring/score";

type ItemKind = Item["kind"];

interface Props {
  series: Series;
  sIdx: number;
  apparatus: ApparatusKey;
  analysis: SeriesAnalysis;
  breakdown: SeriesBreakdown;
  isDup: boolean;
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
  onUpdate,
}: {
  item: Item;
  apparatus: ApparatusKey;
  onUpdate: (patch: Partial<Item>) => void;
}) {
  if (item.kind === "throw") {
    return (
      <>
        <div style={S.throwTag}>投げ</div>
        {[...THROW_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? THROW_OPTIONS_APPARATUS : [])].map((opt) => (
          <label key={opt.id} style={S.check}>
            <input
              type="checkbox"
              checked={(item.throwTypes || []).includes(opt.id)}
              onChange={(e) => onUpdate({ throwTypes: toggle(item.throwTypes, opt.id, e.target.checked) })}
            />
            {opt.name}
          </label>
        ))}
        {REQUIRED_THROW_OPTIONS[apparatus].map((opt) => (
          <label key={opt.id} style={S.checkReq}>
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
        <div style={S.catchTag}>キャッチ</div>
        {[...CATCH_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? CATCH_OPTIONS_APPARATUS : [])].map((opt) => (
          <label key={opt.id} style={S.check}>
            <input
              type="checkbox"
              checked={(item.catchTypes || []).includes(opt.id)}
              onChange={(e) => onUpdate({ catchTypes: toggle(item.catchTypes, opt.id, e.target.checked) })}
            />
            {opt.name}
          </label>
        ))}
        {APPARATUS_USE[apparatus] && (
          <label style={S.checkReq}>
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
        <div style={S.selWrap}>
          <select value={item.skillId} onChange={(e) => onUpdate({ skillId: e.target.value })} style={S.select}>
            <option value="">タンブリング技</option>
            {SKILL_LIST.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <label style={S.check}>
          <input
            type="checkbox"
            checked={item.hasApparatus || false}
            onChange={(e) => onUpdate({ hasApparatus: e.target.checked })}
          />
          手具操作
        </label>
        <label style={S.check}>
          <input
            type="checkbox"
            checked={item.isThrow || false}
            onChange={(e) => onUpdate({ isThrow: e.target.checked })}
          />
          この技の最中に投げ
        </label>
      </>
    );
  }
  // motion
  return (
    <select value={item.motionId} onChange={(e) => onUpdate({ motionId: e.target.value })} style={S.select}>
      <option value="">徒手動作</option>
      {HAND_MOTIONS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

export function SeriesCard({
  series: ser,
  sIdx,
  apparatus,
  analysis: a,
  breakdown: b,
  isDup,
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
    <section style={S.card}>
      <div style={S.lineHead}>
        <span>
          シリーズ {sIdx + 1}
          {isDup ? "（重複：本数・投げ回数に不算入）" : ""}
        </span>
        {canRemove && (
          <button style={S.removeBtnSm} onClick={onRemoveSeries}>
            <Trash2 size={13} /> 削除
          </button>
        )}
      </div>
      <label style={S.execLabel}>
        実施減点(E)：
        <input
          type="number"
          step="0.1"
          min="0"
          value={ser.executionDeduction || 0}
          onChange={(e) => onUpdateField({ executionDeduction: parseFloat(e.target.value) || 0 })}
          style={S.execInput}
        />
        点
      </label>
      <div style={S.skillRow}>
        {ser.items.map((item, iIdx) => (
          <div key={iIdx} style={S.skillBlock}>
            <ItemEditor item={item} apparatus={apparatus} onUpdate={(patch) => onUpdateItem(iIdx, patch)} />
            <button style={S.removeBtnXs} onClick={() => onRemoveItem(iIdx)} aria-label="削除">
              <X size={12} />
            </button>
            {iIdx < ser.items.length - 1 && <div style={S.arrow}>→</div>}
          </div>
        ))}
      </div>
      <div style={S.addRow}>
        <button style={S.addBtnSm} onClick={() => onAddItem("throw")}>
          + 投げ
        </button>
        <button style={S.addBtnSm} onClick={() => onAddItem("skill")}>
          + タンブリング技
        </button>
        <button style={S.addBtnSm} onClick={() => onAddItem("motion")}>
          + 徒手動作
        </button>
        <button style={S.addBtnSm} onClick={() => onAddItem("catch")}>
          + キャッチ
        </button>
      </div>
      {a.units.map((u, ui) => (
        <div key={ui} style={S.unitResult}>
          {u.type === "tumbling"
            ? `タンブリング塊：難度 ${u.finalDiff}`
            : `投げ：難度 ${u.finalDiff}（${
                u.isThrowTumbling ? "転回系としてカウント・投げタン" : "徒手系としてカウント"
              }｜難度は${u.diffFromHand ? "徒手系" : "転回系"}由来｜徒手${u.handDiff}/転回${
                u.tumblingDiff ?? "—"
              }）`}
          {`　／ 最大連続宙返り ${maxSaltoChain(u.skills.map((s) => s.skillId))} 回`}
        </div>
      ))}
      {seriesQualifies && <div style={S.bonusNote}>連続投げ加点の対象（投げ2回以上＋D難度以上）</div>}
      {flowErrors.map((err, ei) => (
        <div key={ei} style={S.flowError}>
          ⚠ {err}
        </div>
      ))}
      <div style={S.seriesBreakdown}>
        <div style={S.breakdownTitle}>シリーズの加点・減点</div>
        <div style={S.breakdownRow}>
          <span>D：タンブリング難度点</span>
          <span>{b.tumDiff.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>D：徒手難度点</span>
          <span>{b.handDiff.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>D：連続投げ加点</span>
          <span>{b.sBonus.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>D：技術加点</span>
          <span>{b.tech.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>D：手具操作加点</span>
          <span>{b.appOp.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>D：二つ投げ4動作加点</span>
          <span>{b.twoMot.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>A：手具操作不足減点</span>
          <span>-{b.noApp.toFixed(1)}</span>
        </div>
        <div style={S.breakdownRow}>
          <span>E：実施減点</span>
          <span>-{b.exec.toFixed(1)}</span>
        </div>
        <div style={S.breakdownTotal}>
          <span>D寄与</span>
          <span>{b.dPart.toFixed(1)} 点</span>
        </div>
        {isDup && (
          <p style={S.hint}>※重複シリーズのため、難度点は採用候補に含まれますが、本数・投げ回数・一部加点には不算入</p>
        )}
      </div>
    </section>
  );
}
