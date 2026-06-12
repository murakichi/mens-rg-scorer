import { useState, useMemo, useRef } from "react";
import { Download, Upload, Plus } from "lucide-react";
import { APPARATUS } from "../scoring/constants";
import { computeScore } from "../scoring/score";
import type { ApparatusKey, Item, Series } from "../scoring/types";
import { JsonModal, type JsonModalMode } from "./JsonModal";
import { SeriesCard } from "./SeriesCard";
import { ScoreSummary } from "./ScoreSummary";

const emptySeries = (): Series => ({
  executionDeduction: 0,
  items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }],
});

const newItem = (kind: Item["kind"]): Item => {
  if (kind === "throw") return { kind: "throw", throwTypes: [], reqTypes: [] };
  if (kind === "catch") return { kind: "catch", catchTypes: [], catchTwo: false };
  if (kind === "skill") return { kind: "skill", skillId: "", hasApparatus: false, isThrow: false };
  return { kind: "motion", motionId: "" };
};

/** 初期状態（空のskill1つだけ）かどうか — addItem 時の置き換え判定に使う */
const isPristine = (items: Item[]) =>
  items.length === 1 &&
  items[0].kind === "skill" &&
  !items[0].skillId &&
  !items[0].hasApparatus &&
  !items[0].isThrow;

export function IndividualScorer() {
  const [apparatus, setApparatus] = useState<ApparatusKey>("stick");
  const [series, setSeries] = useState<Series[]>([emptySeries()]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonModalMode, setJsonModalMode] = useState<JsonModalMode>(null);
  const [jsonText, setJsonText] = useState("");

  // ---- 採点（純粋関数に委譲）----
  const result = useMemo(() => computeScore(series, apparatus), [series, apparatus]);

  // ---- ファイル入出力 ----
  const handleExport = () => {
    const data = { version: 1, apparatus, series };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `routine-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImportedData = (raw: string): boolean => {
    const data = JSON.parse(raw);
    if (data.apparatus && APPARATUS[data.apparatus as ApparatusKey]) setApparatus(data.apparatus);
    if (Array.isArray(data.series) && data.series.length > 0) {
      setSeries(data.series);
      return true;
    }
    return false;
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!applyImportedData(reader.result as string)) alert("シリーズ構成が見つかりませんでした");
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ---- テキスト方式（モーダル）----
  const openExportText = () => {
    setJsonText(JSON.stringify({ version: 1, apparatus, series }, null, 2));
    setJsonModalMode("export");
  };
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました。手動で選択してコピーしてください");
    }
  };
  const handleImportText = () => {
    try {
      if (applyImportedData(jsonText)) setJsonModalMode(null);
      else alert("シリーズ構成が見つかりませんでした");
    } catch {
      alert("JSONの読み込みに失敗しました（形式を確認してください）");
    }
  };

  // ---- 編集アクション ----
  const addItem = (sIdx: number, kind: Item["kind"]) =>
    setSeries((p) => {
      const n = structuredClone(p);
      const item = newItem(kind);
      n[sIdx].items = isPristine(n[sIdx].items) ? [item] : [...n[sIdx].items, item];
      return n;
    });
  const updateItem = (sIdx: number, iIdx: number, patch: Partial<Item>) =>
    setSeries((p) => {
      const n = structuredClone(p);
      n[sIdx].items[iIdx] = { ...n[sIdx].items[iIdx], ...patch } as Item;
      return n;
    });
  const removeItem = (sIdx: number, iIdx: number) =>
    setSeries((p) => {
      const n = structuredClone(p);
      n[sIdx].items.splice(iIdx, 1);
      if (n[sIdx].items.length === 0) n[sIdx].items.push(newItem("skill"));
      return n;
    });
  const addSeries = () => setSeries((p) => [...p, emptySeries()]);
  const removeSeries = (sIdx: number) => setSeries((p) => (p.length > 1 ? p.filter((_, i) => i !== sIdx) : p));
  const updateSeriesField = (sIdx: number, patch: Partial<Series>) =>
    setSeries((p) => {
      const n = structuredClone(p);
      n[sIdx] = { ...n[sIdx], ...patch };
      return n;
    });

  return (
    <>
      <JsonModal
        mode={jsonModalMode}
        text={jsonText}
        onTextChange={setJsonText}
        onClose={() => setJsonModalMode(null)}
        onCopy={handleCopyJson}
        onImport={handleImportText}
      />

      <div className="io-wrap">
        <button className="io-btn" onClick={handleExport}>
          <Download size={14} /> エクスポート
        </button>
        <button className="io-btn" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} /> インポート
        </button>
        <button className="io-btn" onClick={openExportText}>
          テキスト出力
        </button>
        <button className="io-btn" onClick={() => setJsonModalMode("import")}>
          テキスト読込
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          style={{ display: "none" }}
        />
      </div>

      <section className="card">
        <div className="line-head">手具</div>
        <div className="app-wrap">
          {(Object.entries(APPARATUS) as [ApparatusKey, { name: string }][]).map(([k, v]) => (
            <button
              key={k}
              className={k === apparatus ? "app-btn is-active" : "app-btn"}
              onClick={() => setApparatus(k)}
            >
              {v.name}
            </button>
          ))}
        </div>
        <p className="hint">
          必須投げ方：{APPARATUS[apparatus].throws.length ? APPARATUS[apparatus].throws.join("・") : "なし"}
        </p>
      </section>

      <p className="note">
        演技をシリーズ単位で入力します。「投げ」〜「キャッチ」が1つの投げ、投げを挟まない連続したタンブリング技が1本のタンブリングとして自動分類されます。
      </p>

      {series.map((ser, sIdx) => (
        <SeriesCard
          key={sIdx}
          series={ser}
          sIdx={sIdx}
          apparatus={apparatus}
          analysis={result.analysis[sIdx]}
          breakdown={result.seriesBreakdowns[sIdx]}
          isDup={result.dupFlags[sIdx]}
          canRemove={series.length > 1}
          onUpdateField={(patch) => updateSeriesField(sIdx, patch)}
          onAddItem={(kind) => addItem(sIdx, kind)}
          onUpdateItem={(iIdx, patch) => updateItem(sIdx, iIdx, patch)}
          onRemoveItem={(iIdx) => removeItem(sIdx, iIdx)}
          onRemoveSeries={() => removeSeries(sIdx)}
        />
      ))}
      <button className="add-btn" onClick={addSeries}>
        <Plus size={14} /> シリーズを追加
      </button>

      <ScoreSummary result={result} />
    </>
  );
}
