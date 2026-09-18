// =====================================================================
// ランダム生成の入力と結果（型だけ）
//
// 生成の中身は3つに分かれている：
//  - `generateWeights.ts`：上限・目標値・重み（どれくらい嫌うか／優先するか）
//  - `generateEvaluate.ts`：構成の評価（何を数えて、どう足し引きするか）
//  - `generateSearch.ts`：探索（貪欲法・入れ替え・量の調整・並べ替え）
// 入口は `generate.ts`。
// =====================================================================

import type { ApparatusKey, FutureLevel, Series } from "./types";
import type { SeriesTemplate } from "./templates";
import type { SkillWeightStore } from "./skillWeights";

export interface GenerateOptions {
  apparatus: ApparatusKey;
  junior?: boolean;
  /**
   * 十年後モードの上限難度（"F" / "G"）。採点も自動生成のタンブリングも
   * F・G難度を前提に組む（null・未指定は現行規則）。
   */
  future?: FutureLevel;
  /** Dスコアの下限・上限（未指定＝制限なし） */
  minScore?: number | null;
  maxScore?: number | null;
  /** 試行回数（多いほど良い構成が出やすいが遅くなる） */
  attempts?: number;
  /** シリーズ数の上限（既定 `DEFAULT_MAX_SERIES`） */
  maxSeries?: number;
  /**
   * 自動生成のシリーズにしてよい**割合**（0〜1。既定1＝種類ごとの上限だけ）。
   * シリーズ数の上限（`maxSeries`）に対する本数に換算する（`autoSeriesMax`）。
   * 0 なら自動生成を使わず、登録テンプレートだけで組む。
   */
  autoRatio?: number;
  /**
   * 生成するシリーズの**珍しさ**（0〜100。既定 `DEFAULT_RARITY`＝50）。
   * 候補づくりの抽選（重み・0〜1の確率）にまとめて掛かる：
   * 0＝最も遷移しやすい形だけ、50＝実測どおりの頻度、100＝珍しい形を優先。
   * 評価（点数）は変えないので、**点数が動く形は珍しさを上げても増えにくい**
   * （どの宙返りか・どの受け方かのような点数に中立な選択にそのまま効く）。
   */
  rarity?: number;
  /**
   * ユーザーが設定した**技ごとの倍率**（`skillWeights.ts`。既定から変えた技だけ）。
   * 実測の重みの上に掛かるだけなので、既定値は書き換わらない（リセット＝これを渡さない）。
   * 0 にした技は自動生成に出てこない。
   */
  skillWeights?: SkillWeightStore;
  /**
   * 必須要素を必ず満たすか。未指定なら狙うDスコアで決まる
   * （上限なし、または `REQUIRE_ALL_ELEMENTS_MIN_SCORE` 以上で満たしにいく）。
   * false にすると、不足もA減点として D と天秤にかけるだけになる。
   */
  requireAllElements?: boolean;
  /** 投げタン（転回系の投げ受け）の本数の上限。既定は1本。 */
  maxThrowTumbling?: number;
  /** タンブリングの本数の上限（投げタンを含む）。既定は3本（採用される上限と同じ）。 */
  maxTumblings?: number;
  /** 単発で高難度（D難度以上）な技1つあたりの評価の重み（既定 `HIGH_DIFFICULTY_WEIGHT`）。 */
  highDifficultyWeight?: number;
  /** 自動生成の投げシリーズを候補に加えるか（既定 true） */
  autoThrows?: boolean;
  /** 1つの構成に入れる自動生成の投げの本数の上限。既定は3本。 */
  maxAutoThrows?: number;
  /** 自動生成の投げシリーズの候補数の上限（既定＝全組み合わせ） */
  autoThrowLimit?: number;
  /** 自動生成のタンブリングを候補に加えるか（既定 true） */
  autoTumblings?: boolean;
  /** 1つの構成に入れる自動生成のタンブリングの本数の上限。既定は3本。 */
  maxAutoTumblings?: number;
  /** 自動生成のタンブリングの候補数の上限（既定＝全組み合わせ） */
  autoTumblingLimit?: number;
  /**
   * 自動生成のタンブリングに使ってよい転回技のid。
   * 既定は登録テンプレートで実際に使っている技（テンプレートが無ければ技の一覧すべて）。
   */
  autoTumblingSkills?: string[];
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
}

export interface GenerateResult {
  series: Series[];
  /** 使ったテンプレート（並び順は生成結果と同じ） */
  used: SeriesTemplate[];
  dScore: number;
  aScore: number;
  /** 満たせなかった必須要素のラベル */
  missing: string[];
}
