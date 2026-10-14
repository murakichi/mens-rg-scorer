import { X, Trash2, Download, Upload, BookMarked } from "lucide-react";
import {
  addTeamTemplate,
  defaultTeamTemplateName,
  describeTeam,
  mergeTeamTemplates,
  normalizeTeamTemplateStore,
  removeTeamTemplate,
  renameTeamTemplate,
  type TeamTemplateStore,
} from "../scoring/teamTemplates";
import type { TeamState } from "../scoring/team";

interface Props {
  open: boolean;
  store: TeamTemplateStore;
  /** いま編集している構成（「現在の構成を保存」用） */
  team: TeamState;
  onChange: (next: TeamTemplateStore) => void;
  onLoad: (team: TeamState) => void;
  onClose: () => void;
}

const stamp = (t: number) => new Date(t).toLocaleDateString("ja-JP");

/**
 * 団体の構成テンプレート管理（#71）。
 * 個人のテンプレート画面と違い、ここで中身を編集はしない — 保存・読み込み・名前変更・削除だけ。
 */
export function TeamTemplateModal({ open, store, team, onChange, onLoad, onClose }: Props) {
  if (!open) return null;

  const save = () => {
    const name = window.prompt("テンプレート名", defaultTeamTemplateName(store));
    const trimmed = name?.trim();
    if (!trimmed) return;
    // 同じ名前は上書きになるので、黙って消さずに確認する
    if (store.routines.some((t) => t.name === trimmed) && !window.confirm(`「${trimmed}」を上書きしますか？`))
      return;
    onChange(addTeamTemplate(store, trimmed, team));
  };

  const load = (t: TeamTemplateStore["routines"][number]) => {
    if (!window.confirm(`「${t.name}」を読み込みます。編集中の構成は置き換わります。`)) return;
    onLoad(structuredClone(t.team));
    onClose();
  };

  const exportStore = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importStore = () => {
    const raw = window.prompt("テンプレートのJSONを貼り付けてください");
    if (!raw?.trim()) return;
    try {
      const next = normalizeTeamTemplateStore(JSON.parse(raw));
      if (next.routines.length === 0) {
        alert("テンプレートが見つかりませんでした");
        return;
      }
      onChange(mergeTeamTemplates(store, next));
    } catch {
      alert("JSONの読み込みに失敗しました");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            <BookMarked size={15} /> 団体のテンプレート
          </span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="gen-body">
          <div className="io-wrap">
            <button className="io-btn" onClick={save}>
              現在の構成を保存
            </button>
            <button className="io-btn" onClick={exportStore} disabled={store.routines.length === 0}>
              <Download size={14} /> 書き出し
            </button>
            <button className="io-btn" onClick={importStore}>
              <Upload size={14} /> 読み込み
            </button>
          </div>
          <p className="hint">
            構成まるごとを保存します（実施減点は構成ではないので保存しません）。同じ名前で保存すると上書きです。
            シリーズ単位のテンプレートは、グリッドの形が絡むのでまだありません。
          </p>

          {store.routines.length === 0 ? (
            <p className="hint">まだテンプレートがありません。</p>
          ) : (
            <div className="tpl-cards">
              {store.routines.map((t) => (
                <div key={t.id} className="tpl-card is-static">
                  <div className="tpl-card-head">
                    <b>{t.name}</b>
                    <span className="tpl-card-meta">{stamp(t.updatedAt)}</span>
                  </div>
                  <div className="tpl-card-desc">{describeTeam(t.team)}</div>
                  <div className="tpl-card-actions">
                    <button className="io-btn" onClick={() => load(t)}>
                      読み込む
                    </button>
                    <button
                      className="io-btn"
                      onClick={() => {
                        const name = window.prompt("新しい名前", t.name);
                        if (name?.trim()) onChange(renameTeamTemplate(store, t.id, name));
                      }}
                    >
                      名前を変更
                    </button>
                    <button
                      className="remove-btn-sm"
                      onClick={() => {
                        if (window.confirm(`「${t.name}」を削除しますか？`)) onChange(removeTeamTemplate(store, t.id));
                      }}
                    >
                      <Trash2 size={13} /> 削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="io-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
