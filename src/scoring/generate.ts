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

import { analyzeSeries } from "./analysis";
import { autoThrowTemplates, cheneCountRange, isAutoThrowTemplate, withCheneCount } from "./autoThrows";
import {
  autoTumblingTemplates,
  isAutoTumblingTemplate,
  saltoCountRange,
  usedSkillIds,
  withSaltoCount,
} from "./autoTumblings";
import { computeScore, type ScoreResult } from "./score";
import { isCommonApparatus, type SeriesTemplate } from "./templates";
import { APPARATUS, APPARATUS_REQUIRED_ELEMENTS, skillDef } from "./constants";
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
  /**
   * 必須要素を必ず満たすか。未指定なら狙うDスコアで決まる
   * （上限なし、または `REQUIRE_ALL_ELEMENTS_MIN_SCORE` 以上で満たしにいく）。
   * false にすると、不足もA減点として D と天秤にかけるだけになる。
   */
  requireAllElements?: boolean;
  /** 投げタン（転回系の投げ受け）の本数の上限。既定は1本。 */
  maxThrowTumbling?: number;
  /** 自動生成の投げシリーズを候補に加えるか（既定 true） */
  autoThrows?: boolean;
  /** 1つの構成に入れる自動生成の投げの本数の上限。既定は3本。 */
  maxAutoThrows?: number;
  /** 自動生成の投げシリーズの候補数の上限（既定＝全組み合わせ） */
  autoThrowLimit?: number;
  /** 自動生成のタンブリングを候補に加えるか（既定 true） */
  autoTumblings?: boolean;
  /** 1つの構成に入れる自動生成のタンブリングの本数の上限。既定は3本。 */
  maxAutoTumblings?: number;
  /** 自動生成のタンブリングの候補数の上限（既定＝全組み合わせ） */
  autoTumblingLimit?: number;
  /**
   * 自動生成のタンブリングに使ってよい転回技のid。
   * 既定は登録テンプレートで実際に使っている技（テンプレートが無ければ技の一覧すべて）。
   */
  autoTumblingSkills?: string[];
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
 * 生成する構成に入れる自動生成のタンブリングの本数の上限。
 * 難度に採用されるのは上位3本（`ADOPT_COUNT`）までだが、4本目は
 * 必須要素（三宙・つなぎ技・方向系・投げタン）を担うことがあるので1本ぶん余裕を持たせる。
 * 点数に効かない4本目は刈り込みで落ちる。
 */
export const DEFAULT_MAX_AUTO_TUMBLINGS = 4;

/**
 * これ未満のDスコアを狙う構成は「基本的な構成の選手」とみなす（`basicLevel`）。
 * Dスコアが0〜1点台の選手は、ルールの要求を満たしきれない単純なタンブリングを実施する
 * （ロンダート→宙返り1本で終わり／三宙なし／つなぎなし／D難度なし）ので、
 * 自動生成のタンブリングもその範囲に寄せる。
 */
export const BASIC_LEVEL_MAX_SCORE = 2.0;

/**
 * これ以上のDスコアを狙う構成では、必須要素（三宙・つなぎ技・方向系・投げタン・
 * 投げ回数・タンブリング本数）を**必ず満たす**。
 * 上級者（Dスコア4点以上）は必然的にAスコアも高く、要求を満たした構成になっている。
 * 必須要素をすべて満たす構成のDスコアは2.0あたりが下限なので、そこから少し余裕を見た値。
 * 上限を指定しない（最大を狙う）ときも必ず満たしにいく。
 */
export const REQUIRE_ALL_ELEMENTS_MIN_SCORE = 3.0;

/**
 * A側の要求を満たす優先順位（現実の感覚）。大きいほど先に満たす。
 *
 *   投げの回数 ＝ 各手具の必須投げ・受け ＞ 投げタン ＞ **D難度** ＞ 多様な投げ受け
 *   ＞ つなぎ ＞ 三宙 ＞ つなぎの手具操作
 *
 * D難度（難度点そのもの）は評価の `dScore` が担うので表には持たず、投げタンと多様性の間の
 * 位置づけになる。表に無い要求（方向系・タンブリング本数）は `other` を使う。
 * 規則どおりの減点額（投げ回数・投げタン・つなぎ 0.30／多様性 0.10〜0.50／三宙 0.10〜0.20／
 * つなぎの手具操作 0.20）がすでにこの順序をおおむね表しているので、
 * ここの重みは**同点のときにどちらを残すか**を決めるだけにとどめる。
 */
export const A_PRIORITY = {
  /** 投げの回数（ジュニアの投げ超過も同じ扱い） */
  throwCount: 7,
  /** 各手具の必須投げ・受け（左投げ左受け・右投げ右受け・二つ投げ） */
  apparatusThrow: 7,
  /** 転回系の投げ受け（投げタン） */
  throwTumbling: 6,
  // D難度＝5 相当（`dScore` が担当）
  /** 多様な投げ方・受け方 */
  variety: 4,
  /** つなぎ技 */
  connect: 3,
  /** 三宙（宙返り3回以上連続） */
  triple: 2,
  /** つなぎ技の手具操作 */
  connectApparatus: 1,
  /** 表に無い要求（方向系・タンブリング本数） */
  other: 3,
} as const;

/**
 * 優先順位1つあたりの評価の重み。
 * 難度点の最小単位（0.1）より小さくして、順位は**同点のときのタイブレーク**にだけ効かせる。
 */
export const A_PRIORITY_WEIGHT = 0.01;

/**
 * 必須要素を必ず満たす構成での、不足1つあたりの評価の重み。
 * 難度点（最大でも1本0.7）より十分大きく、Dスコアの範囲外ペナルティ（×100）よりは小さい。
 * 範囲に収めることを優先しつつ、その中では要求を満たす構成を選ぶ。
 */
export const REQUIRED_ELEMENT_WEIGHT = 10;

/**
 * その構成で必須要素を必ず満たしにいくか。
 * 既定は狙うDスコアで決まり、`requireAllElements` で明示的に上書きできる。
 * false のときは、必須要素の不足も他と同じくA減点（1つ −0.30）として
 * DとAの損失を比べるだけになる。
 */
export function requiresAllElements(opts: Pick<GenerateOptions, "maxScore" | "requireAllElements">): boolean {
  if (opts.requireAllElements !== undefined) return opts.requireAllElements;
  return opts.maxScore == null || opts.maxScore >= REQUIRE_ALL_ELEMENTS_MIN_SCORE;
}

/**
 * 自動生成のシリーズ1本あたりの評価の重み。
 * 登録したテンプレートは「その選手が実際に実施できる構成」なので、
 * 同じ点数なら自動生成より優先する。難度点の最小単位（0.1）より小さくして、
 * 点数を犠牲にしてまでテンプレートを選ぶことはしない。
 */
export const AUTO_SERIES_WEIGHT = 0.02;

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
function evaluate(series: Series[], opts: GenerateOptions, autoCount = 0): Evaluation {
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
  // 満たせていないA側の要求（優先順位つき）。ある程度のDスコアを狙う構成では必ず満たしにいく
  const shortfall = shortfallPenalty(r, opts.apparatus, requiresAllElements(opts));
  // 自動生成は同点ならテンプレートに譲る（多様性と同じく、点数は犠牲にしない重み）
  const auto = autoCount * AUTO_SERIES_WEIGHT;
  return {
    value: -(penalty + overThrowTum) * 100 - shortfall + r.dScore + r.aScore - variety - auto,
    dScore: r.dScore,
    aScore: r.aScore,
    missing: r.missing.map((m) => m.label),
  };
}

/**
 * 満たせていないA側の要求に対する評価の引き算。
 * `mandatory` なら1つにつき `REQUIRED_ELEMENT_WEIGHT`（必ず満たしにいく）、
 * それに加えて優先順位ぶんの小さな重み（同点のときのタイブレーク）を足す。
 * 手動チェックの手具別必須要素（ころがし等）とロープ跳びは生成では満たせないので数えない。
 */
export function shortfallPenalty(r: ScoreResult, apparatus: ApparatusKey, mandatory: boolean): number {
  let total = 0;
  const add = (unmet: boolean, priority: number) => {
    if (unmet) total += (mandatory ? REQUIRED_ELEMENT_WEIGHT : 0) + priority * A_PRIORITY_WEIGHT;
  };
  const failed = (key: string) => r.required.some((c) => c.key === key && c.passed === false);
  add(failed("count3") || failed("countMax"), A_PRIORITY.throwCount);
  APPARATUS_REQUIRED_ELEMENTS[apparatus].forEach((el) => {
    // 投げ・受けの要求だけ（ロープ跳び・手動チェックの項目は生成では動かせない）
    if (el.auto !== "rightThrow" && el.auto !== "leftThrow" && el.auto !== "twoThrow") return;
    add(
      r.apparatusElementChecks.some((c) => c.key === `appEl_${el.id}` && !c.passed),
      A_PRIORITY.apparatusThrow,
    );
  });
  add(failed("throwTum"), A_PRIORITY.throwTumbling);
  add(r.varietyDeduction > 0, A_PRIORITY.variety);
  add(failed("connect"), A_PRIORITY.connect);
  add(failed("triple"), A_PRIORITY.triple);
  add(r.connectNoApparatus, A_PRIORITY.connectApparatus);
  add(failed("dir"), A_PRIORITY.other);
  add(failed("tumCount"), A_PRIORITY.other);
  return total;
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

/** テンプレートの並びを評価する（自動生成の本数もここで数える） */
const evaluateUsed = (list: SeriesTemplate[], opts: GenerateOptions): Evaluation =>
  evaluate(seriesOf(list), opts, list.filter((t) => t.auto).length);

/** 指定した手具で使えるシリーズテンプレート（その手具のもの＋共通） */
export function usableTemplates(templates: SeriesTemplate[], apparatus: ApparatusKey): SeriesTemplate[] {
  return templates.filter((t) => isCommonApparatus(t.apparatus) || t.apparatus === apparatus);
}

/**
 * 自動生成のシリーズの候補（それぞれ `autoThrows` / `autoTumblings` で切れる）。
 * タンブリングは**登録テンプレートに出てくる技だけ**で組む（`skillIds`）。
 * テンプレートが1つも無いときだけ、技の一覧から自由に組む。
 */
function autoPool(opts: GenerateOptions, own: SeriesTemplate[], rand: () => number): SeriesTemplate[] {
  const pool: SeriesTemplate[] = [];
  if (opts.autoThrows !== false)
    pool.push(...autoThrowTemplates(opts.apparatus, { random: rand, limit: opts.autoThrowLimit }));
  if (opts.autoTumblings !== false)
    pool.push(
      ...autoTumblingTemplates(opts.apparatus, {
        junior: !!opts.junior,
        // 低いDスコアを狙うなら、基本的な構成の選手とみなして候補を寄せる
        basicLevel: opts.maxScore != null && opts.maxScore < BASIC_LEVEL_MAX_SCORE,
        skillIds: opts.autoTumblingSkills ?? usedSkillIds(own.map((t) => t.series)),
        random: rand,
        limit: opts.autoTumblingLimit,
      }),
    );
  return pool;
}

/** その候補が1つの構成に入れられる本数の上限（登録したテンプレートは無制限） */
function autoLimitOf(t: SeriesTemplate, opts: GenerateOptions): number | null {
  if (isAutoThrowTemplate(t)) return opts.maxAutoThrows ?? DEFAULT_MAX_AUTO_THROWS;
  if (isAutoTumblingTemplate(t)) return opts.maxAutoTumblings ?? DEFAULT_MAX_AUTO_TUMBLINGS;
  return null;
}

/** 自動生成の候補の「量」を変えた別案（投げ＝シェネの回数、タンブリング＝宙返りの本数） */
function autoVariants(t: SeriesTemplate): SeriesTemplate[] {
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
function tuneAutoSeries(
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
function isTumblingSeries(series: Series, junior: boolean): boolean {
  return analyzeSeries(series, junior).units.some((u) => u.type === "tumbling" || u.isThrowTumbling);
}

/** 多いほうの並びに、少ないほうを均等に挟み込む */
function interleave<T>(many: T[], few: T[]): T[] {
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
function orderSeries(
  used: SeriesTemplate[],
  cur: Evaluation,
  opts: GenerateOptions,
): { used: SeriesTemplate[]; ev: Evaluation } {
  const junior = !!opts.junior;
  const tumbling = used.filter((t) => isTumblingSeries(t.series, junior));
  const throws = used.filter((t) => !isTumblingSeries(t.series, junior));
  if (tumbling.length === 0 || throws.length === 0) return { used, ev: cur };
  const ordered =
    tumbling.length >= throws.length ? interleave(tumbling, throws) : interleave(throws, tumbling);
  const ev = evaluateUsed(ordered, opts);
  return ev.value >= cur.value - 1e-9 ? { used: ordered, ev } : { used, ev: cur };
}

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
  const maxSeries = opts.maxSeries ?? 8;

  let best: { used: SeriesTemplate[]; ev: Evaluation } | null = null;

  for (let a = 0; a < attempts; a++) {
    let used: SeriesTemplate[] = [];
    let cur = evaluateUsed([], opts);
    /** 自動生成の候補を種類ごとに何本使ったか */
    const autoUsed = new Map<string, number>();

    // ① ランダムな順に見て、評価が上がるものだけ足す。
    //    登録テンプレートを先に見て、足りないところを自動生成で補う。
    for (const t of [...shuffled(own, rand), ...shuffled(auto, rand)]) {
      if (used.length >= maxSeries) break;
      // 自動生成のシリーズは補いの本数まで（テンプレートを押しのけないように）
      const limit = autoLimitOf(t, opts);
      const kind = isAutoThrowTemplate(t) ? "throw" : "tumbling";
      if (limit !== null && (autoUsed.get(kind) ?? 0) >= limit) continue;
      const next = [...used, t];
      const ev = evaluateUsed(next, opts);
      if (ev.value > cur.value + 1e-9) {
        used = next;
        cur = ev;
        if (limit !== null) autoUsed.set(kind, (autoUsed.get(kind) ?? 0) + 1);
      }
    }

    // ② 自動生成のシリーズは量（シェネの回数・宙返りの本数）を調整する
    const tuned = tuneAutoSeries(used, cur, opts);
    used = tuned.used;
    cur = tuned.ev;

    // ③ 抜いても評価が下がらないシリーズを取り除く（＝評価されない要素を入れない）
    for (let improved = true; improved && used.length > 0; ) {
      improved = false;
      for (let i = 0; i < used.length; i++) {
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
    used = ordered.used;
    cur = ordered.ev;

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
