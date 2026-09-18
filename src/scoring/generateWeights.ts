// =====================================================================
// ランダム生成の上限・目標値・重み
//
// 評価式（`generateEvaluate.ts`）に掛ける数だけを置く。値の尺度は3段階：
//  - **タイブレーク**（0.005〜0.05）：難度の刻み0.1より小さいので、同点のときだけ効く
//    （多様性・組み方の優先度・連続投げの順番・自動生成より登録テンプレート、など）
//  - **実在の好み**（0.1〜0.9）：0.1を超えるので、点数と引き換えになる
//    （投げの回数・その他の投げ受け・縦3動作・手以外の投げのあとの徒手、など）
//  - **要求と範囲**：必須要素の不足は `REQUIRED_ELEMENT_WEIGHT`（10）、
//    Dスコアの範囲外は ×100。難度では覆せない
// どの値も**実測して決めた**もので、根拠は `app-scoring-spec.md` と work-logs に残す。
// =====================================================================

import { NON_HAND_TAG, isAutoThrowTemplate } from "./autoThrows";
import { isAutoTumblingTemplate } from "./autoTumblings";
import { ADOPT_COUNT, USE_APPARATUS_TAG, throwCountRequired } from "./constants";
import type { GenerateOptions } from "./generateOptions";
import type { SeriesTemplate } from "./templates";
import type { ApparatusKey } from "./types";

/** 生成する構成に入れる投げタンの本数の上限（必須要素は1本で満たせる） */
export const DEFAULT_MAX_THROW_TUMBLING = 1;

/**
 * 構成に入れるタンブリングの本数の上限（**投げタンを含む**）。
 * 難度点に採用されるのは上位3本（`ADOPT_COUNT`）までで、4本目は評価されないため。
 */
export const DEFAULT_MAX_TUMBLINGS = ADOPT_COUNT;

/** シリーズ数の上限の既定値 */
export const DEFAULT_MAX_SERIES = 8;

/** 自動生成の割合の既定値（1＝種類ごとの上限だけで、割合では制限しない） */
export const DEFAULT_AUTO_RATIO = 1;

/**
 * その構成に入れてよい自動生成のシリーズの本数（種類の合計）。
 * `autoRatio` をシリーズ数の上限に対する本数に換算する。null＝割合では制限しない。
 */
export function autoSeriesMax(opts: GenerateOptions): number | null {
  const ratio = opts.autoRatio ?? DEFAULT_AUTO_RATIO;
  if (ratio >= 1) return null;
  const maxSeries = opts.maxSeries ?? DEFAULT_MAX_SERIES;
  return Math.max(0, Math.round(Math.max(0, ratio) * maxSeries));
}

/**
 * 生成する構成に入れる自動生成の投げの本数の上限。
 * 難度を狙う投げは投げタン＋上位3本（`ADOPT_COUNT`）までだが、それを超える投げは
 * **技術加点のために実施する**ので、本数そのものは投げ上げの回数の最頻値
 * （`preferredThrowCount` / `throwCountPenalty`）で決める。上限はその判断が効く範囲で
 * 「構成が自動生成の投げだけで埋まらない」ようにするためだけのもので、実測では
 * 5本と8本で結果が完全に一致する（＝最頻値の重みが先に効く）。
 */
export const DEFAULT_MAX_AUTO_THROWS = 5;

/**
 * 生成する構成に入れる自動生成のタンブリングの本数の上限。
 * タンブリング全体が3本まで（`DEFAULT_MAX_TUMBLINGS`）なので、それを超えない本数にする。
 */
export const DEFAULT_MAX_AUTO_TUMBLINGS = DEFAULT_MAX_TUMBLINGS;

/** その候補が1つの構成に入れられる本数の上限（登録したテンプレートは無制限） */
export function autoLimitOf(t: SeriesTemplate, opts: GenerateOptions): number | null {
  if (isAutoThrowTemplate(t)) return opts.maxAutoThrows ?? DEFAULT_MAX_AUTO_THROWS;
  if (isAutoTumblingTemplate(t)) return opts.maxAutoTumblings ?? DEFAULT_MAX_AUTO_TUMBLINGS;
  return null;
}

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

/**
 * 実施が少ない技（ハンドスプリング・転宙）を使ったときの評価の重み。
 * 難度点の最小単位（0.1）より小さくして、同じ点数なら別の技の構成を選ばせる。
 * 演技内の回数そのものは `LIMITED_SKILL_MAX` で1回までに制限する。
 */
export const LIMITED_SKILL_WEIGHT = 0.02;

/**
 * 単発で高難度（D難度以上）な技を1つ実施するごとの評価の重み。
 * 上限は決めず、重みの結果として演技内で**1〜2つ程度**に落ち着くようにする
 * （日本のトップでも単発でD難度になる技は演技に1〜2つ程度）。
 *
 * 実際の抑えは候補づくり側の `saltoDifficultyWeight`（D=0.6／E=0.05＝その時代の上限難度の
 * 単発は実戦でほぼ実施されない）が担っていて、
 * それだけで最大を狙う構成でも 0個23%／1個43%／2個28%／3個以上5% に収まる。
 * ここは難度点の刻み（0.1）より小さくして、同じ点数なら易しい技の構成を選ぶ程度にする
 * （0.1 にすると0個が35%まで増えて、1〜2つという実態から外れる）。
 *
 * 手具によって出やすさが違う分は `apparatusHighDifficultyWeight` で割る
 * （リングは重く持ったままひねりにくいので、他の手具より更に嫌う）。
 */
export const HIGH_DIFFICULTY_WEIGHT = 0.02;

/**
 * 同じ難度に到達する組み方のうち、実施されにくい組み方1順位ぶんの評価の重み。
 * 難度点は同じなので、**同じ点数ならより実施される組み方を選ぶ**だけの効き方にする
 * （順位は最大5、タンブリング3本で最大0.075＝難度の刻み0.1より小さい）。
 */
export const SHAPE_PRIORITY_WEIGHT = 0.005;

/**
 * 縦3動作（前転3回など）でE難度になる投げ受けのうち、**手具を使ったキャッチ以外**の本数。
 * 前転3回から受けるのは手具で押さえつけるのが主流で、それ以外の形は基本実施しない。
 * 難度点より大きい重み（`VERTICAL_THREE_THROW_WEIGHT`）で嫌い、Dスコアの範囲を満たすのに
 * どうしても必要なとき（範囲外のペナルティは×100）だけ入るようにする。
 */
/**
 * **手以外の投げ・手具を使った投げのあとに多くの徒手やタンブリングを実施するのは難しい**。
 * 足や手具で投げた直後なので、現実的なのは徒手 `HARD_THROW_MAX_MOTIONS`（1）動作までで、
 * 転回系を挟むこともまずない。狙うDスコアの**要求値**（下限）が `HARD_THROW_FREE_SCORE`（5.0）を
 * 超えるまでは、この形を `HARD_THROW_WEIGHT`（0.9／本＝その形が足せる点数より大きい）だけ嫌うので、
 * **かなり稀にしか出ない**。5.0を超える要求では点数を稼ぐために必要になるので嫌わない。
 */
export const HARD_THROW_TAGS: string[] = [NON_HAND_TAG, USE_APPARATUS_TAG];

export const HARD_THROW_MAX_MOTIONS = 1;

export const HARD_THROW_WEIGHT = 0.9;

export const HARD_THROW_FREE_SCORE = 5.0;

/** その構成で手以外・手具を使った投げのあとの実施を嫌うか（要求値が5.0を超えるなら嫌わない） */
export function suppressHardThrow(opts: GenerateOptions): boolean {
  return (opts.minScore ?? 0) <= HARD_THROW_FREE_SCORE;
}

/**
 * **演技の締め方**。手具によって「最後の投げ受けをこう受けて、そのまま演技を終える」形が決まっている。
 *  - クラブ：もう一方の手具で**押さえてキャッチ**
 *  - ロープ：**足に絡めたキャッチ**（手以外のキャッチ）
 * スティック・リングには決まった締め方が無いので指定しない。
 */
export const FINISH_CATCH_TAG: Partial<Record<ApparatusKey, string>> = {
  clubs: USE_APPARATUS_TAG,
  rope: NON_HAND_TAG,
};

/**
 * 締めの受け方で終わらない構成を嫌う重み。並べ替え（`finishCatchLast`）だけでは
 * 「締めの形になるシリーズが1本も無い」ときに何もできないので、そのときに1本入れさせるための重み。
 * 難度の刻み（0.1）より小さくしてあるので、**難度を捨ててまで締めの形にはしない**。
 * 実測（20構成ずつ）：並べ替えだけでクラブ19/20・ロープ18/20、この重みでクラブ20/20・ロープ19/20
 * （Dスコア平均は 4.32／4.13 のまま変わらない）。
 */
export const FINISH_CATCH_WEIGHT = 0.05;

/**
 * その他の投げ・その他のキャッチは自動生成では**可能な限り使わない**。
 * 技術加点（`TECHNIQUE_BONUS`＝0.1）より強い重みで嫌うので、加点のためだけには実施せず、
 * 多様な投げ受け（必須要素＝`REQUIRED_ELEMENT_WEIGHT`）を満たすのにどうしても必要なときだけ入る。
 */
export const OTHER_STYLE_WEIGHT = 0.15;

// **実施例の無い形**（現実的だが競技での実施例が無い形）の重みは、ここではなく
// `unseenShapes.ts` に形ごとに宣言する（`UNSEEN_SHAPES` の `earns` ＋ `extra`）。
// 候補を出す確率（`unseenChance`）だけでは頻度を抑えられない：どれも技術加点（0.1）を稼ぐので、
// 候補にあれば貪欲法が**進んで**採ってしまい、候補の3%が生成結果の55%になった。
// そこで評価は**稼ぐぶんをそのまま打ち消す**（点数的に中立）。こうすると頻度は抽選だけで決まり、
// 要求するDスコアに応じて滑らかに上がる（要求値で重みを変えると、重みが加点を下回る点で
// 一気に跳ねてしまう）。

/** 縦3動作とみなす動作数（§3.5.5.3） */
export const VERTICAL_THREE_MOTIONS = 3;

/**
 * 手具を使ったキャッチ以外の縦3動作の投げ受け1本ぶんの評価の重み。
 * この形が1本増やす点数（徒手系E難度＝0.7が上限）より大きくして、
 * **点数を稼ぐうえでどうしても必要なときだけ**実施するようにする
 * （Dスコアの範囲外は×100、投げ回数の不足は10なので、必要なときは必ず入る）。
 */
export const VERTICAL_THREE_THROW_WEIGHT = 0.85;

/**
 * 難度を狙う投げは基本4回まで（投げタン1回＋それ以外の投げ3回＝`ADOPT_COUNT` 本の
 * 徒手系ユニット）。それ以上の投げは**加点だけを狙う**ので徒手操作を足さない。
 * 難度に採用されない投げ受けに操作が入っているぶんを、難度の刻みより小さい重みで嫌う。
 */
export const EXTRA_THROW_OPERATION_WEIGHT = 0.01;

/**
 * 投げ上げの回数の**最頻値**。Dスコアが上がるほど多くなる。
 * 最小はルールの回数（一般3回・ジュニア2回）で、それ未満にはしない。
 */
export const THROW_COUNT_MODE_STEPS: { minScore: number; count: number }[] = [
  { minScore: 4.0, count: 5 },
  { minScore: 2.0, count: 4 },
];

/** そのDスコアの構成で最も多い投げ上げの回数 */
export function preferredThrowCount(dScore: number, junior = false): number {
  const step = THROW_COUNT_MODE_STEPS.find((x) => dScore >= x.minScore);
  return Math.max(throwCountRequired(junior), step?.count ?? 0);
}

/** 最頻値より少ない投げ1回ぶんの評価の重み */
export const THROW_COUNT_UNDER_WEIGHT = 0.1;

/**
 * 最頻値より**1回多い**投げの重み。1回多い構成は十分ありえる（Dスコア4点台でも6回を
 * 実施する）ので弱めに嫌う。それでも難度の刻み（0.1）より強くするのは、技術加点に
 * 上限が無く、投げを足すほど点が伸びてしまうため。
 * 自動生成の投げの本数の上限（`DEFAULT_MAX_AUTO_THROWS`）を上げたぶん、
 * 「最頻値を保つ」のはこの重みの仕事になっている。
 */
export const THROW_COUNT_OVER_WEIGHT = 0.2;

/**
 * Dスコアが高い構成での、最頻値より1回多い投げの重み。
 * `THROW_COUNT_HIGH_SCORE` 以上を狙う構成では6回を実施する確率が上がる
 * （最頻値は5回のまま）ので、1回多いぶんの重みを**弱める**。
 */
export const THROW_COUNT_HIGH_SCORE = 5.0;

export const THROW_COUNT_OVER_WEIGHT_HIGH = 0.15;

/** 最頻値より2回以上多い投げ1回ぶんの重み（実際にはほぼ無いので強く嫌う） */
export const THROW_COUNT_FAR_OVER_WEIGHT = 0.3;

/**
 * 投げ上げの回数が最頻値から離れているぶんの評価の引き算。
 * 多い側は技術加点（上限なし）で稼げてしまうので、難度の刻みより強い重みで嫌う。
 * 1回多いだけなら弱め、2回以上多いぶんは強く。
 */
export function throwCountPenalty(count: number, dScore: number, junior = false): number {
  const mode = preferredThrowCount(dScore, junior);
  if (count < mode) return (mode - count) * THROW_COUNT_UNDER_WEIGHT;
  const over = count - mode;
  if (over === 0) return 0;
  const first =
    dScore >= THROW_COUNT_HIGH_SCORE ? THROW_COUNT_OVER_WEIGHT_HIGH : THROW_COUNT_OVER_WEIGHT;
  return first + (over - 1) * THROW_COUNT_FAR_OVER_WEIGHT;
}

/** 連続投げで2回目以降のほうが難度が高いシリーズ1本ぶんの評価の重み */
export const THROW_ORDER_WEIGHT = 0.005;

/**
 * 難度点（タンブリング＋徒手）1点あたりの上乗せ。Dスコアを上げるときは、
 * **加点よりも高難度の実施を優先する**。同じDスコアなら難度点で取っている構成を選び、
 * 難度点と加点が競合する場面（シリーズの枠は限られている）では難度点を取る。
 */
export const DIFFICULTY_PREFERENCE_WEIGHT = 0.3;

/**
 * **タンブリングの難度点**1点あたりの、さらなる上乗せ。上級者のタンブリングはほぼE難度なので、
 * 同じDスコアなら「徒手や加点で稼いだ構成」より「タンブリングの難度で稼いだ構成」を選ぶ。
 * `DIFFICULTY_PREFERENCE_WEIGHT` に足して効く（タンブリング1点＝0.6、徒手1点＝0.3）。
 */
export const TUMBLING_PREFERENCE_WEIGHT = 0.3;

/** 不足を満たす候補を必ず入れて組み直す回数（足す順番で結果が変わるため） */
export const REBUILD_ATTEMPTS = 5;

/** 投げの回数が足りないときに、組み直しの起点として試す投げ候補の数 */
export const THROW_REBUILD_CANDIDATES = 4;

/** タンブリングの入れ替えを試す回数 */
export const TUMBLING_UPGRADE_ROUNDS = 2;
