// =====================================================================
// テンプレートから演技構成をランダムに生成する（個人モード）
//
// 方針：
//  - 使えるのは「指定した手具」と「共通」のシリーズテンプレート
//  - 必須要素をできるだけ満たす（不足はA減点に出るので、D + A残点 を最大化すれば満たしにいく）。
//    3点以上のDスコアを狙う構成では、必須要素を必ず満たす（REQUIRE_ALL_ELEMENTS_MIN_SCORE）。
//    全部は満たせないときに何から満たすかは A_PRIORITY の順（投げの回数＝必須投げ受け＞
//    投げタン＞D難度＞多様な投げ受け＞つなぎ＞三宙＞つなぎの手具操作）
//  - Dスコアの範囲を指定できる。指定がなければ最大を目指す
//  - 評価されない要素は入れない（入れても評価が上がらないシリーズは最後に取り除く）
//    例：4本目のタンブリング、ジュニアの6回目以降の投げ、まったく同じ内容の重複シリーズ
//  - 投げタンは1本まで（必須要素は1本で満たせるため）
//  - タンブリングは投げタンを含めて3本まで（上位3本しか難度に採用されないため）
//  - ハンドスプリング・転宙は実施が少ないので優先度を下げ、演技内で1回までにする
//  - 単発でD難度以上になる技は重みで抑える（結果として演技内で1〜2つ程度になる）
//  - よくある投げシリーズ（autoThrows.ts）とタンブリング（autoTumblings.ts）は
//    システム側で組んで候補に足す。投げ方や技の組み合わせを網羅したテンプレートを
//    登録しなくて済む。あくまで候補なので、評価が上がらなければ使われない
//  - 登録テンプレートが主役。先に見て、足りないところを自動生成で補う。
//    自動生成のタンブリングはテンプレートに出てくる技だけで組む
//  - 自動生成のシリーズは量を調整できる（投げ＝シェネの回数、タンブリング＝宙返りの本数）。
//    Dスコアの範囲を指定したときに、シリーズを丸ごと落とさず「減らして収める」
//    （下限なら増やす）を選べる
//  - 投げとタンブリングは交互に並べる（実際の演技の構成に合わせる。点数には影響しない）
//  - 同じ宙返りの繰り返しは避ける（前宙は例外）。必須ではないので弱い重み付けにとどめる
// =====================================================================

//
// 中身は役割ごとに分かれている（ここは入口だけ）：
//  - `generateOptions.ts`：入力と結果の型
//  - `generateWeights.ts`：上限・目標値・重み
//  - `generateEvaluate.ts`：構成の評価（何を数えて、どう足し引きするか）
//  - `generateSearch.ts`：探索（貪欲法・入れ替え・量の調整・並べ替え）
// 従来どおり `from "./generate"` 1か所で参照できるよう、すべて再エクスポートする。
// =====================================================================

import { APPARATUS } from "./constants";
import { rangePenalty, seriesOf, type Evaluation } from "./generateEvaluate";
import { DEFAULT_MAX_SERIES, REBUILD_ATTEMPTS, requiresAllElements } from "./generateWeights";
import {
  autoPool,
  greedyAttempt,
  orderSeries,
  satisfying,
  swapIn,
  upgradeTumblings,
  usableTemplates,
} from "./generateSearch";
import type { GenerateOptions, GenerateResult } from "./generateOptions";
import type { SeriesTemplate } from "./templates";
import type { ApparatusKey } from "./types";

export * from "./generateOptions";
export * from "./generateWeights";
export * from "./generateEvaluate";
export * from "./generateSearch";

/**
 * ランダムな貪欲法を何度も試して、いちばん評価の高い構成を返す。
 * 使えるテンプレートが無ければ null。
 */
export function generateRoutine(templates: SeriesTemplate[], opts: GenerateOptions): GenerateResult | null {
  const rand = opts.random ?? Math.random;
  // 登録したテンプレートが無くても、自動生成の候補だけで組める
  const own = usableTemplates(templates, opts.apparatus);
  const auto = autoPool(opts, own, rand);
  if (own.length + auto.length === 0) return null;

  const attempts = opts.attempts ?? 40;
  const maxSeries = opts.maxSeries ?? DEFAULT_MAX_SERIES;

  let best: { used: SeriesTemplate[]; ev: Evaluation } | null = null;

  for (let a = 0; a < attempts; a++) {
    const cand = greedyAttempt([], own, auto, opts, rand, maxSeries);
    if (!best || cand.ev.value > best.ev.value + 1e-9) best = cand;
  }

  if (!best || best.used.length === 0) return null;

  const pool = [...own, ...auto];
  /**
   * 詰め直しが必要か。必須要素を必ず満たす設定なら不足が残っているとき、
   * そうでなくても**ルールの投げ回数**に足りていなければ詰め直す。
   */
  const unmet = (ev: Evaluation) =>
    (requiresAllElements(opts) && ev.missing.length > 0) || ev.throwCountUnmet;
  /** 不足が残っている構成を、1本ずつ入れ替えて詰める */
  const repair = (cand: { used: SeriesTemplate[]; ev: Evaluation }) => {
    if (!unmet(cand.ev)) return cand;
    const fixed = swapIn(cand.used, cand.ev, pool, opts);
    if (fixed.ev.value <= cand.ev.value + 1e-9) return cand;
    const ordered = orderSeries(fixed.used, fixed.ev, opts);
    return { used: ordered.used, ev: ordered.ev };
  };

  // ⑤ 必須要素を満たしきれていなければ、1本ずつ入れ替えて詰める
  best = repair(best);

  // ⑥ それでも足りなければ、不足を満たす候補を必ず入れた状態から組み直して詰める。
  //    Dスコアの上限いっぱいの構成では、入れ替えだけでは不足を埋められない
  //    （不足を満たす1本を足す代わりに1本抜く必要がある）ことがある。
  if (unmet(best.ev)) {
    for (const t of satisfying(pool, best.ev, opts, rand)) {
      // 足す順番（乱数）で結果が変わるので、1本につき何度か組み直す
      for (let k = 0; k < REBUILD_ATTEMPTS; k++) {
        const cand = repair(greedyAttempt([t], own, auto, opts, rand, maxSeries));
        if (cand.used.length > 0 && cand.ev.value > best.ev.value + 1e-9) best = cand;
        if (!unmet(best.ev)) break;
      }
      if (!unmet(best.ev)) break;
    }
  }

  // ⑦ タンブリングを難度の高い候補に入れ替える。上級者のタンブリングはほぼE難度だが、
  //    貪欲法は3本（`DEFAULT_MAX_TUMBLINGS`）埋まったあとに後から出てきた高難度の
  //    候補を見られないので、最後にタンブリングだけを入れ替えて評価が上がるなら採る。
  best = upgradeTumblings(best, pool, opts);

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
