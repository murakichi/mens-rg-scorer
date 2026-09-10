import { Plus } from "lucide-react";
import { SeriesCard } from "./SeriesCard";
import { computeScore } from "../scoring/score";
import type { ApparatusKey, Item, Series } from "../scoring/types";

export const emptySeries = (): Series => ({
  executionDeduction: 0,
  items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }],
});

export const newItem = (kind: Item["kind"]): Item => {
  if (kind === "throw") return { kind: "throw", throwTypes: [], reqTypes: [] };
  if (kind === "catch") return { kind: "catch", catchTypes: [], catchTwo: false };
  if (kind === "skill") return { kind: "skill", skillId: "", hasApparatus: false, isThrow: false };
  if (kind === "ropeJump") return { kind: "ropeJump", jumpId: "", isMoving6m: false };
  return { kind: "motion", motionId: "" };
};

/** 初期状態（空のskill1つだけ）かどうか — addItem 時の置き換え判定に使う */
const isPristine = (items: Item[]) =>
  items.length === 1 &&
  items[0].kind === "skill" &&
  !items[0].skillId &&
  !items[0].hasApparatus &&
  !items[0].isThrow;

export interface SeriesTemplateOption {
  id: string;
  name: string;
  /** 現在の手具と違う手具で作られたテンプレートか（プルダウンの見出しを分ける） */
  otherApparatus?: string;
}

interface Props {
  series: Series[];
  apparatus: ApparatusKey;
  junior: boolean;
  onChange: (next: Series[]) => void;
  /** 採点結果。省略時はこのコンポーネント内で計算する（テンプレート編集用） */
  result?: ReturnType<typeof computeScore>;
  /** シリーズカードに出すテンプレート読み込みプルダウンの選択肢 */
  templateOptions?: SeriesTemplateOption[];
  onLoadTemplate?: (sIdx: number, templateId: string) => void;
  onSaveTemplate?: (sIdx: number) => void;
  /** シリーズ追加ボタンの文言 */
  addLabel?: string;
  /** シリーズを増やせるか（1シリーズのテンプレート編集では false） */
  allowAdd?: boolean;
  /** 実施減点の行を出すか */
  showExec?: boolean;
}

/**
 * シリーズ一覧の編集UI（個人モード）。
 * 通常の採点画面とテンプレート管理画面の両方で同じコンポーネントを使う。
 */
export function SeriesListEditor({
  series,
  apparatus,
  junior,
  onChange,
  result,
  templateOptions,
  onLoadTemplate,
  onSaveTemplate,
  addLabel = "シリーズを追加",
  allowAdd = true,
  showExec = true,
}: Props) {
  const score = result ?? computeScore(series, apparatus, { junior });

  const edit = (fn: (draft: Series[]) => void) => {
    const n = structuredClone(series);
    fn(n);
    onChange(n);
  };
  const addItem = (sIdx: number, kind: Item["kind"]) =>
    edit((n) => {
      const item = newItem(kind);
      n[sIdx].items = isPristine(n[sIdx].items) ? [item] : [...n[sIdx].items, item];
    });
  const updateItem = (sIdx: number, iIdx: number, patch: Partial<Item>) =>
    edit((n) => {
      n[sIdx].items[iIdx] = { ...n[sIdx].items[iIdx], ...patch } as Item;
    });
  const removeItem = (sIdx: number, iIdx: number) =>
    edit((n) => {
      n[sIdx].items.splice(iIdx, 1);
      if (n[sIdx].items.length === 0) n[sIdx].items.push(newItem("skill"));
    });
  const updateSeriesField = (sIdx: number, patch: Partial<Series>) =>
    edit((n) => {
      n[sIdx] = { ...n[sIdx], ...patch };
    });
  const removeSeries = (sIdx: number) => {
    if (series.length > 1) onChange(series.filter((_, i) => i !== sIdx));
  };
  const addSeries = () => onChange([...structuredClone(series), emptySeries()]);

  return (
    <>
      {series.map((ser, sIdx) => (
        <SeriesCard
          key={sIdx}
          series={ser}
          sIdx={sIdx}
          apparatus={apparatus}
          junior={junior}
          analysis={score.analysis[sIdx]}
          unitAdopted={score.unitAdopted[sIdx]}
          breakdown={score.seriesBreakdowns[sIdx]}
          isDup={score.dupFlags[sIdx]}
          isDupSignature={score.dupSignatureFlags[sIdx]}
          canRemove={series.length > 1}
          showExec={showExec}
          templateOptions={templateOptions}
          onLoadTemplate={onLoadTemplate && ((id) => onLoadTemplate(sIdx, id))}
          onSaveTemplate={onSaveTemplate && (() => onSaveTemplate(sIdx))}
          onUpdateField={(patch) => updateSeriesField(sIdx, patch)}
          onAddItem={(kind) => addItem(sIdx, kind)}
          onUpdateItem={(iIdx, patch) => updateItem(sIdx, iIdx, patch)}
          onRemoveItem={(iIdx) => removeItem(sIdx, iIdx)}
          onRemoveSeries={() => removeSeries(sIdx)}
        />
      ))}
      {allowAdd && (
        <button className="add-btn" onClick={addSeries}>
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </>
  );
}
