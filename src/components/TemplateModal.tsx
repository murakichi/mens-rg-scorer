import { useEffect, useState } from "react";
import { X, Trash2, Download, Upload, Plus, ChevronLeft } from "lucide-react";
import { APPARATUS } from "../scoring/constants";
import {
  addRoutineTemplate,
  apparatusName,
  describeSeries,
  removeTemplate,
  type TemplateKind,
  type TemplateStore,
} from "../scoring/templates";
import { SeriesListEditor } from "./SeriesListEditor";
import type { ApparatusKey, Series } from "../scoring/types";

interface Props {
  open: boolean;
  store: TemplateStore;
  /** 採点画面で選択中の手具（新規保存時の既定値） */
  apparatus: ApparatusKey;
  junior: boolean;
  /** 編集結果を書き戻す（保存は呼び出し側） */
  onChange: (store: TemplateStore) => void;
  onClose: () => void;
  /** 現在の演技構成を新しい構成テンプレートとして保存 */
  onSaveCurrentRoutine: () => void;
  /** テンプレートを採点画面に読み込む */
  onLoadRoutine: (id: string) => void;
  onAppendSeries: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
}

type Selection = { kind: TemplateKind; id: string } | null;

const stamp = (t: number) => new Date(t).toLocaleDateString("ja-JP");

/** 画面が狭いか（狭いときは一覧だけを出し、編集は上に重ねる） */
function useNarrow(query = "(max-width: 900px)") {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

/**
 * テンプレート管理画面。テンプレートはカードで並べ、
 * 広い画面では右側、狭い画面では重ねたシートで、採点画面と同じ入力欄で編集する。
 */
export function TemplateModal({
  open,
  store,
  apparatus,
  junior,
  onChange,
  onClose,
  onSaveCurrentRoutine,
  onLoadRoutine,
  onAppendSeries,
  onExport,
  onImport,
}: Props) {
  const [sel, setSel] = useState<Selection>(null);
  const narrow = useNarrow();
  if (!open) return null;

  const selected =
    sel?.kind === "series"
      ? store.series.find((t) => t.id === sel.id)
      : sel?.kind === "routine"
        ? store.routines.find((t) => t.id === sel.id)
        : undefined;
  const selectedSeries: Series[] = selected
    ? Array.isArray((selected as { series: Series | Series[] }).series)
      ? (selected as { series: Series[] }).series
      : [(selected as { series: Series }).series]
    : [];

  /** 選択中のテンプレートを書き換える */
  const patchSelected = (patch: { name?: string; apparatus?: ApparatusKey; series?: Series[] }) => {
    if (!sel) return;
    const apply = <T extends { id: string; name: string; apparatus: ApparatusKey; updatedAt: number }>(
      list: T[],
      toSeries: (s: Series[]) => unknown,
    ): T[] =>
      list.map((t) =>
        t.id === sel.id
          ? {
              ...t,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.apparatus !== undefined ? { apparatus: patch.apparatus } : {}),
              ...(patch.series !== undefined ? { series: toSeries(patch.series) } : {}),
              updatedAt: Date.now(),
            }
          : t,
      );
    onChange(
      sel.kind === "series"
        ? { ...store, series: apply(store.series, (s) => s[0]) }
        : { ...store, routines: apply(store.routines, (s) => s) },
    );
  };

  const remove = (kind: TemplateKind, id: string, name: string) => {
    if (!window.confirm(`テンプレート「${name}」を削除しますか？`)) return;
    onChange(removeTemplate(store, kind, id));
    if (sel?.id === id) setSel(null);
  };

  const addRoutine = () => {
    const name = window.prompt("新しい構成テンプレートの名前");
    if (!name?.trim()) return;
    const next = addRoutineTemplate(store, name, apparatus, [
      { executionDeduction: 0, items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }] },
    ]);
    onChange(next);
    setSel({ kind: "routine", id: next.routines[0].id });
  };

  const cards = (kind: TemplateKind) => {
    const items = kind === "series" ? store.series : store.routines;
    if (items.length === 0) {
      return (
        <p className="hint">
          {kind === "series"
            ? "各シリーズの「テンプレートに保存」から登録します。"
            : "「現在の構成を保存」から登録します。"}
        </p>
      );
    }
    return (
      <div className="tpl-cards">
        {items.map((t) => {
          const list: Series[] = kind === "routine" ? (t as { series: Series[] }).series : [(t as { series: Series }).series];
          return (
            <button
              key={t.id}
              type="button"
              className={`tpl-card${sel?.kind === kind && sel.id === t.id ? " is-active" : ""}`}
              onClick={() => setSel({ kind, id: t.id })}
            >
              <span className="tpl-card-head">
                <span className="tpl-card-name">{t.name}</span>
                <span
                  className="tpl-card-del"
                  role="button"
                  tabIndex={-1}
                  aria-label="削除"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(kind, t.id, t.name);
                  }}
                >
                  <Trash2 size={13} />
                </span>
              </span>
              <span className="tpl-card-meta">
                {apparatusName(t.apparatus)}
                {kind === "routine" && `・${list.length}シリーズ`}／{stamp(t.updatedAt)}
              </span>
              <span className="tpl-card-body">
                {list.slice(0, 3).map((ser, i) => (
                  <span key={i} className="tpl-card-line">
                    {kind === "routine" && <b>{i + 1}. </b>}
                    {describeSeries(ser)}
                  </span>
                ))}
                {list.length > 3 && <span className="tpl-card-line">…ほか{list.length - 3}シリーズ</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const editor = selected && (
    <>
      <div className="tpl-editor-head">
        {narrow && (
          <button className="io-btn" onClick={() => setSel(null)}>
            <ChevronLeft size={14} /> 一覧
          </button>
        )}
        <input
          className="tpl-name-input"
          value={selected.name}
          onChange={(e) => patchSelected({ name: e.target.value })}
          placeholder="テンプレート名"
        />
        <button
          className="io-btn"
          onClick={() => (sel!.kind === "routine" ? onLoadRoutine(sel!.id) : onAppendSeries(sel!.id))}
        >
          {sel!.kind === "routine" ? "採点画面に読み込む" : "採点画面に追加"}
        </button>
      </div>
      <div className="app-wrap">
        {(Object.entries(APPARATUS) as [ApparatusKey, { name: string }][]).map(([k, v]) => (
          <button
            key={k}
            className={k === selected.apparatus ? "app-btn is-active" : "app-btn"}
            onClick={() => patchSelected({ apparatus: k })}
          >
            {v.name}
          </button>
        ))}
      </div>
      <SeriesListEditor
        series={selectedSeries}
        apparatus={selected.apparatus}
        junior={junior}
        allowAdd={sel!.kind === "routine"}
        showExec={false}
        onChange={(next) => patchSelected({ series: next })}
      />
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>テンプレート</span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={narrow ? "tpl-panes is-narrow" : "tpl-panes"}>
          <div className="tpl-list">
            <div className="line-head">演技構成のテンプレート</div>
            {cards("routine")}
            <div className="tpl-list-actions">
              <button className="io-btn" onClick={onSaveCurrentRoutine}>
                現在の構成を保存
              </button>
              <button className="io-btn" onClick={addRoutine}>
                <Plus size={13} /> 新規
              </button>
            </div>

            <div className="line-head">シリーズのテンプレート</div>
            {cards("series")}
          </div>

          {!narrow && (
            <div className="tpl-editor">
              {selected ? editor : <p className="hint">カードを選ぶと、採点画面と同じ入力欄で編集できます。</p>}
            </div>
          )}
        </div>

        {narrow && selected && (
          <div className="tpl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tpl-sheet-inner">{editor}</div>
          </div>
        )}

        <p className="hint">
          テンプレートはこのブラウザに保存され、編集内容はそのまま反映されます（端末をまたぐときは書き出し／読み込みを使ってください）。
        </p>
        <div className="modal-actions">
          <button className="io-btn" onClick={onExport}>
            <Download size={14} /> 書き出し
          </button>
          <button className="io-btn" onClick={onImport}>
            <Upload size={14} /> 読み込み
          </button>
          <button className="io-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
