// =====================================================================
// 演技全体の採点（純粋関数）
//
// UI から採点ロジックを完全に分離する。各シリーズ内訳(seriesBreakdowns)を
// 先に算出し、リテラルな総和になるグローバル加点・減点はそれを再利用して
// 二重実装を避ける。
// =====================================================================

import {
  CATEGORY,
  APPARATUS,
  DIFF_VALUE,
  DIFF_SCORE,
  HAND_MOTIONS,
  E_BONUS,
  SERIES_BONUS,
  TECHNIQUE_BONUS,
  APPARATUS_OP_BONUS,
  ropeJumpDef,
  TWOTHROW_MOTION_BONUS,
  JUMP_VARIETY_BONUS,
  NO_APP_SALTO_DEDUCTION,
  NO_APP_ALL_DEDUCTION,
  NO_APP_CAP,
  DIRECTION_DEDUCTION,
  THROW_COUNT_DEDUCTION,
  CONNECT_NO_APP_DEDUCTION,
  SALTO_CHAIN_2_DEDUCTION,
  SALTO_CHAIN_LOW_DEDUCTION,
  VARIETY_REQUIRED,
  VARIETY_DEDUCTION_PER,
  VARIETY_CAP,
  ADOPT_COUNT,
  AE_FULL,
  REQUIRED_THROW_OPTIONS,
  REQUIRED_ELEMENT_DEDUCTION,
  VIOLATION_DEDUCTION,
  APPARATUS_REQUIRED_ELEMENTS,
  VIOLATION_OPTIONS,
  skillDef,
} from "./constants";
import {
  analyzeSeries,
  seriesSignature,
  maxSaltoChain,
  hasConnect,
  hasConnectWithoutApparatus,
} from "./analysis";
import type { ApparatusKey, Series, SeriesAnalysis, Unit } from "./types";

export interface SeriesBreakdown {
  tumDiff: number;
  handDiff: number;
  sBonus: number;
  tech: number;
  appOp: number;
  twoMot: number;
  noApp: number;
  exec: number;
  dPart: number;
  aPart: number;
}

export interface RequiredCheck {
  key: string;
  label: string;
  passed: boolean | null;
}

export interface ScoreResult {
  analysis: SeriesAnalysis[];
  dupFlags: boolean[];
  seriesBreakdowns: SeriesBreakdown[];

  // D
  tumblingScore: number;
  handScore: number;
  seriesBonus: number;
  techniqueCount: number;
  techniqueBonus: number;
  apparatusOpBonus: number;
  twoThrowMotionBonus: number;
  jumpVarietyBonus: number;
  dScore: number;

  // A
  apparatusElementChecks: RequiredCheck[];
  apparatusElementDeduction: number;
  violationChecks: RequiredCheck[];
  violationDeduction: number;
  noApparatusDeduction: number;
  connectNoApparatus: boolean;
  missingDirCount: number;
  directionDeduction: number;
  totalThrowCount: number;
  throwCountDeduction: number;
  maxChainAll: number;
  saltoChainDeduction: number;
  throwKindCount: number;
  catchKindCount: number;
  varietyDeduction: number;
  aDeduction: number;
  aScore: number;

  // E
  seriesExecutionDeduction: number; // 各シリーズの実施減点合計
  overallExecutionDeduction: number; // 演技全体の実施減点（シリーズ非依存）
  executionDeduction: number; // 上記2つの合計
  eScore: number;

  grandTotal: number;

  // 必須要素
  required: RequiredCheck[];
  missing: RequiredCheck[];
  nonDupTumblingCount: number;
}

const isTumblingUnit = (u: Unit) => u.type === "tumbling" || (u.type === "throw" && u.isThrowTumbling);

export interface ComputeOptions {
  overallExecutionDeduction?: number;
  /** §3.2 実施した手具別必須要素のid */
  apparatusElements?: string[];
  /** §3.5.6.3 該当した違反・欠如のid */
  violations?: string[];
}

export function computeScore(
  series: Series[],
  apparatus: ApparatusKey,
  opts: ComputeOptions = {},
): ScoreResult {
  const { overallExecutionDeduction = 0, apparatusElements = [], violations = [] } = opts;
  const analysis = series.map(analyzeSeries);
  const allUnits = analysis.flatMap((a) => a.units);

  // 重複シリーズ判定
  const seen = new Set<string>();
  const dupFlags = series.map((ser) => {
    const sig = seriesSignature(ser);
    if (seen.has(sig)) return true;
    seen.add(sig);
    return false;
  });

  // ---- 各シリーズ内訳（先に算出し、総和系グローバル値はこれを再利用）----
  const seriesBreakdowns: SeriesBreakdown[] = series.map((ser, i) => {
    const a = analysis[i];
    const isDup = dupFlags[i];
    const tumU = a.units.filter(isTumblingUnit);
    const tumDiff = tumU.reduce(
      (s, u) => s + DIFF_SCORE[u.finalDiff] + (u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0),
      0,
    );
    const hU = a.units.filter((u) => u.type === "throw" && !u.isThrowTumbling);
    const handDiff = hU.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
    const sBonus =
      a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus) ? SERIES_BONUS : 0;

    let techCount = 0;
    ser.items.forEach((item) => {
      if (item.kind === "throw") techCount += (item.throwTypes || []).length;
      else if (item.kind === "catch") techCount += (item.catchTypes || []).length;
      else if (item.kind === "skill" && item.isThrow) techCount += (item.throwTypes || []).length;
    });
    const tech = techCount * TECHNIQUE_BONUS;

    let appOp = 0;
    if (!isDup) {
      const ops = ser.items.filter((item) => item.kind === "skill" && item.hasApparatus).length;
      if (ops >= 2) {
        const maxD = a.units.reduce((m, u) => Math.max(m, DIFF_VALUE[u.finalDiff] || 0), 0);
        if (maxD === DIFF_VALUE.E) appOp = APPARATUS_OP_BONUS;
      }
    }

    let twoMot = 0;
    if (!isDup) {
      let inTwo = false;
      let motSum = 0;
      let added = false;
      const fin = () => {
        if (inTwo && motSum >= 4 && !added) {
          twoMot += TWOTHROW_MOTION_BONUS;
          added = true;
        }
        inTwo = false;
        motSum = 0;
        added = false;
      };
      ser.items.forEach((item) => {
        if (item.kind === "throw") {
          fin();
          if ((item.reqTypes || []).includes("twothrow")) inTwo = true;
        } else if (item.kind === "catch") {
          fin();
        } else if (item.kind === "motion" && inTwo) {
          const m = HAND_MOTIONS.find((x) => x.id === item.motionId);
          if (m) motSum += m.motions;
        }
      });
      fin();
    }

    let noApp = 0;
    if (!isDup && a.throwCount === 0) {
      const skills = ser.items.filter(
        (item): item is Extract<typeof item, { kind: "skill" }> => item.kind === "skill" && !!item.skillId,
      );
      const hasT = a.units.some((u) => u.type === "tumbling");
      if (hasT && skills.length > 0) {
        const anyApp = skills.some((s) => s.hasApparatus);
        if (!anyApp) noApp = NO_APP_ALL_DEDUCTION;
        else {
          const saltos = skills.filter((s) => skillDef(s.skillId)?.isSalto);
          if (saltos.length > 0 && !saltos.some((s) => s.hasApparatus)) noApp = NO_APP_SALTO_DEDUCTION;
        }
      }
    }

    const exec = Number(ser.executionDeduction) || 0;
    const dPart = tumDiff + handDiff + sBonus + tech + appOp + twoMot;
    const aPart = noApp;
    return { tumDiff, handDiff, sBonus, tech, appOp, twoMot, noApp, exec, dPart, aPart };
  });

  // ---- D（難度）----
  const tumblingUnits = allUnits.filter(isTumblingUnit);
  const handUnits = allUnits.filter((u) => u.type === "throw" && !u.isThrowTumbling);
  const sortByDiff = (arr: Unit[]) => [...arr].sort((a, b) => DIFF_VALUE[b.finalDiff] - DIFF_VALUE[a.finalDiff]);
  const topTumbling = sortByDiff(tumblingUnits).slice(0, ADOPT_COUNT);
  const topHand = sortByDiff(handUnits).slice(0, ADOPT_COUNT);

  const tumblingScore = topTumbling.reduce((s, u) => {
    const base = DIFF_SCORE[u.finalDiff];
    const eB = u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0;
    return s + base + eB;
  }, 0);
  const handScore = topHand.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
  const seriesBonus = analysis.some(
    (a) => a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus),
  )
    ? SERIES_BONUS
    : 0;

  const techniqueBonus = seriesBreakdowns.reduce((s, b) => s + b.tech, 0);
  const techniqueCount = Math.round(techniqueBonus / TECHNIQUE_BONUS);
  const apparatusOpBonus = seriesBreakdowns.reduce((s, b) => s + b.appOp, 0);
  const twoThrowMotionBonus = seriesBreakdowns.reduce((s, b) => s + b.twoMot, 0);

  const totalThrowCount = analysis.reduce((s, a, i) => s + (dupFlags[i] ? 0 : a.throwCount), 0);

  // ---- A（芸術と多様性）----
  // 手具操作不足：各シリーズ内訳の noApp 総和 + つなぎ技A難度の手具操作なし、上限 NO_APP_CAP
  const connectNoApparatus = allUnits.some((u) => hasConnectWithoutApparatus(u.skills || []));
  let noApparatusDeduction = seriesBreakdowns.reduce((s, b) => s + b.noApp, 0);
  if (connectNoApparatus) noApparatusDeduction += CONNECT_NO_APP_DEDUCTION;
  noApparatusDeduction = Math.min(noApparatusDeduction, NO_APP_CAP);

  const allTumblingSkills = tumblingUnits.flatMap((u) => u.skills);
  const cats = new Set(allTumblingSkills.map((s) => skillDef(s.skillId)?.category).filter(Boolean));
  const missingDirCount =
    (cats.has(CATEGORY.FORWARD) ? 0 : 1) +
    (cats.has(CATEGORY.SIDE) ? 0 : 1) +
    (cats.has(CATEGORY.BACKWARD) ? 0 : 1);
  const directionDeduction = missingDirCount * DIRECTION_DEDUCTION;
  const throwCountDeduction = totalThrowCount < 3 ? THROW_COUNT_DEDUCTION : 0;

  const maxChainAll = tumblingUnits.reduce(
    (m, u) => Math.max(m, maxSaltoChain(u.skills.map((s) => s.skillId))),
    0,
  );
  const saltoChainDeduction =
    maxChainAll >= 3 ? 0 : maxChainAll === 2 ? SALTO_CHAIN_2_DEDUCTION : SALTO_CHAIN_LOW_DEDUCTION;

  // 投げ方・受け方の種類カウント（重複シリーズは「その他」以外を除外）
  const throwKinds = new Set<string>();
  const catchKinds = new Set<string>();
  let throwOtherCount = 0;
  let catchOtherCount = 0;
  series.forEach((ser, i) => {
    const isDup = dupFlags[i];
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        const types = item.throwTypes || [];
        const reqs = item.reqTypes || [];
        if (types.includes("other")) throwOtherCount += 1;
        if (isDup) return;
        if (types.length === 0) throwKinds.add("normal");
        if (types.includes("noview")) throwKinds.add("noview");
        if (types.includes("nonhand")) throwKinds.add("nonhand");
        if (types.includes("useapp")) throwKinds.add("useapp");
        if (reqs.includes("lefthand")) {
          throwKinds.add("lefthand");
          catchKinds.add("lefthand"); // 左手投げは左手キャッチも同時カウント
        }
      } else if (item.kind === "skill" && item.isThrow) {
        const types = item.throwTypes || [];
        if (isDup) return;
        throwKinds.add("tumthrow");
        if (types.includes("noview")) throwKinds.add("noview");
        if (types.includes("nonhand")) throwKinds.add("nonhand");
        if (types.includes("useapp")) throwKinds.add("useapp");
      } else if (item.kind === "catch") {
        const types = item.catchTypes || [];
        if (types.includes("other")) catchOtherCount += 1;
        if (isDup) return;
        if (types.length === 0) catchKinds.add("normal");
        if (types.includes("noview")) catchKinds.add("noview");
        if (types.includes("nonhand")) catchKinds.add("nonhand");
        if (types.includes("useapp")) catchKinds.add("useapp");
      }
    });
  });
  const throwKindCount = throwKinds.size + throwOtherCount;
  const catchKindCount = catchKinds.size + catchOtherCount;
  const throwShortage = Math.max(0, VARIETY_REQUIRED - throwKindCount);
  const catchShortage = Math.max(0, VARIETY_REQUIRED - catchKindCount);
  const varietyDeduction = Math.min(VARIETY_CAP, (throwShortage + catchShortage) * VARIETY_DEDUCTION_PER);

  // ---- 必須要素チェック ----
  const nonDupTumblingCount = analysis.reduce((s, a, i) => {
    if (dupFlags[i]) return s;
    return s + a.units.filter(isTumblingUnit).length;
  }, 0);
  const hasTriple = tumblingUnits.some((u) => maxSaltoChain(u.skills.map((s) => s.skillId)) >= 3);
  const hasConn = allUnits.some((u) => hasConnect(u.skills || []));
  const hasThrowTumbling = allUnits.some((u) => u.type === "throw" && u.isThrowTumbling);

  const requiredThrowIds = REQUIRED_THROW_OPTIONS[apparatus].map((o) => o.id);
  const performedThrowTypes = new Set<string>();
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "throw") (item.reqTypes || []).forEach((t) => performedThrowTypes.add(t));
    }),
  );
  const requiredThrowPassed =
    requiredThrowIds.length === 0 || requiredThrowIds.every((id) => performedThrowTypes.has(id));

  const required: RequiredCheck[] = [
    {
      key: "dir",
      label: "前方系・側方系・後方系をすべて含む",
      passed: cats.has(CATEGORY.FORWARD) && cats.has(CATEGORY.SIDE) && cats.has(CATEGORY.BACKWARD),
    },
    { key: "throwTum", label: "1本以上が投げタン", passed: hasThrowTumbling },
    { key: "triple", label: "1本以上が宙返り3回以上連続", passed: hasTriple },
    { key: "connect", label: "1本以上がつなぎ技（宙返り間にA難度を挟む）", passed: hasConn },
    { key: "count3", label: "投げを3回以上実施", passed: totalThrowCount >= 3 },
    { key: "tumCount", label: "タンブリング3本以上", passed: nonDupTumblingCount >= 3 },
    {
      key: "appThrow",
      label: `${APPARATUS[apparatus].name}の必須投げ方${
        APPARATUS[apparatus].throws.length ? "：" + APPARATUS[apparatus].throws.join("・") : "（なし）"
      }`,
      passed: requiredThrowPassed,
    },
  ];

  // ロープ固有の要求要素（§3.2(3) ③〜⑥）
  let jumpVarietyBonus = 0;
  if (apparatus === "rope") {
    const allJumps = series.flatMap((ser) =>
      ser.items.filter((item): item is Extract<typeof item, { kind: "ropeJump" }> => item.kind === "ropeJump" && !!item.jumpId)
        .map((item) => ({ def: ropeJumpDef(item.jumpId)!, moving: !!item.isMoving6m }))
        .filter((j) => !!j.def),
    );
    const hasTripleJump = allJumps.some((j) => j.def.rotations >= 3);
    const movingCount = allJumps.filter((j) => j.moving).length;
    const frontInPlace = allJumps.filter((j) => !j.moving && j.def.direction === "front").length;
    const backInPlace = allJumps.filter((j) => !j.moving && j.def.direction === "back").length;

    required.push(
      { key: "ropeTriple", label: "3重跳び", passed: hasTripleJump },
      { key: "ropeMoving", label: "6m以上移動の3回以上連続跳び", passed: movingCount >= 3 },
      { key: "ropeFront", label: "前回し跳び2回以上連続", passed: frontInPlace >= 2 },
      { key: "ropeBack", label: "後ろ回し跳び2回以上連続", passed: backInPlace >= 2 },
    );

    // §3.5.5.5(4)① 6m以上移動の連続跳びに2重跳び（rotations≧2）が3回以上 → 加点
    // ②③（跳びの形の多様性 / その場回転跳び2回転）は入力未対応のため今後対応。
    const movingDoubles = allJumps.filter((j) => j.moving && j.def.rotations >= 2).length;
    if (movingDoubles >= 3) jumpVarietyBonus = JUMP_VARIETY_BONUS;
  }

  const missing = required.filter((r) => r.passed === false);

  // ---- §3.2 手具別必須要素（手動チェック）と §3.5.6.3 要求要素の欠如による A減点 ----
  const apparatusElementChecks: RequiredCheck[] = APPARATUS_REQUIRED_ELEMENTS[apparatus].map((el) => ({
    key: `appEl_${el.id}`,
    label: el.name,
    passed: apparatusElements.includes(el.id),
  }));
  const apparatusElementDeduction =
    apparatusElementChecks.filter((c) => !c.passed).length * REQUIRED_ELEMENT_DEDUCTION;

  // passed = 違反・欠如が「ない」状態
  const violationChecks: RequiredCheck[] = VIOLATION_OPTIONS.map((v) => ({
    key: `viol_${v.id}`,
    label: v.name,
    passed: !violations.includes(v.id),
  }));
  const violationDeduction =
    VIOLATION_OPTIONS.filter((v) => violations.includes(v.id)).length * VIOLATION_DEDUCTION;

  // ---- 合計 ----
  const seriesExecutionDeduction = series.reduce((s, ser) => s + (Number(ser.executionDeduction) || 0), 0);
  const overallExec = Number(overallExecutionDeduction) || 0;
  const executionDeduction = seriesExecutionDeduction + overallExec;
  const dScore =
    tumblingScore + handScore + seriesBonus + techniqueBonus + apparatusOpBonus + twoThrowMotionBonus + jumpVarietyBonus;
  const aDeduction =
    noApparatusDeduction +
    directionDeduction +
    throwCountDeduction +
    saltoChainDeduction +
    varietyDeduction +
    apparatusElementDeduction +
    violationDeduction;
  const aScore = Math.max(0, AE_FULL - aDeduction);
  const eScore = Math.max(0, AE_FULL - executionDeduction);
  const grandTotal = dScore + aScore + eScore;

  return {
    analysis,
    dupFlags,
    seriesBreakdowns,
    tumblingScore,
    handScore,
    seriesBonus,
    techniqueCount,
    techniqueBonus,
    apparatusOpBonus,
    twoThrowMotionBonus,
    jumpVarietyBonus,
    dScore,
    apparatusElementChecks,
    apparatusElementDeduction,
    violationChecks,
    violationDeduction,
    noApparatusDeduction,
    connectNoApparatus,
    missingDirCount,
    directionDeduction,
    totalThrowCount,
    throwCountDeduction,
    maxChainAll,
    saltoChainDeduction,
    throwKindCount,
    catchKindCount,
    varietyDeduction,
    aDeduction,
    aScore,
    seriesExecutionDeduction,
    overallExecutionDeduction: overallExec,
    executionDeduction,
    eScore,
    grandTotal,
    required,
    missing,
    nonDupTumblingCount,
  };
}
