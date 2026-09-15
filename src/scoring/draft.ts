// =====================================================================
// 入力中の構成の自動保存（ドラフト）
//
// テンプレートと同じく localStorage（端末ごと）。保持するのは入出力・共有URLと
// 同じ `SaveData` 形（個人）／`TeamState`（団体）で、保存形式を増やさない。
// 壊れたデータ・localStorage が使えない環境でも起動が止まらないこと。
// =====================================================================

import { stripForApparatus } from "./analysis";
import { APPARATUS, ART_DEDUCTION_ITEMS, clampArtDeduction } from "./constants";
import { initialTeamState, normalizeTeamState, type TeamState } from "./team";
import type { ApparatusKey, Item, Series } from "./types";

export const DRAFT_KEY_INDIVIDUAL = "mens-rg-scorer:draft:individual:v1";
export const DRAFT_KEY_TEAM = "mens-rg-scorer:draft:team:v1";
/** 最後に使っていたモード（個人／団体）。どちらのドラフトを見せるかを決める。 */
export const DRAFT_KEY_MODE = "mens-rg-scorer:draft:mode:v1";

export type ScorerMode = "individual" | "team";

/** 個人モードのドラフト。エクスポート／共有URLの `SaveData` と同じ形。 */
export interface IndividualDraft {
  version: 1;
  apparatus: ApparatusKey;
  junior: boolean;
  series: Series[];
  executionDeduction: number;
  apparatusElements: string[];
  violations: string[];
  artDeductions: Record<string, number>;
}

export const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** 保存データの欠点テーブルを項目ごとに丸めて取り込む */
export function normalizeArtDeductions(v: unknown): Record<string, number> {
  const src = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  ART_DEDUCTION_ITEMS.forEach((item) => {
    const n = clampArtDeduction(item.id, src[item.id]);
    if (n > 0) out[item.id] = n;
  });
  return out;
}

const isSeriesLike = (v: unknown): v is Series =>
  !!v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items);

/**
 * 保存データ（ドラフト／共有URL）を個人モードの状態に正規化する。
 * 手具で入力できない内容は `stripForApparatus` で落とす（インポートと同じ扱い）。
 * オブジェクトでなければ null。シリーズが無い場合は空配列（呼び出し側が空シリーズを置く）。
 */
export function normalizeIndividualDraft(data: unknown): IndividualDraft | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const apparatus: ApparatusKey =
    typeof d.apparatus === "string" && d.apparatus in APPARATUS ? (d.apparatus as ApparatusKey) : "stick";
  const raw = Array.isArray(d.series) ? d.series.filter(isSeriesLike) : [];
  return {
    version: 1,
    apparatus,
    junior: !!d.junior,
    series: raw.length > 0 ? stripForApparatus(raw, apparatus) : [],
    executionDeduction: Number(d.executionDeduction) || 0,
    apparatusElements: asStringArray(d.apparatusElements),
    violations: asStringArray(d.violations),
    artDeductions: normalizeArtDeductions(d.artDeductions),
  };
}

/** 何も選ばれていないアイテム（新規追加した直後の空欄）か */
const isBlankItem = (item: Item): boolean => {
  if (item.kind === "skill") return !item.skillId;
  if (item.kind === "motion") return !item.motionId;
  if (item.kind === "ropeJump") return !item.jumpId;
  return false; // 投げ・キャッチはそれ自体が入力
};

/**
 * 復元する価値が無い（＝初期状態と変わらない）ドラフトか。
 * 手具の選択だけは「入力」に数えない — 起動しただけで復元の通知が出ないようにする。
 */
export function isBlankIndividualDraft(d: IndividualDraft): boolean {
  return (
    d.series.every((ser) => ser.items.every(isBlankItem) && !ser.executionDeduction) &&
    !d.executionDeduction &&
    !d.junior &&
    d.apparatusElements.length === 0 &&
    d.violations.length === 0 &&
    Object.keys(d.artDeductions).length === 0
  );
}

/** 団体モードで復元する価値が無い状態か（技も徒手も選ばれておらず、減点も無い） */
export function isBlankTeamState(t: TeamState): boolean {
  return (
    t.series.every(
      (ser) =>
        ser.lanes.every((lane) => lane.every((c) => c.type === "empty" || (c.type === "motion" && !c.motionId))) &&
        ser.crossGroups.length === 0 &&
        ser.unionGroups.length === 0 &&
        !ser.executionDeduction,
    ) &&
    !t.junior &&
    !t.executionDeduction
  );
}

// ---- localStorage 層（使えない環境でも例外を投げない）----

function readKey(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 使えない環境では何もしない */
  }
}

/** 保存されたドラフトを読む。未保存・破損・初期状態と同じなら null。 */
export function loadIndividualDraft(): IndividualDraft | null {
  const d = normalizeIndividualDraft(readKey(DRAFT_KEY_INDIVIDUAL));
  return d && !isBlankIndividualDraft(d) ? d : null;
}

/** 現在の入力を保存する。初期状態と同じなら保存せず消す（次回の復元通知を出さない）。 */
export function saveIndividualDraft(d: IndividualDraft): boolean {
  if (isBlankIndividualDraft(d)) {
    clearDraft(DRAFT_KEY_INDIVIDUAL);
    return true;
  }
  return writeKey(DRAFT_KEY_INDIVIDUAL, d);
}

export function loadTeamDraft(): TeamState | null {
  const raw = readKey(DRAFT_KEY_TEAM) as { team?: unknown } | null;
  const t = normalizeTeamState(raw?.team ?? raw);
  return t && !isBlankTeamState(t) ? t : null;
}

export function saveTeamDraft(team: TeamState): boolean {
  if (isBlankTeamState(team)) {
    clearDraft(DRAFT_KEY_TEAM);
    return true;
  }
  return writeKey(DRAFT_KEY_TEAM, { version: 1, kind: "team", team });
}

/** 団体モードの初期状態（ドラフトが無いとき） */
export const emptyTeamDraft = (): TeamState => initialTeamState();

export function loadDraftMode(): ScorerMode | null {
  const v = readKey(DRAFT_KEY_MODE);
  return v === "individual" || v === "team" ? v : null;
}

export function saveDraftMode(mode: ScorerMode): void {
  writeKey(DRAFT_KEY_MODE, mode);
}
