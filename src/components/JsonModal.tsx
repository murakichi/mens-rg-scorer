import { X } from "lucide-react";

export type JsonModalMode = "export" | "import" | null;

interface Props {
  mode: JsonModalMode;
  text: string;
  onTextChange: (text: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onImport: () => void;
}

/** JSONのテキスト出力／貼り付け読込モーダル */
export function JsonModal({ mode, text, onTextChange, onClose, onCopy, onImport }: Props) {
  if (!mode) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{mode === "export" ? "テキスト出力（JSON）" : "テキスト読込（JSON）"}</span>
          <button className="remove-btn-xs" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <textarea
          className="modal-textarea"
          value={text}
          readOnly={mode === "export"}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={mode === "import" ? "JSONを貼り付けてください" : ""}
        />
        <div className="modal-actions">
          {mode === "export" ? (
            <button className="io-btn" onClick={onCopy}>
              クリップボードにコピー
            </button>
          ) : (
            <button className="io-btn" onClick={onImport}>
              読み込む
            </button>
          )}
          <button className="io-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
