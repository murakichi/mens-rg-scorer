// =====================================================================
// 定義テーブル
//
// 採点ルールの値はすべてここに集約する。ロジック側（analysis.ts /
// score.ts）にマジックナンバーを散らさないこと。
// =====================================================================

import type {
  ApparatusKey,
  Difficulty,
  HandMotion,
  Skill,
} from "./types";

export const CATEGORY = {
  FORWARD: "前方系",
  SIDE: "側方系",
  BACKWARD: "後方系",
  OTHER: "その他",
} as const;

export const APPARATUS: Record<ApparatusKey, { name: string; throws: string[] }> = {
  stick: { name: "スティック", throws: ["左手投げ"] },
  clubs: { name: "クラブ", throws: ["二つ投げ"] },
  ring: { name: "リング", throws: ["二つ投げ"] },
  rope: { name: "ロープ", throws: [] },
};

export const THROW_OPTIONS_COMMON = [
  { id: "noview", name: "視野外の投げ" },
  { id: "nonhand", name: "手以外の投げ" },
  { id: "other", name: "その他の投げ" },
];
export const THROW_OPTIONS_APPARATUS = [{ id: "useapp", name: "手具を使った投げ" }];
export const CATCH_OPTIONS_COMMON = [
  { id: "noview", name: "視野外のキャッチ" },
  { id: "nonhand", name: "手以外のキャッチ" },
  { id: "other", name: "その他のキャッチ" },
];
export const CATCH_OPTIONS_APPARATUS = [{ id: "useapp", name: "手具を使ったキャッチ" }];

export const APPARATUS_USE: Record<ApparatusKey, boolean> = {
  stick: false,
  clubs: true,
  ring: true,
  rope: false,
};
export const APPARATUS_COUNT: Record<ApparatusKey, number> = {
  stick: 1,
  clubs: 2,
  ring: 2,
  rope: 1,
};

export const REQUIRED_THROW_OPTIONS: Record<ApparatusKey, { id: string; name: string }[]> = {
  stick: [{ id: "lefthand", name: "左手投げ" }],
  clubs: [{ id: "twothrow", name: "二つ投げ" }],
  ring: [{ id: "twothrow", name: "二つ投げ" }],
  rope: [],
};

export const DIFF_VALUE: Record<Difficulty, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
export const VALUE_DIFF: Record<number, Difficulty> = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
export const MAX_DIFF = 5;
export const DIFF_SCORE: Record<Difficulty, number> = { A: 0.1, B: 0.2, C: 0.3, D: 0.5, E: 0.7 };

export const E_BONUS = 0.1;
export const SERIES_BONUS = 0.1;
export const TECHNIQUE_BONUS = 0.1;
export const APPARATUS_OP_BONUS = 0.1;
export const TWOTHROW_MOTION_BONUS = 0.1;

export const NO_APP_SALTO_DEDUCTION = 0.1; // 宙返り系すべてに手具操作なし
export const NO_APP_ALL_DEDUCTION = 0.2; // シリーズ全体に手具操作なし
export const NO_APP_CAP = 0.4; // 演技全体での上限
export const DIRECTION_DEDUCTION = 0.3;
export const THROW_COUNT_DEDUCTION = 0.3;
export const CONNECT_NO_APP_DEDUCTION = 0.1;
export const SALTO_CHAIN_2_DEDUCTION = 0.1;
export const SALTO_CHAIN_LOW_DEDUCTION = 0.2;

export const VARIETY_REQUIRED = 3; // 投げ方・受け方それぞれ必要種類数
export const VARIETY_DEDUCTION_PER = 0.1; // 不足1種類につき
export const VARIETY_CAP = 0.5; // 投げ方+受け方の合算上限
export const ADOPT_COUNT = 3;
export const AE_FULL = 10;

// ---- 団体（5人）モード ----
export const UNION_MAX_VALUE = DIFF_VALUE.C; // 組運動の空中転回は最大C
export const ROT_CHAIN_REQUIRED = 4; // 加点対象の連続転回数

// 同じ転回技に関わる加点（最大0.3）：5人4連続/同時/D以上
export const TEAM_ROTATION_BONUS = { all5: 0.1, sim: 0.2, simD: 0.3 } as const;
// 着地に関する加点（最大0.2）：5人着ピタ/同時(縦並び)
export const TEAM_LANDING_BONUS = { all5: 0.1, sim: 0.2 } as const;
// 交差に関する加点（最大0.3）：全C3段以上/D以上1つ/D以上2つ
export const TEAM_CROSS_BONUS = { base: 0.1, oneD: 0.2, twoD: 0.3 } as const;
// 同一難度に関する加点（最大0.2）：全員D以上/全員E
export const TEAM_SAMEDIFF_BONUS = { d: 0.1, e: 0.2 } as const;

export interface RopeJump {
  id: string;
  name: string;
  difficulty: Difficulty;
  rotations: number;
  direction: "front" | "back";
}

export const ROPE_JUMPS: RopeJump[] = [
  { id: "1f", name: "1重跳び（前）", difficulty: "A", rotations: 1, direction: "front" },
  { id: "1b", name: "1重跳び（後ろ）", difficulty: "A", rotations: 1, direction: "back" },
  { id: "2f", name: "2重跳び（前）", difficulty: "A", rotations: 2, direction: "front" },
  { id: "2fc", name: "2重跳び（前・クロス）", difficulty: "B", rotations: 2, direction: "front" },
  { id: "2b", name: "2重跳び（後ろ）", difficulty: "B", rotations: 2, direction: "back" },
  { id: "2bc", name: "2重跳び（後ろ・クロス）", difficulty: "C", rotations: 2, direction: "back" },
  { id: "3f", name: "3重跳び（前）", difficulty: "B", rotations: 3, direction: "front" },
  { id: "3fc", name: "3重跳び（前・クロス）", difficulty: "C", rotations: 3, direction: "front" },
  { id: "3b", name: "3重跳び（後ろ）", difficulty: "C", rotations: 3, direction: "back" },
  { id: "3bc", name: "3重跳び（後ろ・クロス）", difficulty: "D", rotations: 3, direction: "back" },
  { id: "3x2f", name: "3重跳び2回（前）", difficulty: "C", rotations: 3, direction: "front" },
  { id: "3x2fc", name: "3重跳び2回（前・クロス）", difficulty: "C", rotations: 3, direction: "front" },
  { id: "3x2b", name: "3重跳び2回（後ろ）", difficulty: "D", rotations: 3, direction: "back" },
  { id: "3x2bc", name: "3重跳び2回（後ろ・クロス）", difficulty: "D", rotations: 3, direction: "back" },
  { id: "3x3b", name: "3重跳び連続3回以上（後ろ）", difficulty: "D", rotations: 3, direction: "back" },
  { id: "4b", name: "4重跳び（後ろ）", difficulty: "D", rotations: 4, direction: "back" },
  { id: "4x2b", name: "4重跳び連続2回以上（後ろ）", difficulty: "E", rotations: 4, direction: "back" },
];

export function ropeJumpDef(id: string): RopeJump | undefined {
  return ROPE_JUMPS.find((x) => x.id === id);
}

export const HAND_MOTIONS: HandMotion[] = [
  { id: "m1", name: "1動作", motions: 1 },
  { id: "m2", name: "2動作", motions: 2 },
  { id: "m3", name: "3動作", motions: 3 },
  { id: "m4", name: "4動作", motions: 4 },
  { id: "mv3", name: "縦3動作", motions: 3, verticalThree: true },
];

export const SKILL_LIST: Skill[] = [
  { id: "a_cartwheel", name: "側転", category: CATEGORY.SIDE, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_roundoff", name: "ロンダート", category: CATEGORY.SIDE, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_flicflac", name: "バク転", category: CATEGORY.BACKWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_handspring", name: "ハンドスプリング", category: CATEGORY.FORWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_frontroll", name: "とび前転", category: CATEGORY.FORWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "b_sidesalto", name: "側宙", category: CATEGORY.SIDE, difficulty: "B", isSalto: true },
  { id: "b_backsalto", name: "後方宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backtuck", name: "後方屈伸宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backlayout", name: "後方伸身宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backhalf", name: "後方宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backlayhalf", name: "後方伸身宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_tempo", name: "テンポ宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_divefront", name: "ダイビング前宙", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_front", name: "前宙", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "b_fronthalf", name: "前宙半ひねり", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "b_kirimomi", name: "きりもみ", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "c_front1full", name: "前方宙返り1回ひねり", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true },
  { id: "c_kirimomiten", name: "きりもみ転回", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true },
  { id: "c_back15", name: "後方1回半ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_back1full", name: "後方宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_backtuck1full", name: "後方屈伸宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_backlay1full", name: "後方伸身宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_tempotwist", name: "テンポひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "d_frontlay1", name: "伸身前宙1回ひねり", category: CATEGORY.FORWARD, difficulty: "D", isSalto: true },
  { id: "e_frontlay2", name: "伸身前宙2回ひねり", category: CATEGORY.FORWARD, difficulty: "E", isSalto: true },
  { id: "d_back2twist", name: "後方宙返り2回ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "d_backlay25", name: "後方伸身宙返り2回半ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "e_backlay3twist", name: "後方伸身宙返り3回ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_backlay35twist", name: "後方伸身宙返り3回半ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "d_doubleback", name: "後方2回宙返り", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "e_doublelay", name: "後方伸身2回宙返り", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_divedouble", name: "ダイビングダブル", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_moonsault", name: "後方2回宙返り1回ひねり（ムーンサルト）", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_rudolph", name: "後方2回宙返り2回ひねり（ルドルフ）", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
];

export function skillDef(id: string): Skill | undefined {
  return SKILL_LIST.find((x) => x.id === id);
}
