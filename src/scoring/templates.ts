// =====================================================================
// テンプレート（よく使うシリーズ／演技構成の保存）
//
// 保存先はブラウザの localStorage（端末ごと）。採点ロジックからは独立していて、
// 保持するのは入力データ（Series / Series[] と手具）だけ。
// =====================================================================

import { APPARATUS, DIFF_VALUE, HAND_MOTIONS, MOTION_OPTIONS, VALUE_DIFF, ropeJumpDef, skillDef } from "./constants";
import { computeScore } from "./score";
import type { ApparatusKey, Difficulty, Item, Series } from "./types";

export const TEMPLATE_STORAGE_KEY = "mens-rg-scorer:templates:v1";

/** テンプレート専用の「共通」手具。どの手具でも使える内容だけを持つ。 */
export const COMMON_APPARATUS = "common";
export type TemplateApparatus = ApparatusKey | typeof COMMON_APPARATUS;

/** テンプレートの手具の選択肢（共通を含む） */
export const TEMPLATE_APPARATUS_OPTIONS: { id: TemplateApparatus; name: string }[] = [
  ...(Object.entries(APPARATUS) as [ApparatusKey, { name: string }][]).map(([id, v]) => ({ id, name: v.name })),
  { id: COMMON_APPARATUS, name: "共通" },
];

export const isCommonApparatus = (a: TemplateApparatus): a is typeof COMMON_APPARATUS => a === COMMON_APPARATUS;

/** 共通テンプレートを採点・編集するときに使う手具（手具固有の入力を持たないので何でもよい） */
export const scoringApparatus = (a: TemplateApparatus): ApparatusKey => (isCommonApparatus(a) ? "stick" : a);

/**
 * 「共通」で保存できない要素（手具固有の入力）を挙げる。
 * 二つ投げ・左手投げ・手具を使った投げ／キャッチ・二つ同時キャッチ・ロープ跳びが対象。
 */
export function commonBlockers(list: Series[]): string[] {
  const reasons = new Set<string>();
  list.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        (item.reqTypes || []).forEach((t) => {
          if (t === "lefthand") reasons.add("左手投げ");
          else if (t === "twothrow") reasons.add("二つ投げ");
          else reasons.add(t);
        });
        if ((item.throwTypes || []).includes("useapp")) reasons.add("手具を使った投げ");
      }
      if (item.kind === "skill" && (item.throwTypes || []).includes("useapp")) reasons.add("手具を使った投げ");
      if (item.kind === "catch") {
        if ((item.catchTypes || []).includes("useapp")) reasons.add("手具を使ったキャッチ");
        if (item.catchTwo) reasons.add("2つ同時キャッチ");
      }
      if (item.kind === "ropeJump") reasons.add("ロープ跳び");
    }),
  );
  return [...reasons];
}

interface TemplateBase {
  id: string;
  name: string;
  /** 登録したときの手具（"common" ＝ どの手具でも使える） */
  apparatus: TemplateApparatus;
  updatedAt: number;
}
/** 1シリーズ分のテンプレート */
export interface SeriesTemplate extends TemplateBase {
  series: Series;
}
/** 演技構成全体（手具 + 全シリーズ）のテンプレート */
export interface RoutineTemplate extends TemplateBase {
  series: Series[];
}

export interface TemplateStore {
  version: 1;
  series: SeriesTemplate[];
  routines: RoutineTemplate[];
}

export const emptyTemplateStore = (): TemplateStore => ({ version: 1, series: [], routines: [] });

export const newTemplateId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.random()}`;

const isApparatus = (v: unknown): v is TemplateApparatus =>
  typeof v === "string" && (v in APPARATUS || v === COMMON_APPARATUS);

/** items を持つシリーズらしきオブジェクトか */
const isSeriesLike = (v: unknown): v is Series =>
  !!v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items);

function normalizeBase(raw: unknown, fallbackName: string): TemplateBase | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<TemplateBase>;
  return {
    id: typeof t.id === "string" && t.id ? t.id : newTemplateId(),
    name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : fallbackName,
    apparatus: isApparatus(t.apparatus) ? t.apparatus : "stick",
    updatedAt: Number(t.updatedAt) || Date.now(),
  };
}

/** 保存データ（localStorage / インポート）をテンプレート集合に正規化する。壊れた項目は捨てる。 */
export function normalizeTemplateStore(data: unknown): TemplateStore {
  const d = (data ?? {}) as { series?: unknown; routines?: unknown };
  const series: SeriesTemplate[] = (Array.isArray(d.series) ? d.series : []).flatMap((raw, i) => {
    const base = normalizeBase(raw, `シリーズ${i + 1}`);
    const s = (raw as { series?: unknown })?.series;
    return base && isSeriesLike(s) ? [{ ...base, series: s }] : [];
  });
  const routines: RoutineTemplate[] = (Array.isArray(d.routines) ? d.routines : []).flatMap((raw, i) => {
    const base = normalizeBase(raw, `構成${i + 1}`);
    const s = (raw as { series?: unknown })?.series;
    const list = Array.isArray(s) ? s.filter(isSeriesLike) : [];
    return base && list.length > 0 ? [{ ...base, series: list }] : [];
  });
  return { version: 1, series, routines };
}

/** localStorage から読み込む（未保存・破損・アクセス不可なら空） */
export function loadTemplates(): TemplateStore {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return emptyTemplateStore();
    return normalizeTemplateStore(JSON.parse(raw));
  } catch {
    return emptyTemplateStore();
  }
}

/** localStorage に書き込む。保存できたかを返す（プライベートモード等では false）。 */
export function saveTemplates(store: TemplateStore): boolean {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** 同名があれば上書き、なければ追加。新しいものが先頭に来るよう更新日時で並べ替える。 */
function upsert<T extends TemplateBase>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id || x.name === item.name);
  const next = i >= 0 ? list.map((x, k) => (k === i ? { ...item, id: list[i].id } : x)) : [...list, item];
  return [...next].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** テンプレートは構成だけを持つ（実施減点は採点のたびに入れるものなので落とす） */
const stripExec = (s: Series): Series => ({ ...structuredClone(s), executionDeduction: 0 });

export function addSeriesTemplate(
  store: TemplateStore,
  name: string,
  apparatus: TemplateApparatus,
  series: Series,
): TemplateStore {
  const item: SeriesTemplate = {
    id: newTemplateId(),
    name: name.trim(),
    apparatus,
    updatedAt: Date.now(),
    series: stripExec(series),
  };
  return { ...store, series: upsert(store.series, item) };
}

export function addRoutineTemplate(
  store: TemplateStore,
  name: string,
  apparatus: TemplateApparatus,
  series: Series[],
): TemplateStore {
  const item: RoutineTemplate = {
    id: newTemplateId(),
    name: name.trim(),
    apparatus,
    updatedAt: Date.now(),
    series: series.map(stripExec),
  };
  return { ...store, routines: upsert(store.routines, item) };
}

export type TemplateKind = "series" | "routine";

export function removeTemplate(store: TemplateStore, kind: TemplateKind, id: string): TemplateStore {
  return kind === "series"
    ? { ...store, series: store.series.filter((t) => t.id !== id) }
    : { ...store, routines: store.routines.filter((t) => t.id !== id) };
}

export function renameTemplate(store: TemplateStore, kind: TemplateKind, id: string, name: string): TemplateStore {
  const rename = <T extends TemplateBase>(list: T[]): T[] =>
    list.map((t) => (t.id === id ? { ...t, name: name.trim(), updatedAt: Date.now() } : t));
  return kind === "series" ? { ...store, series: rename(store.series) } : { ...store, routines: rename(store.routines) };
}

/**
 * シリーズテンプレートを「共通」「同じ手具のもの」「他の手具のもの」に分ける。
 * 他の手具のテンプレートも読み込めるが、手具固有の入力（ロープ跳び等）は
 * そのまま残るので、プルダウンでは別の見出しに分ける。
 */
export function splitByApparatus<T extends TemplateBase>(
  list: T[],
  apparatus: ApparatusKey,
): { common: T[]; same: T[]; other: T[] } {
  return {
    common: list.filter((t) => isCommonApparatus(t.apparatus)),
    same: list.filter((t) => t.apparatus === apparatus),
    other: list.filter((t) => !isCommonApparatus(t.apparatus) && t.apparatus !== apparatus),
  };
}

export const apparatusName = (key: TemplateApparatus): string =>
  isCommonApparatus(key) ? "共通" : APPARATUS[key]?.name ?? key;


/** カード表示用：アイテム1つの短い名前 */
function itemLabel(item: Item): string {
  if (item.kind === "throw") return "投げ";
  if (item.kind === "catch") return "キャッチ";
  if (item.kind === "skill") return skillDef(item.skillId)?.name ?? "技";
  if (item.kind === "ropeJump") return ropeJumpDef(item.jumpId)?.name ?? "ロープ跳び";
  const m = MOTION_OPTIONS.find((o) => o.id === item.motionId) ?? HAND_MOTIONS.find((x) => x.id === item.motionId);
  const name = m?.name ?? skillDef(item.motionId)?.name ?? "徒手";
  const n = Number(item.count);
  return Number.isFinite(n) && n > 1 ? `${name}×${n}` : name;
}

/** カード表示用：シリーズの中身を「投げ→前宙→キャッチ」のように短くまとめる */
export function describeSeries(series: Series, max = 6): string {
  const labels = series.items.map(itemLabel);
  if (labels.length === 0) return "（空）";
  return labels.length > max ? `${labels.slice(0, max).join("→")}→…` : labels.join("→");
}


/** テンプレートの検索・表示に使う指標 */
export interface TemplateMetrics {
  /** 含まれるユニットの最高難度（空なら null） */
  diff: Difficulty | null;
  diffValue: number;
  /** そのテンプレート単体で採点したときのD（難度点＋加点） */
  dScore: number;
}

/** テンプレート（シリーズ1つ／構成まるごと）の難度と点数を求める */
export function templateMetrics(list: Series[], apparatus: TemplateApparatus, junior = false): TemplateMetrics {
  const r = computeScore(list, scoringApparatus(apparatus), { junior });
  let v = 0;
  r.analysis.forEach((a) => a.units.forEach((u) => (v = Math.max(v, DIFF_VALUE[u.finalDiff]))));
  return { diff: v > 0 ? VALUE_DIFF[v] : null, diffValue: v, dScore: r.dScore };
}
