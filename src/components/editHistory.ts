// =====================================================================
// Undo / Redo の中身（React に依存しない純粋な部分）
//
// フック（`useEditHistory`）は「値の変化を観測して、ここの関数でスタックを
// 動かす」だけにしてある。判断の核が純粋なので単体テストできる。
// =====================================================================

/** 履歴に積む上限。これを超えたら古いものから捨てる。 */
export const HISTORY_LIMIT = 50;

/**
 * 連続した編集を1つにまとめる時間（ms）。
 * 数値入力は1キーごとに `onChange` が飛ぶので、そのままだと1文字＝1履歴になる。
 */
export const COALESCE_MS = 800;

/**
 * 「形」の署名。**数値だけを潰して**比較するので、数値をいじっただけの変化が分かる。
 * 技を足す・消す・並べ替える・選び直すといった変化は署名が変わる。
 */
export const shapeOf = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "number" ? 0 : x));

/**
 * 直前の履歴に吸収してよい変化か。
 * 形が同じ（＝数値を変えただけ）で、かつ直前の編集から間が空いていないときだけ。
 * 積むものが無いとき（最初の1回）は吸収しない — でないと最初の編集が記録されない。
 */
export function shouldCoalesce(
  prevShape: string,
  nextShape: string,
  elapsedMs: number,
  pastLength: number,
  coalesceMs: number = COALESCE_MS,
): boolean {
  return pastLength > 0 && prevShape === nextShape && elapsedMs < coalesceMs;
}

export interface HistoryStacks<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T>(): HistoryStacks<T> => ({ past: [], future: [] });

/**
 * 編集を1件記録する。`previous` は**変化する前**の値。
 * `coalesce` が true なら積まずに（直前の履歴に吸収して）やり直しだけ捨てる。
 */
export function recordEdit<T>(
  h: HistoryStacks<T>,
  previous: T,
  coalesce: boolean,
  limit: number = HISTORY_LIMIT,
): HistoryStacks<T> {
  return {
    past: coalesce ? h.past : [...h.past, previous].slice(-limit),
    // 新しく編集したらやり直しの先は消える
    future: [],
  };
}

/** 1つ戻す。戻せなければ null。 */
export function undoStep<T>(
  h: HistoryStacks<T>,
  current: T,
  limit: number = HISTORY_LIMIT,
): { history: HistoryStacks<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1];
  return {
    history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, limit) },
    value,
  };
}

/** 1つやり直す。やり直せなければ null。 */
export function redoStep<T>(
  h: HistoryStacks<T>,
  current: T,
  limit: number = HISTORY_LIMIT,
): { history: HistoryStacks<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const value = h.future[0];
  return {
    history: { past: [...h.past, current].slice(-limit), future: h.future.slice(1) },
    value,
  };
}

/**
 * 値の変化を観測したときに何をするか。**順番が肝心**なので関数にして固定する。
 *
 * - `init`: 初回。基準を覚えるだけ。
 * - `applied`: undo/redo による変化。履歴には積まず、フラグを下ろす。
 * - `ignore`: 中身が変わっていない（再レンダーだけ）。
 * - `record`: ふつうの編集。履歴に積む。
 *
 * `applied` の判定は `ignore` より**先**でなければならない。まとめ（coalesce）の結果、
 * 戻した先が今と同じ JSON になることがあり、そこで `ignore` にするとフラグが立ったまま
 * 残って、次の本物の編集が記録されなくなる。
 */
export function observeChange(opts: {
  hasPrevious: boolean;
  sameJson: boolean;
  applying: boolean;
}): "init" | "applied" | "ignore" | "record" {
  if (!opts.hasPrevious) return "init";
  if (opts.applying) return "applied";
  if (opts.sameJson) return "ignore";
  return "record";
}
