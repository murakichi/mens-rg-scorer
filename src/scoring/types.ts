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
  /** MOTION_OPTIONS の id */
  motionId: string;
  /** シェネなど `hasHandsOption` の動作で、手を上げて実施したか */
  hands?: boolean;
  /** 連続で実施した回数（未指定は1回）。動作数は 回数分だけ加算される。 */
  count?: number;
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
  /**
   * 直前までのシリーズと構成が一致していても「実際は別内容」とユーザーが宣言した場合 true。
   * シェネの腕の使い方や動作の内訳など、入力項目に現れない差異を手動で救済するためのフラグ。
   */
  notDuplicate?: boolean;
  items: Item[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  difficulty: Difficulty;
  isSalto: boolean;
  /**
   * 宙返りの連続に含まれた場合のみ宙返りとして扱う技（きりもみ・きりもみ転回）。
   * 採点規則集 P51 3.6.2.4 の宙返りの連続についての注釈（Q&A Q7）。
   */
  saltoOnlyInChain?: boolean;
  /** つなぎ技として宙返り間に挟めるA難度技か */
  isConnectA?: boolean;
  /** 2回宙返り系か（ジュニア適用規則では禁止のため選択肢に出さない） */
  isDoubleSalto?: boolean;
}

export interface HandMotion {
  id: string;
  name: string;
  motions: number;
  verticalThree?: boolean;
  /** 縦回転の徒手か（3動作分そろうと縦3動作＝E難度になる） */
  vertical?: boolean;
  /** 「手あり」チェックを出す動作か（シェネ。手の有無で別の技として扱う） */
  hasHandsOption?: boolean;
  /**
   * 選択肢には出さないが、保存済みデータのために解決だけできる旧項目。
   * 具体的な技（回転系）が揃ったため、汎用の「n動作」は選択肢から外した。
   */
  legacy?: boolean;
}

/** analyzeSeries が items を分類して生成する単位（タンブリング塊 or 投げ） */
export interface Unit {
  type: "tumbling" | "throw";
  isThrow: boolean;
  /** このユニットに含まれる投げ上げの回数（タンブリング塊・ロープ跳びは0） */
  throwCount: number;
  skillThrow: boolean;
  /** 投げ単位かつ技を含む＝投げタン */
  isThrowTumbling?: boolean;
  /** ロープ跳びから生成した徒手系ユニット（実際の投げ受けではない） */
  fromRopeJump?: boolean;
  /**
   * 難度の内容を表す正規化キー。§3.4.4「全く同じ技は難度として数えない」の判定に使う。
   * 技術タグ（視野外・手以外など）は難度の内容ではないため含めない。
   */
  signature: string;
  /**
   * もう一方の内容キー。手あり／手なしのシェネが混在した場合、どちらの内容とも
   * 同じ技として扱うため2つ持つ（Q&A Q21）。
   */
  signatureAlt?: string;
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
  /** ジュニア適用規則（§10 変更規則1）で採点するか。未指定は false 扱い。 */
  junior?: boolean;
  series: Series[];
}
