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
  Posture,
  Skill,
  TwistParams,
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
/** 団体のジュニアのみ、1シリーズあたりの実施減点(E)の上限（個人は上限なし）。 */
export const JUNIOR_SERIES_EXECUTION_MAX = 1.0;
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
// 必須要素チェックのうち、他に固有の減点が無い項目（投げタン・つなぎ技・タンブリング本数）の欠如
export const MISSING_ELEMENT_DEDUCTION = 0.3;
export const VIOLATION_DEDUCTION = 0.3; // 開始/終了/音楽違反・徒手系基礎要素群欠如（各）

/**
 * §3.2 手具別の必須要素のうち「手具操作」要素のチェック項目。
 * 3回以上の投げ上げは投げ回数の判定と重複するため除外（不足時は THROW_COUNT_DEDUCTION）。
 * 未実施の項目は §3.5.6.3 により1つにつき −0.30。
 *
 * `auto` が付いた項目はシリーズ入力から自動判定し、手動チェックの対象外にする。
 * - `rightThrow`：左手投げ・手以外の投げ以外の投げ（＝通常の右投げ右受け）が1回以上あるか。
 * - `leftThrow` / `twoThrow`：左手投げ／二つ同時投げ（投げアイテムの `reqTypes`）が1回以上あるか。
 * - `throwTumbling`：転回系の投げ受け＝投げタンが1本以上あるか。
 * - `ropeTriple` / `ropeMoving` / `ropeFront` / `ropeBack`：ロープ跳びの入力から判定する
 *   3重跳び／6m以上移動の3回以上連続跳び／その場前回し跳び2回以上／その場後ろ回し跳び2回以上。
 */
export type RequiredElementAuto =
  | "rightThrow"
  | "leftThrow"
  | "twoThrow"
  | "throwTumbling"
  | "ropeTriple"
  | "ropeMoving"
  | "ropeFront"
  | "ropeBack";

export const APPARATUS_REQUIRED_ELEMENTS: Record<
  ApparatusKey,
  { id: string; name: string; auto?: RequiredElementAuto }[]
> = {
  stick: [
    { id: "stick_left", name: "左投げ左受け1回以上", auto: "leftThrow" },
    { id: "stick_right", name: "右投げ右受け1回以上", auto: "rightThrow" },
    { id: "stick_rotthrow", name: "転回系の投げ受け", auto: "throwTumbling" },
    { id: "stick_roll", name: "1m以上のころがし" },
    { id: "stick_propeller", name: "プロペラ回旋2回以上" },
  ],
  ring: [
    { id: "ring_twothrow", name: "2つ同時投げ", auto: "twoThrow" },
    { id: "ring_rotthrow", name: "転回系の投げ受け", auto: "throwTumbling" },
    { id: "ring_roll", name: "1m以上のころがし" },
    { id: "ring_turn", name: "まわし2回以上" },
  ],
  rope: [
    { id: "rope_rotthrow", name: "転回系の投げ受け", auto: "throwTumbling" },
    { id: "rope_triple", name: "3重跳び", auto: "ropeTriple" },
    { id: "rope_moving", name: "6m以上移動の3回以上連続跳び", auto: "ropeMoving" },
    { id: "rope_front", name: "その場前回し跳び2回以上連続", auto: "ropeFront" },
    { id: "rope_back", name: "その場後ろ回し跳び2回以上連続", auto: "ropeBack" },
  ],
  clubs: [
    { id: "clubs_twothrow", name: "2つ同時投げ", auto: "twoThrow" },
    { id: "clubs_rotthrow", name: "転回系の投げ受け", auto: "throwTumbling" },
    { id: "clubs_roll", name: "50cm以上のころがし" },
    { id: "clubs_propeller", name: "プロペラ回旋2回以上" },
  ],
};

/** §3.5.6.3 審判判断による違反・欠如（各 −0.30）。実施＝該当あり。 */
/**
 * §3.5.6.4 芸術と多様性（A）の欠点テーブル。審判の主観評価なので手入力する。
 * `max` はその項目の配点上限、`step` は刻み。`note` は規則の減点幅。
 * 「投げ受けの操作」は投げ方・受け方の種類不足として自動判定するのでここには含めない。
 */
export interface ArtDeductionItem {
  id: string;
  group: string;
  name: string;
  max: number;
  note: string;
}
export const ART_DEDUCTION_STEP = 0.1;
export const ART_DEDUCTION_ITEMS: ArtDeductionItem[] = [
  { id: "handVariety", group: "多様性と技術価値", name: "徒手系の種類・組み合わせの多様性", max: 1.0, note: "0.1 / 0.2" },
  { id: "tumVariety", group: "多様性と技術価値", name: "転回系の種類・組み合わせの多様性", max: 0.5, note: "0.1 / 0.2" },
  { id: "appVariety", group: "多様性と技術価値", name: "さまざまな操作", max: 1.0, note: "0.1 / 0.2" },
  { id: "appInTumbling", group: "手具操作の多様性", name: "転回中の操作", max: 0.5, note: "0〜0.4" },
  { id: "rhythm", group: "芸術性と技術価値", name: "リズム変化・ダイナミズムによる表現", max: 0.5, note: "0.1 / 0.2" },
  { id: "space", group: "芸術性と技術価値", name: "空間使用による表現", max: 0.5, note: "0.1 / 0.2" },
  { id: "originality", group: "芸術性と技術価値", name: "独創性の高い内容と表現", max: 0.5, note: "0.1 / 0.2" },
  { id: "handRatio", group: "その他の技術的価値", name: "徒手の割合", max: 0.5, note: "0〜0.5" },
  { id: "volume", group: "その他の技術的価値", name: "運動量", max: 0.5, note: "0.1 / 0.2" },
];

export function artDeductionItem(id: string): ArtDeductionItem | undefined {
  return ART_DEDUCTION_ITEMS.find((x) => x.id === id);
}

/** 欠点テーブル1項目の減点を 0〜上限 に丸める（未知のidは0） */
export function clampArtDeduction(id: string, value: unknown): number {
  const item = artDeductionItem(id);
  if (!item) return 0;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.round(v * 10) / 10, item.max);
}

export const VIOLATION_OPTIONS = [
  { id: "handBasic", name: "徒手系基礎要素1群が全くない" },
  { id: "start", name: "演技の開始違反" },
  { id: "end", name: "演技の終了違反" },
  { id: "music", name: "伴奏音楽の違反（リズムに欠け演技を妨害）" },
];

/**
 * §3.6.1 徒手系難度表。団体の徒手はこの表から選ぶ（個人の「投げ受けの間の動作数」とは別物）。
 * `team` は団体（5名実施）の難度、`solo` は個人の難度。
 */
export type HandElementGroup = "jump" | "balance" | "handstand" | "flex";
export interface HandElement {
  id: string;
  group: HandElementGroup;
  name: string;
  solo: Difficulty;
  team: Difficulty;
}
export const HAND_ELEMENT_GROUPS: { id: HandElementGroup; name: string }[] = [
  { id: "jump", name: "跳躍" },
  { id: "balance", name: "バランス（静止2秒）" },
  { id: "handstand", name: "倒立（静止2秒）" },
  { id: "flex", name: "柔軟（静止2秒）" },
];
export const HAND_ELEMENTS: HandElement[] = [
  // 1. 跳躍
  { id: "j1", group: "jump", name: "閉脚から大の字とび", solo: "A", team: "A" },
  { id: "j2", group: "jump", name: "とびあがって1回以上のひねり", solo: "A", team: "B" },
  { id: "j3", group: "jump", name: "とびあがって2回以上のひねり", solo: "B", team: "C" },
  { id: "j4", group: "jump", name: "前後開脚交叉とび", solo: "A", team: "B" },
  { id: "j5", group: "jump", name: "開脚屈身とび", solo: "A", team: "B" },
  { id: "j6", group: "jump", name: "かかえこみとび", solo: "A", team: "A" },
  { id: "j7", group: "jump", name: "閉脚屈身とび", solo: "A", team: "B" },
  { id: "j8", group: "jump", name: "後に振り上げて反り身の跳躍", solo: "A", team: "B" },
  { id: "j9", group: "jump", name: "後に振り上げて反り身の跳躍（頭と足がつく）", solo: "B", team: "C" },
  { id: "j10", group: "jump", name: "前・後・側で足打ちを伴う跳躍", solo: "A", team: "B" },
  { id: "j11", group: "jump", name: "バタフライ", solo: "A", team: "B" },
  { id: "j12", group: "jump", name: "バタフライ1回ひねり", solo: "B", team: "C" },
  // 2. バランス
  { id: "b1", group: "balance", name: "正面水平立ち", solo: "A", team: "B" },
  { id: "b2", group: "balance", name: "側面水平立ち", solo: "A", team: "B" },
  { id: "b3", group: "balance", name: "足を保持した片足平均立ち", solo: "A", team: "B" },
  { id: "b4", group: "balance", name: "開脚片足平均立ち（頭と足が触れる）", solo: "C", team: "C" },
  { id: "b5", group: "balance", name: "背面水平立ち", solo: "B", team: "C" },
  { id: "b6", group: "balance", name: "足を保持した180°開脚片足平均立ち", solo: "B", team: "C" },
  { id: "b7", group: "balance", name: "足を保持しない135°以上の開脚片足平均立ち", solo: "B", team: "C" },
  { id: "b8", group: "balance", name: "足を保持しない180°以上の開脚片足平均立ち", solo: "C", team: "D" },
  // 3. 倒立
  { id: "h1", group: "handstand", name: "閉脚（開脚）倒立", solo: "A", team: "B" },
  { id: "h2", group: "handstand", name: "前後開脚倒立（片足屈膝を含む）", solo: "A", team: "B" },
  { id: "h3", group: "handstand", name: "前とび倒立", solo: "B", team: "C" },
  { id: "h4", group: "handstand", name: "十字倒立", solo: "C", team: "D" },
  { id: "h5", group: "handstand", name: "片手倒立", solo: "C", team: "D" },
  { id: "h6", group: "handstand", name: "後転倒立", solo: "C", team: "D" },
  { id: "h7", group: "handstand", name: "後方ブリッヂから倒立", solo: "C", team: "D" },
  { id: "h8", group: "handstand", name: "伸腕屈身力倒立（シンピ閉脚）", solo: "C", team: "D" },
  { id: "h8b", group: "handstand", name: "伸腕屈身力倒立（シンピ開脚）", solo: "B", team: "C" },
  { id: "h9", group: "handstand", name: "開脚前挙支持から伸腕屈伸力倒立", solo: "C", team: "D" },
  // 4. 柔軟
  { id: "f1", group: "flex", name: "長座になり体前屈（頭が足につく）", solo: "A", team: "B" },
  { id: "f2", group: "flex", name: "左右開脚座で体前屈（胸が床面につく）", solo: "A", team: "B" },
  { id: "f3", group: "flex", name: "左右開脚座、又は前後開脚座（一直線・180度）", solo: "A", team: "B" },
  { id: "f4", group: "flex", name: "左右開脚座（一直線・180度）前屈", solo: "B", team: "C" },
  { id: "f5", group: "flex", name: "前後開脚座（一直線・180度）前屈", solo: "A", team: "B" },
  { id: "f6", group: "flex", name: "左右／前後開脚座（180度未満）仰臥位", solo: "A", team: "B" },
  { id: "f7", group: "flex", name: "左右／前後開脚座（一直線・180度）仰臥位", solo: "B", team: "C" },
];

export function handElementDef(id: string): HandElement | undefined {
  return HAND_ELEMENTS.find((x) => x.id === id);
}
/** 団体での徒手系難度（表の団体列） */
export function teamHandDifficulty(id: string): Difficulty | undefined {
  return handElementDef(id)?.team;
}

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
  { id: "b_backsalto", name: "後方宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true, twist: { base: "back", twist: 0, posture: "tuck" } },
  { id: "b_backtuck", name: "後方屈伸宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true, twist: { base: "back", twist: 0, posture: "pike" } },
  { id: "b_backlayout", name: "後方伸身宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true, twist: { base: "back", twist: 0, posture: "layout" } },
  { id: "b_backhalf", name: "後方宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true, twist: { base: "back", twist: 0.5, posture: "tuck" } },
  { id: "b_backlayhalf", name: "後方伸身宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true, twist: { base: "back", twist: 0.5, posture: "layout" } },
  { id: "b_tempo", name: "テンポ宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_divefront", name: "ダイビング前宙", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_front", name: "前宙", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true, twist: { base: "front", twist: 0, posture: "tuck" } },
  { id: "b_fronthalf", name: "前宙半ひねり", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true, twist: { base: "front", twist: 0.5, posture: "tuck" } },
  { id: "b_tenchu", name: "転宙", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "b_kirimomi", name: "きりもみ", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true, saltoOnlyInChain: true },
  { id: "c_front1full", name: "前方宙返り1回ひねり", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true, twist: { base: "front", twist: 1, posture: "tuck" } },
  { id: "c_kirimomiten", name: "きりもみ転回", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true, saltoOnlyInChain: true },
  { id: "c_back15", name: "後方宙返り1回半ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true, twist: { base: "back", twist: 1.5, posture: "tuck" } },
  { id: "c_backlay15", name: "後方伸身宙返り1回半ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true, twist: { base: "back", twist: 1.5, posture: "layout" } },
  { id: "c_back1full", name: "後方宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true, twist: { base: "back", twist: 1, posture: "tuck" } },
  { id: "c_backtuck1full", name: "後方屈伸宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true, twist: { base: "back", twist: 1, posture: "pike" } },
  { id: "c_backlay1full", name: "後方伸身宙返り1回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true, twist: { base: "back", twist: 1, posture: "layout" } },
  { id: "c_tempotwist", name: "テンポひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "d_frontlay1", name: "伸身前宙1回ひねり", category: CATEGORY.FORWARD, difficulty: "D", isSalto: true, twist: { base: "front", twist: 1, posture: "layout" } },
  { id: "e_frontlay2", name: "伸身前宙2回ひねり", category: CATEGORY.FORWARD, difficulty: "E", isSalto: true, twist: { base: "front", twist: 2, posture: "layout" } },
  { id: "d_back2twist", name: "後方宙返り2回ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true, twist: { base: "back", twist: 2, posture: "tuck" } },
  { id: "d_backlay25", name: "後方伸身宙返り2回半ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true, twist: { base: "back", twist: 2.5, posture: "layout" } },
  { id: "e_backlay3twist", name: "後方伸身宙返り3回ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, twist: { base: "back", twist: 3, posture: "layout" } },
  { id: "e_backlay35twist", name: "後方伸身宙返り3回半ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, twist: { base: "back", twist: 3.5, posture: "layout" } },
  { id: "d_doubleback", name: "後方2回宙返り", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true, isDoubleSalto: true },
  { id: "e_doublelay", name: "後方伸身2回宙返り", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, isDoubleSalto: true },
  { id: "e_divedouble", name: "ダイビングダブル", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, isDoubleSalto: true },
  { id: "e_moonsault", name: "後方2回宙返り1回ひねり（ムーンサルト）", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, isDoubleSalto: true },
  { id: "e_rudolph", name: "後方2回宙返り2回ひねり（ルドルフ）", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true, isDoubleSalto: true },
];

// ---- ひねり・姿勢で組み立てる宙返り（§3.6.2 の表を素直に表現する） ----

/** ひねり回数の選択肢（0.5 が半ひねり） */
export const TWIST_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
/** 姿勢の選択肢 */
export const POSTURE_OPTIONS: { id: Posture; name: string }[] = [
  { id: "tuck", name: "抱え込み" },
  { id: "pike", name: "屈伸" },
  { id: "layout", name: "伸身" },
];
/** 前方系・後方系のどちらを組み立てるか */
export const TWIST_BASES: { id: TwistParams["base"]; name: string; category: string }[] = [
  { id: "back", name: "後方宙返り", category: CATEGORY.BACKWARD },
  { id: "front", name: "前宙", category: CATEGORY.FORWARD },
];

/** 組み立てた宙返りのidの接頭辞（SKILL_LIST に無い組み合わせだけこの形式になる） */
export const TWIST_ID_PREFIX = "tw:";

export const twistLabel = (twist: number): string => {
  if (twist === 0) return "なし";
  if (twist === 0.5) return "半ひねり";
  const full = Math.floor(twist);
  return `${full}回${twist % 1 ? "半" : ""}ひねり`;
};

/**
 * ひねり回数と姿勢から基礎難度を求める（§3.6.2）。
 * 後方系は姿勢によらずひねり回数だけで決まる（#7・#12〜#17）。
 * 前方系は伸身が1段階上（#7/#8/#11/#12〜#14）。
 */
export function twistDifficulty({ base, twist, posture }: TwistParams): Difficulty {
  const steps = [DIFF_VALUE.B, DIFF_VALUE.B, DIFF_VALUE.C, DIFF_VALUE.C, DIFF_VALUE.D, DIFF_VALUE.D, DIFF_VALUE.E];
  const i = Math.min(Math.max(Math.round(twist * 2), 0), steps.length - 1);
  let v = steps[i];
  if (base === "front" && posture === "layout") v += 1;
  return VALUE_DIFF[Math.min(v, MAX_DIFF)];
}

/** 組み立てた宙返りの名前（例：後方伸身宙返り1回半ひねり／伸身前宙1回ひねり） */
export function twistName({ base, twist, posture }: TwistParams): string {
  const tw = twist === 0 ? "" : twistLabel(twist);
  if (base === "back") {
    const body = posture === "pike" ? "後方屈伸宙返り" : posture === "layout" ? "後方伸身宙返り" : "後方宙返り";
    return body + tw;
  }
  const body = posture === "pike" ? "屈伸前宙" : posture === "layout" ? "伸身前宙" : "前宙";
  return body + tw;
}

const sameTwist = (a: TwistParams, b: TwistParams) =>
  a.base === b.base && a.twist === b.twist && a.posture === b.posture;

/**
 * ひねり・姿勢から技idを作る。`SKILL_LIST` に同じ内容の技があればそのidを返し、
 * 無い組み合わせのときだけ `tw:` 形式の合成idにする（重複判定が食い違わないように）。
 */
export function buildTwistSkillId(params: TwistParams): string {
  const known = SKILL_LIST.find((sk) => sk.twist && sameTwist(sk.twist, params));
  if (known) return known.id;
  return `${TWIST_ID_PREFIX}${params.base}:${params.twist}:${params.posture}`;
}

/** 技idをひねり・姿勢に戻す（組み立てで表せない技は null） */
export function parseTwistSkillId(id: string): TwistParams | null {
  if (id.startsWith(TWIST_ID_PREFIX)) {
    const [base, twist, posture] = id.slice(TWIST_ID_PREFIX.length).split(":");
    const t = Number(twist);
    if ((base === "back" || base === "front") && Number.isFinite(t) && POSTURE_OPTIONS.some((p) => p.id === posture)) {
      return { base, twist: t, posture: posture as Posture };
    }
    return null;
  }
  return SKILL_LIST.find((x) => x.id === id)?.twist ?? null;
}

export function skillDef(id: string): Skill | undefined {
  const found = SKILL_LIST.find((x) => x.id === id);
  if (found) return found;
  // SKILL_LIST に無いひねりの組み合わせは、その場で技として組み立てる
  const params = id.startsWith(TWIST_ID_PREFIX) ? parseTwistSkillId(id) : null;
  if (!params) return undefined;
  return {
    id,
    name: twistName(params),
    category: params.base === "back" ? CATEGORY.BACKWARD : CATEGORY.FORWARD,
    difficulty: twistDifficulty(params),
    isSalto: true,
    twist: params,
  };
}

/** 適用規則で実施できる技か。ジュニアは2回宙返り系が禁止（§10 変更規則1）。 */
export function skillAllowed(id: string, junior = false): boolean {
  return !(junior && skillDef(id)?.isDoubleSalto);
}

/** ロンダートの技id（後方の宙返りに入るときに自動で補う） */
export const ROUNDOFF_SKILL_ID = "a_roundoff";

/** 後方に入る転回（ロンダート・バク転）。この直後は後方系を続けて実施する。 */
export const BACKWARD_ENTRY_SKILLS: string[] = [ROUNDOFF_SKILL_ID, "a_flicflac"];

/** 後方系の宙返りか（ロンダート等の後でしか実施できない技） */
export function isBackwardSalto(id: string): boolean {
  const s = skillDef(id);
  return !!s && !!s.isSalto && s.category === CATEGORY.BACKWARD;
}

/**
 * 後方の宙返りでも前向きに降りる技（続けて後方系に入るにはロンダートを挟む）。
 * 半ひねり系（n回半ひねり）は `twist` から判定するので、ここに挙げるのは
 * ひねりで表せないものだけ。
 */
export const FORWARD_LANDING_BACK_SALTOS: string[] = ["b_divefront"];

/** 後方系か（バク転・後方の宙返り） */
export function isBackwardSkill(id: string): boolean {
  return skillDef(id)?.category === CATEGORY.BACKWARD;
}

/**
 * その技の直後に、そのまま後方系へ入れるか（後ろ向きのまま降りるか）。
 *  - ロンダート・バク転・ひねりなし／整数ひねりの後方宙返り → そのまま続けられる
 *  - 前方系、n回半ひねり、ダイビング前宙 → 前向きに降りるのでロンダートを挟む
 */
export function leadsBackward(prevSkillId: string | undefined): boolean {
  if (!prevSkillId) return false;
  if (BACKWARD_ENTRY_SKILLS.includes(prevSkillId)) return true;
  if (!isBackwardSalto(prevSkillId)) return false;
  if (FORWARD_LANDING_BACK_SALTOS.includes(prevSkillId)) return false;
  const p = parseTwistSkillId(prevSkillId);
  return !p || p.twist % 1 === 0;
}

/** その位置で選べる系統 */
export interface SkillFlow {
  /** 後方系の宙返りを選べるか */
  backward: boolean;
  /** 前方系を選べるか */
  forward: boolean;
}

/** 制限なし（テストや位置が分からない場合の既定） */
export const ANY_SKILL_FLOW: SkillFlow = { backward: true, forward: true };

/**
 * 直前の技から、その位置で選べる系統を決める。
 *  - 後方系はどこでも選べる。そのまま入れない位置（シリーズの頭、前方系や
 *    半ひねり系の後）で選んだときは、手前にロンダートを補う（needsRoundoffBefore）
 *  - ロンダート・バク転など後ろ向きに入った後に前方系を実施することはないので、
 *    そこでだけ前方系を出さない
 */
export function skillFlowAfter(prevSkillId: string | undefined): SkillFlow {
  return { backward: true, forward: !leadsBackward(prevSkillId) };
}

/**
 * 適用規則に応じたタンブリング技の選択肢。
 * `flow` を渡すと、その位置で実施しない系統（ロンダート前の後方宙返り、
 * ロンダート後の前方系）を選択肢から外す。
 */
export function skillOptions(junior = false, flow: SkillFlow = ANY_SKILL_FLOW): Skill[] {
  return SKILL_LIST.filter((s) => {
    if (!skillAllowed(s.id, junior)) return false;
    if (!flow.backward && isBackwardSalto(s.id)) return false;
    if (!flow.forward && s.category === CATEGORY.FORWARD) return false;
    return true;
  });
}

/** タンブリング技のプルダウンをまとめる系統の表示順 */
export const SKILL_CATEGORY_ORDER: string[] = [CATEGORY.FORWARD, CATEGORY.SIDE, CATEGORY.BACKWARD, CATEGORY.OTHER];

/** タンブリング技の選択肢を系統（前方系・側方系・後方系）ごとにまとめる。空の系統は返さない。 */
export function skillOptionGroups(
  junior = false,
  flow: SkillFlow = ANY_SKILL_FLOW,
): { name: string; skills: Skill[] }[] {
  const opts = skillOptions(junior, flow);
  const groups = SKILL_CATEGORY_ORDER.map((name) => ({ name, skills: opts.filter((s) => s.category === name) }));
  // 表示順に無いカテゴリが増えても落とさない
  const rest = opts.filter((s) => !SKILL_CATEGORY_ORDER.includes(s.category));
  if (rest.length > 0) groups.push({ name: CATEGORY.OTHER, skills: rest });
  return groups.filter((g) => g.skills.length > 0);
}

/**
 * 徒手として扱うことがある転回技（A難度技ときりもみ系）。徒手動作の選択肢にも出す。
 * 動作数は難度をそのまま徒手系難度に読み替えた値（A/きりもみ＝1動作、きりもみ転回＝2動作）。
 */
export const MOTION_SKILLS: Skill[] = SKILL_LIST.filter((s) => !s.isSalto || s.saltoOnlyInChain);

/**
 * 手ありシェネの種類。`other`（その他）はいくつ実施しても重複と見なさない。
 */
export const HANDS_TYPES = [
  { id: "one", name: "片手上げ" },
  { id: "both", name: "両手上げ" },
  { id: "spin", name: "回旋" },
  { id: "other", name: "その他" },
] as const;
export const DEFAULT_HANDS_TYPE = "one";
export const HANDS_TYPE_OTHER = "other";

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
export const MOTION_OPTIONS: { id: string; name: string; hasHandsOption?: boolean; vertical?: boolean }[] = [
  ...HAND_MOTIONS.filter((m) => !m.legacy).map((m) => ({
    id: m.id,
    name: m.name,
    hasHandsOption: m.hasHandsOption,
    vertical: !!m.vertical,
  })),
  // 徒手扱いの転回技はすべて縦の一回転（motionDef と同じ扱い）
  ...MOTION_SKILLS.map((s) => ({ id: s.id, name: s.name, vertical: true })),
];

/** 徒手動作のプルダウンをまとめる回転軸（表示順） */
export const MOTION_AXIS_GROUPS = [
  { id: "vertical", name: "縦回転" },
  { id: "horizontal", name: "横回転" },
] as const;

/** 徒手動作の選択肢を縦回転・横回転ごとにまとめる（各群の中の並び順は motionOptionsFor と同じ） */
export function motionOptionGroupsFor(prevMotionId?: string): { name: string; options: typeof MOTION_OPTIONS }[] {
  const opts = motionOptionsFor(prevMotionId);
  return MOTION_AXIS_GROUPS.map((g) => ({
    name: g.name,
    options: opts.filter((o) => (g.id === "vertical" ? !!o.vertical : !o.vertical)),
  })).filter((g) => g.options.length > 0);
}

// ---- ジュニア適用規則（変更規則1）----

/**
 * ジュニアで難度認定が変わる転回系（§10 変更規則1-5）。
 * ダイビング前宙・後方宙返り半ひねりは一般ではB難度だが、ジュニアではC難度。
 */
export const JUNIOR_SKILL_DIFFICULTY: Record<string, Difficulty> = {
  b_divefront: "C", // ダイビング前宙
  b_backhalf: "C", // 後方宙返り半ひねり
  b_backlayhalf: "C", // 後方伸身宙返り半ひねり
};

/** 適用規則に応じた転回系の難度。ジュニアは JUNIOR_SKILL_DIFFICULTY で上書きする。 */
export function skillDifficulty(id: string, junior = false): Difficulty | undefined {
  if (junior) {
    const j = JUNIOR_SKILL_DIFFICULTY[id];
    if (j) return j;
    // 組み立てた後方宙返り半ひねりも同じ認定（§10 変更規則1-4：伸身を含む）
    const p = parseTwistSkillId(id);
    if (p && p.base === "back" && p.twist === 0.5) return "C";
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

/**
 * ジュニアで難度認定が変わる連続技（§10 変更規則1-5 の適用）。
 * バク転→後方伸身宙返りは、まとめて1つのC難度として認定する。
 */
export const JUNIOR_SKILL_COMBOS: { ids: string[]; difficulty: Difficulty }[] = [
  { ids: ["a_flicflac", "b_backlayout"], difficulty: "C" }, // バク転→後方伸身宙返り
];

/** skillIds の先頭がジュニアの連続技認定に一致すればその難度と長さを返す。 */
export function juniorComboAt(skillIds: string[], i: number): { difficulty: Difficulty; length: number } | null {
  for (const combo of JUNIOR_SKILL_COMBOS) {
    if (combo.ids.every((id, k) => skillIds[i + k] === id)) {
      return { difficulty: combo.difficulty, length: combo.ids.length };
    }
  }
  return null;
}

/** 適用規則に応じた1シリーズの実施減点(E)の上限（団体のみ）。一般は上限なし（null）。 */
export function seriesExecutionMax(junior = false): number | null {
  return junior ? JUNIOR_SERIES_EXECUTION_MAX : null;
}

/** 1シリーズの実施減点(E)を適用規則の上限で丸める（負値は0）。 */
export function clampSeriesExecution(value: unknown, junior = false): number {
  const v = Math.max(0, Number(value) || 0);
  const max = seriesExecutionMax(junior);
  return max === null ? v : Math.min(v, max);
}
