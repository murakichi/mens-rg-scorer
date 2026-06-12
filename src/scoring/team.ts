// =====================================================================
// 団体（5人）モードのデータモデルと採点ロジック（純粋関数）
//
// 個人モードと共通の定義テーブル（SKILL_LIST / HAND_MOTIONS / DIFF_* ）は
// constants.ts を再利用する。団体は「5人 × 複数スロット」のグリッドで、
// 横方向に連続する非空セルを1つの塊として扱う。
// =====================================================================

import { DIFF_VALUE, VALUE_DIFF, MAX_DIFF, DIFF_SCORE, AE_FULL, skillDef } from "./constants";
import type { Difficulty } from "./types";

export const NUM_PLAYERS = 5;
export const NUM_SERIES = 3;

export type CellType = "empty" | "skill" | "motion";
export interface Cell {
  type: CellType;
  skillId?: string;
  motionId?: string;
}

export type SeriesMode = "normal" | "allTogether";
export interface TeamSeries {
  mode: SeriesMode;
  slots: number;
  /** 選手レーン × スロットのセル。同時実施(allTogether)では1レーンのみ。 */
  lanes: Cell[][];
  hasCross: boolean;
  crossGroups: unknown[];
  hasUnion: boolean;
}
export interface TeamState {
  series: TeamSeries[];
}

/** 横方向に連続する非空セルの塊 */
export interface Chunk {
  lane: number;
  startSlot: number;
  endSlot: number;
  cells: (Cell & { slot: number })[];
  skillIds: string[];
  motionIds: string[];
  diff: Difficulty | null;
  hasMotion: boolean;
  hasSkill: boolean;
}

export interface TeamSeriesAnalysis {
  lanes: Chunk[][];
  seriesDiff: Difficulty | null;
  cellToChunk: Record<string, Chunk & { ci: number }>;
}

export interface TeamRequiredCheck {
  key: string;
  label: string;
  passed: boolean;
}

export interface TeamScoreResult {
  analysis: TeamSeriesAnalysis[];
  emptyColumnWarnings: number[][];
  required: TeamRequiredCheck[];
  missing: TeamRequiredCheck[];
  dScore: number;
  aDeduction: number;
  aScore: number;
  executionDeduction: number;
  eScore: number;
  grandTotal: number;
}

// ---- ファクトリ ----
export const emptyCell = (): Cell => ({ type: "empty" });
export const emptyLane = (slots: number): Cell[] => Array.from({ length: slots }, emptyCell);

export const emptySeries = (slots = 4): TeamSeries => ({
  mode: "normal",
  slots,
  lanes: Array.from({ length: NUM_PLAYERS }, () => emptyLane(slots)),
  hasCross: false,
  crossGroups: [],
  hasUnion: false,
});

export const initialTeamState = (): TeamState => ({
  series: Array.from({ length: NUM_SERIES }, () => emptySeries(3)),
});

/** 団体の塊難度：個人と異なり投げ加点(+1)はない */
function calcChunkDifficulty(skillIds: string[]): Difficulty | null {
  const diffs = skillIds
    .map((id) => skillDef(id)?.difficulty)
    .filter((d): d is Difficulty => !!d && d !== "A");
  if (diffs.length === 0) return null;
  let v = DIFF_VALUE[diffs[0]];
  for (let i = 1; i < diffs.length; i++) v += DIFF_VALUE[diffs[i]] - 1;
  return VALUE_DIFF[Math.min(v, MAX_DIFF)];
}

function analyzeTeamSeries(ser: TeamSeries): TeamSeriesAnalysis {
  const lanes: Chunk[][] = ser.lanes.map((lane, laneIdx) => {
    const chunks: Chunk[] = [];
    let buf: Chunk | null = null;
    const flush = () => {
      if (buf) chunks.push(buf);
      buf = null;
    };
    lane.forEach((cell, slot) => {
      if (cell.type === "empty") {
        flush();
        return;
      }
      if (!buf) {
        buf = {
          lane: laneIdx,
          startSlot: slot,
          endSlot: slot,
          cells: [],
          skillIds: [],
          motionIds: [],
          diff: null,
          hasMotion: false,
          hasSkill: false,
        };
      }
      buf.endSlot = slot;
      buf.cells.push({ slot, ...cell });
    });
    flush();
    chunks.forEach((c) => {
      const skillIds = c.cells.filter((x) => x.type === "skill" && x.skillId).map((x) => x.skillId!);
      c.skillIds = skillIds;
      c.motionIds = c.cells.filter((x) => x.type === "motion" && x.motionId).map((x) => x.motionId!);
      c.diff = skillIds.length ? calcChunkDifficulty(skillIds) : null;
      c.hasMotion = c.motionIds.length > 0;
      c.hasSkill = skillIds.length > 0;
    });
    return chunks;
  });

  let max = 0;
  lanes.forEach((chunks) =>
    chunks.forEach((c) => {
      if (c.diff) max = Math.max(max, DIFF_VALUE[c.diff]);
    }),
  );
  const seriesDiff = max > 0 ? VALUE_DIFF[max] : null;

  const cellToChunk: Record<string, Chunk & { ci: number }> = {};
  lanes.forEach((chunks, laneIdx) =>
    chunks.forEach((c, ci) => {
      for (let s = c.startSlot; s <= c.endSlot; s++) cellToChunk[`${laneIdx}-${s}`] = { ci, ...c };
    }),
  );
  return { lanes, seriesDiff, cellToChunk };
}

export function computeTeamScore(team: TeamState): TeamScoreResult {
  const analysis = team.series.map(analyzeTeamSeries);

  const totalCrosses = team.series.reduce(
    (s, ser) => s + (ser.crossGroups?.length || 0) + (ser.hasCross ? 1 : 0),
    0,
  );
  const hasAnyUnion = team.series.some((ser) => ser.hasUnion);
  const hasAnyAllTogether = team.series.some((ser) => ser.mode === "allTogether");
  const allLanesFilled = team.series.every((ser) =>
    ser.lanes.every((lane) => lane.some((cell) => cell.type !== "empty")),
  );

  const emptyColumnWarnings = team.series.map((ser) => {
    if (ser.mode === "allTogether") return [];
    const warns: number[] = [];
    for (let s = 0; s < ser.slots; s++) {
      if (ser.lanes.every((lane) => lane[s].type === "empty")) warns.push(s);
    }
    return warns;
  });

  const motionChunkCount = analysis.reduce(
    (s, a) => s + a.lanes.reduce((ss, chunks) => ss + chunks.filter((c) => c.hasMotion && !c.hasSkill).length, 0),
    0,
  );

  const required: TeamRequiredCheck[] = [
    { key: "cross", label: "交差を1回以上実施", passed: totalCrosses >= 1 },
    { key: "union", label: "組技を1回以上実施", passed: hasAnyUnion },
    { key: "allTog", label: "全員同時実施を1回以上", passed: hasAnyAllTogether },
    { key: "allLanes", label: "各シリーズで全レーンに塊（通常は5人全員）", passed: allLanesFilled },
    { key: "motion3", label: "徒手塊を3つ以上", passed: motionChunkCount >= 3 },
  ];
  const missing = required.filter((r) => !r.passed);

  const dScore = analysis.reduce((s, a) => s + (a.seriesDiff ? DIFF_SCORE[a.seriesDiff] : 0), 0);
  const aDeduction = missing.length * 0.3; // 暫定：要件不足を一律 -0.3/件
  const executionDeduction = 0; // 後で各シリーズに入力欄を追加
  const aScore = Math.max(0, AE_FULL - aDeduction);
  const eScore = Math.max(0, AE_FULL - executionDeduction);
  const grandTotal = dScore + aScore + eScore;

  return {
    analysis,
    emptyColumnWarnings,
    required,
    missing,
    dScore,
    aDeduction,
    aScore,
    executionDeduction,
    eScore,
    grandTotal,
  };
}
