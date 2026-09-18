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

/**
 * 重み付きで1つ選ぶ（重みは1が既定。重み0は選ばれない）。
 * `exponent` は珍しさのつまみ（`rarityExponent`）。1＝重みそのまま。
 */
export function pickWeighted<T>(
  list: T[],
  rand: () => number,
  weightOf: (x: T) => number,
  exponent = 1,
): T {
  const w = exponent === 1 ? weightOf : (x: T) => rarityWeight(weightOf(x), exponent);
  let left = rand() * list.reduce((n, x) => n + w(x), 0);
  for (const x of list) {
    left -= w(x);
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
  exponent = 1,
): string | null {
  if (options.length === 0) return null;
  const fresh = options.filter((id) => !used.includes(id));
  const list = fresh.length > 0 ? fresh : options;
  return pickWeighted(list, rand, (id) => weights[id] ?? 1, exponent);
}

// =====================================================================
// 珍しさ（`rarity`）
//
// 重みは「どれくらい実施されるか」そのものなので、**重みを指数で変形**すれば
// 「ありふれた形だけ」〜「珍しい形を優先」を1つのつまみで動かせる。
// 0＝最も遷移しやすいものに尖らせる／50＝実測どおり（既定）／100＝重みを反転。
// 抽選（`pickWeighted` / `pickDifferent`）と0〜1の確率（`rarityChance`）の
// 両方に同じつまみを掛けるので、技だけでなく「珍しい並び」自体が動く。
// =====================================================================

/** 珍しさの既定値（＝実測どおりの頻度） */
export const DEFAULT_RARITY = 50;

/** 珍しさ0（ありふれた形だけ）のときの指数。大きいほど最頻の形に尖る */
export const RARITY_COMMON_EXPONENT = 3;

/** 珍しさ100（珍しい形を優先）のときの指数。負にすると重みが反転する */
export const RARITY_RARE_EXPONENT = -1;

/** 珍しさ（0〜100）を重みに掛ける指数に変換する（50で1＝そのまま） */
export function rarityExponent(rarity: number = DEFAULT_RARITY): number {
  const r = Math.min(100, Math.max(0, rarity));
  if (r === DEFAULT_RARITY) return 1;
  return r < DEFAULT_RARITY
    ? 1 + ((DEFAULT_RARITY - r) / DEFAULT_RARITY) * (RARITY_COMMON_EXPONENT - 1)
    : 1 - ((r - DEFAULT_RARITY) / DEFAULT_RARITY) * (1 - RARITY_RARE_EXPONENT);
}

/** 重みに珍しさの指数を掛ける（0以下の重みは選ばれないままにする） */
export const rarityWeight = (weight: number, exponent: number): number =>
  weight > 0 ? weight ** exponent : 0;

/**
 * 0〜1の確率に珍しさを掛ける。`p^k / (p^k + (1-p)^k)` なので
 * 0.5 は動かず、指数が負なら起きやすさが入れ替わる（`rarityExponent` と同じ向き）。
 */
export function rarityChance(p: number, rarity: number = DEFAULT_RARITY): number {
  if (p <= 0 || p >= 1) return p;
  const k = rarityExponent(rarity);
  if (k === 1) return p;
  const a = p ** k;
  const b = (1 - p) ** k;
  return a / (a + b);
}
