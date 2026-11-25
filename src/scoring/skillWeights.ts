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
import { HARDER_THAN_RATED, HARDER_THAN_RATED_WEIGHT, LIMITED_SKILLS, RARE_PICK_WEIGHT, SKILL_PICK_WEIGHT } from "./tumblingWeights";

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

// =====================================================================
// 技ごとの出やすさを「値そのもの」で持つ（2026-11-25）
//
// 画面では倍率ではなく、**その技の出やすさのパラメータそのもの**を見せて変えられるようにする。
// 技ごとの用意済みの値（`defaultSkillPickValue`）＝
//   実施の多さ（`SKILL_PICK_WEIGHT`）× 実施が少ない技（`LIMITED_SKILLS` の `RARE_PICK_WEIGHT`）
//   × 表記より難しい技（`HARDER_THAN_RATED` の `HARDER_THAN_RATED_WEIGHT`）
// で、難度ごとの重み（D 0.6 など）や位置ごとの重み（後方伸身のあとのきりもみ 等）はその上に掛かる
// 別のパラメータとして残す。生成には「新しい値 ÷ 用意済みの値」の倍率で渡すので、生成の中身は変わらない。
// =====================================================================


export const SKILL_VALUE_STORAGE_KEY = "mens-rg-scorer:skill-values:v2";

/** 技id → 出やすさの値。**保存するのは用意済みの値から変えたものだけ** */
export type SkillValueStore = Record<string, number>;

export const SKILL_VALUE_MIN = 0;
export const SKILL_VALUE_MAX = 3;
export const SKILL_VALUE_STEP = 0.01;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** その技の用意済みの出やすさ（技そのものの値。難度・位置ごとの重みは含めない） */
export function defaultSkillPickValue(id: string): number {
  let v = SKILL_PICK_WEIGHT[id] ?? 1;
  if (LIMITED_SKILLS.includes(id)) v *= RARE_PICK_WEIGHT;
  if (HARDER_THAN_RATED.includes(id)) v *= HARDER_THAN_RATED_WEIGHT;
  return round2(v);
}

export const clampSkillValue = (v: number): number =>
  Math.min(SKILL_VALUE_MAX, Math.max(SKILL_VALUE_MIN, round2(v)));

/** 保存データを正規化する。知らないid・数値でないもの・用意済みと同じものは捨てる */
export function normalizeSkillValues(data: unknown): SkillValueStore {
  const d = (data ?? {}) as Record<string, unknown>;
  const out: SkillValueStore = {};
  Object.entries(d).forEach(([id, raw]) => {
    if (!skillDef(id)) return;
    const v = typeof raw === "number" && Number.isFinite(raw) ? clampSkillValue(raw) : null;
    if (v === null || v === defaultSkillPickValue(id)) return;
    out[id] = v;
  });
  return out;
}

/** その技の出やすさ（未設定なら用意済みの値） */
export const skillValue = (store: SkillValueStore, id: string): number => store[id] ?? defaultSkillPickValue(id);

/** 1技の値を変える（用意済みと同じなら捨てる） */
export function setSkillValue(store: SkillValueStore, id: string, value: number): SkillValueStore {
  const v = clampSkillValue(value);
  const out = { ...store };
  if (v === defaultSkillPickValue(id)) delete out[id];
  else out[id] = v;
  return out;
}

/** 生成に渡す倍率（新しい値 ÷ 用意済みの値）。変えていない技は入れない */
export function skillValuesToWeights(store: SkillValueStore): SkillWeightStore {
  const out: SkillWeightStore = {};
  Object.entries(store).forEach(([id, v]) => {
    const def = defaultSkillPickValue(id);
    if (def > 0) out[id] = v / def;
  });
  return out;
}

/** 旧形式（倍率）を値に直す */
export const skillWeightsToValues = (weights: SkillWeightStore): SkillValueStore =>
  normalizeSkillValues(
    Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, w * defaultSkillPickValue(id)])),
  );

/** localStorage から読み込む。新形式が無ければ旧形式（倍率）を値に直して読む */
export function loadSkillValues(): SkillValueStore {
  try {
    const raw = localStorage.getItem(SKILL_VALUE_STORAGE_KEY);
    if (raw) return normalizeSkillValues(JSON.parse(raw));
  } catch {
    return {};
  }
  return skillWeightsToValues(loadSkillWeights());
}

/** localStorage に書き込む（旧形式は消す）。保存できたかを返す */
export function saveSkillValues(store: SkillValueStore): boolean {
  try {
    const norm = normalizeSkillValues(store);
    if (Object.keys(norm).length === 0) localStorage.removeItem(SKILL_VALUE_STORAGE_KEY);
    else localStorage.setItem(SKILL_VALUE_STORAGE_KEY, JSON.stringify(norm));
    localStorage.removeItem(SKILL_WEIGHT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
