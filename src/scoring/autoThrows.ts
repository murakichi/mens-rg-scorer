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

import { APPARATUS_USE, HANDS_TYPES, REQUIRED_THROW_OPTIONS } from "./constants";
import { newTemplateId, type SeriesTemplate } from "./templates";
import type { ApparatusKey, Item, Series } from "./types";

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
   * 先に最低限の投げ受け（投げ→キャッチ、徒手なし）を1本足すか。
   * 投げ方を1種類増やすのに操作を足さずに済むので、日本トップの演技でも
   * 「手以外の投げ→キャッチ→視野外の投げ→シェネ→キャッチ」のように実施する。
   */
  leadPair?: boolean;
}

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
];

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
  return styles;
}

/**
 * その投げ方で使える受け方。
 * 二つ投げは手具が2つとも空中にあるので、手具で押さえつけてキャッチはできない。
 */
export function catchStylesForThrow(apparatus: ApparatusKey, twoThrow: boolean): AutoCatchStyle[] {
  const styles = autoCatchStyles(apparatus);
  return twoThrow ? styles.filter((c) => c.id !== CATCH_USE_APPARATUS) : styles;
}

/** 視野外の受け・投げの技術タグ */
export const NO_VIEW_TAG = "noview";

/**
 * 縦3動作（前転3回）の形で、**手具を使ったキャッチ以外**の受け方を引く重み。
 * 前転3回から受けるのは手具で押さえつけるのが主流。
 */
export const VERTICAL_THREE_OTHER_CATCH_WEIGHT = 0.2;

/**
 * その形で使える受け方。視野外の投げ受けを足す形（`noViewPair`）では、
 * その直前の受けを**視野外にしない**（視野外のキャッチから視野外の投げへは物理的に繋げない）。
 */
export function catchStylesForPattern(
  apparatus: ApparatusKey,
  twoThrow: boolean,
  pattern: AutoThrowPattern,
): AutoCatchStyle[] {
  const styles = catchStylesForThrow(apparatus, twoThrow);
  return pattern.noViewPair ? styles.filter((c) => c.id !== NO_VIEW_TAG) : styles;
}

/** シェネの手の使い方（null＝手なし。手ありは HANDS_TYPES の種類ごとに別の技） */
export type AutoHands = string | null;
export const autoHandsVariants = (): AutoHands[] => [null, ...HANDS_TYPES.map((h) => h.id)];

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
  return { executionDeduction: 0, items };
}

/** 生成結果の表示名。中身はシリーズの内容で分かるので、種類だけを出す。 */
export const AUTO_THROW_NAME = "自動生成の投げ";
export const autoThrowName = (): string => AUTO_THROW_NAME;

function shuffled<T>(list: T[], rand: () => number): T[] {
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
function cycler<T>(list: T[], rand: () => number): () => T {
  let rest: T[] = [];
  return () => {
    if (rest.length === 0) rest = shuffled(list, rand);
    return rest.pop() as T;
  };
}

/** 重み付きで1つ選ぶ（重みは1が既定） */
function pickWeighted<T>(list: T[], rand: () => number, weightOf: (x: T) => number): T {
  let left = rand() * list.reduce((n, x) => n + weightOf(x), 0);
  for (const x of list) {
    left -= weightOf(x);
    if (left < 0) return x;
  }
  return list[list.length - 1];
}

/** その形で取り得るシェネの回数 */
export function cheneCountRange(pattern: AutoThrowPattern): number[] {
  const range: number[] = [];
  for (let n = pattern.chene.min; n <= pattern.chene.max; n++) range.push(n);
  return range;
}

export interface AutoThrowOptions {
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 作る候補の数の上限（既定＝形 × 投げ方 の全組み合わせ） */
  limit?: number;
}

/**
 * その手具で使える投げシリーズの候補を作る。
 * 「形 × 投げ方」を土台にして、受け方・シェネの手・シェネの回数は
 * できる限り被らないように配る（`cycler`）。
 */
export function autoThrowSpecs(apparatus: ApparatusKey, opts: AutoThrowOptions = {}): AutoThrowSpec[] {
  const rand = opts.random ?? Math.random;
  const throwStyles = autoThrowStyles(apparatus);
  const combos = shuffled(
    AUTO_THROW_PATTERNS.flatMap((pattern) => throwStyles.map((throwStyle) => ({ pattern, throwStyle }))),
    rand,
  );
  const limit = Math.max(0, opts.limit ?? combos.length);
  // 受け方は「形 × 二つ投げかどうか」ごとに配る（使える受け方が違うので偏らせない）
  const catchCyclers = new Map<string, () => AutoCatchStyle>();
  const nextCatchFor = (pattern: AutoThrowPattern, twoThrow: boolean): AutoCatchStyle => {
    const key = `${pattern.noViewPair ? "noViewPair" : "-"}:${twoThrow}`;
    let next = catchCyclers.get(key);
    if (!next) {
      next = cycler(catchStylesForPattern(apparatus, twoThrow, pattern), rand);
      catchCyclers.set(key, next);
    }
    // 縦3動作の形は手具を使ったキャッチが主流。それ以外は引きにくくする
    if (pattern.verticalThree) {
      const styles = catchStylesForPattern(apparatus, twoThrow, pattern);
      return pickWeighted(styles, rand, (c) =>
        c.id === CATCH_USE_APPARATUS ? 1 : VERTICAL_THREE_OTHER_CATCH_WEIGHT,
      );
    }
    return next();
  };
  const nextHands = cycler(autoHandsVariants(), rand);
  // 先に足す投げ受けの投げ方。二つ投げは2つ同時キャッチで受ける形になるので使わない
  const nextLeadThrow = cycler(
    throwStyles.filter((t) => !t.two),
    rand,
  );
  // シェネの回数は形ごとに配る（その形で取り得る回数がひととおり出るように）
  const nextCount = new Map<string, () => number>();
  return combos.slice(0, limit).map(({ pattern, throwStyle }) => {
    let counts = nextCount.get(pattern.id);
    if (!counts) {
      counts = cycler(cheneCountRange(pattern), rand);
      nextCount.set(pattern.id, counts);
    }
    const cheneCount = counts();
    return {
      pattern,
      cheneCount,
      // シェネが無い形では手の種類は使わない（順番も消費しない）
      hands: cheneCount > 0 ? nextHands() : null,
      throwStyle,
      catchStyle: nextCatchFor(pattern, !!throwStyle.two),
      ...(pattern.leadPair ? { leadThrowStyle: nextLeadThrow() } : {}),
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
