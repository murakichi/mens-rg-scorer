import { useEffect, useState } from "react";
import { X, Trash2, Download, Upload, Plus, ChevronLeft } from "lucide-react";
import {
  addRoutineTemplate,
  addSeriesTemplate,
  apparatusName,
  commonBlockers,
  describeSeries,
  isCommonApparatus,
  removeTemplate,
  scoringApparatus,
  templateMetrics,
  TEMPLATE_APPARATUS_OPTIONS,
  type TemplateApparatus,
  type TemplateKind,
  type TemplateStore,
} from "../scoring/templates";
import { DIFF_VALUE } from "../scoring/constants";
import type { Difficulty } from "../scoring/types";
import { SeriesListEditor } from "./SeriesListEditor";
import { SeriesTags } from "./SeriesCard";
import { SERIES_TAGS, seriesTags, type SeriesTagId } from "../scoring/analysis";
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
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<SeriesTagId[]>([]);
  // 難度・点数は範囲で絞り込む（空欄＝制限なし）
  const [diffMin, setDiffMin] = useState("");
  const [diffMax, setDiffMax] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
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
  const patchSelected = (patch: { name?: string; apparatus?: TemplateApparatus; series?: Series[] }) => {
    if (!sel) return;
    const apply = <T extends { id: string; name: string; apparatus: TemplateApparatus; updatedAt: number }>(
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

  const emptySeries = (): Series => ({
    executionDeduction: 0,
    items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }],
  });

  const addRoutine = () => {
    const name = window.prompt("新しい構成テンプレートの名前");
    if (!name?.trim()) return;
    const next = addRoutineTemplate(store, name, apparatus, [emptySeries()]);
    onChange(next);
    setSel({ kind: "routine", id: next.routines[0].id });
  };

  const addSeries = () => {
    const name = window.prompt("新しいシリーズテンプレートの名前");
    if (!name?.trim()) return;
    const next = addSeriesTemplate(store, name, apparatus, emptySeries());
    onChange(next);
    setSel({ kind: "series", id: next.series[0].id });
  };

  const toggleTag = (id: SeriesTagId) =>
    setTagFilter((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const filtering =
    !!query.trim() || tagFilter.length > 0 || !!diffMin || !!diffMax || !!scoreMin || !!scoreMax;
  const clearFilters = () => {
    setQuery("");
    setTagFilter([]);
    setDiffMin("");
    setDiffMax("");
    setScoreMin("");
    setScoreMax("");
  };

  /** フリーワード（名前・手具・中身）・タグ・難度／点数の範囲で絞り込む */
  const matches = (name: string, ap: TemplateApparatus, list: Series[]) => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = [name, apparatusName(ap), ...list.map((s) => describeSeries(s, 99))].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (tagFilter.length > 0) {
      const tags = new Set(list.flatMap((s) => seriesTags(s, junior)));
      if (!tagFilter.every((t) => tags.has(t))) return false;
    }
    if (diffMin || diffMax || scoreMin || scoreMax) {
      const m = templateMetrics(list, ap, junior);
      if (diffMin && m.diffValue < DIFF_VALUE[diffMin as Difficulty]) return false;
      if (diffMax && (m.diffValue === 0 || m.diffValue > DIFF_VALUE[diffMax as Difficulty])) return false;
      if (scoreMin && m.dScore < parseFloat(scoreMin) - 1e-9) return false;
      if (scoreMax && m.dScore > parseFloat(scoreMax) + 1e-9) return false;
    }
    return true;
  };

  /** 手具を変える。共通にするときは手具固有の要素が入っていないか確かめる。 */
  const setApparatusOf = (next: TemplateApparatus) => {
    if (isCommonApparatus(next)) {
      const blockers = commonBlockers(selectedSeries);
      if (blockers.length > 0) {
        window.alert(`共通にできません：${blockers.join("・")}が含まれています。`);
        return;
      }
    }
    patchSelected({ apparatus: next });
  };

  const cards = (kind: TemplateKind) => {
    const all = kind === "series" ? store.series : store.routines;
    const items = all.filter((t) =>
      matches(
        t.name,
        t.apparatus,
        kind === "series" ? [(t as { series: Series }).series] : (t as { series: Series[] }).series,
      ),
    );
    if (all.length > 0 && items.length === 0) {
      return <p className="hint">条件に合うテンプレートがありません。</p>;
    }
    if (items.length === 0) {
      return (
        <p className="hint">
          {kind === "series"
            ? "採点画面の各シリーズの「テンプレートに保存」か、下の「新規」から登録します。"
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
                {(() => {
                  const m = templateMetrics(list, t.apparatus, junior);
                  return (
                    <>
                      ／難度 {m.diff ?? "—"}・D {m.dScore.toFixed(1)}
                    </>
                  );
                })()}
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
              {kind === "series" && <SeriesTags series={list[0]} junior={junior} />}
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
        {TEMPLATE_APPARATUS_OPTIONS.map((o) => (
          <button
            key={o.id}
            className={o.id === selected.apparatus ? "app-btn is-active" : "app-btn"}
            onClick={() => setApparatusOf(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
      {isCommonApparatus(selected.apparatus) && (
        <p className="hint">
          共通テンプレートはどの手具でも使えます。手具固有の要素（二つ投げ・左手投げ・手具を使った投げ／キャッチ・
          2つ同時キャッチ・ロープ跳び）は入力できません。
        </p>
      )}
      <SeriesListEditor
        series={selectedSeries}
        apparatus={scoringApparatus(selected.apparatus)}
        common={isCommonApparatus(selected.apparatus)}
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
            <div className="tpl-search">
              <input
                className="tpl-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="名前・技名で検索"
              />
              <span className="tag-row">
                {SERIES_TAGS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.title}
                    className={tagFilter.includes(t.id) ? "tag tag-btn is-on" : "tag tag-btn"}
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
                {filtering && (
                  <button type="button" className="tag tag-btn" onClick={clearFilters}>
                    クリア
                  </button>
                )}
              </span>
              <span className="tpl-range">
                難度
                <select className="select tpl-range-sel" value={diffMin} onChange={(e) => setDiffMin(e.target.value)}>
                  <option value="">下限なし</option>
                  {(["A", "B", "C", "D", "E"] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {d}以上
                    </option>
                  ))}
                </select>
                〜
                <select className="select tpl-range-sel" value={diffMax} onChange={(e) => setDiffMax(e.target.value)}>
                  <option value="">上限なし</option>
                  {(["A", "B", "C", "D", "E"] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {d}以下
                    </option>
                  ))}
                </select>
              </span>
              <span className="tpl-range">
                点数(D)
                <input
                  className="tpl-range-input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={scoreMin}
                  onChange={(e) => setScoreMin(e.target.value)}
                  placeholder="下限"
                />
                〜
                <input
                  className="tpl-range-input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                  placeholder="上限"
                />
              </span>
            </div>

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
            <div className="tpl-list-actions">
              <button className="io-btn" onClick={addSeries}>
                <Plus size={13} /> 新規
              </button>
            </div>
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
