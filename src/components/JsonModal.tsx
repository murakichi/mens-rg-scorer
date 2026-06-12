import { X } from "lucide-react";
import { S } from "../styles";

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
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span>{mode === "export" ? "テキスト出力（JSON）" : "テキスト読込（JSON）"}</span>
          <button style={S.removeBtnXs} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <textarea
          style={S.modalTextarea}
          value={text}
          readOnly={mode === "export"}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={mode === "import" ? "JSONを貼り付けてください" : ""}
        />
        <div style={S.modalActions}>
          {mode === "export" ? (
            <button style={S.ioBtn} onClick={onCopy}>
              クリップボードにコピー
            </button>
          ) : (
            <button style={S.ioBtn} onClick={onImport}>
              読み込む
            </button>
          )}
          <button style={S.ioBtn} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
