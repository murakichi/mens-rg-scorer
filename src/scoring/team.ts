// =====================================================================
// 団体（5人）モードのデータモデルと採点ロジック（純粋関数）
//
// 個人モードと共通の定義テーブル（SKILL_LIST / HAND_MOTIONS / DIFF_* ）は
// constants.ts を再利用する。団体は「5人 × 複数スロット」のグリッドで、
// 横方向に連続する非空セルを1つの塊として扱う。
//
// シリーズ難度の決め方（mens-rg-rules.md「団体」章と同期）:
//   seriesValue = max(三人以上が到達した難度, 各交差グループの合計難度)
//   - 各レーン（選手）の最高塊難度を降順に並べ、3番目の値を「三人以上が
//     到達した難度」とする（同時実施シリーズは全員同一なのでレーン0の値）。
//   - 5人が同時に同じ技を実施した塊は難度を一つ上げる。ただし連続塊の途中
//     なら「塊の連続難度」と「その技+1」の高い方を採用する。
//   - 交差グループは選択セルの難度を連続加算（合計 −(段数−1)、上限E）。
//     順序は無関係。徒手段は値1（＝+0で飛んだ転回の難度を採用）。
// =====================================================================

import {
  DIFF_VALUE,
  VALUE_DIFF,
  MAX_DIFF,
  DIFF_SCORE,
  AE_FULL,
  UNION_MAX_VALUE,
  ROT_CHAIN_REQUIRED,
  TEAM_ROTATION_BONUS,
  TEAM_LANDING_BONUS,
  TEAM_CROSS_BONUS,
  TEAM_SAMEDIFF_BONUS,
  skillDef,
} from "./constants";
import type { Difficulty } from "./types";

export const NUM_PLAYERS = 5;
export const NUM_SERIES = 3;

export type CellType = "empty" | "skill" | "motion";
export interface Cell {
  type: CellType;
  skillId?: string;
  motionId?: string;
  /** 塊の最後の技：終末に宙返りからの足裏着地で静止（着ピタ） */
  stuck?: boolean;
}

/** グリッド上のセル参照（交差グループのメンバー） */
export interface CellRef {
  lane: number;
  slot: number;
}

/** 1シリーズ内の独立したグループ（交差／組運動）。グリッドのセルを束ねる。 */
export interface CellGroup {
  id: string;
  cells: CellRef[];
}
/** @deprecated CellGroup に統合 */
export type CrossGroup = CellGroup;

export type SeriesMode = "normal" | "allTogether";
export interface TeamSeries {
  mode: SeriesMode;
  slots: number;
  /** 選手レーン × スロットのセル。同時実施(allTogether)では1レーンのみ。 */
  lanes: Cell[][];
  /** グリッドのセルを選んで作る交差グループ（複数可・独立） */
  crossGroups: CellGroup[];
  /** グリッドのセルを選んで作る組運動グループ（複数可・独立） */
  unionGroups: CellGroup[];
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
  /** 連続加算による塊難度（5人同時の格上げ前） */
  diff: Difficulty | null;
  /** 5人同時の格上げを反映した最終難度 */
  adjDiff: Difficulty | null;
  adjValue: number;
  /** 5人同時実施により格上げされたか */
  bumped: boolean;
  hasMotion: boolean;
  hasSkill: boolean;
}

export interface CrossMember {
  lane: number;
  slot: number;
  value: number;
  label: string;
}
export interface CrossInfo {
  id: string;
  members: CrossMember[];
  diffValue: number;
  diff: Difficulty | null;
}

export interface TeamSeriesAnalysis {
  lanes: Chunk[][];
  /** 各レーンの最高塊難度値（5人同時格上げ反映） */
  laneValues: number[];
  /** 三人以上が到達した難度 */
  threePersonValue: number;
  threePersonDiff: Difficulty | null;
  crosses: CrossInfo[];
  crossMaxValue: number;
  unions: CrossInfo[];
  unionMaxValue: number;
  /** シリーズ最終難度 */
  seriesValue: number;
  seriesDiff: Difficulty | null;
  cellToChunk: Record<string, Chunk & { ci: number }>;
  /** "lane-slot" → 所属する交差グループの番号(1始まり)の配列 */
  cellToCross: Record<string, number[]>;
  /** "lane-slot" → 所属する組運動グループの番号(1始まり)の配列 */
  cellToUnion: Record<string, number[]>;
  /** "lane-slot" → その塊の最後の技セルか（着ピタ入力対象） */
  chunkLastSkill: Record<string, boolean>;
}

export interface TeamBonus {
  rotation: number; // 同じ転回技に関わる加点（最大0.3）
  landing: number; // 着地に関する加点（最大0.2）
  cross: number; // 交差に関する加点（最大0.3）
  sameDiff: number; // 同一難度に関する加点（最大0.2）
  total: number;
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
  seriesDiffScore: number;
  bonus: TeamBonus;
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
  crossGroups: [],
  unionGroups: [],
});

export const initialTeamState = (): TeamState => ({
  series: Array.from({ length: NUM_SERIES }, () => emptySeries(3)),
});

/** 団体の塊難度：個人と異なり投げ加点(+1)はない。A難度は連続加算で無視。 */
function calcChunkDifficulty(skillIds: string[]): Difficulty | null {
  const diffs = skillIds
    .map((id) => skillDef(id)?.difficulty)
    .filter((d): d is Difficulty => !!d && d !== "A");
  if (diffs.length === 0) return null;
  let v = DIFF_VALUE[diffs[0]];
  for (let i = 1; i < diffs.length; i++) v += DIFF_VALUE[diffs[i]] - 1;
  return VALUE_DIFF[Math.min(v, MAX_DIFF)];
}

/** セル単体の難度値（交差の段の値）。技=難度値、徒手=1、空=0。 */
function cellValue(cell: Cell | undefined): number {
  if (!cell || cell.type === "empty") return 0;
  if (cell.type === "skill") return cell.skillId ? DIFF_VALUE[skillDef(cell.skillId)?.difficulty ?? "A"] : 0;
  return 1; // 徒手
}
function cellLabel(cell: Cell): string {
  if (cell.type === "skill") return cell.skillId ? skillDef(cell.skillId)?.name ?? "技" : "技（未選択）";
  return "徒手";
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
          adjDiff: null,
          adjValue: 0,
          bumped: false,
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

  // ---- 5人同時に同じ技を実施したスロットを検出 ----
  const fivePerson = new Set<number>();
  if (ser.mode !== "allTogether") {
    for (let s = 0; s < ser.slots; s++) {
      const c0 = ser.lanes[0]?.[s];
      if (
        c0 &&
        c0.type === "skill" &&
        c0.skillId &&
        ser.lanes.length === NUM_PLAYERS &&
        ser.lanes.every((l) => l[s]?.type === "skill" && l[s]?.skillId === c0.skillId)
      ) {
        fivePerson.add(s);
      }
    }
  }

  // ---- 各塊に5人同時の格上げを反映 ----
  lanes.forEach((chunks) =>
    chunks.forEach((c) => {
      const contVal = c.diff ? DIFF_VALUE[c.diff] : 0;
      let adj = contVal;
      let hadFive = false;
      c.cells.forEach((cell) => {
        if (cell.type !== "skill" || !cell.skillId) return;
        // 同時実施シリーズは常に5人同時扱い。通常は全員同技スロットのみ。
        const isFive = ser.mode === "allTogether" || fivePerson.has(cell.slot);
        if (!isFive) return;
        hadFive = true;
        const cand = Math.min(DIFF_VALUE[skillDef(cell.skillId)?.difficulty ?? "A"] + 1, MAX_DIFF);
        if (cand > adj) adj = cand;
      });
      c.adjValue = adj;
      c.adjDiff = adj > 0 ? VALUE_DIFF[adj] : null;
      c.bumped = hadFive && adj > contVal;
    }),
  );

  // ---- 三人以上が到達した難度 ----
  const laneValues = lanes.map((chunks) => chunks.reduce((m, c) => Math.max(m, c.adjValue), 0));
  let threePersonValue = 0;
  if (ser.mode === "allTogether") {
    threePersonValue = laneValues[0] ?? 0; // 全員同一実施
  } else {
    const sorted = [...laneValues].sort((a, b) => b - a);
    threePersonValue = sorted[2] ?? 0; // 上から3番目＝3人以上が到達
  }
  const threePersonDiff = threePersonValue > 0 ? VALUE_DIFF[threePersonValue] : null;

  // ---- 交差グループの難度 ----
  const crosses: CrossInfo[] = ser.crossGroups.map((g) => {
    const members: CrossMember[] = g.cells
      .map(({ lane, slot }) => {
        const cell = ser.lanes[lane]?.[slot];
        if (!cell || cell.type === "empty") return null;
        return { lane, slot, value: cellValue(cell), label: cellLabel(cell) };
      })
      .filter((m): m is CrossMember => m !== null);
    const hasSkill = members.some((m) => ser.lanes[m.lane]?.[m.slot]?.type === "skill");
    let diffValue = 0;
    // 交差成立には転回(技)を含む2段以上が必要
    if (members.length >= 2 && hasSkill) {
      const sum = members.reduce((s, m) => s + m.value, 0);
      diffValue = Math.min(Math.max(sum - (members.length - 1), 1), MAX_DIFF);
    }
    return { id: g.id, members, diffValue, diff: diffValue > 0 ? VALUE_DIFF[diffValue] : null };
  });
  const crossMaxValue = crosses.reduce((m, c) => Math.max(m, c.diffValue), 0);

  // ---- 組運動グループの難度（宙返りを選択、最大C） ----
  const unions: CrossInfo[] = ser.unionGroups.map((g) => {
    const members: CrossMember[] = g.cells
      .map(({ lane, slot }) => {
        const cell = ser.lanes[lane]?.[slot];
        if (!cell || cell.type === "empty") return null;
        return { lane, slot, value: cellValue(cell), label: cellLabel(cell) };
      })
      .filter((m): m is CrossMember => m !== null);
    // 転回(宙返り)を伴う場合のみ難度。空中転回は最大C。
    let diffValue = 0;
    members.forEach((m) => {
      const cell = ser.lanes[m.lane]?.[m.slot];
      if (cell?.type === "skill" && cell.skillId && skillDef(cell.skillId)?.isSalto) {
        diffValue = Math.max(diffValue, Math.min(m.value, UNION_MAX_VALUE));
      }
    });
    return { id: g.id, members, diffValue, diff: diffValue > 0 ? VALUE_DIFF[diffValue] : null };
  });
  const unionMaxValue = unions.reduce((m, u) => Math.max(m, u.diffValue), 0);

  const seriesValue = Math.max(threePersonValue, crossMaxValue, unionMaxValue);
  const seriesDiff = seriesValue > 0 ? VALUE_DIFF[seriesValue] : null;

  const cellToChunk: Record<string, Chunk & { ci: number }> = {};
  lanes.forEach((chunks, laneIdx) =>
    chunks.forEach((c, ci) => {
      for (let s = c.startSlot; s <= c.endSlot; s++) cellToChunk[`${laneIdx}-${s}`] = { ci, ...c };
    }),
  );

  const cellToCross: Record<string, number[]> = {};
  crosses.forEach((c, ci) =>
    c.members.forEach((m) => {
      const k = `${m.lane}-${m.slot}`;
      (cellToCross[k] ||= []).push(ci + 1);
    }),
  );
  const cellToUnion: Record<string, number[]> = {};
  unions.forEach((u, ui) =>
    u.members.forEach((m) => {
      const k = `${m.lane}-${m.slot}`;
      (cellToUnion[k] ||= []).push(ui + 1);
    }),
  );

  // 各塊の最後の技セル（着ピタ入力対象）
  const chunkLastSkill: Record<string, boolean> = {};
  lanes.forEach((chunks, laneIdx) =>
    chunks.forEach((c) => {
      const lastSkill = [...c.cells].reverse().find((cell) => cell.type === "skill" && cell.skillId);
      if (lastSkill) chunkLastSkill[`${laneIdx}-${lastSkill.slot}`] = true;
    }),
  );

  return {
    lanes,
    laneValues,
    threePersonValue,
    threePersonDiff,
    crosses,
    crossMaxValue,
    unions,
    unionMaxValue,
    seriesValue,
    seriesDiff,
    cellToChunk,
    cellToCross,
    cellToUnion,
    chunkLastSkill,
  };
}

// ---- 団体の加点（D加点）。各カテゴリは1演技で最高ティアのみ採用。 ----

/**
 * 同じ転回技に関わる加点：5人が「同じ技構成」で4つ以上連続する転回を実施。
 * ① 同技構成（タイミング不問）0.1 / ② 同技構成を同時（同一スロット起点）0.2 / ③ ②をD以上 0.3
 */
function rotationBonusForSeries(ser: TeamSeries, a: TeamSeriesAnalysis): number {
  const NEED = ROT_CHAIN_REQUIRED;
  const seqKey = (c: Chunk) => c.skillIds.join(",");

  if (ser.mode === "allTogether") {
    const c4 = a.lanes[0]?.find((c) => c.skillIds.length >= NEED);
    if (!c4) return 0;
    // 同時実施＝全員が同技構成を同時に実施。D以上なら最上位。
    return c4.adjValue >= DIFF_VALUE.D ? TEAM_ROTATION_BONUS.simD : TEAM_ROTATION_BONUS.sim;
  }
  if (a.lanes.length < NUM_PLAYERS) return 0;

  // 各レーンの 4連続以上の塊（同技判定の候補）
  const perLane = a.lanes.map((chunks) => chunks.filter((c) => c.skillIds.length >= NEED));
  if (perLane.some((list) => list.length === 0)) return 0;

  // ②③ 同技構成を同時（同一スロット起点）に全員が実施
  let simValue = 0;
  for (const c of perLane[0]) {
    const key = seqKey(c);
    const matches = perLane.map((list) =>
      list.find((x) => seqKey(x) === key && x.startSlot === c.startSlot),
    );
    if (matches.every((m) => m)) {
      const allD = matches.every((m) => m!.adjValue >= DIFF_VALUE.D);
      simValue = Math.max(simValue, allD ? TEAM_ROTATION_BONUS.simD : TEAM_ROTATION_BONUS.sim);
    }
  }
  if (simValue > 0) return simValue;

  // ① 同技構成を全員が実施（タイミングは不問）
  for (const c of perLane[0]) {
    const key = seqKey(c);
    if (perLane.every((list) => list.some((x) => seqKey(x) === key))) return TEAM_ROTATION_BONUS.all5;
  }
  return 0;
}

/** 着地に関する加点：5人が終末で着ピタ / 縦並びで同時 */
function landingBonusForSeries(ser: TeamSeries, a: TeamSeriesAnalysis): number {
  const terminals = a.lanes.map((chunks) => {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const sk = [...chunks[i].cells].reverse().find((c) => c.type === "skill" && c.skillId);
      if (sk) return sk;
    }
    return null;
  });
  if (ser.mode === "allTogether") {
    const t = terminals[0];
    return t && t.stuck ? TEAM_LANDING_BONUS.sim : 0; // 同時実施＝縦並び相当
  }
  if (terminals.length < NUM_PLAYERS || terminals.some((t) => !t || !t.stuck)) return 0;
  const slots = terminals.map((t) => t!.slot);
  const sameSlot = slots.every((s) => s === slots[0]);
  return sameSlot ? TEAM_LANDING_BONUS.sim : TEAM_LANDING_BONUS.all5;
}

/** 交差に関する加点：全C以上の3段以上 / D以上を1つ含む / 2つ含む */
function crossBonusForCross(info: CrossInfo, ser: TeamSeries): number {
  const skillVals = info.members
    .filter((m) => ser.lanes[m.lane]?.[m.slot]?.type === "skill")
    .map((m) => m.value);
  if (skillVals.length < 3) return 0;
  if (!skillVals.every((v) => v >= DIFF_VALUE.C)) return 0;
  const dPlus = skillVals.filter((v) => v >= DIFF_VALUE.D).length;
  if (dPlus >= 2) return TEAM_CROSS_BONUS.twoD;
  if (dPlus === 1) return TEAM_CROSS_BONUS.oneD;
  return TEAM_CROSS_BONUS.base;
}

/** 同一難度に関する加点：全員D以上 / 全員E */
function sameDiffBonusForSeries(ser: TeamSeries, a: TeamSeriesAnalysis): number {
  const laneMaxSkill = a.lanes.map((chunks) => {
    let m = 0;
    chunks.forEach((c) =>
      c.cells.forEach((cell) => {
        if (cell.type === "skill" && cell.skillId) {
          m = Math.max(m, DIFF_VALUE[skillDef(cell.skillId)?.difficulty ?? "A"]);
        }
      }),
    );
    return m;
  });
  if (ser.mode === "allTogether") {
    const v = laneMaxSkill[0] ?? 0;
    if (v >= DIFF_VALUE.E) return TEAM_SAMEDIFF_BONUS.e;
    if (v >= DIFF_VALUE.D) return TEAM_SAMEDIFF_BONUS.d;
    return 0;
  }
  if (laneMaxSkill.length < NUM_PLAYERS) return 0;
  const minv = Math.min(...laneMaxSkill);
  if (minv >= DIFF_VALUE.E) return TEAM_SAMEDIFF_BONUS.e;
  if (minv >= DIFF_VALUE.D) return TEAM_SAMEDIFF_BONUS.d;
  return 0;
}

function computeTeamBonus(team: TeamState, analysis: TeamSeriesAnalysis[]): TeamBonus {
  let rotation = 0;
  let landing = 0;
  let cross = 0;
  let sameDiff = 0;
  team.series.forEach((ser, i) => {
    const a = analysis[i];
    rotation = Math.max(rotation, rotationBonusForSeries(ser, a));
    landing = Math.max(landing, landingBonusForSeries(ser, a));
    sameDiff = Math.max(sameDiff, sameDiffBonusForSeries(ser, a));
    a.crosses.forEach((c) => (cross = Math.max(cross, crossBonusForCross(c, ser))));
  });
  const total = rotation + landing + cross + sameDiff;
  return { rotation, landing, cross, sameDiff, total };
}

export function computeTeamScore(team: TeamState): TeamScoreResult {
  const analysis = team.series.map(analyzeTeamSeries);

  const crossCount = analysis.reduce((s, a) => s + a.crosses.filter((c) => c.diff).length, 0);
  const unionCount = team.series.reduce(
    (s, ser) => s + ser.unionGroups.filter((g) => g.cells.length > 0).length,
    0,
  );
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
    { key: "cross", label: "交差を1回以上実施", passed: crossCount >= 1 },
    { key: "union", label: "組技を1回以上実施", passed: unionCount >= 1 },
    { key: "allTog", label: "全員同時実施を1回以上", passed: hasAnyAllTogether },
    { key: "allLanes", label: "各シリーズで全レーンに塊（通常は5人全員）", passed: allLanesFilled },
    { key: "motion3", label: "徒手塊を3つ以上", passed: motionChunkCount >= 3 },
  ];
  const missing = required.filter((r) => !r.passed);

  const seriesDiffScore = analysis.reduce((s, a) => s + (a.seriesDiff ? DIFF_SCORE[a.seriesDiff] : 0), 0);
  const bonus = computeTeamBonus(team, analysis);
  const dScore = seriesDiffScore + bonus.total;
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
    seriesDiffScore,
    bonus,
    dScore,
    aDeduction,
    aScore,
    executionDeduction,
    eScore,
    grandTotal,
  };
}
