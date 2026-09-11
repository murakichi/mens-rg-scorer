// =====================================================================
// テンプレートから演技構成をランダムに生成する（個人モード）
//
// 方針：
//  - 使えるのは「指定した手具」と「共通」のシリーズテンプレート
//  - 必須要素をできるだけ満たす（不足はA減点に出るので、D + A残点 を最大化すれば満たしにいく）
//  - Dスコアの範囲を指定できる。指定がなければ最大を目指す
//  - 評価されない要素は入れない（入れても評価が上がらないシリーズは最後に取り除く）
//    例：4本目のタンブリング、ジュニアの6回目以降の投げ、まったく同じ内容の重複シリーズ
//  - 投げタンは1本まで（必須要素は1本で満たせるため）
//  - 投げ方（左手投げ・視野外・手以外…）を網羅したテンプレートを登録しなくても済むよう、
//    よくある投げシリーズはシステム側で組んで候補に足す（autoThrows.ts）。
//    あくまで候補なので、評価が上がらなければ使われない
//  - 自動生成の投げはシェネの回数を調整できる。Dスコアの範囲を指定したときに
//    シリーズを丸ごと落とさず「回数を減らして収める」（下限なら増やす）を選べる
//  - 同じ宙返りの繰り返しは避ける（前宙は例外）。必須ではないので弱い重み付けにとどめる
// =====================================================================

import { autoThrowTemplates, cheneCountRange, isAutoThrowTemplate, withCheneCount } from "./autoThrows";
import { computeScore } from "./score";
import { isCommonApparatus, type SeriesTemplate } from "./templates";
import { APPARATUS, skillDef } from "./constants";
import type { ApparatusKey, Series } from "./types";

export interface GenerateOptions {
  apparatus: ApparatusKey;
  junior?: boolean;
  /** Dスコアの下限・上限（未指定＝制限なし） */
  minScore?: number | null;
  maxScore?: number | null;
  /** 試行回数（多いほど良い構成が出やすいが遅くなる） */
  attempts?: number;
  /** シリーズ数の上限 */
  maxSeries?: number;
  /** 投げタン（転回系の投げ受け）の本数の上限。既定は1本。 */
  maxThrowTumbling?: number;
  /** 自動生成の投げシリーズを候補に加えるか（既定 true） */
  autoThrows?: boolean;
  /** 1つの構成に入れる自動生成の投げの本数の上限。既定は3本。 */
  maxAutoThrows?: number;
  /** 自動生成の投げシリーズの候補数の上限（既定＝全組み合わせ） */
  autoThrowLimit?: number;
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
}

export interface GenerateResult {
  series: Series[];
  /** 使ったテンプレート（並び順は生成結果と同じ） */
  used: SeriesTemplate[];
  dScore: number;
  aScore: number;
  /** 満たせなかった必須要素のラベル */
  missing: string[];
}

/** 生成する構成に入れる投げタンの本数の上限（必須要素は1本で満たせる） */
export const DEFAULT_MAX_THROW_TUMBLING = 1;

/**
 * 生成する構成に入れる自動生成の投げの本数の上限。
 * 技術加点（視野外・手以外…）に上限が無いため、放っておくと自動生成の投げだけで
 * 構成が埋まってしまう。難度に採用されるのも上位3本（`ADOPT_COUNT`）までなので、
 * 「テンプレートで足りない投げ方を補う」本数にとどめる。
 */
export const DEFAULT_MAX_AUTO_THROWS = 3;

/**
 * 同じ宙返りを繰り返したときの1回あたりの減点（評価用の重み）。
 * 上級者ほど同じ宙返りを演技中に何度も実施しないため、多様な宙返りを選ばせる。
 * 難度点の最小単位（0.1）より小さくして、点数を犠牲にしてまで多様性を取らないようにする。
 */
export const SALTO_VARIETY_WEIGHT = 0.02;

/** 演技中に何度実施しても不自然でない宙返り（前宙） */
export const REPEATABLE_SALTOS = ["b_front"];

/** 演技全体で同じ宙返りを繰り返した回数（2回目以降を数える。前宙は数えない）。 */
export function saltoRepeatCount(series: Series[]): number {
  const counts = new Map<string, number>();
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind !== "skill" || !item.skillId) return;
      if (REPEATABLE_SALTOS.includes(item.skillId)) return;
      if (!skillDef(item.skillId)?.isSalto) return;
      counts.set(item.skillId, (counts.get(item.skillId) ?? 0) + 1);
    }),
  );
  let repeats = 0;
  counts.forEach((n) => (repeats += Math.max(0, n - 1)));
  return repeats;
}

/** 範囲から外れた分のペナルティ。範囲内なら0。 */
function rangePenalty(d: number, min?: number | null, max?: number | null): number {
  let p = 0;
  if (min != null && d < min) p += min - d;
  if (max != null && d > max) p += d - max;
  return p;
}

interface Evaluation {
  value: number;
  dScore: number;
  aScore: number;
  missing: string[];
}

/**
 * 構成の良さ。範囲外は強いペナルティ、そのうえで D + A残点 を最大化する。
 * 必須要素の不足・ジュニアの投げ超過はA減点として効くので、これだけで
 * 「必須要素を満たしつつ難度を上げる」方向に進む。
 */
function evaluate(series: Series[], opts: GenerateOptions): Evaluation {
  const r = computeScore(series, opts.apparatus, { junior: !!opts.junior });
  const penalty = rangePenalty(r.dScore, opts.minScore, opts.maxScore);
  // 投げタンの本数制限（既定1本）。超えた分は範囲外と同じ強さで嫌う。
  const maxThrowTum = opts.maxThrowTumbling ?? DEFAULT_MAX_THROW_TUMBLING;
  const throwTumCount = r.analysis.reduce(
    (n, a) => n + a.units.filter((u) => u.isThrowTumbling).length,
    0,
  );
  const overThrowTum = Math.max(0, throwTumCount - maxThrowTum);
  // 同じ宙返りの繰り返しは弱く嫌う（同点のときに多様な構成が選ばれる程度）
  const variety = saltoRepeatCount(series) * SALTO_VARIETY_WEIGHT;
  return {
    value: -(penalty + overThrowTum) * 100 + r.dScore + r.aScore - variety,
    dScore: r.dScore,
    aScore: r.aScore,
    missing: r.missing.map((m) => m.label),
  };
}

function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** テンプレートの並びを、採点できるシリーズの並びに直す */
const seriesOf = (list: SeriesTemplate[]): Series[] => list.map((t) => structuredClone(t.series));

/** 指定した手具で使えるシリーズテンプレート（その手具のもの＋共通） */
export function usableTemplates(templates: SeriesTemplate[], apparatus: ApparatusKey): SeriesTemplate[] {
  return templates.filter((t) => isCommonApparatus(t.apparatus) || t.apparatus === apparatus);
}

/** 自動生成の投げシリーズの候補（`autoThrows: false` なら空） */
function autoThrowPool(opts: GenerateOptions, rand: () => number): SeriesTemplate[] {
  if (opts.autoThrows === false) return [];
  return autoThrowTemplates(opts.apparatus, { random: rand, limit: opts.autoThrowLimit });
}

/**
 * 自動生成の投げのシェネの回数を、評価が上がるあいだ増減する。
 * Dスコアの上限を指定したときは「シリーズを丸ごと落とす」より先に
 * 「回数を減らして範囲に収める」が選べるようになり、下限を指定したときは
 * 逆に回数を増やして届かせる。形ごとの範囲（`cheneCountRange`）は外れない。
 */
function tuneAutoThrows(
  used: SeriesTemplate[],
  cur: Evaluation,
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  let list = used;
  let ev = cur;
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!isAutoThrowTemplate(t)) continue;
      for (const n of cheneCountRange(t.spec.pattern)) {
        const tuned = withCheneCount(t, n);
        if (!tuned) continue;
        const next = list.map((x, k) => (k === i ? tuned : x));
        const e = evaluate(seriesOf(next), opts);
        if (e.value > ev.value + 1e-9) {
          list = next;
          ev = e;
          improved = true;
        }
      }
    }
  }
  return { used: list, ev };
}

/**
 * ランダムな貪欲法を何度も試して、いちばん評価の高い構成を返す。
 * 使えるテンプレートが無ければ null。
 */
export function generateRoutine(templates: SeriesTemplate[], opts: GenerateOptions): GenerateResult | null {
  const rand = opts.random ?? Math.random;
  // テンプレートが1つも無いときは生成しない（投げだけの構成になってしまうため）
  const own = usableTemplates(templates, opts.apparatus);
  if (own.length === 0) return null;
  const pool = [...own, ...autoThrowPool(opts, rand)];

  const attempts = opts.attempts ?? 40;
  const maxSeries = opts.maxSeries ?? 8;
  const maxAuto = opts.maxAutoThrows ?? DEFAULT_MAX_AUTO_THROWS;

  let best: { used: SeriesTemplate[]; ev: Evaluation } | null = null;

  for (let a = 0; a < attempts; a++) {
    let used: SeriesTemplate[] = [];
    let cur = evaluate([], opts);
    let autoUsed = 0;

    // ① ランダムな順に見て、評価が上がるものだけ足す
    for (const t of shuffled(pool, rand)) {
      if (used.length >= maxSeries) break;
      // 自動生成の投げは補いの本数まで（テンプレートを押しのけないように）
      if (t.auto && autoUsed >= maxAuto) continue;
      const next = [...used, t];
      const ev = evaluate(seriesOf(next), opts);
      if (ev.value > cur.value + 1e-9) {
        used = next;
        cur = ev;
        if (t.auto) autoUsed += 1;
      }
    }

    // ② 自動生成の投げはシェネの回数を調整する（範囲指定に収めるため）
    const tuned = tuneAutoThrows(used, cur, opts);
    used = tuned.used;
    cur = tuned.ev;

    // ③ 抜いても評価が下がらないシリーズを取り除く（＝評価されない要素を入れない）
    for (let improved = true; improved && used.length > 0; ) {
      improved = false;
      for (let i = 0; i < used.length; i++) {
        const next = used.filter((_, k) => k !== i);
        const ev = evaluate(seriesOf(next), opts);
        if (ev.value >= cur.value - 1e-9) {
          used = next;
          cur = ev;
          improved = true;
          break;
        }
      }
    }

    if (!best || cur.value > best.ev.value + 1e-9) best = { used, ev: cur };
  }

  if (!best || best.used.length === 0) return null;
  return {
    series: seriesOf(best.used),
    used: best.used,
    dScore: best.ev.dScore,
    aScore: best.ev.aScore,
    missing: best.ev.missing,
  };
}


/**
 * 手具を指定しない場合は全手具で生成して、いちばん良かったものを返す。
 * 指定した場合はその手具だけで生成する。
 */
export function generateForApparatus(
  templates: SeriesTemplate[],
  opts: Omit<GenerateOptions, "apparatus"> & { apparatus?: ApparatusKey | null },
): (GenerateResult & { apparatus: ApparatusKey }) | null {
  const list = opts.apparatus ? [opts.apparatus] : (Object.keys(APPARATUS) as ApparatusKey[]);
  let best: (GenerateResult & { apparatus: ApparatusKey }) | null = null;
  for (const apparatus of list) {
    const r = generateRoutine(templates, { ...opts, apparatus });
    if (!r) continue;
    const cand = { ...r, apparatus };
    // 比較は生成時と同じ基準（範囲外のペナルティ＋D＋A残点）
    const val = (x: GenerateResult) =>
      -rangePenalty(x.dScore, opts.minScore, opts.maxScore) * 100 + x.dScore + x.aScore;
    if (!best || val(cand) > val(best) + 1e-9) best = cand;
  }
  return best;
}
