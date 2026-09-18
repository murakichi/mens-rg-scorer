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

import { shuffled } from "./pick";
import { analyzeSeries, motionDef, motionTimes } from "./analysis";
import {
  NON_HAND_TAG,
  OTHER_TAG,
  autoThrowTemplates,
  cheneCountRange,
  isAutoThrowTemplate,
  withCheneCount,
} from "./autoThrows";
import {
  LIMITED_SKILLS,
  LIMITED_SKILL_MAX,
  apparatusHighDifficultyWeight,
  isHighDifficultySkill,
  readTumblingShape,
  throwTumblingShapeRank,
  tumblingShapeRank,
  autoTumblingTemplates,
  isAutoTumblingTemplate,
  saltoCountRange,
  usedSkillIds,
  withSaltoCount,
} from "./autoTumblings";
import { computeScore, type ScoreResult } from "./score";
import { isCommonApparatus, type SeriesTemplate } from "./templates";
import {
  ADOPT_COUNT,
  APPARATUS,
  APPARATUS_REQUIRED_ELEMENTS,
  DIFF_VALUE,
  USE_APPARATUS_TAG,
  skillDef,
  throwCountRequired,
} from "./constants";
import type { ApparatusKey, FutureLevel, Series } from "./types";

export interface GenerateOptions {
  apparatus: ApparatusKey;
  junior?: boolean;
  /**
   * 十年後モードの上限難度（"F" / "G"）。採点も自動生成のタンブリングも
   * F・G難度を前提に組む（null・未指定は現行規則）。
   */
  future?: FutureLevel;
  /** Dスコアの下限・上限（未指定＝制限なし） */
  minScore?: number | null;
  maxScore?: number | null;
  /** 試行回数（多いほど良い構成が出やすいが遅くなる） */
  attempts?: number;
  /** シリーズ数の上限（既定 `DEFAULT_MAX_SERIES`） */
  maxSeries?: number;
  /**
   * 自動生成のシリーズにしてよい**割合**（0〜1。既定1＝種類ごとの上限だけ）。
   * シリーズ数の上限（`maxSeries`）に対する本数に換算する（`autoSeriesMax`）。
   * 0 なら自動生成を使わず、登録テンプレートだけで組む。
   */
  autoRatio?: number;
  /**
   * 必須要素を必ず満たすか。未指定なら狙うDスコアで決まる
   * （上限なし、または `REQUIRE_ALL_ELEMENTS_MIN_SCORE` 以上で満たしにいく）。
   * false にすると、不足もA減点として D と天秤にかけるだけになる。
   */
  requireAllElements?: boolean;
  /** 投げタン（転回系の投げ受け）の本数の上限。既定は1本。 */
  maxThrowTumbling?: number;
  /** タンブリングの本数の上限（投げタンを含む）。既定は3本（採用される上限と同じ）。 */
  maxTumblings?: number;
  /** 単発で高難度（D難度以上）な技1つあたりの評価の重み（既定 `HIGH_DIFFICULTY_WEIGHT`）。 */
  highDifficultyWeight?: number;
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

/**
 * 実施が少ない技（ハンドスプリング・転宙）を使ったときの評価の重み。
 * 難度点の最小単位（0.1）より小さくして、同じ点数なら別の技の構成を選ばせる。
 * 演技内の回数そのものは `LIMITED_SKILL_MAX` で1回までに制限する。
 */
export const LIMITED_SKILL_WEIGHT = 0.02;

/** 演技全体での、実施が少ない技の回数（技idごと） */
export function limitedSkillCounts(series: Series[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => {
    if (LIMITED_SKILLS.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId) add(item.skillId);
      if (item.kind === "motion" && item.motionId) add(item.motionId);
    }),
  );
  return counts;
}

/**
 * 単発で高難度（D難度以上）な技を1つ実施するごとの評価の重み。
 * 上限は決めず、重みの結果として演技内で**1〜2つ程度**に落ち着くようにする
 * （日本のトップでも単発でD難度になる技は演技に1〜2つ程度）。
 *
 * 実際の抑えは候補づくり側の `SALTO_DIFFICULTY_WEIGHT`（D=0.6／E=0.3）が担っていて、
 * それだけで最大を狙う構成でも 0個23%／1個43%／2個28%／3個以上5% に収まる。
 * ここは難度点の刻み（0.1）より小さくして、同じ点数なら易しい技の構成を選ぶ程度にする
 * （0.1 にすると0個が35%まで増えて、1〜2つという実態から外れる）。
 *
 * 手具によって出やすさが違う分は `apparatusHighDifficultyWeight` で割る
 * （リングは重く持ったままひねりにくいので、他の手具より更に嫌う）。
 */
export const HIGH_DIFFICULTY_WEIGHT = 0.02;

/** 演技全体での、単発で高難度（D難度以上）な技の数 */
export function highDifficultyCount(
  series: Series[],
  junior = false,
  future: FutureLevel = null,
): number {
  let n = 0;
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId && isHighDifficultySkill(item.skillId, junior, future))
        n += 1;
    }),
  );
  return n;
}

/**
 * 同じ難度に到達する組み方のうち、実施されにくい組み方1順位ぶんの評価の重み。
 * 難度点は同じなので、**同じ点数ならより実施される組み方を選ぶ**だけの効き方にする
 * （順位は最大5、タンブリング3本で最大0.075＝難度の刻み0.1より小さい）。
 */
export const SHAPE_PRIORITY_WEIGHT = 0.005;

/**
 * 構成全体で、実施されにくい組み方ぶんの順位の合計（`TUMBLING_SHAPE_ORDER`）。
 * 転回系のユニットが1つのシリーズだけを見る（テンプレートの複合シリーズは対象外）。
 */
export function shapeRankTotal(
  series: Series[],
  r: ScoreResult,
  junior = false,
  future: FutureLevel = null,
): number {
  let total = 0;
  series.forEach((ser, i) => {
    const units = (r.analysis[i]?.units ?? []).filter((u) => u.type === "tumbling" || u.isThrowTumbling);
    if (units.length !== 1) return;
    const shape = readTumblingShape(ser, junior, future);
    if (!shape) return;
    total += units[0].isThrowTumbling
      ? throwTumblingShapeRank(shape, units[0].finalDiff)
      : tumblingShapeRank(shape, units[0].finalDiff);
  });
  return total;
}

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

/** その構成で「手以外・手具を使った投げのあとに徒手を2動作以上または転回系」を実施している回数 */
export function hardThrowCount(series: Series[], junior = false, future: FutureLevel = null): number {
  let count = 0;
  series.forEach((ser) => {
    let open = false;
    let hard = false;
    let motions = 0;
    let skills = 0;
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        open = true;
        hard = (item.throwTypes || []).some((t) => HARD_THROW_TAGS.includes(t));
        motions = 0;
        skills = 0;
        return;
      }
      if (!open) return;
      if (item.kind === "motion") {
        const def = motionDef(item.motionId, junior, future);
        if (def) motions += motionTimes(item.count);
        return;
      }
      if (item.kind === "skill") {
        skills += 1;
        return;
      }
      if (item.kind === "catch") {
        if (hard && (motions > HARD_THROW_MAX_MOTIONS || skills > 0)) count += 1;
        open = false;
        hard = false;
      }
    });
  });
  return count;
}

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

/** そのシリーズが手具の締めの受け方で終わっているか */
export function endsWithFinishCatch(series: Series, apparatus: ApparatusKey): boolean {
  const tag = FINISH_CATCH_TAG[apparatus];
  if (!tag) return false;
  const last = series.items[series.items.length - 1];
  return last?.kind === "catch" && (last.catchTypes || []).includes(tag);
}

/** 構成が手具の締めの受け方で終わっていないか（締め方の無い手具では常に false） */
export function missesFinishCatch(series: Series[], apparatus: ApparatusKey): boolean {
  if (!FINISH_CATCH_TAG[apparatus] || series.length === 0) return false;
  return !endsWithFinishCatch(series[series.length - 1], apparatus);
}

/**
 * その他の投げ・その他のキャッチは自動生成では**可能な限り使わない**。
 * 技術加点（`TECHNIQUE_BONUS`＝0.1）より強い重みで嫌うので、加点のためだけには実施せず、
 * 多様な投げ受け（必須要素＝`REQUIRED_ELEMENT_WEIGHT`）を満たすのにどうしても必要なときだけ入る。
 */
export const OTHER_STYLE_WEIGHT = 0.15;

/** その他の投げ・その他のキャッチの回数 */
export function otherStyleCount(series: Series[]): number {
  let count = 0;
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "throw" || (item.kind === "skill" && item.isThrow))
        count += (item.throwTypes || []).filter((t) => t === OTHER_TAG).length;
      else if (item.kind === "catch") count += (item.catchTypes || []).filter((t) => t === OTHER_TAG).length;
    }),
  );
  return count;
}

export function verticalThreeThrowCount(series: Series[], junior = false, future: FutureLevel = null): number {
  let count = 0;
  series.forEach((ser) => {
    let vertical = 0;
    let open = false;
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        vertical = 0;
        open = true;
        return;
      }
      if (item.kind === "motion" && open) {
        const def = motionDef(item.motionId, junior, future);
        if (def) vertical += def.vertical * motionTimes(item.count);
        return;
      }
      if (item.kind === "catch" && open) {
        if (vertical >= VERTICAL_THREE_MOTIONS && !(item.catchTypes || []).includes(USE_APPARATUS_TAG))
          count += 1;
        open = false;
      }
    });
  });
  return count;
}

/** 縦3動作とみなす動作数（§3.5.5.3） */
const VERTICAL_THREE_MOTIONS = 3;

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

/** 難度に採用されない投げ受けに入っている徒手操作のぶん（A難度＝操作なしを0とする） */
export function extraThrowOperation(r: ScoreResult): number {
  let total = 0;
  r.analysis.forEach((a, i) =>
    a.units.forEach((u, j) => {
      if (u.throwCount === 0 || u.isThrowTumbling) return;
      if (r.unitInTop[i]?.[j]) return;
      total += DIFF_VALUE[u.finalDiff] - DIFF_VALUE.A;
    }),
  );
  return total;
}

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

/**
 * 連続投げ（1つのシリーズに投げ受けが2つ以上）のうち、**2回目以降のほうが難度が高い**
 * シリーズの数。1回目のほうが高いのが普通だが、逆の構成も現実にあるので、
 * `THROW_ORDER_WEIGHT`（難度点の刻みより小さい）だけ弱く嫌うだけにする。
 * 投げタンは転回系の難度で決まるので数えない。
 */
export function reversedThrowOrderCount(r: ScoreResult): number {
  let n = 0;
  r.analysis.forEach((a) => {
    const diffs = a.units
      .filter((u) => u.throwCount > 0 && !u.isThrowTumbling)
      .map((u) => DIFF_VALUE[u.finalDiff]);
    if (diffs.length < 2) return;
    if (Math.max(...diffs.slice(1)) > diffs[0]) n += 1;
  });
  return n;
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
  /** ルールの投げ回数（一般3回・ジュニア2回）に足りていないか。Dスコアに関係なく必ず満たす */
  throwCountUnmet: boolean;
}

/**
 * 構成の良さ。範囲外は強いペナルティ、そのうえで D + A残点 を最大化する。
 * 必須要素の不足・ジュニアの投げ超過はA減点として効くので、これだけで
 * 「必須要素を満たしつつ難度を上げる」方向に進む。
 */
function evaluate(series: Series[], opts: GenerateOptions, autoCount = 0): Evaluation {
  const r = computeScore(series, opts.apparatus, { junior: !!opts.junior, future: opts.future ?? null });
  const penalty = rangePenalty(r.dScore, opts.minScore, opts.maxScore);
  // 投げタンの本数制限（既定1本）。超えた分は範囲外と同じ強さで嫌う。
  const maxThrowTum = opts.maxThrowTumbling ?? DEFAULT_MAX_THROW_TUMBLING;
  const throwTumCount = r.analysis.reduce(
    (n, a) => n + a.units.filter((u) => u.isThrowTumbling).length,
    0,
  );
  const overThrowTum = Math.max(0, throwTumCount - maxThrowTum);
  // タンブリングは投げタンを含めて3本までしか評価されない。4本目は入れない
  const overTumbling = Math.max(0, r.nonDupTumblingCount - (opts.maxTumblings ?? DEFAULT_MAX_TUMBLINGS));
  // 単発で高難度（D難度以上）な技は数が少ない。上限は決めず、重みで抑える
  const highDifficulty = highDifficultyCount(series, !!opts.junior, opts.future ?? null);
  // 実施が少ない技（ハンドスプリング・転宙）は演技内で1回まで。使うこと自体も弱く嫌う
  const limited = limitedSkillCounts(series);
  let limitedUsed = 0;
  let overLimited = 0;
  limited.forEach((n) => {
    limitedUsed += n;
    overLimited += Math.max(0, n - LIMITED_SKILL_MAX);
  });
  // 同じ宙返りの繰り返しは弱く嫌う（同点のときに多様な構成が選ばれる程度）
  const variety = saltoRepeatCount(series) * SALTO_VARIETY_WEIGHT;
  // 転回系の多様性の減点（§3.5.6.4）は手入力の項目だが、自動計算した値を評価では負う。
  // 上級者（難度の高い構成）になるほど宙返りの種類が増えるので、この減点は自然に小さくなる
  const tumVariety = r.tumVariety.deduction;
  // 同じ難度なら、より実施される組み方（C→B→B など）を選ぶ
  const shape = shapeRankTotal(series, r, !!opts.junior, opts.future ?? null) * SHAPE_PRIORITY_WEIGHT;
  // 連続投げは1回目のほうが難度が高いのが普通（逆の構成も現実にあるので弱く嫌うだけ）
  const throwOrder = reversedThrowOrderCount(r) * THROW_ORDER_WEIGHT;
  // 投げ上げの回数はDスコアに応じた最頻値に寄せる
  const throwCount = throwCountPenalty(r.performedThrowCount, r.dScore, !!opts.junior);
  // 難度に採用されない投げは加点だけを狙うので、操作を足さない
  const extraOperation = extraThrowOperation(r) * EXTRA_THROW_OPERATION_WEIGHT;
  // 前転3回（縦3動作）を手具を使ったキャッチ以外で受ける形は基本実施しない
  const verticalThree =
    verticalThreeThrowCount(series, !!opts.junior, opts.future ?? null) * VERTICAL_THREE_THROW_WEIGHT;
  // その他の投げ・その他のキャッチは可能な限り使わない
  const otherStyle = otherStyleCount(series) * OTHER_STYLE_WEIGHT;
  // クラブは押さえてキャッチ、ロープは足に絡めたキャッチで演技を締める
  const finishCatch = missesFinishCatch(series, opts.apparatus) ? FINISH_CATCH_WEIGHT : 0;
  // 手以外・手具を使った投げのあとに徒手を多く実施する形は、要求値が5.0を超えるまで嫌う
  const hardThrow = suppressHardThrow(opts)
    ? hardThrowCount(series, !!opts.junior, opts.future ?? null) * HARD_THROW_WEIGHT
    : 0;
  // 満たせていないA側の要求（優先順位つき）。ある程度のDスコアを狙う構成では必ず満たしにいく
  const shortfall = shortfallPenalty(r, opts.apparatus, requiresAllElements(opts));
  // 自動生成は同点ならテンプレートに譲る（多様性と同じく、点数は犠牲にしない重み）
  const auto = autoCount * AUTO_SERIES_WEIGHT;
  return {
    value:
      -(penalty + overThrowTum + overTumbling + overLimited) * 100 -
      shortfall +
      r.dScore +
      // 加点よりも高難度の実施を優先する（タンブリングの難度はさらに優先する）
      (r.tumblingScore + r.handScore) * DIFFICULTY_PREFERENCE_WEIGHT +
      r.tumblingScore * TUMBLING_PREFERENCE_WEIGHT +
      r.aScore -
      variety -
      tumVariety -
      shape -
      throwOrder -
      throwCount -
      extraOperation -
      verticalThree -
      otherStyle -
      finishCatch -
      hardThrow -
      auto -
      limitedUsed * LIMITED_SKILL_WEIGHT -
      (highDifficulty * (opts.highDifficultyWeight ?? HIGH_DIFFICULTY_WEIGHT)) /
        apparatusHighDifficultyWeight(opts.apparatus),
    dScore: r.dScore,
    aScore: r.aScore,
    missing: r.missing.map((m) => m.label),
    throwCountUnmet: r.required.some((c) => c.key === "count3" && c.passed === false),
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
  // 投げの回数はA側の最優先。Dスコアが低い構成でも**ルールの回数は必ず満たす**
  // （0〜1点台の選手が満たさないのはタンブリング側の要求で、投げの回数は投げるだけ）
  if (failed("count3") || failed("countMax"))
    total += REQUIRED_ELEMENT_WEIGHT + A_PRIORITY.throwCount * A_PRIORITY_WEIGHT;
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
  // 割合が0＝自動生成を使わない（候補を作るだけ無駄なので作らない）
  if (autoSeriesMax(opts) === 0) return pool;
  if (opts.autoThrows !== false)
    pool.push(
      ...autoThrowTemplates(opts.apparatus, {
        random: rand,
        limit: opts.autoThrowLimit,
        // 十年後モードでは5〜6動作（F・G難度）の形も候補にする
        future: opts.future ?? null,
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

/** 不足を満たす候補を必ず入れて組み直す回数（足す順番で結果が変わるため） */
const REBUILD_ATTEMPTS = 5;

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
function isTumblingSeries(series: Series, junior: boolean, future: FutureLevel = null): boolean {
  return analyzeSeries(series, junior, future).units.some(
    (u) => u.type === "tumbling" || u.isThrowTumbling,
  );
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
function finishCatchLast(list: SeriesTemplate[], apparatus: ApparatusKey): SeriesTemplate[] {
  if (!FINISH_CATCH_TAG[apparatus] || list.length < 2) return list;
  const ends = (t: SeriesTemplate) => endsWithFinishCatch(t.series, apparatus);
  const idx = list.findIndex(ends);
  if (idx < 0 || ends(list[list.length - 1])) return list;
  return [...list.filter((_, i) => i !== idx), list[idx]];
}

/** 自動生成のシリーズの本数が上限（種類ごと・割合）を超えていないか */
function withinAutoLimits(list: SeriesTemplate[], opts: GenerateOptions): boolean {
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
function swapIn(
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
function upgradeTumblings(
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

/** タンブリングの入れ替えを試す回数 */
const TUMBLING_UPGRADE_ROUNDS = 2;

/**
 * 貪欲法の1回ぶん。`start` のシリーズは必ず入れた状態から始める。
 *  ① ランダムな順に見て、評価が上がるものだけ足す（登録テンプレートを先に見る）
 *  ② 自動生成のシリーズは量（シェネの回数・宙返りの本数）を調整する
 *  ③ 抜いても評価が下がらないシリーズを取り除く
 *  ④ 投げとタンブリングを交互に並べる
 */
function greedyAttempt(
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

/** 投げの回数が足りないときに、組み直しの起点として試す投げ候補の数 */
const THROW_REBUILD_CANDIDATES = 4;

/** その候補を必ず入れて組み直す価値があるもの（不足を満たせる候補） */
function satisfying(
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
