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
  if (ordered === used) return { used, ev: cur };
  const ev = evaluateUsed(ordered, opts);
  return ev.value >= cur.value - 1e-9 ? { used: ordered, ev } : { used, ev: cur };
}

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
