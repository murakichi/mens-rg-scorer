// =====================================================================
// タンブリングシリーズの自動生成（ランダム生成用）
//
// 投げ（autoThrows.ts）と同じく、よくあるタンブリングの形をシステム側で組む。
// 並べ方は**入力画面と同じ制約**＋**実際の演技での組み方**で決める：
//  - 後方系はロンダート・バク転から入るか、後ろ向きに降りる宙返りに続けてしか
//    実施できない（`needsRoundoffBefore`。足りなければロンダートを補う）
//  - ロンダート・バク転の直後は後方系しか実施できない（`skillFlowAfter`）
//  - 宙返りを続けるときの系統は**直前の技の降りる向き**で決まる（`leadsBackward`）。
//    後ろ向きに降りれば後方系、前向きに降りれば前方系・側方系
//  - 連続の難度は**だんだん下がる**（後方1回半ひねり→前方1回ひねり→前宙 など）。
//    テンポ宙返り・テンポひねりだけは例外で、そのあと難度が上がってよい
//  - 後方系を続けて実施することは少ないので、テンポ以外の後方系で連続は切る。
//    ただし後方伸身宙返り（ひねりを含む）の後は 前宙・きりもみ・きりもみ転回 が主流
//  - 宙返りのあとのバク転は（テンポの後を除いて）個人ではまず無いので、つなぎ技は
//    前向きに降りた後のロンダート・側転・ハンドスプリング・とび前転にする
//  - つなぎの最後にただの後方宙返りは実施しない（B難度がほしいときはダイビング前宙）。
//    ジュニアは難度を取るためにやむを得ず実施することがあるので制限しない
//  - 投げ受け（投げタン）は手具の滞空時間の都合で 前方系→前転／前方系→側宙（転宙）。
//    投げたあとにロンダートを入れる形は作らない
//  - ジュニアは2回宙返り系を実施しない（`skillOptions` の選択肢に出ない）
// 組み立てたシリーズは `tumblingFlowErrors` で入力画面の制約を検算できる。
// =====================================================================

import {
  CATEGORY,
  DIFF_VALUE,
  MAX_DIFF,
  ROUNDOFF_SKILL_ID,
  isBackwardSalto,
  leadsBackward,
  skillDef,
  skillDifficulty,
  skillFlowAfter,
  skillOptions,
} from "./constants";
import { needsRoundoffBefore, prevSkillId } from "./analysis";
import { newTemplateId, type SeriesTemplate } from "./templates";
import type { ApparatusKey, Item, Series } from "./types";

/** 自動生成するタンブリングの形 */
export interface AutoTumblingPattern {
  id: string;
  /** 宙返りの本数（最小・最大とも含む） */
  saltos: { min: number; max: number };
  /** 1本目の宙返りのあとにつなぎ技（A難度）を挟むか */
  connect: boolean;
  /** 投げ受け（投げタン）か */
  throwCatch: boolean;
  /** 最後に前転でつなぐか（投げ受けの着地） */
  rollFinish: boolean;
}

export const AUTO_TUMBLING_PATTERNS: AutoTumblingPattern[] = [
  // 宙返りの連続（3本で三宙）。難度はだんだん下がる
  { id: "chain", saltos: { min: 1, max: 3 }, connect: false, throwCatch: false, rollFinish: false },
  // 1本目の後につなぎ技を挟む（前向きに降りて → ロンダート等 → もう1本）
  { id: "connect", saltos: { min: 2, max: 3 }, connect: true, throwCatch: false, rollFinish: false },
  // 投げタン：投げ→前方系→前転→キャッチ
  { id: "throwRoll", saltos: { min: 1, max: 1 }, connect: false, throwCatch: true, rollFinish: true },
  // 投げタン：投げ→前方系→側宙（転宙）→キャッチ
  { id: "throwSalto", saltos: { min: 2, max: 2 }, connect: false, throwCatch: true, rollFinish: false },
];

/** 投げ受けの着地でつなぐ徒手動作（前転） */
export const THROW_ROLL_MOTION = "fwd_roll";

/** 投げ受けで前方系の宙返りに続けて実施する技（側宙、たまに転宙） */
export const THROW_FINISH_SALTOS: string[] = ["b_sidesalto", "b_tenchu"];

/**
 * 後方伸身宙返り（ひねりの有無を問わない）の後に実施する主流の技。
 * 後ろ向きに降りる技だが、ここだけは連続が切れず前方系に続く。
 * 側宙はこの後の前宙に続けて実施する（前宙（＋側宙））。
 * きりもみ・きりもみ転回は宙返りの連続の中でだけ宙返りとして数える技（Q&A Q7）で、
 * まさにこの位置で実施するので難度の上下は問わない。
 */
export const AFTER_BACK_LAYOUT_SALTOS: string[] = ["b_front", "b_kirimomi", "c_kirimomiten"];

/** 後方伸身宙返り系（ひねりを含む）か */
export function isBackLayoutSalto(id: string): boolean {
  const t = skillDef(id)?.twist;
  return t?.base === "back" && t.posture === "layout";
}

/**
 * つなぎ技のあとには実施しない技。
 * 上級者がつなぎの最後にただの後方宙返りを実施することは稀で、
 * B難度がほしいときはダイビング前宙を実施する。
 * ジュニアは難度を取るためにやむを得ず実施することがあるので、この制限をかけない。
 */
export const CONNECT_FINISH_AVOID: string[] = ["b_backsalto"];

/**
 * テンポ宙返り系。連続の「難度はだんだん下がる」の例外で、この後は難度が上がってよい。
 * 宙返りのあとにバク転を実施するのも、テンポの後だけ。
 */
export const TEMPO_SKILLS: string[] = ["b_tempo", "c_tempotwist"];
export const isTempoSalto = (id: string): boolean => TEMPO_SKILLS.includes(id);

/** 系統ごとの入りの技（空＝助走から直接入る） */
export const TUMBLING_ENTRIES: Record<string, string[][]> = {
  [CATEGORY.BACKWARD]: [[ROUNDOFF_SKILL_ID], [ROUNDOFF_SKILL_ID, "a_flicflac"]],
  [CATEGORY.FORWARD]: [[], ["a_handspring"], ["a_frontroll"]],
  [CATEGORY.SIDE]: [[], ["a_cartwheel"]],
};

/**
 * つなぎ技（宙返りの間に挟むA難度技）と、そのあとに実施する系統。
 * バク転はテンポの後だけ（`connectOptionsAfter`）。
 */
export const TUMBLING_CONNECTS: { id: string; next: string }[] = [
  { id: ROUNDOFF_SKILL_ID, next: CATEGORY.BACKWARD },
  { id: "a_flicflac", next: CATEGORY.BACKWARD },
  { id: "a_handspring", next: CATEGORY.FORWARD },
  { id: "a_frontroll", next: CATEGORY.FORWARD },
  { id: "a_cartwheel", next: CATEGORY.SIDE },
];

const difficultyValue = (id: string, junior: boolean): number => {
  const d = skillDifficulty(id, junior);
  return d ? DIFF_VALUE[d] : 0;
};

/** 連続に使う宙返り（きりもみ系は宙返りの連続の中でだけ宙返りになるので使わない） */
function saltoList(junior: boolean, prevId?: string): { id: string; category: string }[] {
  return skillOptions(junior, skillFlowAfter(prevId))
    .filter((s) => s.isSalto && !s.saltoOnlyInChain)
    .map((s) => ({ id: s.id, category: s.category }));
}

/** 連続の1本目に実施できる宙返り */
export function firstSaltoOptions(junior = false): string[] {
  return saltoList(junior).map((s) => s.id);
}

/**
 * その宙返りに続けて実施できる宙返り。
 *  - 直前が後ろ向きに降りる技なら後方系、前向きに降りる技なら前方系・側方系
 *  - 難度は直前以下（テンポの後だけ制限なし）
 *  - テンポ以外の後方系のあとは続けない（後方系の連続は実際には少ない）
 */
export function nextSaltoOptions(prevId: string, junior = false): string[] {
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId)).map((s) => s.id));
  // 後方伸身宙返り（ひねりを含む）の後は 前宙・きりもみ・きりもみ転回
  if (isBackLayoutSalto(prevId)) return AFTER_BACK_LAYOUT_SALTOS.filter((id) => offered.has(id));
  const backward = leadsBackward(prevId);
  if (backward && !isTempoSalto(prevId)) return [];
  const ceiling = isTempoSalto(prevId) ? MAX_DIFF : difficultyValue(prevId, junior);
  return saltoList(junior, prevId)
    .filter((s) => (backward ? isBackwardSalto(s.id) : !isBackwardSalto(s.id)))
    .filter((s) => difficultyValue(s.id, junior) <= ceiling)
    .map((s) => s.id);
}

/**
 * その宙返りのあとに挟めるつなぎ技。
 *  - 前向きに降りた後：ロンダート・側転・ハンドスプリング・とび前転
 *  - テンポの後：バク転
 *  - それ以外（後ろ向きに降りる宙返りの後）は無し
 */
export function connectOptionsAfter(prevId: string, junior = false): string[] {
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId)).map((s) => s.id));
  if (isTempoSalto(prevId)) return ["a_flicflac"].filter((id) => offered.has(id));
  if (leadsBackward(prevId)) return [];
  return TUMBLING_CONNECTS.map((c) => c.id).filter((id) => offered.has(id) && id !== "a_flicflac");
}

/** つなぎ技のあとに実施できる宙返り（つなぎで勢いを作り直すので難度の制限はしない） */
export function saltoOptionsAfterConnect(connectId: string, junior = false): string[] {
  const next = TUMBLING_CONNECTS.find((c) => c.id === connectId)?.next;
  return saltoList(junior, connectId)
    .filter((s) => (next === CATEGORY.SIDE ? s.category !== CATEGORY.BACKWARD : s.category === next))
    // ただの後方宙返りは実施しない（B難度がほしいときはダイビング前宙・後方伸身宙返り）。ジュニアは除く
    .filter((s) => junior || !CONNECT_FINISH_AVOID.includes(s.id))
    .map((s) => s.id);
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
  /** つなぎ技のid（`pattern.connect` のときだけ。1本目の後に入る） */
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
    if (pattern.connect && i === 1 && spec.connectId) items.push(skillItem(spec.connectId));
    // 入力画面と同じで、そのままでは後方系に入れない位置ではロンダートを補う
    const next = skillItem(id);
    if (needsRoundoffBefore([...items, next], items.length)) items.push(skillItem(ROUNDOFF_SKILL_ID));
    items.push(next);
  });
  // 投げ受けの着地は前転でつなぐ
  if (pattern.rollFinish) items.push({ kind: "motion", motionId: THROW_ROLL_MOTION, count: 1 });
  if (pattern.throwCatch) items.push({ kind: "catch" });
  return { executionDeduction: 0, items };
}

/**
 * 入力画面の制約に反する並びを挙げる（空なら入力画面でもそのまま入力できる）。
 * 判定は入力画面のプルダウンと同じ関数で行う（系統の絞り込みが変わっても追随する）。
 *  - その位置の選択肢に出る技か（`skillOptions(junior, skillFlowAfter(prev))`。
 *    ロンダート・バク転の直後は後方系だけ、ジュニアは2回宙返り系なし）
 *  - 後方系はロンダートを補わずに実施できる位置にあること（`needsRoundoffBefore`）
 */
export function tumblingFlowErrors(series: Series, junior = false): string[] {
  const errors: string[] = [];
  series.items.forEach((item, i) => {
    if (item.kind !== "skill" || !item.skillId) return;
    const name = skillDef(item.skillId)?.name ?? item.skillId;
    if (needsRoundoffBefore(series.items, i)) errors.push(`${i + 1}番目の${name}：手前にロンダートが必要`);
    const prev = prevSkillId(series.items, i);
    if (!skillOptions(junior, skillFlowAfter(prev)).some((s) => s.id === item.skillId)) {
      const prevName = prev ? skillDef(prev)?.name ?? prev : "先頭";
      errors.push(`${i + 1}番目の${name}：${prevName}の位置では選べない技`);
    }
  });
  return errors;
}

/** 表示名（最後の技と連続本数、つなぎ・投げ受けの別が分かるようにする） */
export function autoTumblingName(spec: AutoTumblingSpec): string {
  const last = skillDef(spec.saltoIds[spec.saltoCount - 1])?.name ?? "宙返り";
  const parts = [
    spec.saltoCount >= 2 ? `${last}まで${spec.saltoCount}連続` : last,
    ...(spec.pattern.connect ? ["つなぎ技あり"] : []),
    ...(spec.pattern.rollFinish ? ["前転"] : []),
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

/** 同じ技の繰り返しは避けて1つ選ぶ（他に無ければ繰り返しも許す） */
function pickDifferent(options: string[], used: string[], rand: () => number): string | null {
  if (options.length === 0) return null;
  const fresh = options.filter((id) => !used.includes(id));
  const list = fresh.length > 0 ? fresh : options;
  return list[Math.floor(rand() * list.length)];
}

export interface AutoTumblingOptions {
  junior?: boolean;
  /**
   * 使ってよい転回技のid。登録テンプレートに出てくる技を渡すと、その選手が
   * 実際に実施している技だけで組み立てる（技そのものではなく**組み合わせ**を自動化する）。
   * 未指定・空なら技の一覧すべてを使う。
   */
  skillIds?: string[];
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 作る候補の数の上限（既定＝形 × 宙返りの組み合わせ） */
  limit?: number;
}

/** 1つの形につき作る候補の数（宙返りの種類を変えた別案） */
export const AUTO_TUMBLING_VARIANTS = 5;

/** 前方系の宙返り（投げタンの1本目）か */
const isForwardSalto = (id: string): boolean => skillDef(id)?.category === CATEGORY.FORWARD;

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
    // 投げタンの1本目は前方系（手具の滞空時間の都合で後方系は実施しない）
    const firsts = usable(firstSaltoOptions(junior))
      // 投げ受けの1本目は前方系（手具の滞空時間の都合で後方系は実施しない）
      .filter((id) => !pattern.throwCatch || isForwardSalto(id))
      // つなぎの形は、つなぎ技を挟める技（前向きに降りる技・テンポ）だけを1本目にする
      .filter((id) => !pattern.connect || usable(connectOptionsAfter(id, junior)).length > 0);
    if (firsts.length === 0) return;
    const nextFirst = cycler(firsts, rand);
    const nextCount = cycler(saltoCountRange(pattern), rand);
    /** その技に続けて実施できる宙返り（投げ受けは側宙・転宙だけ） */
    const continuations = (prevId: string) =>
      usable(nextSaltoOptions(prevId, junior)).filter(
        (id) => !pattern.throwCatch || THROW_FINISH_SALTOS.includes(id),
      );
    for (let v = 0; v < AUTO_TUMBLING_VARIANTS; v++) {
      const count = nextCount();
      let saltoIds: string[] = [];
      let connectId = "";
      // 目標の本数まで続く1本目が引けるまで何回か引き直す（後ろ向きに降りる技は連続しない）
      for (let attempt = 0; attempt < firsts.length && saltoIds.length < count; attempt++) {
        const first = nextFirst();
        const ids = [first];
        let cid = "";
        // つなぎ技は1本目の後
        if (pattern.connect) {
          cid = pickDifferent(usable(connectOptionsAfter(first, junior)), [], rand) ?? "";
          if (!cid) continue;
          const after = pickDifferent(usable(saltoOptionsAfterConnect(cid, junior)), ids, rand);
          if (!after) continue;
          ids.push(after);
        }
        // 残りは「向きと難度」のルールで続ける
        while (ids.length < pattern.saltos.max) {
          const next = pickDifferent(continuations(ids[ids.length - 1]), ids, rand);
          if (!next) break;
          ids.push(next);
        }
        if (ids.length > saltoIds.length) {
          saltoIds = ids;
          connectId = cid;
        }
      }
      if (saltoIds.length < pattern.saltos.min) continue;
      // 続かなかったぶんは本数を減らす
      const saltoCount = Math.max(pattern.saltos.min, Math.min(count, saltoIds.length));
      specs.push({ pattern, saltoCount, entry: [], saltoIds, connectId });
    }
  });

  // 入りの技は1本目の系統に合わせて配る（投げタンは投げてすぐ実施するので付けない）
  const entryCyclers = new Map<string, () => string[]>();
  specs.forEach((spec) => {
    if (spec.pattern.throwCatch) return;
    const category = skillDef(spec.saltoIds[0])?.category ?? CATEGORY.FORWARD;
    let next = entryCyclers.get(category);
    if (!next) {
      const entries = (TUMBLING_ENTRIES[category] ?? [[]]).filter(
        (entry) => entry.length === 0 || usable(entry).length === entry.length,
      );
      next = cycler(entries.length > 0 ? entries : [[]], rand);
      entryCyclers.set(category, next);
    }
    spec.entry = next();
  });

  const limit = Math.max(0, opts.limit ?? specs.length);
  return shuffled(specs, rand).slice(0, limit);
}

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

/** 宙返りの本数だけを変えた候補。形の範囲外・組み立てた本数より多い・変化なしなら null。 */
export function withSaltoCount(t: AutoTumblingTemplate, saltoCount: number): AutoTumblingTemplate | null {
  if (saltoCount === t.spec.saltoCount) return null;
  if (!saltoCountRange(t.spec.pattern).includes(saltoCount)) return null;
  if (saltoCount > t.spec.saltoIds.length) return null;
  return autoTemplate(t.apparatus, { ...t.spec, saltoCount }, t.id);
}
