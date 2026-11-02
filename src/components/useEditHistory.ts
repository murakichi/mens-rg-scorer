import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  emptyHistory,
  observeChange,
  recordEdit,
  redoStep,
  shapeOf,
  shouldCoalesce,
  undoStep,
  type HistoryStacks,
} from "./editHistory";

/**
 * 構成の編集に対する Undo / Redo。
 *
 * 既存の `useState` はそのままに、**値の変化を見て履歴を積む**形にしてある
 * （更新側に手を入れないので、`setSeries` の呼び出し箇所が増えても履歴は勝手に付いてくる）。
 * 採点ごとの入力（E実施減点・違反チェック・芸術の欠点）は履歴に入れない — 履歴は
 * 構成の変遷と対応していたほうが分かりやすい（#68）。
 *
 * スタックの操作そのものは `editHistory.ts`（Reactに依存しない）に置いてテストしている。
 */

/** 文字を打つ欄か（ブラウザ本来の取り消しが効く相手） */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "password", "tel"]);
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
  return TEXT_INPUT_TYPES.has(type);
}

export interface EditHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** テンプレート読込など「履歴を捨てて作り直す」場面で使う */
  clear: () => void;
}

export function useEditHistory<T>(
  value: T,
  restore: (v: T) => void,
  options: { limit?: number; coalesceMs?: number } = {},
): EditHistory {
  const limit = options.limit ?? HISTORY_LIMIT;
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;

  const stacks = useRef<HistoryStacks<T>>(emptyHistory<T>());
  /** 直前に観測した値。これが履歴に積む対象になる。 */
  const current = useRef<{ value: T; json: string; shape: string; at: number } | null>(null);
  /** undo/redo で戻している最中か（その変化は履歴に積まない） */
  const applying = useRef(false);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const json = JSON.stringify(value);
    const prev = current.current;
    const snap = { value, json, shape: shapeOf(value), at: Date.now() };

    const action = observeChange({
      hasPrevious: !!prev,
      sameJson: !!prev && prev.json === json,
      applying: applying.current,
    });
    if (action === "ignore") return;
    if (action === "init") {
      current.current = snap;
      return;
    }
    if (action === "applied") {
      applying.current = false;
      current.current = snap;
      bump();
      return;
    }
    if (!prev) return; // action === "record" なら prev はあるが、型のために明示する
    stacks.current = recordEdit(
      stacks.current,
      prev.value,
      shouldCoalesce(prev.shape, snap.shape, snap.at - prev.at, stacks.current.past.length, coalesceMs),
      limit,
    );
    current.current = snap;
    bump();
  }, [value, limit, coalesceMs]);

  const undo = useCallback(() => {
    if (!current.current) return;
    const step = undoStep(stacks.current, current.current.value, limit);
    if (!step) return;
    stacks.current = step.history;
    applying.current = true;
    restore(step.value);
  }, [restore, limit]);

  const redo = useCallback(() => {
    if (!current.current) return;
    const step = redoStep(stacks.current, current.current.value, limit);
    if (!step) return;
    stacks.current = step.history;
    applying.current = true;
    restore(step.value);
  }, [restore, limit]);

  const clear = useCallback(() => {
    stacks.current = emptyHistory<T>();
    bump();
  }, []);

  // Ctrl/Cmd+Z で戻す、Ctrl/Cmd+Shift+Z と Ctrl+Y でやり直す。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // モーダルが開いている間は裏の構成を触らない（テンプレート編集中に
      // 裏の演技が黙って戻る、という見えない事故を防ぐ）
      if (document.querySelector(".modal-overlay")) return;
      const el = e.target as HTMLElement | null;
      // **文字を打つ欄の中だけ**ブラウザ本来の取り消しに譲る。
      // プルダウン・チェックボックス・数値入力には本来の取り消しが無いので、
      // ここで譲ると「技を選んだ直後の Ctrl+Z が何も起きない」になってしまう。
      if (el?.isContentEditable || isTextEntry(el)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return {
    canUndo: stacks.current.past.length > 0,
    canRedo: stacks.current.future.length > 0,
    undo,
    redo,
    clear,
  };
}
