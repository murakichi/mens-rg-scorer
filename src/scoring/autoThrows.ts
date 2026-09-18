// =====================================================================
// 投げシリーズの自動生成（ランダム生成用）
//
// 投げ方（左手投げ・視野外・手以外…）を全パターン網羅したテンプレートを
// 手で登録するのは大変なので、よくある投げシリーズの形をシステム側で組む。
//
// 形は AUTO_THROW_PATTERNS の11種類：
//   投げ→1〜2回シェネ→前転→転がり→キャッチ
//   投げ→1〜3回シェネ→前転→キャッチ（＋視野外の投げ受け）
//   投げ→3〜4回シェネ→キャッチ（＋視野外の投げ受け）
//   投げ→前転3回→キャッチ（縦3動作でE難度）
//   投げ→シェネ→キャッチ／投げ→前転→キャッチ／投げ→キャッチ
//     （必須要素を最低限の操作（徒手0〜1動作）で満たす形）
//   投げ→キャッチ→投げ→シェネ（→前転）→キャッチ
//     （先に最低限の投げ受けを1本置いて、投げ方を安く1種類増やす形）
// これに「投げ方」「受け方」「シェネの手」「シェネの回数」を割り当てた候補を作り、
// ランダム生成（generate.ts）の候補に足す。**必ず使われるわけではなく**、
// 評価が上がるものだけが構成に入る。
// =====================================================================

import { cycler, pickWeighted, rarityChance, rarityExponent, shuffled } from "./pick";
import {
  APPARATUS_USE,
  DIFF_VALUE,
  HANDS_TYPES,
  NO_VIEW_TAG,
  REQUIRED_THROW_OPTIONS,
  hasLeftHandThrow,
} from "./constants";

/** 視野外の投げ・キャッチの技術タグ（`constants.ts` が持ち主。ここからも参照できるよう再輸出する） */
export { NO_VIEW_TAG };
import { newTemplateId, type SeriesTemplate } from "./templates";
import { unseenShapeChance } from "./unseenShapes";
import type { ApparatusKey, FutureLevel, Item, Series } from "./types";

/** 自動生成した投げシリーズの形 */
export interface AutoThrowPattern {
  id: string;
  /** シェネの回数（最小・最大とも含む。0〜0＝シェネなし） */
  chene: { min: number; max: number };
  /** シェネのあとに続ける徒手動作（MOTION_OPTIONS の id と回数） */
  after: { motionId: string; count: number }[];
  /** キャッチのあとに「視野外の投げ→視野外のキャッチ」を足すか */
  noViewPair: boolean;
  /**
   * 徒手が**縦3動作**（前転3回）でE難度になる形か。
   * 受けは手具を使ったキャッチ（押さえつけ）が主流で、それ以外の受け方は少ない。
   */
  verticalThree?: boolean;
  /**
   * 先に投げ受けを1本足すか（連続投げの1回目。`LEAD_THROW_CHENE_COUNT` 回のシェネを挟む）。
   * 投げ方を1種類増やすのに操作を足さずに済むので、日本トップの演技でも
   * 「手以外の投げ→キャッチ→視野外の投げ→シェネ→キャッチ」のように実施する。
   */
  leadPair?: boolean;
  /**
   * あとに投げ受けを1本足すか（連続投げの2回目）。**連続投げは1回目で難度を採ることが多い**ので、
   * 徒手はこの形の主役（1回目）に付き、2回目は徒手なしの投げ受けになる。
   */
  trailPair?: boolean;
  /**
   * 十年後モード専用の形（その上限難度に届いていないと候補にしない）。
   * 現行規則では徒手はE止まり（4動作）なので、5〜6動作の形はここで区別する。
   */
  future?: Exclude<FutureLevel, null>;
}

/** その上限難度でこの形を使ってよいか（`future` の付いていない形はいつでも使える） */
export const throwPatternAllowed = (pattern: AutoThrowPattern, future: FutureLevel = null): boolean =>
  !pattern.future || (!!future && DIFF_VALUE[future] >= DIFF_VALUE[pattern.future]);

/**
 * 連続投げの1回目（`leadPair` の先に置く投げ受け）で実施するシェネの回数。
 * 1回目が低難度になる形では1シェネを挟む。
 */
export const LEAD_THROW_CHENE_COUNT = 1;

/** 徒手動作のid（自動生成で使うものだけ） */
const CHENE = "chene";
const FWD_ROLL = "fwd_roll";
const ROLL = "roll";

const times = (motionId: string, count: number) => ({ motionId, count });

export const AUTO_THROW_PATTERNS: AutoThrowPattern[] = [
  { id: "cheneRollRoll", chene: { min: 1, max: 2 }, after: [times(FWD_ROLL, 1), times(ROLL, 1)], noViewPair: false },
  { id: "cheneRoll", chene: { min: 1, max: 3 }, after: [times(FWD_ROLL, 1)], noViewPair: false },
  { id: "cheneRollNoView", chene: { min: 1, max: 3 }, after: [times(FWD_ROLL, 1)], noViewPair: true },
  { id: "chene", chene: { min: 3, max: 4 }, after: [], noViewPair: false },
  { id: "cheneNoView", chene: { min: 3, max: 4 }, after: [], noViewPair: true },
  // シェネなし。前転3回＝縦3動作でE難度（§3.5.5.3）
  {
    id: "rolls",
    chene: { min: 0, max: 0 },
    after: [times(FWD_ROLL, 3)],
    noViewPair: false,
    verticalThree: true,
  },
  // 最低限の操作で必須要素（左手投げ・二つ投げ）を満たす形。
  // スティックの「1シェネキャッチ」、クラブ・リングの「二つ投げ→前転／シェネ→キャッチ」。
  // 難度は低いのでDスコアを抑えたいときに使われやすいが、上級者も普通に実施する。
  { id: "minimalChene", chene: { min: 1, max: 1 }, after: [], noViewPair: false },
  { id: "minimalRoll", chene: { min: 0, max: 0 }, after: [times(FWD_ROLL, 1)], noViewPair: false },
  // 徒手なしの投げ受け（スティックの「通常・視野外投げ→手以外のキャッチ」など）
  { id: "minimalNone", chene: { min: 0, max: 0 }, after: [], noViewPair: false },
  // 先に最低限の投げ受けを1本置く形（投げ方を安く1種類増やす）
  { id: "cheneLeadPair", chene: { min: 3, max: 4 }, after: [], noViewPair: false, leadPair: true },
  { id: "cheneRollLeadPair", chene: { min: 1, max: 3 }, after: [times(FWD_ROLL, 1)], noViewPair: false, leadPair: true },
  // あとに最低限の投げ受けを1本足す形（連続投げは1回目で難度を採ることが多い）
  { id: "cheneTrailPair", chene: { min: 3, max: 4 }, after: [], noViewPair: false, trailPair: true },
  { id: "cheneRollTrailPair", chene: { min: 1, max: 3 }, after: [times(FWD_ROLL, 1)], noViewPair: false, trailPair: true },
  // ---- 十年後モードでだけ実施する、5〜6動作の形（`HAND_MOTION_WEIGHT` の数え方）----
  // シェネ×5＝5.0（F）／シェネ×4→前転＝5.5（G）／前転×4＝6.0（G）／シェネ×6＝6.0（G）
  { id: "cheneFive", chene: { min: 5, max: 5 }, after: [], noViewPair: false, future: "F" },
  { id: "cheneSix", chene: { min: 6, max: 6 }, after: [], noViewPair: false, future: "G" },
  { id: "cheneFourRoll", chene: { min: 4, max: 4 }, after: [times(FWD_ROLL, 1)], noViewPair: false, future: "G" },
  // 前転4回。縦3動作と同じく、受けはもう一方の手具で押さえつけるのが主流
  {
    id: "rollsFour",
    chene: { min: 0, max: 0 },
    after: [times(FWD_ROLL, 4)],
    noViewPair: false,
    verticalThree: true,
    future: "G",
  },
];

/** 徒手なしの投げ受けの形（`trailPair` のあとの1本など、手具ごとの規則だけで受け方を引くのに使う） */
export const MINIMAL_PATTERN: AutoThrowPattern =
  AUTO_THROW_PATTERNS.find((p) => p.id === "minimalNone") ??
  { id: "minimalNone", chene: { min: 0, max: 0 }, after: [], noViewPair: false };

/** そのキャッチのあとに投げが続く形か（そこから投げに繋げない受け方を外すのに使う） */
export const throwsAfterCatch = (pattern: AutoThrowPattern): boolean =>
  !!pattern.noViewPair || !!pattern.trailPair;

/** 自動生成で使う投げ方 */
export interface AutoThrowStyle {
  id: string;
  name: string;
  /** 手具固有の必須投げ（lefthand / twothrow） */
  reqTypes?: string[];
  /** 技術タグ（noview / nonhand / other / useapp） */
  throwTypes?: string[];
  /** 手具を2つ投げるか（キャッチも2つ同時になる） */
  two?: boolean;
  /**
   * 実施例の無い投げ方（左手投げ＋視野外）。物理的には実施できるので候補には残すが、
   * **要求するDスコアが上がるまで出さない**（`unseenShapes.ts` の `leftHandNoViewThrow`）。
   * 連続投げの1回目・2回目（`leadPair` / `trailPair`）には使わない。
   */
  rare?: boolean;
}

/** 自動生成で使う受け方 */
export interface AutoCatchStyle {
  id: string;
  name: string;
  catchTypes?: string[];
}

/** その手具で使える投げ方（通常の右投げ＋必須投げ＋技術タグ） */
export function autoThrowStyles(apparatus: ApparatusKey): AutoThrowStyle[] {
  const styles: AutoThrowStyle[] = [
    { id: "normal", name: "通常の投げ" },
    ...REQUIRED_THROW_OPTIONS[apparatus].map((o) => ({
      id: o.id,
      name: o.name,
      reqTypes: [o.id],
      two: o.id === "twothrow",
    })),
    { id: "noview", name: "視野外の投げ", throwTypes: ["noview"] },
    { id: "nonhand", name: "手以外の投げ", throwTypes: ["nonhand"] },
    { id: "other", name: "その他の投げ", throwTypes: ["other"] },
  ];
  if (APPARATUS_USE[apparatus]) styles.push({ id: "useapp", name: "手具を使った投げ", throwTypes: ["useapp"] });
  // 左手投げを視野外（背面）で投げる形。物理的には実施できるが競技での例が無いので
  // `rare` を立てて、要求するDスコアが上がるまで出さない
  if (hasLeftHandThrow(apparatus))
    styles.push({
      id: `${LEFT_HAND_TAG}+${NO_VIEW_TAG}`,
      name: "左手の視野外投げ",
      reqTypes: [LEFT_HAND_TAG],
      throwTypes: [NO_VIEW_TAG],
      rare: true,
    });
  return styles;
}

/** 手具で押さえつけてキャッチ（手具を使ったキャッチ）のid */
export const CATCH_USE_APPARATUS = "useapp";

/** その手具で使える受け方（2つ同時キャッチは二つ投げに付くので選択肢には出さない） */
export function autoCatchStyles(apparatus: ApparatusKey): AutoCatchStyle[] {
  const styles: AutoCatchStyle[] = [
    { id: "normal", name: "通常のキャッチ" },
    { id: "noview", name: "視野外のキャッチ", catchTypes: ["noview"] },
    { id: "nonhand", name: "手以外のキャッチ", catchTypes: ["nonhand"] },
    { id: "other", name: "その他のキャッチ", catchTypes: ["other"] },
  ];
  // クラブ・リングは、もう一方の手具で押さえつけて受けられる
  if (APPARATUS_USE[apparatus])
    styles.push({ id: CATCH_USE_APPARATUS, name: "手具で押さえつけてキャッチ", catchTypes: [CATCH_USE_APPARATUS] });
  // 2種類を同時に満たす受け方（`COMBINED_CATCH_WEIGHT`）
  styles.push({
    id: `${NO_VIEW_TAG}+${NON_HAND_TAG}`,
    name: "視野外＋手以外のキャッチ",
    catchTypes: [NO_VIEW_TAG, NON_HAND_TAG],
  });
  if (APPARATUS_USE[apparatus])
    styles.push({
      id: `${NO_VIEW_TAG}+${CATCH_USE_APPARATUS}`,
      name: "視野外＋手具を使ったキャッチ",
      catchTypes: [NO_VIEW_TAG, CATCH_USE_APPARATUS],
    });
  return styles;
}

/** その受け方がその技術タグを含むか（2種類を同時に満たす受け方があるのでタグで見る） */
export const catchHasTag = (catchStyle: AutoCatchStyle, tag: string): boolean =>
  (catchStyle.catchTypes || []).includes(tag);

/**
 * その投げ方で使える受け方。
 * 二つ投げは手具が2つとも空中にあるので、手具で押さえつけてキャッチはできない。
 */
export function catchStylesForThrow(apparatus: ApparatusKey, twoThrow: boolean): AutoCatchStyle[] {
  const styles = autoCatchStyles(apparatus);
  return twoThrow ? styles.filter((c) => !catchHasTag(c, CATCH_USE_APPARATUS)) : styles;
}

/** 手以外の受け・投げの技術タグ */
export const NON_HAND_TAG = "nonhand";
/**
 * 動作の最後が**転がり・前転**の形。クラブ・リングは、そこから
 * **手具を使ったキャッチ（押さえつけ）**で受けるのが定番。
 */
export const ROLL_FINISH_MOTIONS: string[] = [FWD_ROLL, ROLL];
export const rollFinishShape = (pattern: AutoThrowPattern): boolean => {
  const last = pattern.after[pattern.after.length - 1];
  return !!last && ROLL_FINISH_MOTIONS.includes(last.motionId);
};
/** その形で手具を使ったキャッチ以外を引く重み（クラブ・リングのみ） */
export const ROLL_FINISH_OTHER_CATCH_WEIGHT = 0.2;

/**
 * その他の受け・投げの技術タグ。
 * **これは「珍しい投げ方・受け方」ではない**：規則の分類では同じ受け方に見えるが実態は
 * まったく違う、というものを**別の種類として数えてもらう**ための入力で、
 * 多様な投げ受け（必須要素）の種類数を埋める役割を持つ。
 * だから自動生成では「ほかの種類で足りないときだけ使う」＝可能な限り使わない扱いにし、
 * **珍しさのつまみ（`rarity`）の変形からも外す**（珍しさを上げてこれが増えても意味がない）。
 */
export const OTHER_TAG = "other";
/** その他のキャッチから次の投げに続ける確率は低い */
export const OTHER_CATCH_BEFORE_THROW_WEIGHT = 0.2;
/**
 * その他の投げ・その他のキャッチは自動生成では**可能な限り使わない**。
 * 受け方は引く重みを下げ（ここ）、投げ方は候補としては残したまま
 * 生成側の評価で嫌う（`generate.ts` の `OTHER_STYLE_WEIGHT`）。
 */
export const OTHER_CATCH_WEIGHT = 0.1;

/**
 * 2種類を同時に満たす受け方の重み。単独の受け方より実施は少ない。
 *  - 視野外＋手以外のキャッチ：低難度の投げで実施する（手以外の規則 `NON_HAND_CATCH_RULE` に従う）
 *  - 視野外＋手具を使ったキャッチ：クラブ・リングで、難度に関わらず起こりうる
 *    （クラブは実施例が無いので `NO_VIEW_USE_APPARATUS_WEIGHT` でさらに低く）
 */
export const COMBINED_CATCH_WEIGHT = 0.1;
export const NO_VIEW_USE_APPARATUS_WEIGHT: Partial<Record<ApparatusKey, number>> = { clubs: 0.3 };

/**
 * **クラブの二つ投げを手以外で受ける**のはほぼ不可能：2本とも空中にあるので、
 * 受け止めるのに使える体の部位に手具を添えることができない。実施例が無いに等しいので、
 * **要求するDスコア**（`demandScore`＝`minScore`）が `TWO_THROW_NON_HAND_FREE_SCORE` を
 * 超えるまでは事実上生成しない重みにする（`HARD_THROW_FREE_SCORE` と同じ読み方）。
 * 禁止ではなく重みなのは、点数がどうしても要るときの逃げ道を残すため。
 * リングは輪なので腕・首で受けられる余地があり、この規則の対象外。
 */
export const TWO_THROW_NON_HAND_WEIGHT = 0.01;

export const TWO_THROW_NON_HAND_FREE_SCORE = 5.0;

export const twoThrowNonHandWeight = (
  apparatus: ApparatusKey,
  demandScore?: number | null,
): number =>
  apparatus === "clubs" && (demandScore ?? 0) <= TWO_THROW_NON_HAND_FREE_SCORE
    ? TWO_THROW_NON_HAND_WEIGHT
    : 1;

/**
 * **前転3回（縦3動作）は珍しい寄りの技**。候補に混ぜるかどうかを1回の抽選で決める
 * （形ごとに引くと投げ方の数だけ生き残って、結局貪欲法が拾ってしまう）。
 *
 * ただし縦3動作は徒手だけでE難度に届く唯一の形なので、**要求するDスコア**
 * （`demandScore`＝`minScore`）が `VERTICAL_THREE_FREE_SCORE` 以上のときは下げない
 * （`HARD_THROW_FREE_SCORE` と同じ考え方）。珍しさのつまみも通す。
 */
export const VERTICAL_THREE_CHANCE = 0.25;

export const VERTICAL_THREE_FREE_SCORE = 4.5;

export const verticalThreeChance = (demandScore?: number | null): number =>
  (demandScore ?? 0) >= VERTICAL_THREE_FREE_SCORE ? 1 : VERTICAL_THREE_CHANCE;

/**
 * 縦3動作（前転3回）の形で、**手具を使ったキャッチ以外**の受け方を引く重み。
 * 前転3回から受けるのは手具で押さえつけるのが主流。
 */
export const VERTICAL_THREE_OTHER_CATCH_WEIGHT = 0.2;

/** 左手投げの必須投げのid */
export const LEFT_HAND_TAG = "lefthand";

/** 左手投げを**視野外で受ける**確率はかなり低い */
export const LEFT_HAND_NO_VIEW_CATCH_WEIGHT = 0.1;

/**
 * 手以外のキャッチの実施しやすさは手具で違う。
 *  - スティック：**低難度の投げ**（徒手が少ない投げ受け）で実施する
 *  - クラブ：低難度の投げで、しかも**低確率**
 *  - リング・ロープ：普通に実施する（ロープは足に絡めて受け、そのまま演技を締めることが多い）
 */
export const NON_HAND_CATCH_MAX_MOTIONS = 1;
export const NON_HAND_CATCH_RULE: Record<ApparatusKey, { lowDifficultyOnly: boolean; weight: number }> = {
  stick: { lowDifficultyOnly: true, weight: 1 },
  clubs: { lowDifficultyOnly: true, weight: 0.2 },
  ring: { lowDifficultyOnly: false, weight: 1 },
  rope: { lowDifficultyOnly: false, weight: 1 },
};

/** その形で実施する徒手動作の数（シェネの回数＋形に含まれる動作） */
export const patternMotions = (pattern: AutoThrowPattern, cheneCount: number): number =>
  cheneCount + pattern.after.reduce((n, m) => n + m.count, 0);

/** その投げ方・形で受け方を引く重み（1が既定。0は実施しない） */
export function catchStyleWeight({
  throwStyle,
  catchStyle,
  pattern,
  apparatus,
  motions,
  demandScore,
}: {
  throwStyle: AutoThrowStyle;
  catchStyle: AutoCatchStyle;
  pattern: AutoThrowPattern;
  apparatus: ApparatusKey;
  /** その投げ受けで実施する徒手動作の数（`patternMotions`） */
  motions: number;
  /** 要求するDスコア（`minScore`）。クラブの二つ投げ×手以外の判定に使う */
  demandScore?: number | null;
}): number {
  const has = (tag: string) => catchHasTag(catchStyle, tag);
  const nonHandRule = NON_HAND_CATCH_RULE[apparatus];
  // 手以外のキャッチを低難度の投げでしか実施しない手具では、徒手が多い形では実施しない
  if (has(NON_HAND_TAG) && nonHandRule.lowDifficultyOnly && motions > NON_HAND_CATCH_MAX_MOTIONS)
    return 0;
  let weight = 1;
  // その他のキャッチは可能な限り使わない
  if (has(OTHER_TAG)) weight *= OTHER_CATCH_WEIGHT;
  // その他のキャッチから次の投げに続けるのは少ない（`noViewPair` は受けたあと投げる形）
  if (throwsAfterCatch(pattern) && has(OTHER_TAG)) weight *= OTHER_CATCH_BEFORE_THROW_WEIGHT;
  // 縦3動作の形は手具で押さえつけて受けるのが主流
  if (pattern.verticalThree && !has(CATCH_USE_APPARATUS)) weight *= VERTICAL_THREE_OTHER_CATCH_WEIGHT;
  // クラブ・リングは、転がり・前転で終わってから手具で押さえつけて受けるのが定番
  if (APPARATUS_USE[apparatus] && rollFinishShape(pattern) && !has(CATCH_USE_APPARATUS))
    weight *= ROLL_FINISH_OTHER_CATCH_WEIGHT;
  // 左手投げを視野外で受けることはかなり少ない
  if ((throwStyle.reqTypes || []).includes(LEFT_HAND_TAG) && has(NO_VIEW_TAG))
    weight *= LEFT_HAND_NO_VIEW_CATCH_WEIGHT;
  // 手以外のキャッチの実施しやすさは手具で違う
  if (has(NON_HAND_TAG)) weight *= nonHandRule.weight;
  // クラブの二つ投げを手以外で受けるのはほぼ不可能（点数がどうしても要るときだけ）
  if (throwStyle.two && has(NON_HAND_TAG)) weight *= twoThrowNonHandWeight(apparatus, demandScore);
  // 2種類を同時に満たす受け方は単独より少ない（視野外＋手具を使ったキャッチはクラブでさらに低く）
  if ((catchStyle.catchTypes || []).length >= 2)
    weight *=
      COMBINED_CATCH_WEIGHT *
      (has(CATCH_USE_APPARATUS) ? (NO_VIEW_USE_APPARATUS_WEIGHT[apparatus] ?? 1) : 1);
  return weight;
}

/**
 * その受け方からは**どんな投げにも繋げられない**技術タグ。
 *  - 手以外のキャッチ → 足や体で受けた手具はすぐには投げられない
 *  - 手具を使ったキャッチ（押さえつけ）→ 押さえた状態からは投げられない
 */
export const NO_THROW_AFTER_CATCH_TAGS: string[] = [NON_HAND_TAG, CATCH_USE_APPARATUS];

/**
 * **同じ技術では繋げられない**組み合わせ：視野外で受けてそのまま視野外に投げることはできない。
 * 視野外で受けてから**普通に見て投げる**のは実施例がある
 * （視野外投げ→1シェネ→視野外キャッチ→二つ投げ→そのままキャッチ）。
 */
export const NO_SAME_TAG_AFTER_CATCH_TAGS: string[] = [NO_VIEW_TAG];

/**
 * その受け方のあとに投げを続けられるか。
 * 次の投げ方が決まっていないうちは**無条件のものだけ**を外し（`NO_THROW_AFTER_CATCH_TAGS`）、
 * 同じ技術どうしの組み合わせ（視野外→視野外）は投げ方を引くときに外す。
 */
export const canThrowAfterCatch = (catchStyle: AutoCatchStyle, nextThrow?: AutoThrowStyle): boolean => {
  if (NO_THROW_AFTER_CATCH_TAGS.some((tag) => catchHasTag(catchStyle, tag))) return false;
  if (!nextThrow) return true;
  const types = nextThrow.throwTypes || [];
  return !NO_SAME_TAG_AFTER_CATCH_TAGS.some((tag) => catchHasTag(catchStyle, tag) && types.includes(tag));
};

/**
 * その形で使える受け方。**次の投げに続ける受け**（`noViewPair`・`trailPair` の直前の受け）では、
 * そこから投げに繋げない受け方（`NO_THROW_AFTER_CATCH_TAGS`）を外す。
 */
export function catchStylesForPattern(
  apparatus: ApparatusKey,
  twoThrow: boolean,
  pattern: AutoThrowPattern,
): AutoCatchStyle[] {
  const styles = catchStylesForThrow(apparatus, twoThrow);
  if (!throwsAfterCatch(pattern)) return styles;
  // `noViewPair` は続けて**視野外に投げる**形なので、視野外のキャッチも外れる。
  // `trailPair` は2回目の投げ方をあとで引くので、ここでは無条件のものだけ外し、
  // 視野外どうしの組み合わせは投げ方を引くとき（`trailThrowStylesAfter`）に外す
  const noViewThrow: AutoThrowStyle = { id: NO_VIEW_TAG, name: "視野外の投げ", throwTypes: [NO_VIEW_TAG] };
  return styles.filter((c) => (pattern.noViewPair ? canThrowAfterCatch(c, noViewThrow) : canThrowAfterCatch(c)));
}

/**
 * `trailPair` の2回目に使える投げ方。手以外の投げは2回目には実施できず、
 * 直前の受けが視野外なら視野外の投げも外す（視野外→視野外は実施できない）。
 */
export const trailThrowStylesAfter = (
  styles: AutoThrowStyle[],
  mainCatch: AutoCatchStyle,
): AutoThrowStyle[] => styles.filter((t) => t.id !== NON_HAND_TAG && canThrowAfterCatch(mainCatch, t));

/**
 * その形で使える投げ方。先に投げ受けを1本置く形（`leadPair`）の本体の投げは
 * **連続投げの2回目**なので、手以外の投げにはしない（ほぼ不可能）。
 */
export function throwStylesForPattern(
  apparatus: ApparatusKey,
  pattern: AutoThrowPattern,
): AutoThrowStyle[] {
  const styles = autoThrowStyles(apparatus);
  // `leadPair` の本体は連続投げの**2回目**。手以外の投げは2回目には実施できず、
  // 二つ投げも「2回目 かつ 徒手を多く実施する（＝高難度）」形は実施されない
  // （実施例があるのは 視野外投げ→1シェネ→視野外キャッチ→**二つ投げ→そのままキャッチ**の
  //  ように、2回目の二つ投げをすぐ受ける形＝`trailPair` のほう）
  return pattern.leadPair ? styles.filter((t) => t.id !== NON_HAND_TAG && !t.two) : styles;
}

/** シェネの手の使い方（null＝手なし。手ありは HANDS_TYPES の種類ごとに別の技） */
export type AutoHands = string | null;
export const autoHandsVariants = (): AutoHands[] => [null, ...HANDS_TYPES.map((h) => h.id)];

/**
 * シェネの手を引く重み。**手なしが最優先**で、手ありは
 * 片手上げ＝両手上げ ＞ その他 ＞ 回旋 の順に実施される。
 */
export const HANDS_NONE_WEIGHT = 1;
export const HANDS_PICK_WEIGHT: Record<string, number> = {
  one: 0.5,
  both: 0.5,
  other: 0.25,
  spin: 0.1,
};
export const handsWeight = (hands: AutoHands): number =>
  hands === null ? HANDS_NONE_WEIGHT : (HANDS_PICK_WEIGHT[hands] ?? 1);

/**
 * 回旋は2動作までがメインで、3動作は頻度が下がる（4動作はさらに下がる）。
 * シェネの回数はいままでどおり形ごとに配り、**その回数で回旋を引く重み**を下げる
 * （3動作以上しか取れない形では回旋がほとんど出ない）。ほかの手は回数で変わらない。
 */
export const SPIN_HANDS_ID = "spin";
export const SPIN_MAIN_CHENE_COUNT = 2;
export const SPIN_THIRD_CHENE_WEIGHT = 0.3;
export const SPIN_OVER_CHENE_WEIGHT = 0.1;
export const cheneCountWeight = (hands: AutoHands, count: number): number => {
  if (hands !== SPIN_HANDS_ID || count <= SPIN_MAIN_CHENE_COUNT) return 1;
  return count === SPIN_MAIN_CHENE_COUNT + 1 ? SPIN_THIRD_CHENE_WEIGHT : SPIN_OVER_CHENE_WEIGHT;
};

/** 1本ぶんの自動生成の内容 */
export interface AutoThrowSpec {
  pattern: AutoThrowPattern;
  /** シェネの回数 */
  cheneCount: number;
  hands: AutoHands;
  throwStyle: AutoThrowStyle;
  catchStyle: AutoCatchStyle;
  /** 先に足す投げ受けの投げ方（`pattern.leadPair` のときだけ。受けは通常のキャッチ） */
  leadThrowStyle?: AutoThrowStyle;
  /** あとに足す投げ受けの投げ方（`pattern.trailPair` のときだけ。徒手なし） */
  trailThrowStyle?: AutoThrowStyle;
  /** あとに足す投げ受けの受け方（徒手なしの投げ受けとして引く。演技の締めになり得る） */
  trailCatchStyle?: AutoCatchStyle;
}

/** 自動生成の内容からシリーズを組み立てる */
export function buildAutoThrowSeries(spec: AutoThrowSpec): Series {
  const { pattern, throwStyle, catchStyle } = spec;
  const items: Item[] = [];
  // 先に最低限の投げ受けを1本（徒手なし・通常のキャッチ）
  if (pattern.leadPair && spec.leadThrowStyle) {
    items.push({
      kind: "throw",
      ...(spec.leadThrowStyle.throwTypes ? { throwTypes: [...spec.leadThrowStyle.throwTypes] } : {}),
    });
    // 連続投げの1回目が低難度になる形では、1シェネを挟む
    items.push({ kind: "motion", motionId: CHENE, count: LEAD_THROW_CHENE_COUNT, hands: false });
    items.push({ kind: "catch" });
  }
  items.push({
    kind: "throw",
    ...(throwStyle.reqTypes ? { reqTypes: [...throwStyle.reqTypes] } : {}),
    ...(throwStyle.throwTypes ? { throwTypes: [...throwStyle.throwTypes] } : {}),
  });
  if (spec.cheneCount > 0)
    items.push({
      kind: "motion",
      motionId: CHENE,
      count: spec.cheneCount,
      hands: spec.hands !== null,
      ...(spec.hands !== null ? { handsType: spec.hands } : {}),
    });
  pattern.after.forEach((m) => items.push({ kind: "motion", motionId: m.motionId, count: m.count }));
  items.push({
    kind: "catch",
    ...(catchStyle.catchTypes ? { catchTypes: [...catchStyle.catchTypes] } : {}),
    // 二つ投げは2つとも空中にあるので2つ同時キャッチで受ける
    ...(throwStyle.two ? { catchTwo: true } : {}),
  });
  if (pattern.noViewPair) {
    items.push({ kind: "throw", throwTypes: [NO_VIEW_TAG] });
    items.push({ kind: "catch", catchTypes: [NO_VIEW_TAG] });
  }
  // あとに最低限の投げ受けを1本（徒手なし・通常のキャッチ）
  if (pattern.trailPair && spec.trailThrowStyle) {
    const style = spec.trailThrowStyle;
    items.push({
      kind: "throw",
      ...(style.reqTypes ? { reqTypes: [...style.reqTypes] } : {}),
      ...(style.throwTypes ? { throwTypes: [...style.throwTypes] } : {}),
    });
    const close = spec.trailCatchStyle;
    items.push({
      kind: "catch",
      ...(close?.catchTypes ? { catchTypes: [...close.catchTypes] } : {}),
      ...(style.two ? { catchTwo: true } : {}),
    });
  }
  return { executionDeduction: 0, items };
}

/** 生成結果の表示名。中身はシリーズの内容で分かるので、種類だけを出す。 */
export const AUTO_THROW_NAME = "自動生成の投げ";
export const autoThrowName = (): string => AUTO_THROW_NAME;

/** その形で取り得るシェネの回数 */
export function cheneCountRange(pattern: AutoThrowPattern): number[] {
  const range: number[] = [];
  for (let n = pattern.chene.min; n <= pattern.chene.max; n++) range.push(n);
  return range;
}

export interface AutoThrowOptions {
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 十年後モードの上限難度（"F" / "G"）。5〜6動作の形はこれに届いたときだけ使う。 */
  future?: FutureLevel;
  /** 作る候補の数の上限（既定＝形 × 投げ方 の全組み合わせ） */
  limit?: number;
  /**
   * **要求するDスコアの下限**（`minScore`）。実施例の無い投げ方（`AutoThrowStyle.rare`）は
   * 要求値が上がるほど出やすくする（`unseenShapeChance`）。
   */
  demandScore?: number | null;
  /**
   * **珍しさ**（0〜100、既定50）。受け方・シェネの手の重みと、実施例の無い投げ方の
   * 確率にまとめて掛かる（`rarityExponent` / `rarityChance`）。
   */
  rarity?: number;
}

/**
 * その手具で使える投げシリーズの候補を作る。
 * 「形 × 投げ方」を土台にして、受け方・シェネの手・シェネの回数は
 * できる限り被らないように配る（`cycler`）。
 */
export function autoThrowSpecs(apparatus: ApparatusKey, opts: AutoThrowOptions = {}): AutoThrowSpec[] {
  const rand = opts.random ?? Math.random;
  const throwStyles = autoThrowStyles(apparatus);
  /** 珍しさ：抽選の重みに掛ける指数と、0〜1の確率に掛ける変換 */
  const exp = rarityExponent(opts.rarity);
  const chance = (p: number) => rarityChance(p, opts.rarity);
  // 実施例の無い投げ方（左手投げ＋視野外）は、要求するDスコアが上がるほど残す
  const rareChance = chance(unseenShapeChance("leftHandNoViewThrow", opts.demandScore));
  // 前転3回（縦3動作）は珍しい寄りの技。候補に入れるかどうかは1回だけ引く
  const keepVerticalThree = rand() < chance(verticalThreeChance(opts.demandScore));
  const combos = shuffled(
    AUTO_THROW_PATTERNS.filter(
      (pattern) =>
        throwPatternAllowed(pattern, opts.future ?? null) &&
        (!pattern.verticalThree || keepVerticalThree),
    )
      .flatMap((pattern) =>
        throwStylesForPattern(apparatus, pattern).map((throwStyle) => ({ pattern, throwStyle })),
      )
      .filter(({ throwStyle }) => !throwStyle.rare || rand() < rareChance),
    rand,
  );
  const limit = Math.max(0, opts.limit ?? combos.length);
  // 受け方は「形 × 二つ投げかどうか」ごとに配る（使える受け方が違うので偏らせない）
  const catchCyclers = new Map<string, () => AutoCatchStyle>();
  const nextCatchFor = (
    pattern: AutoThrowPattern,
    throwStyle: AutoThrowStyle,
    motions: number,
  ): AutoCatchStyle => {
    const twoThrow = !!throwStyle.two;
    const styles = catchStylesForPattern(apparatus, twoThrow, pattern);
    // 引きにくい受け方がある形・投げ方（縦3動作・左手投げの視野外・手以外）は重み付きで引く
    const weight = (c: AutoCatchStyle) =>
      catchStyleWeight({
        throwStyle,
        catchStyle: c,
        pattern,
        apparatus,
        motions,
        demandScore: opts.demandScore,
      });
    if (styles.some((c) => weight(c) !== 1))
      // その他のキャッチは「珍しい受け方」ではなく**ルール上は同じ受け方に見えるが実態が違う
      // ものを別の種類として数えてもらう**ための入力なので、珍しさの変形からは外す
      return pickWeighted(styles, rand, weight, (c) => (catchHasTag(c, OTHER_TAG) ? 1 : exp));
    // それ以外は被らないように配る
    const key = `${pattern.noViewPair ? "noViewPair" : "-"}:${twoThrow}`;
    let next = catchCyclers.get(key);
    if (!next) {
      next = cycler(styles, rand);
      catchCyclers.set(key, next);
    }
    return next();
  };
  // シェネの手は重み付きで引く（手なし ＞ 片手＝両手 ＞ その他 ＞ 回旋）。
  // 回旋は2動作までがメインなので、回数が多い形では引きにくくする
  const nextHands = (cheneCount: number): AutoHands =>
    pickWeighted(autoHandsVariants(), rand, (h) => handsWeight(h) * cheneCountWeight(h, cheneCount), exp);
  // 先に足す投げ受けの投げ方。二つ投げは2つ同時キャッチで受ける形になるので使わない
  const nextLeadThrow = cycler(
    throwStyles.filter((t) => !t.two && !t.rare),
    rand,
  );
  // あとに足す投げ受けの投げ方（連続投げの2回目）。使える投げ方が直前の受け方で変わるので
  // （視野外で受けたら視野外には投げられない）、使える組み合わせごとに配る
  const trailCyclers = new Map<string, () => AutoThrowStyle>();
  const nextTrailThrow = (mainCatch: AutoCatchStyle): AutoThrowStyle => {
    const usable = trailThrowStylesAfter(
      throwStyles.filter((t) => !t.rare),
      mainCatch,
    );
    const key = usable.map((t) => t.id).join("|");
    let next = trailCyclers.get(key);
    if (!next) {
      next = cycler(usable, rand);
      trailCyclers.set(key, next);
    }
    return next();
  };
  // シェネの回数は形ごとに配る（その形で取り得る回数がひととおり出るように）
  const nextCount = new Map<string, () => number>();
  return combos.slice(0, limit).map(({ pattern, throwStyle }) => {
    let counts = nextCount.get(pattern.id);
    if (!counts) {
      counts = cycler(cheneCountRange(pattern), rand);
      nextCount.set(pattern.id, counts);
    }
    const cheneCount = counts();
    const catchStyle = nextCatchFor(pattern, throwStyle, patternMotions(pattern, cheneCount));
    return {
      pattern,
      cheneCount,
      // シェネが無い形では手の種類は使わない
      hands: cheneCount > 0 ? nextHands(cheneCount) : null,
      throwStyle,
      catchStyle,
      ...(pattern.leadPair ? { leadThrowStyle: nextLeadThrow() } : {}),
      ...(pattern.trailPair
        ? (() => {
            const trailThrowStyle = nextTrailThrow(catchStyle);
            // 受け方は「徒手なしの投げ受け」として引く（手具ごとの規則だけが効く）。
            // クラブの押さえつけ・ロープの足に絡めた受けが出るので、演技の締めにもなる
            return {
              trailThrowStyle,
              trailCatchStyle: nextCatchFor(MINIMAL_PATTERN, trailThrowStyle, 0),
            };
          })()
        : {}),
    };
  });
}

/**
 * ランダム生成の候補として渡す自動生成の投げ。
 * 組み立てた内容（`spec`）を持たせて、生成側がシェネの回数を調整できるようにする。
 */
export interface AutoThrowTemplate extends SeriesTemplate {
  auto: true;
  apparatus: ApparatusKey;
  spec: AutoThrowSpec;
}

const autoTemplate = (apparatus: ApparatusKey, spec: AutoThrowSpec, id = newTemplateId()): AutoThrowTemplate => ({
  id,
  name: autoThrowName(),
  apparatus,
  updatedAt: 0,
  auto: true,
  spec,
  series: buildAutoThrowSeries(spec),
});

/** 自動生成の投げシリーズを、ランダム生成の候補（シリーズテンプレート）として返す */
export function autoThrowTemplates(apparatus: ApparatusKey, opts: AutoThrowOptions = {}): AutoThrowTemplate[] {
  return autoThrowSpecs(apparatus, opts).map((spec) => autoTemplate(apparatus, spec));
}

/** 自動生成の投げの候補か（シェネの回数を調整できるのはこれだけ） */
export function isAutoThrowTemplate(t: SeriesTemplate): t is AutoThrowTemplate {
  // 自動生成のタンブリング（autoTumblings.ts）も spec を持つので、形の中身で見分ける
  return !!t.auto && !!(t as AutoThrowTemplate).spec?.pattern?.chene;
}

/** シェネの回数だけを変えた候補。形の範囲外・変化なしなら null。 */
export function withCheneCount(t: AutoThrowTemplate, cheneCount: number): AutoThrowTemplate | null {
  if (cheneCount === t.spec.cheneCount) return null;
  if (!cheneCountRange(t.spec.pattern).includes(cheneCount)) return null;
  return autoTemplate(t.apparatus, { ...t.spec, cheneCount }, t.id);
}
