import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  emptyHistory,
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

    // 初回は基準を覚えるだけ
    if (!prev) {
      current.current = snap;
      return;
    }
    // 中身が同じなら何もしない（再レンダーだけの回）
    if (prev.json === json) return;
    // undo/redo による変化は積まない
    if (applying.current) {
      applying.current = false;
      current.current = snap;
      bump();
      return;
    }
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
  // 入力欄の中ではブラウザ本来の取り消しに譲る（文字単位で戻せたほうがよい）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
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
