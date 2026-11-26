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
//  ⑤ 詰め直し（`swapIn` / `satisfying` / `upgradeTumblings` / `levelAdoptedDiffs`）：
//     必須要素が残っていれば1本ずつ入れ替え、それでも足りなければ不足を満たす1本を起点に
//     組み直す。そのあとタンブリングだけを高難度の候補に入れ替え、最後に
//     **採用される難度が1段以内に揃うように**均す
// =====================================================================

import { analyzeSeries } from "./analysis";
import { computeScore } from "./score";
import { autoThrowTemplates, cheneCountRange, isAutoThrowTemplate, withCheneCount } from "./autoThrows";
import {
  autoTumblingTemplates,
  isAutoTumblingTemplate,
  saltoCountRange,
  usedSkillIds,
  withSaltoCount,
} from "./autoTumblings";
import {
  endsWithFinishCatch,
  evaluateUsed,
  extraTwoThrowSeriesCount,
  highDifficultyCount,
  hasTwoThrow,
  rangePenalty,
  type Evaluation,
} from "./generateEvaluate";
import {
  BASIC_LEVEL_MAX_SCORE,
  DEFAULT_MAX_AUTO_THROWS,
  DEFAULT_MAX_AUTO_TUMBLINGS,
  FINISH_CATCH_TAG,
  HAND_UPGRADE_ROUNDS,
  SPREAD_REPAIR_BUDGET,
  SPREAD_REPAIR_ROOM_RUN,
  SPREAD_REPAIR_ROUNDS,
  THROW_REBUILD_CANDIDATES,
  TUMBLING_UPGRADE_ROUNDS,
  aimsAllE,
  autoLimitOf,
  autoSeriesMax,
  preferredThrowCount,
  ROPE_FOOT_WRAP_KIND,
  ROLL_MOTIONS,
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
        // ユーザーが設定した技ごとの倍率
        skillWeights: opts.skillWeights,
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
  ordered = throwTumblingToFront(ordered, opts.apparatus, junior, future, opts.random ?? Math.random);
  ordered = highDifficultyTumblingFirst(ordered, junior, future);
  ordered = lastTumblingNearEnd(ordered, junior, future);
  if (ordered === used) return { used, ev: cur };
  const ev = evaluateUsed(ordered, opts);
  return ev.value >= cur.value - 1e-9 ? { used: ordered, ev } : { used, ev: cur };
}

/**
 * **単発で高難度（D難度以上）の技を含むタンブリングは、そうでないタンブリングより前で実施する**（オーナー 2026-11-20）。
 * 投げを含まないタンブリングのシリーズが並ぶ位置だけを使い、高難度を含むものを前に寄せる（それぞれの中の順は保つ）。
 * 投げタン（技の最中に投げる形を含む）は動かさない：技の最中に投げる投げタンはこの決まりの対象外（オーナー）、
 * それ以外の投げタンは3〜4つ目に置く決まり（`throwTumblingToFront`）が先にある。
 * **あくまで優先で、絶対ではない**（オーナー 2026-11-20）：`HIGH_TUMBLING_FIRST_CHANCE` の割合でだけ並べ替える。
 * 並べ替えるかは乱数を使わず中身から決める（乱数を引くとほかの抽選がずれるため）。
 */
export function highDifficultyTumblingFirst(
  list: SeriesTemplate[],
  junior: boolean,
  future: FutureLevel = null,
): SeriesTemplate[] {
  const slots = list
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        isTumblingSeries(t.series, junior, future) &&
        !t.series.items.some((it) => it.kind === "throw" || (it.kind === "skill" && it.isThrow)),
    );
  if (slots.length < 2) return list;
  // 並べ替えるかを中身から決める（同じ構成なら同じ結果）
  let h = 0;
  for (const ch of JSON.stringify(slots.map(({ t }) => t.series.items))) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if ((h % 100) / 100 >= HIGH_TUMBLING_FIRST_CHANCE) return list;
  const high = (t: SeriesTemplate) => highDifficultyCount([t.series], junior, future) > 0;
  const sorted = [...slots.filter(({ t }) => high(t)), ...slots.filter(({ t }) => !high(t))];
  if (sorted.every((x, k) => x === slots[k])) return list;
  const out = [...list];
  slots.forEach(({ i }, k) => {
    out[i] = sorted[k].t;
  });
  return out;
}

/**
 * **最後のタンブリングは演技の最後か、最後の投げの前あたりで実施する**（オーナー 2026-11-26）。
 * 並べ終えたあとで、最後のタンブリングが「最後」か「最後から2つ目」になければ、最後から2つ目のシリーズと入れ替える
 * （最後のシリーズ＝締めのキャッチなどには触れない）。投げタンは3〜4つ目に置く決まり（`throwTumblingToFront`）があるので、
 * 動かすのは投げを含まないタンブリングを優先し、無ければ最後のタンブリングをそのまま動かす。
 */
export function lastTumblingNearEnd(
  list: SeriesTemplate[],
  junior: boolean,
  future: FutureLevel = null,
): SeriesTemplate[] {
  const n = list.length;
  if (n < 3) return list;
  const isTum = list.map((t) => isTumblingSeries(t.series, junior, future));
  const lastT = isTum.lastIndexOf(true);
  if (lastT < 0 || lastT >= n - 2) return list;
  const hasThrow = (t: SeriesTemplate) =>
    t.series.items.some((it) => it.kind === "throw" || (it.kind === "skill" && it.isThrow));
  // 動かすタンブリング：投げを含まないもののうちいちばん後ろ、無ければ最後のタンブリング
  let pick = -1;
  for (let i = n - 1; i >= 0; i--) if (isTum[i] && !hasThrow(list[i])) { pick = i; break; }
  if (pick < 0) pick = lastT;
  const out = [...list];
  [out[pick], out[n - 2]] = [out[n - 2], out[pick]];
  return out;
}

/** 高難度を含むタンブリングを前に寄せる割合（優先であって絶対ではない） */
export const HIGH_TUMBLING_FIRST_CHANCE = 0.8;

/** 投げタンを置く位置の候補（0始まり。3つ目と4つ目のシリーズ） */
export const THROW_TUMBLING_POSITIONS = [2, 3];

/**
 * 投げタンは演技の前半（3〜4つ目のシリーズ）で実施することが多いので、
 * 投げタンのシリーズを3つ目か4つ目に寄せる（どちらかは乱数で決める。並びで点数は変わらない）。
 * 宙返りの最中に投げる投げタンは、最初のタンブリングで実施することもあるので、
 * 最初のタンブリングの位置も置き場所の候補に入れる。
 * 投げとタンブリングの交互の並びを崩さないよう、そこにある**タンブリングのシリーズと入れ替える**
 * （投げのシリーズは動かさない）。すでに3〜4つ目にあるときや、入れ替え先が無いときはそのまま。
 * 締めのキャッチで終わるシリーズを最後に置いているときは、その位置には触れない。
 */
export function throwTumblingToFront(
  list: SeriesTemplate[],
  apparatus: ApparatusKey,
  junior: boolean,
  future: FutureLevel = null,
  random: () => number = Math.random,
): SeriesTemplate[] {
  const idx = list.findIndex((t) => analyzeSeries(t.series, junior, future).units.some((u) => u.isThrowTumbling));
  if (idx < 0) return list;
  const lastFinish = !!FINISH_CATCH_TAG[apparatus] && endsWithFinishCatch(list[list.length - 1].series, apparatus);
  const movable = lastFinish ? list.length - 1 : list.length;
  const throwsInSkill = list[idx].series.items.some((it) => it.kind === "skill" && it.isThrow);
  const firstTumbling = list.findIndex((t) => isTumblingSeries(t.series, junior, future));
  const places = [...THROW_TUMBLING_POSITIONS, ...(throwsInSkill ? [firstTumbling] : [])];
  if (idx >= movable || places.includes(idx)) return list;
  const targets = [...new Set(places)].filter((p) => p < movable && isTumblingSeries(list[p].series, junior, future));
  if (targets.length === 0) return list;
  const target = targets[Math.floor(random() * targets.length)];
  const out = [...list];
  [out[idx], out[target]] = [out[target], out[idx]];
  return out;
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
 * 二つ投げのシリーズが2本以上入っているときに、**二つ投げを含まない候補**への入れ替えを試す
 * （1構成に1本まで、`TWO_THROW_EXTRA_WEIGHT`）。貪欲法は足す・外すしかしないので、
 * 同じ点数で二つ投げでない投げに替えられる場合も、ここで入れ替えて初めて届く。
 */
export function dropExtraTwoThrow(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  pool: SeriesTemplate[],
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  if (extraTwoThrowSeriesCount(best.used.map((t) => t.series)) === 0) return best;
  // シェネの回数・宙返りの本数を変えた別案も候補にする（Dスコアの上限を踏み越えずに替えるため）
  const plain = pool.flatMap((t) => [t, ...autoVariants(t)]).filter((t) => !hasTwoThrow(t.series));
  const swapped = swapIn(best.used, best.ev, plain, opts, 3);
  if (swapped.ev.value <= best.ev.value + 1e-9) return best;
  const ordered = orderSeries(swapped.used, swapped.ev, opts);
  return { used: ordered.used, ev: ordered.ev };
}

/** 投げの徒手ユニット（投げタンを除く）を含むシリーズか。徒手側の入れ替えの対象 */
export function isHandThrowSeries(
  series: Series,
  junior: boolean,
  future: FutureLevel = null,
): boolean {
  return analyzeSeries(series, junior, future).units.some(
    (u) => u.type === "throw" && !u.isThrowTumbling,
  );
}

/**
 * **Dスコア 4.2 以上を狙うときは、まず採点される6ユニットを全部E難度にしてから加点を積む**
 * （4.2 ＝ E 0.7 × 上位3タンブリング＋上位3徒手。`allEScore`）。
 * タンブリング側は `upgradeTumblings` でほぼEになっていたが、**徒手側が届いていなかった**
 * （実測：下限4.2で6つ全部Eは 9〜14/25 構成、採用徒手ユニットのE率 60〜67/75）。
 * 原因は同じで、貪欲法は投げの枠が埋まったあとの候補を見られず、`tuneAutoThrows` は
 * 選ばれた形のシェネ回数しか動かせない（最小形は伸ばせない）。なので候補を投げに絞って入れ替える。
 */
export function upgradeHandUnits(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  pool: SeriesTemplate[],
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  if (!aimsAllE(opts)) return best;
  const junior = !!opts.junior;
  const future = opts.future ?? null;
  const throws = pool.filter(
    (t) => isHandThrowSeries(t.series, junior, future) && !isTumblingSeries(t.series, junior, future),
  );
  if (throws.length === 0) return best;
  const swapped = swapIn(best.used, best.ev, throws, opts, HAND_UPGRADE_ROUNDS);
  if (swapped.ev.value <= best.ev.value + 1e-9) return best;
  const ordered = orderSeries(swapped.used, swapped.ev, opts);
  return { used: ordered.used, ev: ordered.ev };
}

/**
 * **採用ユニットの難度を均す最後の一手**（`MAX_ADOPTED_DIFF_SPREAD`）。
 * 変えるのは「どのシリーズを使うか」と「自動生成のシリーズの量」、それに**投げを1本足すこと**だけ。
 * タンブリングの本数は変えないし、シリーズを抜くこともしない。
 *
 * ばらつきの正体は**Dスコアの上限と貪欲法の順番**。貪欲法は1本足すごとに評価が上がるものを
 * 採るので、難度のかたまりが大きいタンブリングから埋まり、投げの番になるとDスコアの残りが
 * 少なく**安い投げ（徒手0〜1動作＝A・B難度）しか入らない**。Dスコア 2〜3点台の投げの最頻値は
 * 4回（`preferredThrowCount`）で、うち1本が投げタンだと徒手ユニットはちょうど3つ＝
 * **上位3つに全部入る**ので、その安い1本がそのまま採用されて幅3〜4になる
 * （実測：上限3.0で タン[E,C,E] 徒手[B,E,A] のような構成。幅1〜2で収まっていた構成は
 *  どれも投げ5回で、安い徒手が上位3つから外れていた）。
 *
 * 1本だけ入れ替えても直らない：安い投げを厚い投げに替えるとDスコアが上限を超えるので、
 * **同時に別のユニットを下げなければならない**。評価が上がる手しか採らない `swapIn` では
 * その「下げる」1手を踏めないし、幅のペナルティを重くしても同じ
 * （実測：0.5 → 1.5 → 4 と上げても頭打ち。足す手・量を動かす手を足しても変わらなかった）。
 *
 * なので**はみ出しの合計（`adoptedSpreadCost`）が減る向きに1手ずつ降りていき、いちばん均った
 * ところを採る**。手放してよい評価の量は `SPREAD_REPAIR_BUDGET` までで、途中もその外には出ない。
 * 幅そのものではなくはみ出しの合計を見るのは**足場**のため：幅は最大と最小しか見ないので、
 * {C,C,E,E} の C を1つ D に上げても幅は2のままで1手ずつでは改善が見えないが、
 * はみ出しなら 2 → 1 と減る。
 * Dスコアの範囲・必須要素は降りる途中も崩さない（均すために点数の芯を落とさない）。
 * 安い投げ自体も残す — ユーザーの要望どおり、加点のための低難度の投げはそのまま。
 * 揃え方は「厚い投げに替える」か「投げを1本足して上位3つから押し出す」のどちらか
 * （足すのは最頻値＋1回まで）。
 */
export function levelAdoptedDiffs(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  pool: SeriesTemplate[],
  opts: GenerateOptions,
  maxSeries: number,
): { used: SeriesTemplate[]; ev: Evaluation } {
  if (best.ev.spreadCost <= 1e-9) return best;
  const miss = (ev: Evaluation) => rangePenalty(ev.dScore, opts.minScore, opts.maxScore);
  const missLimit = miss(best.ev) + 1e-9;
  const floor = best.ev.value - SPREAD_REPAIR_BUDGET;
  const junior = !!opts.junior;
  const future = opts.future ?? null;
  let list = best.used;
  let ev = best.ev;
  /** いまのところいちばん均っている構成（予算内なのは作り方から保証される） */
  let goal = best;
  /** 「余地を作る」だけの手を続けて踏んだ回数（下げ続けても均らないので頭を打たせる） */
  let roomRun = 0;
  for (let round = 0; round < SPREAD_REPAIR_ROUNDS; round++) {
    if (ev.spreadCost <= 1e-9) break;
    let pick: { used: SeriesTemplate[]; ev: Evaluation; room: boolean } | null = null;
    const usedIds = new Set(list.map((t) => t.id));
    const consider = (next: SeriesTemplate[]) => {
      if (!withinAutoLimits(next, opts)) return;
      const e = evaluateUsed(next, opts);
      // **予算の外には出ない**。範囲外・投げタン超過・タンブリング4本目などは評価が
      // 100点単位で落ちるので、ここで一緒に弾かれる
      if (e.value < floor - 1e-9) return;
      if (miss(e) > missLimit) return;
      if (e.missing.length > best.ev.missing.length) return;
      // 二つ投げのシリーズは増やさない（1構成に1本まで。予算で払える額なので明示的に弾く）
      if (
        extraTwoThrowSeriesCount(next.map((t) => t.series)) >
        extraTwoThrowSeriesCount(best.used.map((t) => t.series))
      )
        return;
      // 投げの回数は減らさない（安い投げを消すのは「均した」ではなく「やめた」）。
      // 増やすのは**上位3つから押し出す**ための1本だけ許す（投げ4回のうち1本が投げタンだと
      // 徒手ユニットが3つ＝全部採用されてしまうので、1本足すと安いほうが外れる）。
      // ただし最頻値（`preferredThrowCount`）＋1回まで — 均しのために実測の分布を壊さない
      if (e.throwCount < best.ev.throwCount) return;
      if (
        e.throwCount > best.ev.throwCount &&
        e.throwCount > preferredThrowCount(e.dScore, junior) + 1
      )
        return;
      const better = e.spreadCost < ev.spreadCost - 1e-9;
      // はみ出しは同じまま**Dスコアに余地を作る**手。上限いっぱいの構成では、安い投げを
      // 厚くするのに先に別のユニットを下げる必要があり、その1手だけでは均らない。
      // ただし続けては踏まない（下げ続けても均らないので、点数だけ失う）
      const room =
        roomRun < SPREAD_REPAIR_ROOM_RUN &&
        Math.abs(e.spreadCost - ev.spreadCost) < 1e-9 &&
        e.dScore < ev.dScore - 1e-9;
      if (!better && !room) return;
      // はみ出しがいちばん減る手を採る（同じなら評価の高いほう）
      if (pick && !(e.spreadCost < pick.ev.spreadCost - 1e-9 || e.value > pick.ev.value + 1e-9)) return;
      pick = { used: next, ev: e, room: !better };
    };
    // 量を変える手（自動生成のシリーズは投げ＝シェネの回数・タンブリング＝宙返りの本数）
    list.forEach((t, i) => autoVariants(t).forEach((v) => consider(list.map((x, k) => (k === i ? v : x)))));
    // **シリーズの種類は変えない**（タンブリングは同じ本数のまま、投げは投げのまま）。
    // 投げをタンブリングに替えると投げの回数が最頻値から外れ、交互の並びも崩れる
    const tumFlags = list.map((t) => isTumblingSeries(t.series, junior, future));
    for (const t of pool) {
      if (usedIds.has(t.id)) continue;
      const tum = isTumblingSeries(t.series, junior, future);
      // 足す手（安い投げを上位3つから押し出す）。足すのは投げだけ
      if (!tum && list.length < maxSeries) consider([...list, t]);
      // 入れ替える手（厚い投げに替える・高すぎるタンブリングを下げる）
      for (let i = 0; i < list.length; i++)
        if (tumFlags[i] === tum) consider(list.map((x, k) => (k === i ? t : x)));
    }
    if (!pick) break;
    const step = pick as { used: SeriesTemplate[]; ev: Evaluation; room: boolean };
    list = step.used;
    ev = step.ev;
    roomRun = step.room ? roomRun + 1 : 0;
    if (ev.spreadCost < goal.ev.spreadCost - 1e-9) goal = { used: list, ev };
  }
  if (goal.used === best.used) return best;
  const ordered = orderSeries(goal.used, goal.ev, opts);
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

/** 加点済みと重複したとき外してよい技術タグ（外しても投げ受けとして成り立つもの）と、一緒に外す付随タグ */
const DROPPABLE_DUPLICATE_TAGS: Record<string, string[]> = {
  noview: ["noview", "betweenlegs"],
  useapp: ["useapp"],
};

/**
 * **加点済みと全く同じ投げ方・受け方**（技術タグが付いているのに加点にならない投げ・受け）から、
 * そのタグを外す（オーナー 2026-11-18：意味のない投げを入れない）。入れ替え（`swapIn`）は候補を丸ごと
 * 替えるだけなので、「タグの無い同じ投げ受け」には届かない。外して評価が上がるときだけ採り、
 * 自動生成の候補（`auto`）だけを書き換える（ユーザーのテンプレートはそのまま）。
 * 手以外の受け・投げは前後の形（無回転・横投げ）と組で決めているので外さない（評価の重みで避ける）。
 */
export function dropDuplicateTechTags(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  let cur = best;
  for (let round = 0; round < 8; round++) {
    const r = computeScore(cur.used.map((t) => t.series), opts.apparatus, {
      junior: !!opts.junior,
      future: opts.future ?? null,
    });
    let improved = false;
    for (let i = 0; i < cur.used.length && !improved; i++) {
      if (!cur.used[i].auto) continue;
      const tech = r.seriesBreakdowns[i]?.techItems ?? [];
      for (let j = 0; j < tech.length && !improved; j++) {
        if (tech[j]?.status !== "duplicate") continue;
        const item = cur.used[i].series.items[j];
        const isThrowSide = item.kind === "throw" || (item.kind === "skill" && !!item.isThrow);
        const tags = (isThrowSide ? item.throwTypes : (item as { catchTypes?: string[] }).catchTypes) ?? [];
        for (const tag of Object.keys(DROPPABLE_DUPLICATE_TAGS)) {
          if (!tags.includes(tag)) continue;
          const drop = DROPPABLE_DUPLICATE_TAGS[tag];
          const kept = tags.filter((t) => !drop.includes(t));
          const items = cur.used[i].series.items.map((it, k) =>
            k !== j ? it : isThrowSide ? { ...it, throwTypes: kept } : { ...it, catchTypes: kept },
          );
          const used = cur.used.map((t, k) => (k === i ? { ...t, series: { ...t.series, items } } : t));
          const ev = evaluateUsed(used, opts);
          if (ev.value > cur.ev.value + 1e-9) {
            cur = { used, ev };
            improved = true;
            break;
          }
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}

/**
 * **ロープの足に巻き付けたキャッチは最後のシリーズだけ・前転や転がりの直後にはしない**（オーナー 2026-11-18）。
 * 受け方（`nonHandKind`）はシリーズの中身から決めるので、並び（最後かどうか）は候補を作る時点では分からない。
 * そこで並べ終わったあとに、自動生成の候補の受け方を書き換える：
 *  - 最後以外のシリーズ・前転や転がりの直後の足に巻き付け → 肩
 *  - 最後のシリーズの最後の受けが肩（前転・転がりの直後でない）→ 足に巻き付け（締めは足に巻き付けが圧倒的に多い）
 * 評価が下がる書き換えはしない（同じ受け方の技術加点の重複など）。ユーザーのテンプレートはそのまま。
 */
export function arrangeRopeFootWrap(
  best: { used: SeriesTemplate[]; ev: Evaluation },
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  if (opts.apparatus !== "rope") return best;
  let cur = best;
  const lastIdx = cur.used.length - 1;
  if (lastIdx < 0) return cur;
  const isRoll = (it: Series["items"][number] | undefined) => it?.kind === "motion" && ROLL_MOTIONS.includes(it.motionId);
  const tryKind = (i: number, j: number, kind: string, allowEqual: boolean) => {
    const items = cur.used[i].series.items.map((it, k) => (k === j ? ({ ...it, nonHandKind: kind } as typeof it) : it));
    const used = cur.used.map((t, k) => (k === i ? { ...t, series: { ...t.series, items } } : t));
    const ev = evaluateUsed(used, opts);
    if (ev.value > cur.ev.value + 1e-9 || (allowEqual && ev.value >= cur.ev.value - 1e-9)) cur = { used, ev };
  };
  cur.used.forEach((t, i) => {
    if (!t.auto) return;
    t.series.items.forEach((item, j) => {
      const isCatch = item.kind === "catch" || (item.kind === "skill" && !!item.isCatch);
      if (!isCatch) return;
      const kind = (item as { nonHandKind?: string }).nonHandKind;
      const afterRoll = isRoll(t.series.items[j - 1]);
      if (kind === ROPE_FOOT_WRAP_KIND && (i !== lastIdx || afterRoll)) tryKind(i, j, "shoulder", false);
      // 投げタン（技を含むシリーズ）を足で受けるのはレアなので、締めでも書き換えない
      else if (
        kind === "shoulder" &&
        i === lastIdx &&
        j === t.series.items.length - 1 &&
        !afterRoll &&
        !t.series.items.some((it) => it.kind === "skill")
      )
        tryKind(i, j, ROPE_FOOT_WRAP_KIND, true);
    });
  });
  // 最後のシリーズが通常のキャッチで終わっていれば、足に巻き付けて締める形を試す（評価が上がるときだけ）
  const last = cur.used[lastIdx];
  const end = last?.series.items[last.series.items.length - 1];
  if (
    last?.auto &&
    !last.series.items.some((it) => it.kind === "skill") &&
    end?.kind === "catch" &&
    !(end.catchTypes || []).length &&
    !isRoll(last.series.items[last.series.items.length - 2])
  ) {
    const j = last.series.items.length - 1;
    const items = last.series.items.map((it, k) =>
      k === j ? ({ ...it, catchTypes: ["nonhand"], nonHandKind: ROPE_FOOT_WRAP_KIND } as typeof it) : it,
    );
    const used = cur.used.map((t, k) => (k === lastIdx ? { ...t, series: { ...t.series, items } } : t));
    const ev = evaluateUsed(used, opts);
    if (ev.value > cur.ev.value + 1e-9) cur = { used, ev };
  }
  return cur;
}
