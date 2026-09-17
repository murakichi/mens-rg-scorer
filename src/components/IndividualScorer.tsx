import { useState, useMemo, useRef, useEffect } from "react";
import { Download, Upload, Link2, BookMarked, Save, Shuffle, Lightbulb, Printer } from "lucide-react";
import {
  APPARATUS,
  APPARATUS_REQUIRED_ELEMENTS,
  ART_DEDUCTION_ITEMS,
  ART_DEDUCTION_STEP,
  VIOLATION_OPTIONS,
  clampArtDeduction,
} from "../scoring/constants";
import { computeScore } from "../scoring/score";
import { apparatusBlockers, stripForApparatus } from "../scoring/analysis";
import type { ApparatusKey, Series } from "../scoring/types";
import { buildShareUrl } from "../scoring/share";
import { JsonModal, type JsonModalMode } from "./JsonModal";
import { SeriesListEditor, emptySeries } from "./SeriesListEditor";
import { TemplateModal } from "./TemplateModal";
import { GenerateModal } from "./GenerateModal";
import { SuggestModal } from "./SuggestModal";
import { PrintSheet } from "./PrintSheet";
import { ScoreSummary } from "./ScoreSummary";
import {
  DRAFT_KEY_INDIVIDUAL,
  asStringArray,
  clearDraft,
  loadIndividualDraft,
  normalizeArtDeductions,
  normalizeIndividualDraft,
  saveIndividualDraft,
  type IndividualDraft,
} from "../scoring/draft";
import {
  addRoutineTemplate,
  addSeriesTemplate,
  apparatusName,
  defaultTemplateApparatus,
  isCommonApparatus,
  loadTemplates,
  normalizeTemplateStore,
  saveTemplates,
  splitByApparatus,
  type TemplateStore,
} from "../scoring/templates";

interface Props {
  /** URL共有から復元する初期構成（任意） */
  initialData?: {
    apparatus?: string;
    executionDeduction?: unknown;
    apparatusElements?: unknown;
    violations?: unknown;
    junior?: unknown;
    artDeductions?: unknown;
    series?: unknown;
  };
}

export function IndividualScorer({ initialData }: Props = {}) {
  // 起動時の優先順位は 共有URL ＞ 自動保存されたドラフト ＞ 空。
  // 共有URLで開いたときは、他人の構成で自分のドラフトを踏まないよう復元しない。
  const [restored] = useState(() => (initialData ? null : loadIndividualDraft()));
  const [init] = useState<IndividualDraft | null>(() => restored ?? normalizeIndividualDraft(initialData));
  const [draftNotice, setDraftNotice] = useState(!!restored);

  const [apparatus, setApparatus] = useState<ApparatusKey>(init?.apparatus ?? "stick");
  const [series, setSeries] = useState<Series[]>(() =>
    init && init.series.length > 0 ? init.series : [emptySeries()],
  );
  const [overallExecution, setOverallExecution] = useState(init?.executionDeduction ?? 0);
  const [apparatusElements, setApparatusElements] = useState<string[]>(() => init?.apparatusElements ?? []);
  const [violations, setViolations] = useState<string[]>(() => init?.violations ?? []);
  const [junior, setJunior] = useState<boolean>(init?.junior ?? false);
  const [artDeductions, setArtDeductions] = useState<Record<string, number>>(() => init?.artDeductions ?? {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonModalMode, setJsonModalMode] = useState<JsonModalMode>(null);
  const [jsonText, setJsonText] = useState("");
  // ---- テンプレート（localStorage 保存）----
  const [templates, setTemplates] = useState<TemplateStore>(() => loadTemplates());
  const [templateOpen, setTemplateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const updateTemplates = (next: TemplateStore) => {
    setTemplates(next);
    if (!saveTemplates(next)) alert("テンプレートを保存できませんでした（ブラウザの設定をご確認ください）");
  };

  // ---- 採点（純粋関数に委譲）----
  const result = useMemo(
    () =>
      computeScore(series, apparatus, {
        overallExecutionDeduction: overallExecution,
        apparatusElements,
        violations,
        junior,
        artDeductions,
      }),
    [series, apparatus, overallExecution, apparatusElements, violations, junior, artDeductions],
  );

  // ---- 入力中の構成を自動保存する ----
  // 起動時の内容と同じあいだは書き込まない：共有URLを開いただけで自分のドラフトを
  // 上書きしないため（ユーザーが何か編集した時点から保存が始まる）。
  // 「1回目の実行を飛ばす」ではなく内容そのものを比べるのは、StrictMode が
  // effect を2回走らせても ref が残って素通りしてしまうため。
  const initialPayload = useRef<string | null>(null);
  const saveFailed = useRef(false);
  useEffect(() => {
    const data = saveData();
    const json = JSON.stringify(data);
    if (initialPayload.current === null) {
      initialPayload.current = json;
      return;
    }
    if (json === initialPayload.current) return;
    // 保存できないまま（容量超過・プライベートモード）気づかないと、
    // 古いドラフトを「復元しました」と出してしまうので一度だけ知らせる。
    if (!saveIndividualDraft(data) && !saveFailed.current) {
      saveFailed.current = true;
      alert("入力内容を自動保存できませんでした（ブラウザの設定・空き容量をご確認ください）。\nエクスポートか共有URLで控えを取ってください。");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apparatus, series, overallExecution, apparatusElements, violations, junior, artDeductions]);

  /** 復元した内容を破棄して最初からにする */
  const discardDraft = () => {
    if (!window.confirm("復元した入力を破棄して、最初からやり直しますか？")) return;
    setSeries([emptySeries()]);
    setOverallExecution(0);
    setApparatusElements([]);
    setViolations([]);
    setJunior(false);
    setArtDeductions({});
    clearDraft(DRAFT_KEY_INDIVIDUAL);
    setDraftNotice(false);
  };

  // 自動判定の要素（auto付き）は手動チェック欄に出さない
  const manualElements = APPARATUS_REQUIRED_ELEMENTS[apparatus].filter((el) => !el.auto);

  const toggleId = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  // ---- ファイル入出力 ----
  // エクスポート・共有URL・自動保存のドラフトはすべてこの形（型で固定する）
  const saveData = (): IndividualDraft => ({
    version: 1,
    apparatus,
    executionDeduction: overallExecution,
    apparatusElements,
    violations,
    junior,
    artDeductions,
    series,
  });
  const handleExport = () => {
    const data = saveData();
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
    const ap: ApparatusKey =
      data.apparatus && APPARATUS[data.apparatus as ApparatusKey] ? (data.apparatus as ApparatusKey) : apparatus;
    if (ap !== apparatus) setApparatus(ap);
    setOverallExecution(Number(data.executionDeduction) || 0);
    setApparatusElements(asStringArray(data.apparatusElements));
    setViolations(asStringArray(data.violations));
    setJunior(!!data.junior);
    setArtDeductions(normalizeArtDeductions(data.artDeductions));
    if (Array.isArray(data.series) && data.series.length > 0) {
      // 読み込んだ内容のうち、その手具で入力できないものは落とす
      setSeries(stripForApparatus(data.series, ap));
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
    setJsonText(JSON.stringify(saveData(), null, 2));
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

  const handleCopyShareUrl = async () => {
    const url = buildShareUrl(saveData());
    try {
      await navigator.clipboard.writeText(url);
      alert("共有URLをコピーしました。このURLを開くと構成が復元されます。");
    } catch {
      window.prompt("以下のURLをコピーしてください", url);
    }
  };

  /**
   * 手具の切り替え。その手具で入力できない内容（他の手具から残ったもの）は
   * 入力画面に出ないので、確認して落としてから切り替える。
   */
  const changeApparatus = (k: ApparatusKey) => {
    if (k === apparatus) return;
    const blockers = apparatusBlockers(series, k);
    if (blockers.length > 0) {
      const msg = `${APPARATUS[k].name}では入力できない内容（${blockers.join("・")}）があります。外して切り替えますか？`;
      if (!window.confirm(msg)) return;
      setSeries((p) => stripForApparatus(p, k));
    }
    setApparatus(k);
  };

  // ---- テンプレートの操作 ----
  const { common, same, other } = splitByApparatus(templates.series, apparatus);
  const seriesTemplateOptions = [
    ...common.map((t) => ({ id: t.id, name: t.name })),
    ...same.map((t) => ({ id: t.id, name: t.name })),
    ...other.map((t) => ({ id: t.id, name: t.name, otherApparatus: apparatusName(t.apparatus) })),
  ];
  const saveSeriesTemplate = (sIdx: number) => {
    const name = window.prompt("テンプレート名", `シリーズ${sIdx + 1}`);
    if (!name?.trim()) return;
    // 手具固有の要素が無ければ「共通」で保存する
    updateTemplates(
      addSeriesTemplate(templates, name, defaultTemplateApparatus([series[sIdx]], apparatus), series[sIdx]),
    );
  };
  const loadSeriesTemplate = (sIdx: number, id: string) => {
    const t = templates.series.find((x) => x.id === id);
    if (!t) return;
    // 他の手具のテンプレートを読み込んだときは、今の手具で入力できない内容を落とす
    const [loaded] = stripForApparatus([structuredClone(t.series)], apparatus);
    // 実施減点は採点ごとの入力なので、読み込んでも今の値を残す
    setSeries((p) =>
      p.map((ser, i) => (i === sIdx ? { ...loaded, executionDeduction: ser.executionDeduction } : ser)),
    );
  };
  const saveCurrentRoutine = () => {
    const name = window.prompt("テンプレート名", `${apparatusName(apparatus)}の構成`);
    if (!name?.trim()) return;
    updateTemplates(addRoutineTemplate(templates, name, defaultTemplateApparatus(series, apparatus), series));
  };
  const loadRoutineTemplate = (id: string) => {
    const t = templates.routines.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`「${t.name}」を読み込みます。編集中の構成は置き換わります。`)) return;
    // 共通テンプレートは手具を選ばないので、今の手具のまま読み込む
    const ap = isCommonApparatus(t.apparatus) ? apparatus : t.apparatus;
    if (ap !== apparatus) setApparatus(ap);
    setSeries(stripForApparatus(structuredClone(t.series), ap));
    setTemplateOpen(false);
  };
  const appendSeriesTemplate = (id: string) => {
    const t = templates.series.find((x) => x.id === id);
    if (!t) return;
    setSeries((p) => [...p, ...stripForApparatus([structuredClone(t.series)], apparatus)]);
    setTemplateOpen(false);
  };
  const exportTemplates = () => {
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importTemplates = () => {
    const raw = window.prompt("テンプレートのJSONを貼り付けてください");
    if (!raw?.trim()) return;
    try {
      const next = normalizeTemplateStore(JSON.parse(raw));
      if (next.series.length === 0 && next.routines.length === 0) {
        alert("テンプレートが見つかりませんでした");
        return;
      }
      updateTemplates({
        version: 1,
        series: [...next.series, ...templates.series],
        routines: [...next.routines, ...templates.routines],
      });
    } catch {
      alert("JSONの読み込みに失敗しました");
    }
  };

  return (
    <>
      <GenerateModal
        open={generateOpen}
        templates={templates.series}
        apparatus={apparatus}
        junior={junior}
        onClose={() => setGenerateOpen(false)}
        onApply={(ap, r) => {
          if (!window.confirm("生成した構成を反映します。編集中の構成は置き換わります。")) return;
          setApparatus(ap);
          setSeries(structuredClone(r.series));
          setGenerateOpen(false);
        }}
      />
      <SuggestModal
        open={suggestOpen}
        series={series}
        apparatus={apparatus}
        junior={junior}
        apparatusElements={apparatusElements}
        violations={violations}
        artDeductions={artDeductions}
        onClose={() => setSuggestOpen(false)}
      />
      <TemplateModal
        open={templateOpen}
        store={templates}
        apparatus={apparatus}
        junior={junior}
        onChange={updateTemplates}
        onClose={() => setTemplateOpen(false)}
        onSaveCurrentRoutine={saveCurrentRoutine}
        onLoadRoutine={loadRoutineTemplate}
        onAppendSeries={appendSeriesTemplate}
        onExport={exportTemplates}
        onImport={importTemplates}
      />
      <JsonModal
        mode={jsonModalMode}
        text={jsonText}
        onTextChange={setJsonText}
        onClose={() => setJsonModalMode(null)}
        onCopy={handleCopyJson}
        onImport={handleImportText}
      />

      {draftNotice && (
        <div className="draft-notice">
          <span className="draft-notice-text">前回の入力を復元しました。</span>
          <span className="draft-notice-btns">
            <button className="io-btn" onClick={discardDraft}>
              破棄して最初から
            </button>
            <button className="io-btn" onClick={() => setDraftNotice(false)}>
              閉じる
            </button>
          </span>
        </div>
      )}

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
        <button className="io-btn" onClick={handleCopyShareUrl}>
          <Link2 size={14} /> 共有URLをコピー
        </button>
        <button className="io-btn" onClick={saveCurrentRoutine}>
          <Save size={14} /> 構成をテンプレートに保存
        </button>
        <button className="io-btn" onClick={() => setTemplateOpen(true)}>
          <BookMarked size={14} /> テンプレート
        </button>
        <button className="io-btn" onClick={() => setGenerateOpen(true)}>
          <Shuffle size={14} /> ランダム生成
        </button>
        <button className="io-btn" onClick={() => setSuggestOpen(true)}>
          <Lightbulb size={14} /> 改善提案
        </button>
        <button className="io-btn" onClick={() => window.print()}>
          <Printer size={14} /> 印刷・PDF
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
        <div className="line-head">適用規則</div>
        <div className="switch-row">
          <button
            type="button"
            role="switch"
            aria-checked={junior}
            className={junior ? "switch is-on" : "switch"}
            onClick={() => setJunior((p) => !p)}
          >
            <span className="switch-knob" />
          </button>
          <span className="switch-label">ジュニアモード{junior ? "：ON" : "：OFF"}</span>
        </div>
        <p className="hint">
          ジュニア適用規則（§10 変更規則1）で採点します。ダイビング前宙・後方宙返り半ひねりをC難度で認定し、
          投げ上げの最低回数を2回とします。
        </p>
      </section>

      <section className="card">
        <div className="line-head">手具</div>
        <div className="app-wrap">
          {(Object.entries(APPARATUS) as [ApparatusKey, { name: string }][]).map(([k, v]) => (
            <button
              key={k}
              className={k === apparatus ? "app-btn is-active" : "app-btn"}
              onClick={() => changeApparatus(k)}
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

      <SeriesListEditor
        series={series}
        apparatus={apparatus}
        junior={junior}
        result={result}
        onChange={setSeries}
        templateOptions={seriesTemplateOptions}
        onLoadTemplate={loadSeriesTemplate}
        onSaveTemplate={saveSeriesTemplate}
      />

      <section className="card">
        <div className="line-head">実施減点（演技全体）</div>
        <label className="exec-label">
          演技全体の実施減点(E)：
          <input
            className="exec-input"
            type="number"
            step="0.1"
            min="0"
            value={overallExecution || 0}
            onChange={(e) => setOverallExecution(parseFloat(e.target.value) || 0)}
          />
          点
        </label>
        <p className="hint">
          各シリーズの実施減点とは別に、演技全体に対する実施減点を入力します（E残点は両方を合算して算出）。
        </p>
      </section>

      <section className="card">
        <div className="line-head">手具別必須要素（{APPARATUS[apparatus].name}）</div>
        {manualElements.length === 0 ? (
          <p className="hint">
            この手具に手動チェックの必須要素はありません（各シリーズの入力から自動判定します）。
          </p>
        ) : (
          <>
            {manualElements.map((el) => (
              <label key={el.id} className="check">
                <input
                  type="checkbox"
                  checked={apparatusElements.includes(el.id)}
                  onChange={(e) => setApparatusElements((p) => toggleId(p, el.id, e.target.checked))}
                />
                {el.name}
              </label>
            ))}
            <p className="hint">
              実施した要素にチェックします。未チェックの要素は §3.5.6.3 により1つにつき −0.30点（A減点）。
              左手投げ／二つ投げ・3回以上の投げ上げ・右投げ右受け・転回系の投げ受けは各シリーズの入力から自動判定します。
            </p>
          </>
        )}
      </section>

      <section className="card">
        <div className="line-head">芸術と多様性の欠点（§3.5.6.4）</div>
        {ART_DEDUCTION_ITEMS.map((item, i) => {
          const prev = ART_DEDUCTION_ITEMS[i - 1];
          const value = artDeductions[item.id] ?? 0;
          return (
            <div key={item.id}>
              {item.group !== prev?.group && <div className="art-group">{item.group}</div>}
              <label className="art-row">
                <span className="art-row-name">
                  {item.name}
                  <span className="art-row-note">
                    上限 {item.max.toFixed(2)}／減点幅 {item.note}
                  </span>
                </span>
                <select
                  className="select art-select"
                  value={value}
                  onChange={(e) =>
                    setArtDeductions((p) => {
                      const n = { ...p };
                      const v = clampArtDeduction(item.id, e.target.value);
                      if (v > 0) n[item.id] = v;
                      else delete n[item.id];
                      return n;
                    })
                  }
                >
                  <option value={0}>—</option>
                  {Array.from({ length: Math.round(item.max / ART_DEDUCTION_STEP) }, (_, k) => {
                    const v = Math.round((k + 1) * ART_DEDUCTION_STEP * 10) / 10;
                    return (
                      <option key={v} value={v}>
                        -{v.toFixed(1)}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
          );
        })}
        <p className="hint">
          審判の主観評価にあたる項目です。該当する減点を選びます（A減点に加算）。
          「投げ受けの操作（上限0.50）」はシリーズ入力から自動判定するため、ここには出しません。
        </p>
      </section>

      <section className="card">
        <div className="line-head">違反・欠如（§3.5.6.3）</div>
        {VIOLATION_OPTIONS.map((v) => (
          <label key={v.id} className="check">
            <input
              type="checkbox"
              checked={violations.includes(v.id)}
              onChange={(e) => setViolations((p) => toggleId(p, v.id, e.target.checked))}
            />
            {v.name}
          </label>
        ))}
        <p className="hint">該当する違反・欠如にチェックします。各1つにつき −0.30点（A減点）。</p>
      </section>

      <ScoreSummary result={result} apparatus={apparatus} />

      <PrintSheet result={result} apparatus={apparatus} junior={junior} series={series} />

      {/* 入力中どこにいても届くように、画面下に貼り付く操作バー */}
      <div className="action-bar">
        <span className="action-bar-score">
          合計 <b>{result.grandTotal.toFixed(1)}</b>
          <span className="action-bar-sub">
            D {result.dScore.toFixed(1)}／A {result.aScore.toFixed(1)}／E {result.eScore.toFixed(1)}
          </span>
        </span>
        <span className="action-bar-btns">
          <button className="io-btn" onClick={saveCurrentRoutine}>
            <Save size={14} /> 構成を保存
          </button>
          <button className="io-btn" onClick={() => setTemplateOpen(true)}>
            <BookMarked size={14} /> テンプレート
          </button>
        </span>
      </div>
    </>
  );
}
