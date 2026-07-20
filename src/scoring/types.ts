// =====================================================================
// ドメイン型定義
// =====================================================================

export type ApparatusKey = "stick" | "clubs" | "ring" | "rope";
export type Difficulty = "A" | "B" | "C" | "D" | "E";

/** 演技を構成する1アイテム。kind で判別する判別共用体。 */
export type Item =
  | ThrowItem
  | CatchItem
  | SkillItem
  | MotionItem
  | RopeJumpItem;

export interface ThrowItem {
  kind: "throw";
  /** 任意の投げ技術タグ（noview / nonhand / other / useapp） */
  throwTypes?: string[];
  /** 手具固有の必須投げ（lefthand / twothrow など） */
  reqTypes?: string[];
}

export interface CatchItem {
  kind: "catch";
  catchTypes?: string[];
  /** 2つ同時キャッチ */
  catchTwo?: boolean;
}

export interface SkillItem {
  kind: "skill";
  /** SKILL_LIST の id。未選択時は空文字。 */
  skillId: string;
  /** 手具操作を伴うか */
  hasApparatus?: boolean;
  /** この技の最中に投げを行うか */
  isThrow?: boolean;
  /** 技の最中の投げの技術タグ（noview / nonhand / useapp）。isThrow 時のみ有効。 */
  throwTypes?: string[];
}

export interface MotionItem {
  kind: "motion";
  /** HAND_MOTIONS の id */
  motionId: string;
}

export interface RopeJumpItem {
  kind: "ropeJump";
  /** ROPE_JUMPS の id */
  jumpId: string;
  /** 6m以上の移動を伴う跳びか */
  isMoving6m?: boolean;
}

export interface Series {
  /** ユーザーが手入力する実施減点(E) */
  executionDeduction: number;
  items: Item[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  difficulty: Difficulty;
  isSalto: boolean;
  /** つなぎ技として宙返り間に挟めるA難度技か */
  isConnectA?: boolean;
}

export interface HandMotion {
  id: string;
  name: string;
  motions: number;
  verticalThree?: boolean;
}

/** analyzeSeries が items を分類して生成する単位（タンブリング塊 or 投げ） */
export interface Unit {
  type: "tumbling" | "throw";
  isThrow: boolean;
  skillThrow: boolean;
  /** 投げ単位かつ技を含む＝投げタン */
  isThrowTumbling?: boolean;
  skills: { skillId: string; hasApparatus: boolean; isThrow: boolean }[];
  handDiff?: Difficulty | null;
  tumblingDiff?: Difficulty | null;
  finalDiff: Difficulty;
  diffFromHand?: boolean;
  hasApparatus: boolean;
  hasDPlus: boolean;
}

export interface SeriesAnalysis {
  units: Unit[];
  throwCount: number;
}

/** 採点保存フォーマット */
export interface SaveData {
  version: number;
  apparatus: ApparatusKey;
  /** 演技全体の実施減点（シリーズ非依存）。未指定は0扱い。 */
  executionDeduction?: number;
  /** §3.2 手具別必須要素のうち実施した項目のid（APPARATUS_REQUIRED_ELEMENTS）。 */
  apparatusElements?: string[];
  /** §3.5.6.3 該当した違反・欠如のid（VIOLATION_OPTIONS）。 */
  violations?: string[];
  series: Series[];
}
