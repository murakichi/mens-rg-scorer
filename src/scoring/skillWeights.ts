// =====================================================================
// 技ごとの選ばれやすさのユーザー設定
//
// 自動生成の重み（`SKILL_PICK_WEIGHT` などの実測値）は触らず、**その上に載せる倍率**
// だけをここで持つ。既定値を書き換えないので、
//  - リセット＝保存した倍率を捨てるだけ
//  - 1技だけ戻す＝そのidを捨てるだけ
// で済む。保存先はブラウザの localStorage（端末ごと。テンプレートと同じ名前空間）。
// 採点には一切影響しない（生成の候補づくりの重みだけ）。
// =====================================================================

import { SKILL_LIST, skillDef } from "./constants";

export const SKILL_WEIGHT_STORAGE_KEY = "mens-rg-scorer:skill-weights:v1";

/** 技id → 倍率。**保存するのは既定（1）から変えたものだけ** */
export type SkillWeightStore = Record<string, number>;

/** 倍率の下限・上限・刻み（0＝その技を生成に使わない） */
export const SKILL_WEIGHT_MIN = 0;
export const SKILL_WEIGHT_MAX = 3;
export const SKILL_WEIGHT_STEP = 0.1;
/** 既定の倍率（実測どおり） */
export const SKILL_WEIGHT_DEFAULT = 1;

export const clampSkillWeight = (w: number): number =>
  Math.min(SKILL_WEIGHT_MAX, Math.max(SKILL_WEIGHT_MIN, Math.round(w / SKILL_WEIGHT_STEP) * SKILL_WEIGHT_STEP));

/** 保存データを正規化する。知らないid・数値でないもの・既定と同じものは捨てる */
export function normalizeSkillWeights(data: unknown): SkillWeightStore {
  const d = (data ?? {}) as Record<string, unknown>;
  const out: SkillWeightStore = {};
  Object.entries(d).forEach(([id, raw]) => {
    if (!skillDef(id)) return;
    const w = typeof raw === "number" && Number.isFinite(raw) ? clampSkillWeight(raw) : null;
    if (w === null || w === SKILL_WEIGHT_DEFAULT) return;
    out[id] = w;
  });
  return out;
}

/** localStorage から読み込む（未保存・破損・アクセス不可なら空） */
export function loadSkillWeights(): SkillWeightStore {
  try {
    const raw = localStorage.getItem(SKILL_WEIGHT_STORAGE_KEY);
    if (!raw) return {};
    return normalizeSkillWeights(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** localStorage に書き込む。保存できたかを返す（プライベートモード等では false） */
export function saveSkillWeights(store: SkillWeightStore): boolean {
  try {
    const norm = normalizeSkillWeights(store);
    if (Object.keys(norm).length === 0) localStorage.removeItem(SKILL_WEIGHT_STORAGE_KEY);
    else localStorage.setItem(SKILL_WEIGHT_STORAGE_KEY, JSON.stringify(norm));
    return true;
  } catch {
    return false;
  }
}

/** 1技の倍率を変える（既定に戻すなら捨てる） */
export function setSkillWeight(store: SkillWeightStore, id: string, weight: number): SkillWeightStore {
  const w = clampSkillWeight(weight);
  const out = { ...store };
  if (w === SKILL_WEIGHT_DEFAULT) delete out[id];
  else out[id] = w;
  return out;
}

/** 1技だけ既定に戻す */
export const resetSkillWeight = (store: SkillWeightStore, id: string): SkillWeightStore =>
  setSkillWeight(store, id, SKILL_WEIGHT_DEFAULT);

/** すべて既定に戻す */
export const resetSkillWeights = (): SkillWeightStore => ({});

/** その技のユーザー倍率（未設定なら1） */
export const userSkillWeight = (store: SkillWeightStore | undefined, id: string): number =>
  store?.[id] ?? SKILL_WEIGHT_DEFAULT;

/** 既定から変えた技の数 */
export const changedSkillCount = (store: SkillWeightStore): number => Object.keys(store).length;

/** 設定画面に並べる技（一覧の順番そのまま） */
export const weightableSkills = () => SKILL_LIST;
