// =====================================================================
// 構成の探索
//
// 候補（登録テンプレート＋自動生成）から、評価（`generateEvaluate.ts`）がいちばん高い
// 並びを探す。手順は5つ：
//  ① 貪欲法（`greedyAttempt`）：ランダムな順に見て、評価が上がるものだけ足す。
//     登録テンプレートを先に見て、足りないところを自動生成で補う
//  ② 量の調整（`tuneAutoSeries`）：自動生成のシェネの回数・宙返りの本数を増減する。
//     Dスコアの範囲に「シリーズを丸ごと落とす」より先に「減らして収める」で届かせる
//  ③ 刈り込み：抜いても評価が下がらないシリーズを取り除く（＝評価されない要素を入れない）
//  ④ 並べ替え（`orderSeries`）：投げとタンブリングを交互にし、締めのキャッチを最後に置く
//  ⑤ 詰め直し（`swapIn` / `satisfying` / `upgradeTumblings`）：必須要素が残っていれば
//     1本ずつ入れ替え、それでも足りなければ不足を満たす1本を起点に組み直す。
//     最後にタンブリングだけを高難度の候補に入れ替える
// =====================================================================

import { analyzeSeries } from "./analysis";
import { autoThrowTemplates, cheneCountRange, isAutoThrowTemplate, withCheneCount } from "./autoThrows";
import {
  autoTumblingTemplates,
  isAutoTumblingTemplate,
  saltoCountRange,
  usedSkillIds,
  withSaltoCount,
} from "./autoTumblings";
import { endsWithFinishCatch, evaluateUsed, type Evaluation } from "./generateEvaluate";
import {
  BASIC_LEVEL_MAX_SCORE,
  DEFAULT_MAX_AUTO_THROWS,
  DEFAULT_MAX_AUTO_TUMBLINGS,
  FINISH_CATCH_TAG,
  THROW_REBUILD_CANDIDATES,
  TUMBLING_UPGRADE_ROUNDS,
  autoLimitOf,
  autoSeriesMax,
} from "./generateWeights";
import { shuffled } from "./pick";
import { isCommonApparatus, type SeriesTemplate } from "./templates";
import type { GenerateOptions } from "./generateOptions";
import type { ApparatusKey, FutureLevel, Series } from "./types";

/** 指定した手具で使えるシリーズテンプレート（その手具のもの＋共通） */
export function usableTemplates(templates: SeriesTemplate[], apparatus: ApparatusKey): SeriesTemplate[] {
  return templates.filter((t) => isCommonApparatus(t.apparatus) || t.apparatus === apparatus);
}

/**
 * 自動生成のシリーズの候補（それぞれ `autoThrows` / `autoTumblings` で切れる）。
 * タンブリングは**登録テンプレートに出てくる技だけ**で組む（`skillIds`）。
 * テンプレートが1つも無いときだけ、技の一覧から自由に組む。
 */
export function autoPool(opts: GenerateOptions, own: SeriesTemplate[], rand: () => number): SeriesTemplate[] {
  const pool: SeriesTemplate[] = [];
  // 割合が0＝自動生成を使わない（候補を作るだけ無駄なので作らない）
  if (autoSeriesMax(opts) === 0) return pool;
  if (opts.autoThrows !== false)
    pool.push(
      ...autoThrowTemplates(opts.apparatus, {
        random: rand,
        limit: opts.autoThrowLimit,
        // 実施例の無い投げ方（左手投げ＋視野外）は要求値が上がるほど出やすくする
        demandScore: opts.minScore,
        // 十年後モードでは5〜6動作（F・G難度）の形も候補にする
        future: opts.future ?? null,
        // 生成する形の珍しさ（0〜100。既定50＝実測どおり）
        rarity: opts.rarity,
      }),
    );
  if (opts.autoTumblings !== false)
    pool.push(
      ...autoTumblingTemplates(opts.apparatus, {
        junior: !!opts.junior,
        // 十年後モードではF・G難度の技もタンブリングの候補にする
        future: opts.future ?? null,
        // 低いDスコアを狙うなら、基本的な構成の選手とみなして候補を寄せる
        basicLevel: opts.maxScore != null && opts.maxScore < BASIC_LEVEL_MAX_SCORE,
        // 後ろ向きで終わる後方宙返りで終わる確率は狙うDスコアで決まる
        targetScore: opts.maxScore,
        // 実施例の無い投げ受け（背面キャッチ・左手投げ）は要求値が上がるほど出やすくする
        demandScore: opts.minScore,
        skillIds: opts.autoTumblingSkills ?? usedSkillIds(own.map((t) => t.series)),
        random: rand,
        limit: opts.autoTumblingLimit,
        // 生成する形の珍しさ（0〜100。既定50＝実測どおり）
        rarity: opts.rarity,
      }),
    );
  return pool;
}

/** 自動生成の候補の「量」を変えた別案（投げ＝シェネの回数、タンブリング＝宙返りの本数） */
export function autoVariants(t: SeriesTemplate): SeriesTemplate[] {
  if (isAutoThrowTemplate(t))
    return cheneCountRange(t.spec.pattern).flatMap((n) => withCheneCount(t, n) ?? []);
  if (isAutoTumblingTemplate(t))
    return saltoCountRange(t.spec.pattern).flatMap((n) => withSaltoCount(t, n) ?? []);
  return [];
}

/**
 * 自動生成のシリーズの量（シェネの回数・宙返りの本数）を、評価が上がるあいだ増減する。
 * Dスコアの上限を指定したときは「シリーズを丸ごと落とす」より先に
 * 「減らして範囲に収める」が選べるようになり、下限を指定したときは
 * 逆に増やして届かせる。形ごとの範囲は外れない。
 */
export function tuneAutoSeries(
  used: SeriesTemplate[],
  cur: Evaluation,
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  let list = used;
  let ev = cur;
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < list.length; i++) {
      for (const tuned of autoVariants(list[i])) {
        const next = list.map((x, k) => (k === i ? tuned : x));
        const e = evaluateUsed(next, opts);
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

/** 転回系（宙返り・投げタン）を含むシリーズか。並べ替えの区分に使う。 */
export function isTumblingSeries(
  series: Series,
  junior: boolean,
  future: FutureLevel = null,
): boolean {
  return analyzeSeries(series, junior, future).units.some(
    (u) => u.type === "tumbling" || u.isThrowTumbling,
  );
}

/** 多いほうの並びに、少ないほうを均等に挟み込む */
export function interleave<T>(many: T[], few: T[]): T[] {
  const out: T[] = [];
  let k = 0;
  many.forEach((item, i) => {
    out.push(item);
    // i番目まで来たら、少ないほうを「ここまでに入れておきたい数」まで入れる
    const want = Math.ceil(((i + 1) * few.length) / many.length);
    while (k < want && k < few.length) out.push(few[k++]);
  });
  while (k < few.length) out.push(few[k++]);
  return out;
}

/**
 * 投げ（徒手系）とタンブリングが交互になるように並べ替える。
 * 貪欲法は評価が上がった順に足すだけなので、そのままだと投げが先頭に固まる。
 * 実際の演技は投げとタンブリングを交互に構成するので、採点画面にそのまま
 * 持っていける並びにする。並びで点数は変わらないが、ジュニアの投げ上限は
 * 前から数えるので、評価が下がる並びになったときは元の順のままにする。
 */
export function orderSeries(
  used: SeriesTemplate[],
  cur: Evaluation,
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  const junior = !!opts.junior;
  const future = opts.future ?? null;
  const tumbling = used.filter((t) => isTumblingSeries(t.series, junior, future));
  const throws = used.filter((t) => !isTumblingSeries(t.series, junior, future));
  let ordered = used;
  if (tumbling.length > 0 && throws.length > 0)
    ordered =
      tumbling.length >= throws.length ? interleave(tumbling, throws) : interleave(throws, tumbling);
  ordered = finishCatchLast(ordered, opts.apparatus);
  if (ordered === used) return { used, ev: cur };
  const ev = evaluateUsed(ordered, opts);
  return ev.value >= cur.value - 1e-9 ? { used: ordered, ev } : { used, ev: cur };
}

/**
 * クラブは**もう一方の手具で押さえたキャッチ**、ロープは**足に絡めたキャッチ**で
 * 演技を締めることがとても多いので（`FINISH_CATCH_TAG`）、その受けで終わるシリーズを
 * 最後に置く（並びで点数は変わらないが、`FINISH_CATCH_WEIGHT` ぶん評価が上がる）。
 */
export function finishCatchLast(list: SeriesTemplate[], apparatus: ApparatusKey): SeriesTemplate[] {
  if (!FINISH_CATCH_TAG[apparatus] || list.length < 2) return list;
  const ends = (t: SeriesTemplate) => endsWithFinishCatch(t.series, apparatus);
  const idx = list.findIndex(ends);
  if (idx < 0 || ends(list[list.length - 1])) return list;
  return [...list.filter((_, i) => i !== idx), list[idx]];
}

/** 自動生成のシリーズの本数が上限（種類ごと・割合）を超えていないか */
export function withinAutoLimits(list: SeriesTemplate[], opts: GenerateOptions): boolean {
  const throws = list.filter(isAutoThrowTemplate).length;
  const tumblings = list.filter(isAutoTumblingTemplate).length;
  const ratioMax = autoSeriesMax(opts);
  if (ratioMax !== null && throws + tumblings > ratioMax) return false;
  return (
    throws <= (opts.maxAutoThrows ?? DEFAULT_MAX_AUTO_THROWS) &&
    tumblings <= (opts.maxAutoTumblings ?? DEFAULT_MAX_AUTO_TUMBLINGS)
  );
}

/**
 * 最後の詰め。使っている1本を別の候補に入れ替えて評価が上がるなら採る。
 * タンブリングは3本までなので、貪欲法だけでは必須要素の組み合わせに届かないことがある
 * （三宙・つなぎ技・投げタンを3本に収める並び）。いちばん良い構成に対してだけ、
 * 必須要素が足りないときに行うので、生成時間はほとんど増えない。
 */
export function swapIn(
  used: SeriesTemplate[],
  cur: Evaluation,
  pool: SeriesTemplate[],
  opts: GenerateOptions,
  rounds = 2,
): { used: SeriesTemplate[]; ev: Evaluation } {
  let list = used;
  let ev = cur;
  for (let round = 0; round < rounds; round++) {
    let improved = false;
    for (let i = 0; i < list.length; i++) {
      const usedIds = new Set(list.map((t) => t.id));
      for (const t of pool) {
        if (usedIds.has(t.id)) continue;
        const next = list.map((x, k) => (k === i ? t : x));
        if (!withinAutoLimits(next, opts)) continue;
        const e = evaluateUsed(next, opts);
        if (e.value > ev.value + 1e-9) {
          list = next;
          ev = e;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { used: list, ev };
}

/**
 * タンブリングだけを入れ替えて難度を上げる最後の一手。**上級者のタンブリングはほぼE難度**だが、
 * 貪欲法はタンブリングの枠（`DEFAULT_MAX_TUMBLINGS`）が埋まったあとに出てきた高難度の候補を
 * 見られない（足すと本数超過で評価が下がる）。候補をタンブリングだけに絞って入れ替えるので、
 * 見る組み合わせは少なく、生成時間もほとんど増えない。
 */
export function upgradeTumblings(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  pool: SeriesTemplate[],
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  const junior = !!opts.junior;
  const tumblings = pool.filter((t) => isTumblingSeries(t.series, junior, opts.future ?? null));
  if (tumblings.length === 0) return best;
  const swapped = swapIn(best.used, best.ev, tumblings, opts, TUMBLING_UPGRADE_ROUNDS);
  if (swapped.ev.value <= best.ev.value + 1e-9) return best;
  const ordered = orderSeries(swapped.used, swapped.ev, opts);
  return { used: ordered.used, ev: ordered.ev };
}

/**
 * 貪欲法の1回ぶん。`start` のシリーズは必ず入れた状態から始める。
 *  ① ランダムな順に見て、評価が上がるものだけ足す（登録テンプレートを先に見る）
 *  ② 自動生成のシリーズは量（シェネの回数・宙返りの本数）を調整する
 *  ③ 抜いても評価が下がらないシリーズを取り除く
 *  ④ 投げとタンブリングを交互に並べる
 */
export function greedyAttempt(
  start: SeriesTemplate[],
  own: SeriesTemplate[],
  auto: SeriesTemplate[],
  opts: GenerateOptions,
  rand: () => number,
  maxSeries: number,
): { used: SeriesTemplate[]; ev: Evaluation } {
  let used: SeriesTemplate[] = [...start];
  let cur = evaluateUsed(used, opts);
  /** 自動生成の候補を種類ごとに何本使ったか */
  const autoUsed = new Map<string, number>();
  let autoTotal = 0;
  const countAuto = (t: SeriesTemplate) => {
    if (autoLimitOf(t, opts) === null) return;
    const kind = isAutoThrowTemplate(t) ? "throw" : "tumbling";
    autoUsed.set(kind, (autoUsed.get(kind) ?? 0) + 1);
    autoTotal += 1;
  };
  start.forEach(countAuto);
  // 自動生成にしてよい割合（`autoRatio`）ぶんの本数。null＝割合では制限しない
  const ratioMax = autoSeriesMax(opts);

  // ① ランダムな順に見て、評価が上がるものだけ足す。
  //    登録テンプレートを先に見て、足りないところを自動生成で補う。
  const startIds = new Set(used.map((t) => t.id));
  for (const t of [...shuffled(own, rand), ...shuffled(auto, rand)]) {
    if (used.length >= maxSeries) break;
    if (startIds.has(t.id)) continue;
    // 自動生成のシリーズは補いの本数まで（テンプレートを押しのけないように）
    const limit = autoLimitOf(t, opts);
    const kind = isAutoThrowTemplate(t) ? "throw" : "tumbling";
    if (limit !== null && (autoUsed.get(kind) ?? 0) >= limit) continue;
    // 自動生成の割合の上限（種類をまとめた本数）
    if (limit !== null && ratioMax !== null && autoTotal >= ratioMax) continue;
    const next = [...used, t];
    const ev = evaluateUsed(next, opts);
    if (ev.value > cur.value + 1e-9) {
      used = next;
      cur = ev;
      countAuto(t);
    }
  }

  // ② 自動生成のシリーズは量（シェネの回数・宙返りの本数）を調整する
  const tuned = tuneAutoSeries(used, cur, opts);
  used = tuned.used;
  cur = tuned.ev;

  // ③ 抜いても評価が下がらないシリーズを取り除く（＝評価されない要素を入れない）
  //    ただし必ず入れる指定のものは残す
  const keep = new Set(start.map((t) => t.id));
  for (let improved = true; improved && used.length > 0; ) {
    improved = false;
    for (let i = 0; i < used.length; i++) {
      if (keep.has(used[i].id)) continue;
      const next = used.filter((_, k) => k !== i);
      const ev = evaluateUsed(next, opts);
      if (ev.value >= cur.value - 1e-9) {
        used = next;
        cur = ev;
        improved = true;
        break;
      }
    }
  }

  // ④ 投げとタンブリングを交互に並べる
  const ordered = orderSeries(used, cur, opts);
  return { used: ordered.used, ev: ordered.ev };
}

/** その候補を必ず入れて組み直す価値があるもの（不足を満たせる候補） */
export function satisfying(
  pool: SeriesTemplate[],
  ev: Evaluation,
  opts: GenerateOptions,
  rand: () => number,
): SeriesTemplate[] {
  const list = pool.filter((t) => {
    const one = evaluateUsed([t], opts);
    return ev.missing.some((m) => !one.missing.includes(m));
  });
  if (!ev.throwCountUnmet) return list;
  // 投げの回数は1本では満たせない（3回必要）ので、投げを含む候補も起点にする。
  // 起点も登録テンプレートを先に試す（自動生成は足りないところを補うもの）
  const withThrow = pool.filter((t) => t.series.items.some((it) => it.kind === "throw"));
  const throwers = [
    ...shuffled(
      withThrow.filter((t) => !t.auto),
      rand,
    ),
    ...shuffled(
      withThrow.filter((t) => t.auto),
      rand,
    ),
  ].slice(0, THROW_REBUILD_CANDIDATES);
  return [...new Set([...list, ...throwers])];
}
