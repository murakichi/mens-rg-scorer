// =====================================================================
// 候補を配るための抽選ユーティリティ（自動生成で共通）
//
// 自動生成（`autoThrows.ts` / `autoTumblings.ts` / `generate.ts`）は
// 「できる限り被らせずに配る」「実際の演技での多さに寄せて引く」の2つだけで
// 候補を作る。乱数は呼び出し側から渡す（テストで固定できるようにするため）。
// =====================================================================

/** 並びをシャッフルした新しい配列 */
export function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 候補をできる限り被らせずに配る。ひと回りしたら並べ直して次の周に入るので、
 * 候補数より多く要求されても偏らない。
 */
export function cycler<T>(list: T[], rand: () => number): () => T {
  let rest: T[] = [];
  return () => {
    if (rest.length === 0) rest = shuffled(list, rand);
    return rest.pop() as T;
  };
}

/** 重み付きで1つ選ぶ（重みは1が既定。重み0は選ばれない） */
export function pickWeighted<T>(list: T[], rand: () => number, weightOf: (x: T) => number): T {
  let left = rand() * list.reduce((n, x) => n + weightOf(x), 0);
  for (const x of list) {
    left -= weightOf(x);
    if (left < 0) return x;
  }
  return list[list.length - 1];
}

/**
 * 同じ技の繰り返しは避けて1つ選ぶ（他に無ければ繰り返しも許す）。
 * `weights` を渡すと実際の演技での多さに寄せて選ぶ（表に無い技は1）。
 */
export function pickDifferent(
  options: string[],
  used: string[],
  rand: () => number,
  weights: Record<string, number> = {},
): string | null {
  if (options.length === 0) return null;
  const fresh = options.filter((id) => !used.includes(id));
  const list = fresh.length > 0 ? fresh : options;
  return pickWeighted(list, rand, (id) => weights[id] ?? 1);
}
