// =====================================================================
// タンブリングシリーズの自動生成（ランダム生成用）
//
// 投げ（autoThrows.ts）と同じく、よくあるタンブリングの形をシステム側で組む。
// 並びの正しさは**入力画面と同じ制約**で決める：
//  - 後方系はロンダート・バク転から入るか、後ろ向きに降りる宙返りに続けてしか
//    実施できない（`needsRoundoffBefore`。足りなければロンダートを補う）
//  - ロンダート・バク転の直後は後方系しか実施できない（`skillFlowAfter`）
//  - 宙返りを続けるには、前の宙返りが同じ向きで降りていること（`leadsBackward`）
//  - ジュニアは2回宙返り系を実施しない（`skillAllowed`）
// 組み立てたシリーズは `tumblingFlowErrors` で上の制約を満たすか検算できる。
// =====================================================================

import {
  CATEGORY,
  ROUNDOFF_SKILL_ID,
  leadsBackward,
  skillAllowed,
  skillDef,
  skillFlowAfter,
} from "./constants";
import { needsRoundoffBefore, prevSkillId } from "./analysis";
import { newTemplateId, type SeriesTemplate } from "./templates";
import type { ApparatusKey, Item, Series } from "./types";

/** 自動生成するタンブリングの形 */
export interface AutoTumblingPattern {
  id: string;
  /** どの系統の宙返りを実施するか（`CATEGORY` の値） */
  category: string;
  /** 宙返りの本数（最小・最大とも含む） */
  saltos: { min: number; max: number };
  /** 宙返りの間にA難度のつなぎ技を挟むか（§3.2 のつなぎ技） */
  connect: boolean;
  /** 投げ受けにするか（投げ→転回系→キャッチ＝投げタン） */
  throwCatch: boolean;
}

export const AUTO_TUMBLING_PATTERNS: AutoTumblingPattern[] = [
  // 後方系：ロンダートから宙返りを続ける（3本で三宙）
  { id: "back", category: CATEGORY.BACKWARD, saltos: { min: 1, max: 3 }, connect: false, throwCatch: false },
  // 後方系：宙返りの間にバク転を挟む（つなぎ技）
  { id: "backConnect", category: CATEGORY.BACKWARD, saltos: { min: 2, max: 3 }, connect: true, throwCatch: false },
  // 前方系：ハンドスプリング等から前方の宙返り
  { id: "front", category: CATEGORY.FORWARD, saltos: { min: 1, max: 3 }, connect: false, throwCatch: false },
  // 前方系：宙返りの間にハンドスプリング等を挟む
  { id: "frontConnect", category: CATEGORY.FORWARD, saltos: { min: 2, max: 2 }, connect: true, throwCatch: false },
  // 側方系：側転から側宙
  { id: "side", category: CATEGORY.SIDE, saltos: { min: 1, max: 1 }, connect: false, throwCatch: false },
  // 投げタン（転回系の投げ受け）
  { id: "throwBack", category: CATEGORY.BACKWARD, saltos: { min: 1, max: 2 }, connect: false, throwCatch: true },
  { id: "throwFront", category: CATEGORY.FORWARD, saltos: { min: 1, max: 2 }, connect: false, throwCatch: true },
];

/** 系統ごとの入りの技（空＝助走から直接宙返りに入る） */
export const TUMBLING_ENTRIES: Record<string, string[][]> = {
  [CATEGORY.BACKWARD]: [[ROUNDOFF_SKILL_ID], [ROUNDOFF_SKILL_ID, "a_flicflac"]],
  [CATEGORY.FORWARD]: [[], ["a_handspring"], ["a_frontroll"]],
  [CATEGORY.SIDE]: [[], ["a_cartwheel"]],
};

/** 系統ごとの宙返り（難度の低いものから並べる。ジュニアの2回宙返り系は `skillAllowed` で外れる） */
export const TUMBLING_SALTOS: Record<string, string[]> = {
  [CATEGORY.BACKWARD]: [
    "b_backsalto",
    "b_backtuck",
    "b_backlayout",
    "b_tempo",
    "b_backhalf",
    "b_backlayhalf",
    "c_back1full",
    "c_backlay1full",
    "c_back15",
    "c_backlay15",
    "c_tempotwist",
    "d_back2twist",
    "d_backlay25",
    "d_doubleback",
  ],
  [CATEGORY.FORWARD]: ["b_front", "b_tenchu", "b_fronthalf", "c_front1full", "d_frontlay1"],
  [CATEGORY.SIDE]: ["b_sidesalto"],
};

/** 系統ごとのつなぎ技（宙返りの間に挟むA難度技） */
export const TUMBLING_CONNECTS: Record<string, string[]> = {
  [CATEGORY.BACKWARD]: ["a_flicflac"],
  [CATEGORY.FORWARD]: ["a_handspring", "a_frontroll"],
  [CATEGORY.SIDE]: ["a_cartwheel"],
};

/**
 * その宙返りに続けて同じ系統の宙返りを実施できるか。
 * 後方系は後ろ向きに降りる技（`leadsBackward`）から続き、前方系・側方系はその逆。
 * 半ひねりで向きが変わる技は連続の最後にだけ使う。
 */
export function canChainAfter(skillId: string, category: string): boolean {
  return category === CATEGORY.BACKWARD ? leadsBackward(skillId) : !leadsBackward(skillId);
}

/** その形・その適用規則で使える宙返り（`last` は連続の最後に置く技か） */
export function saltoOptions(pattern: AutoTumblingPattern, junior: boolean, last: boolean): string[] {
  const list = (TUMBLING_SALTOS[pattern.category] ?? []).filter((id) => skillAllowed(id, junior));
  // つなぎ技を挟む場合も、つなぎ技のあとは同じ系統に入り直すので向きの条件は同じ
  return last ? list : list.filter((id) => canChainAfter(id, pattern.category));
}

/** その形で取り得る宙返りの本数 */
export function saltoCountRange(pattern: AutoTumblingPattern): number[] {
  const range: number[] = [];
  for (let n = pattern.saltos.min; n <= pattern.saltos.max; n++) range.push(n);
  return range;
}

/** 1本ぶんの自動生成の内容 */
export interface AutoTumblingSpec {
  pattern: AutoTumblingPattern;
  /** 実施する宙返りの本数 */
  saltoCount: number;
  /** 入りの技 */
  entry: string[];
  /** 宙返りの並び（`saltoCount` 本ぶんを前から使う） */
  saltoIds: string[];
  /** つなぎ技のid（`pattern.connect` のときだけ使う） */
  connectId: string;
}

const skillItem = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: true, isThrow: false });

/** 自動生成の内容からシリーズを組み立てる */
export function buildAutoTumblingSeries(spec: AutoTumblingSpec): Series {
  const { pattern } = spec;
  const items: Item[] = [];
  if (pattern.throwCatch) items.push({ kind: "throw" });
  spec.entry.forEach((id) => items.push(skillItem(id)));
  spec.saltoIds.slice(0, spec.saltoCount).forEach((id, i) => {
    if (pattern.connect && i > 0) items.push(skillItem(spec.connectId));
    // 入力画面と同じで、そのままでは後方系に入れない位置ではロンダートを補う
    const next = skillItem(id);
    if (needsRoundoffBefore([...items, next], items.length)) items.push(skillItem(ROUNDOFF_SKILL_ID));
    items.push(next);
  });
  if (pattern.throwCatch) items.push({ kind: "catch" });
  return { executionDeduction: 0, items };
}

/**
 * 入力画面の制約に反する並びを挙げる（空なら入力画面でもそのまま入力できる）。
 *  - ロンダート・バク転の直後は後方系だけ（`skillFlowAfter`）
 *  - 後方系はロンダートを補わずに実施できる位置にあること（`needsRoundoffBefore`）
 *  - ジュニアで実施しない技を使っていないこと（`skillAllowed`）
 */
export function tumblingFlowErrors(series: Series, junior = false): string[] {
  const errors: string[] = [];
  series.items.forEach((item, i) => {
    if (item.kind !== "skill" || !item.skillId) return;
    const def = skillDef(item.skillId);
    const name = def?.name ?? item.skillId;
    if (!skillAllowed(item.skillId, junior)) errors.push(`${i + 1}番目の${name}：ジュニアでは実施しない技`);
    if (needsRoundoffBefore(series.items, i)) errors.push(`${i + 1}番目の${name}：手前にロンダートが必要`);
    const prev = prevSkillId(series.items, i);
    const flow = skillFlowAfter(prev);
    const category = def?.category;
    const ok =
      category === CATEGORY.BACKWARD ? flow.backward : category === CATEGORY.SIDE ? flow.side : flow.forward;
    if (!ok) errors.push(`${i + 1}番目の${name}：${skillDef(prev ?? "")?.name}の直後には実施しない系統`);
  });
  return errors;
}

/** 表示名（系統と本数、つなぎ・投げ受けの別が分かるようにする） */
export function autoTumblingName(spec: AutoTumblingSpec): string {
  const last = skillDef(spec.saltoIds[spec.saltoCount - 1])?.name ?? "宙返り";
  const parts = [
    spec.saltoCount >= 2 ? `${last}まで${spec.saltoCount}連続` : last,
    ...(spec.pattern.connect ? ["つなぎ技あり"] : []),
  ];
  return `${spec.pattern.throwCatch ? "自動生成の投げタン" : "自動生成のタンブリング"}（${parts.join("・")}）`;
}

function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 候補をできる限り被らせずに配る（ひと回りしたら並べ直す） */
function cycler<T>(list: T[], rand: () => number): () => T {
  let rest: T[] = [];
  return () => {
    if (rest.length === 0) rest = shuffled(list, rand);
    return rest.pop() as T;
  };
}

export interface AutoTumblingOptions {
  junior?: boolean;
  /**
   * 使ってよい転回技のid。登録テンプレートに出てくる技を渡すと、その選手が
   * 実際に実施している技だけで組み立てる（技そのものではなく**組み合わせ**を自動化する）。
   * 未指定・空なら `TUMBLING_SALTOS` の全部を使う。
   */
  skillIds?: string[];
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 作る候補の数の上限（既定＝形 × 宙返りの組み合わせ） */
  limit?: number;
}

/** 1つの形につき作る候補の数（宙返りの種類を変えた別案） */
export const AUTO_TUMBLING_VARIANTS = 4;

/**
 * タンブリングの候補を作る。形ごとに宙返りの種類・入りの技・本数を
 * できる限り被らないように配る（`cycler`）。
 */
export function autoTumblingSpecs(opts: AutoTumblingOptions = {}): AutoTumblingSpec[] {
  const rand = opts.random ?? Math.random;
  const junior = !!opts.junior;
  // 使ってよい技の範囲（指定が無ければ全部）
  const allowed = opts.skillIds && opts.skillIds.length > 0 ? new Set(opts.skillIds) : null;
  const usable = (ids: string[]) => (allowed ? ids.filter((id) => allowed.has(id)) : ids);
  const specs: AutoTumblingSpec[] = [];
  AUTO_TUMBLING_PATTERNS.forEach((pattern) => {
    const maxSaltos = pattern.saltos.max;
    // 入りの技は「何も付けない」形が常に使える（助走から直接入る）
    const entries = (TUMBLING_ENTRIES[pattern.category] ?? [[]]).filter(
      (entry) => entry.length === 0 || usable(entry).length === entry.length,
    );
    const chain = usable(saltoOptions(pattern, junior, false));
    const last = usable(saltoOptions(pattern, junior, true));
    const connects = usable(TUMBLING_CONNECTS[pattern.category] ?? []);
    // 実施する技が無い系統の形は作らない（テンプレートに無い技は使わない）
    if (last.length === 0) return;
    if (pattern.connect && connects.length === 0) return;
    if (maxSaltos >= 2 && chain.length === 0) return;
    const nextEntry = cycler(entries.length > 0 ? entries : [[]], rand);
    const nextCount = cycler(saltoCountRange(pattern), rand);
    const nextChain = cycler(chain.length > 0 ? chain : last, rand);
    const nextLast = cycler(last, rand);
    const nextConnect = cycler(connects, rand);
    for (let v = 0; v < AUTO_TUMBLING_VARIANTS; v++) {
      // 最後の1本だけ向きが変わる技も使える。本数を減らしても並びが壊れないよう、
      // 途中に置く技は「続けられる技」から選ぶ。
      const saltoIds = [...Array(maxSaltos - 1)].map(() => nextChain());
      saltoIds.push(nextLast());
      specs.push({
        pattern,
        saltoCount: nextCount(),
        entry: nextEntry(),
        saltoIds,
        connectId: pattern.connect ? nextConnect() : "",
      });
    }
  });
  const limit = Math.max(0, opts.limit ?? specs.length);
  return shuffled(specs, rand).slice(0, limit);
}

/**
 * ランダム生成の候補として渡す自動生成のタンブリング。
 * 組み立てた内容（`spec`）を持たせて、生成側が宙返りの本数を調整できるようにする。
 */
export interface AutoTumblingTemplate extends SeriesTemplate {
  auto: true;
  apparatus: ApparatusKey;
  spec: AutoTumblingSpec;
}

const autoTemplate = (
  apparatus: ApparatusKey,
  spec: AutoTumblingSpec,
  id = newTemplateId(),
): AutoTumblingTemplate => ({
  id,
  name: autoTumblingName(spec),
  apparatus,
  updatedAt: 0,
  auto: true,
  spec,
  series: buildAutoTumblingSeries(spec),
});

/**
 * 構成のなかで実際に使っている転回技のid。
 * 自動生成のタンブリングをこの範囲に絞ると、その選手が実施できる技だけで組める。
 * 徒手として入れた転回技（側転・きりもみ等）も実施している技なので含める。
 */
export function usedSkillIds(list: Series[]): string[] {
  const ids = new Set<string>();
  list.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId) ids.add(item.skillId);
      if (item.kind === "motion" && skillDef(item.motionId)) ids.add(item.motionId);
    }),
  );
  return [...ids];
}

/** 自動生成のタンブリングを、ランダム生成の候補（シリーズテンプレート）として返す */
export function autoTumblingTemplates(
  apparatus: ApparatusKey,
  opts: AutoTumblingOptions = {},
): AutoTumblingTemplate[] {
  return autoTumblingSpecs(opts).map((spec) => autoTemplate(apparatus, spec));
}

/** 自動生成のタンブリングの候補か */
export function isAutoTumblingTemplate(t: SeriesTemplate): t is AutoTumblingTemplate {
  return !!t.auto && Array.isArray((t as AutoTumblingTemplate).spec?.saltoIds);
}

/** 宙返りの本数だけを変えた候補。形の範囲外・変化なしなら null。 */
export function withSaltoCount(t: AutoTumblingTemplate, saltoCount: number): AutoTumblingTemplate | null {
  if (saltoCount === t.spec.saltoCount) return null;
  if (!saltoCountRange(t.spec.pattern).includes(saltoCount)) return null;
  return autoTemplate(t.apparatus, { ...t.spec, saltoCount }, t.id);
}
