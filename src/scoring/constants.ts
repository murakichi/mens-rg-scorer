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
/** タンブリング中の投げ（投げタン）に付けられる技術タグ。技術加点対象のみ（その他は除外）。 */
export const SKILL_THROW_OPTIONS_COMMON = [
  { id: "noview", name: "視野外の投げ" },
  { id: "nonhand", name: "手以外の投げ" },
];
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

/** 二つ投げが必須投げの手具（リング・クラブ）か。二つ投げ関連の表示条件に使う。 */
export function hasTwoThrow(apparatus: ApparatusKey): boolean {
  return REQUIRED_THROW_OPTIONS[apparatus].some((o) => o.id === "twothrow");
}

export const DIFF_VALUE: Record<Difficulty, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
export const VALUE_DIFF: Record<number, Difficulty> = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
export const MAX_DIFF = 5;
export const DIFF_SCORE: Record<Difficulty, number> = { A: 0.1, B: 0.2, C: 0.3, D: 0.5, E: 0.7 };

export const E_BONUS = 0.1;
export const SERIES_BONUS = 0.1;
export const TECHNIQUE_BONUS = 0.1;
export const APPARATUS_OP_BONUS = 0.1;
export const TWOTHROW_MOTION_BONUS = 0.1;
export const JUMP_VARIETY_BONUS = 0.1; // §3.5.5.5(4) 様々な跳びに対する加点（最大0.10）

export const NO_APP_SALTO_DEDUCTION = 0.1; // 宙返り系すべてに手具操作なし
export const NO_APP_ALL_DEDUCTION = 0.2; // シリーズ全体に手具操作なし
export const NO_APP_CAP = 0.4; // 演技全体での上限
export const DIRECTION_DEDUCTION = 0.3;
export const THROW_COUNT_DEDUCTION = 0.3;
/** 投げ上げの最低回数。不足で THROW_COUNT_DEDUCTION（一般 / ジュニア）。 */
export const THROW_COUNT_REQUIRED = 3;
export const JUNIOR_THROW_COUNT_REQUIRED = 2;
/** 投げ上げの上限回数。ジュニアのみ5回までで、超過すると THROW_COUNT_OVER_DEDUCTION。 */
export const JUNIOR_THROW_COUNT_MAX = 5;
export const THROW_COUNT_OVER_DEDUCTION = 0.3;
// つなぎ技のA難度に手具操作がない場合の減点（Q&A Q10 より 0.2）。
// 操作は回しに限らず持ち替え・足やわきに挟むなども含み、1つでもあれば減点しない。
export const CONNECT_NO_APP_DEDUCTION = 0.2;
export const SALTO_CHAIN_2_DEDUCTION = 0.1;
export const SALTO_CHAIN_LOW_DEDUCTION = 0.2;

export const VARIETY_REQUIRED = 3; // 投げ方・受け方それぞれ必要種類数
export const VARIETY_DEDUCTION_PER = 0.1; // 不足1種類につき
export const VARIETY_CAP = 0.5; // 投げ方+受け方の合算上限
export const ADOPT_COUNT = 3;
export const AE_FULL = 10;

// §3.5.6.3 要求要素の欠如（A減点、各 −0.30）
export const REQUIRED_ELEMENT_DEDUCTION = 0.3; // 手具操作の要求要素がない場合（1つにつき）
export const VIOLATION_DEDUCTION = 0.3; // 開始/終了/音楽違反・徒手系基礎要素群欠如（各）

/**
 * §3.2 手具別の必須要素のうち「手具操作」要素のチェック項目。
 * 左手投げ/二つ投げ（→必須投げ）と3回以上の投げ上げ（→投げ回数）は別途判定するため除外。
 * 未実施の項目は §3.5.6.3 により1つにつき −0.30。
 *
 * `auto` が付いた項目はシリーズ入力から自動判定し、手動チェックの対象外にする。
 * - `rightThrow`：左手投げ・手以外の投げ以外の投げ（＝通常の右投げ右受け）が1回以上あるか。
 */
export type RequiredElementAuto = "rightThrow";

export const APPARATUS_REQUIRED_ELEMENTS: Record<
  ApparatusKey,
  { id: string; name: string; auto?: RequiredElementAuto }[]
> = {
  stick: [
    { id: "stick_right", name: "右投げ右受け1回以上", auto: "rightThrow" },
    { id: "stick_rotthrow", name: "転回系の投げ受け" },
    { id: "stick_roll", name: "1m以上のころがし" },
    { id: "stick_propeller", name: "プロペラ回旋2回以上" },
  ],
  ring: [
    { id: "ring_rotthrow", name: "転回系の投げ受け" },
    { id: "ring_roll", name: "1m以上のころがし" },
    { id: "ring_turn", name: "まわし2回以上" },
  ],
  rope: [{ id: "rope_rotthrow", name: "転回系の投げ受け" }],
  clubs: [
    { id: "clubs_rotthrow", name: "転回系の投げ受け" },
    { id: "clubs_roll", name: "50cm以上のころがし" },
    { id: "clubs_propeller", name: "プロペラ回旋2回以上" },
  ],
};

/** §3.5.6.3 審判判断による違反・欠如（各 −0.30）。実施＝該当あり。 */
export const VIOLATION_OPTIONS = [
  { id: "handBasic", name: "徒手系基礎要素1群が全くない" },
  { id: "start", name: "演技の開始違反" },
  { id: "end", name: "演技の終了違反" },
  { id: "music", name: "伴奏音楽の違反（リズムに欠け演技を妨害）" },
];

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
  // 以下3種は難度判定で前後を区別しない（規則表では後ろの列にのみ記載）。
  // 前後の別は §3.2(3) の前回し／後ろ回し跳びの要求要素判定にのみ使う。
  { id: "3x3f", name: "3重跳び連続3回以上（前）", difficulty: "D", rotations: 3, direction: "front" },
  { id: "3x3b", name: "3重跳び連続3回以上（後ろ）", difficulty: "D", rotations: 3, direction: "back" },
  { id: "4f", name: "4重跳び（前）", difficulty: "D", rotations: 4, direction: "front" },
  { id: "4b", name: "4重跳び（後ろ）", difficulty: "D", rotations: 4, direction: "back" },
  { id: "4x2f", name: "4重跳び連続2回以上（前）", difficulty: "E", rotations: 4, direction: "front" },
  { id: "4x2b", name: "4重跳び連続2回以上（後ろ）", difficulty: "E", rotations: 4, direction: "back" },
];

export function ropeJumpDef(id: string): RopeJump | undefined {
  return ROPE_JUMPS.find((x) => x.id === id);
}

export const HAND_MOTIONS: HandMotion[] = [
  // 汎用の動作数。具体的な回転系が揃ったため選択肢からは外し、保存済みデータの解決用に残す。
  // （§3.5.5.3 の注釈どおり、投げ受けの間に数えるのは縦軸・横軸の360度回転のみ）
  { id: "m1", name: "1動作", motions: 1, legacy: true },
  { id: "m2", name: "2動作", motions: 2, legacy: true },
  { id: "m3", name: "3動作", motions: 3, legacy: true },
  { id: "m4", name: "4動作", motions: 4, legacy: true },
  { id: "mv3", name: "縦3動作", motions: 3, verticalThree: true, legacy: true },
  // 縦回転の徒手としてのみ判定する技（タンブリング技には出さない）
  { id: "td_rise", name: "タッチダウンライズ", motions: 1, vertical: true },
  { id: "fwd_roll", name: "前転", motions: 1, vertical: true },
  { id: "back_roll", name: "後転", motions: 1, vertical: true },
  { id: "gambi", name: "ギャンビ", motions: 1, vertical: true },
  // 横の一回転の徒手
  { id: "chene", name: "シェネ", motions: 1, hasHandsOption: true },
  { id: "roll", name: "転がり", motions: 1 },
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
  { id: "b_kirimomi", name: "きりもみ", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true, saltoOnlyInChain: true },
  { id: "c_front1full", name: "前方宙返り1回ひねり", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true },
  { id: "c_kirimomiten", name: "きりもみ転回", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true, saltoOnlyInChain: true },
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

/**
 * 徒手として扱うことがある転回技（A難度技ときりもみ系）。徒手動作の選択肢にも出す。
 * 動作数は難度をそのまま徒手系難度に読み替えた値（A/きりもみ＝1動作、きりもみ転回＝2動作）。
 */
export const MOTION_SKILLS: Skill[] = SKILL_LIST.filter((s) => !s.isSalto || s.saltoOnlyInChain);

/**
 * 徒手動作の選択肢の並び順。現実の演技で使われやすいものを上に出す。
 * `MOTION_PRIORITY_AFTER` は「直前に選んだ動作」に応じた優先順（つながりやすい動作を上に）。
 */
export const MOTION_PRIORITY_DEFAULT = ["chene", "fwd_roll", "a_cartwheel", "a_frontroll", "a_handspring"];
export const MOTION_PRIORITY_AFTER: Record<string, string[]> = {
  chene: ["fwd_roll", "roll", "a_cartwheel"],
  fwd_roll: ["roll"],
};

/** 直前に選んだ徒手動作（あれば）に応じて並べ替えた選択肢を返す */
export function motionOptionsFor(prevMotionId?: string): typeof MOTION_OPTIONS {
  const priority = [...(prevMotionId ? MOTION_PRIORITY_AFTER[prevMotionId] ?? [] : []), ...MOTION_PRIORITY_DEFAULT];
  const rank = (id: string) => {
    const i = priority.indexOf(id);
    return i === -1 ? priority.length : i;
  };
  return [...MOTION_OPTIONS]
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o.id) - rank(b.o.id) || a.i - b.i)
    .map((x) => x.o);
}

/** 旧データの徒手動作（選択肢には出さないが、読み込んだ構成では表示・計算する） */
export function legacyMotionDef(id: string): HandMotion | undefined {
  return HAND_MOTIONS.find((m) => m.id === id && m.legacy);
}

/** 徒手動作アイテムの選択肢（回転系の徒手。汎用の「n動作」は含まない） */
export const MOTION_OPTIONS: { id: string; name: string; hasHandsOption?: boolean }[] = [
  ...HAND_MOTIONS.filter((m) => !m.legacy).map((m) => ({
    id: m.id,
    name: m.name,
    hasHandsOption: m.hasHandsOption,
  })),
  ...MOTION_SKILLS.map((s) => ({ id: s.id, name: s.name })),
];

// ---- ジュニア適用規則（変更規則1）----

/**
 * ジュニアで難度認定が変わる転回系（§10 変更規則1-5）。
 * ダイビング前宙・後方宙返り半ひねりは一般ではB難度だが、ジュニアではC難度。
 */
export const JUNIOR_SKILL_DIFFICULTY: Record<string, Difficulty> = {
  b_divefront: "C", // ダイビング前宙
  b_backhalf: "C", // 後方宙返り半ひねり
};

/** 適用規則に応じた転回系の難度。ジュニアは JUNIOR_SKILL_DIFFICULTY で上書きする。 */
export function skillDifficulty(id: string, junior = false): Difficulty | undefined {
  if (junior) {
    const j = JUNIOR_SKILL_DIFFICULTY[id];
    if (j) return j;
  }
  return skillDef(id)?.difficulty;
}

/** 適用規則に応じた投げ上げの最低回数 */
export function throwCountRequired(junior = false): number {
  return junior ? JUNIOR_THROW_COUNT_REQUIRED : THROW_COUNT_REQUIRED;
}

/** 適用規則に応じた投げ上げの上限回数。一般は上限なし（null）。 */
export function throwCountMax(junior = false): number | null {
  return junior ? JUNIOR_THROW_COUNT_MAX : null;
}
