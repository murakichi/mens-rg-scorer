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
  THROW_COUNT_OVER_DEDUCTION,
  throwCountRequired,
  throwCountMax,
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
  type RequiredElementAuto,
  VIOLATION_OPTIONS,
  skillDef,
} from "./constants";
import {
  analyzeSeries,
  seriesSignature,
  maxSaltoChain,
  saltoFlags,
  hasConnect,
  hasConnectWithoutApparatus,
} from "./analysis";
import type { ApparatusKey, Difficulty, Series, SeriesAnalysis, Unit } from "./types";

/** シリーズ内の徒手系ユニット1つ分の難度点の内訳（投げごとの表示用） */
export interface HandDiffRow {
  /** 表示用ラベル（投げ1／ロープ跳び など） */
  label: string;
  diff: Difficulty;
  score: number;
  /** 難度として採用されたか（重複・同一内容・連続投げのA難度は false） */
  adopted: boolean;
  /** 徒手難度点の上位3つに入ったか */
  inTop: boolean;
}

export interface SeriesBreakdown {
  tumDiff: number;
  handDiff: number;
  /** 徒手難度点の投げごとの内訳（不採用・上位3外も含む） */
  handRows: HandDiffRow[];
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
  /** analysis[i].units と同じ並びで、そのユニットが難度点に採用されたか */
  unitAdopted: boolean[][];
  /** analysis[i].units と同じ並びで、そのユニットが上位3つの採用に入ったか */
  unitInTop: boolean[][];
  /** 採点に用いる重複フラグ（notDuplicate で解除されたものは false） */
  dupFlags: boolean[];
  /** 構成が既出のシリーズと一致したか（notDuplicate による解除を反映しない生の判定） */
  dupSignatureFlags: boolean[];
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
  /** 実施した投げ上げ回数（上限超過分も含む） */
  performedThrowCount: number;
  /** 上限を超えた投げ上げの回数（ジュニアのみ） */
  overThrowCount: number;
  /** 適用規則上必要な投げ上げ回数（一般3 / ジュニア2） */
  requiredThrowCount: number;
  /** 投げ上げの上限回数（ジュニア5 / 一般は上限なしで null） */
  maxThrowCount: number | null;
  throwCountDeduction: number;
  /** 投げ上げが上限を超えた場合の減点（ジュニアのみ） */
  throwCountOverDeduction: number;
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
const isHandUnit = (u: Unit) => u.type === "throw" && !u.isThrowTumbling;
/** そのユニットが難度点に寄与する点数（E難度ボーナス込み）。採用の優劣比較に使う。 */
const unitScore = (u: Unit) =>
  DIFF_SCORE[u.finalDiff] + (isTumblingUnit(u) && u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0);

/**
 * シリーズ内で徒手難度点に採用する徒手系ユニット。
 * 連続投げ（実際の投げ受けが2つ以上）で、そのすべてが徒手系（投げタンでない）の場合、
 * その中のA難度＝間に徒手動作0の投げ受けは採用しない。
 * ただし全てがA難度なら最高難度＝A を1つだけ採用する（0にはしない）。
 * ロープ跳び由来のユニットは投げ受けではないため対象外（1重跳びのA難度は従来どおり採用）。
 */
function adoptedHandUnits(units: Unit[]): Unit[] {
  const handUnits = units.filter(isHandUnit);
  // 実際の投げ受けユニットのみが対象（ロープ跳び・投げなしの徒手ユニットは除く）
  const throwUnits = handUnits.filter((u) => !u.fromRopeJump && u.throwCount > 0);
  const others = handUnits.filter((u) => u.fromRopeJump || u.throwCount === 0);
  if (throwUnits.length < 2) return handUnits;
  const nonA = throwUnits.filter((u) => u.finalDiff !== "A");
  const adoptedThrows = nonA.length > 0 ? nonA : throwUnits.slice(0, 1);
  return [...others, ...adoptedThrows];
}

export interface ComputeOptions {
  overallExecutionDeduction?: number;
  /** §3.2 実施した手具別必須要素のid */
  apparatusElements?: string[];
  /** §3.5.6.3 該当した違反・欠如のid */
  violations?: string[];
  /** ジュニア適用規則（変更規則1）で採点するか */
  junior?: boolean;
}

export function computeScore(
  series: Series[],
  apparatus: ApparatusKey,
  opts: ComputeOptions = {},
): ScoreResult {
  const { overallExecutionDeduction = 0, apparatusElements = [], violations = [], junior = false } = opts;
  const analysis = series.map((ser) => analyzeSeries(ser, junior));
  const requiredThrowCount = throwCountRequired(junior);
  const maxThrowCount = throwCountMax(junior);
  const allUnits = analysis.flatMap((a) => a.units);

  // 重複シリーズ判定。構成が既出でも notDuplicate が立っていれば重複として扱わない
  // （入力項目に現れない差異＝シェネの腕の使い方・動作の内訳違いなどをユーザーが宣言する）。
  const seen = new Set<string>();
  const dupSignatureFlags = series.map((ser) => {
    const sig = seriesSignature(ser);
    if (seen.has(sig)) return true;
    seen.add(sig);
    return false;
  });
  const dupFlags = dupSignatureFlags.map((dup, i) => dup && !series[i].notDuplicate);

  // ---- 投げ上げの上限（ジュニアのみ）----
  // 上限を超えた6回目以降の投げは、要素・難度ともにカウントしない。
  // 実施回数そのものは超過分の減点に使うため別に数える。
  const overLimitUnit = (() => {
    let n = 0;
    return analysis.map((a, i) =>
      a.units.map((u) => {
        if (dupFlags[i] || u.throwCount === 0) return false;
        const over = maxThrowCount !== null && n >= maxThrowCount;
        n += u.throwCount;
        return over;
      }),
    );
  })();
  // アイテム単位（多様性・技術加点・必須投げの判定用）。投げと同じ順序で数える。
  const overLimitItem = (() => {
    let n = 0;
    return series.map((ser, i) =>
      ser.items.map((item) => {
        const isThrowItem = item.kind === "throw" || (item.kind === "skill" && !!item.isThrow);
        if (!isThrowItem || dupFlags[i]) return false;
        const over = maxThrowCount !== null && n >= maxThrowCount;
        n += 1;
        return over;
      }),
    );
  })();
  /** キャッチは直前の投げの扱いに従う */
  const itemOver = series.map((ser, i) => {
    let last = false;
    return ser.items.map((item, j) => {
      if (item.kind === "throw" || (item.kind === "skill" && !!item.isThrow)) {
        last = overLimitItem[i][j];
        return last;
      }
      if (item.kind === "catch") return last;
      return false;
    });
  });

  // 実施した投げ回数（上限超過分も含む。減点の算出に使う）
  const performedThrowCount = analysis.reduce((s, a, i) => s + (dupFlags[i] ? 0 : a.throwCount), 0);

  // ---- 難度点に採用するユニットをシリーズ順に確定する ----
  // 重複シリーズは全除外、A難度の投げ受けは adoptedHandUnits() で間引き、
  // さらに演技全体で同じ内容の難度は1回しか数えない（§3.4.4）。
  // 不採用でも本数・投げ回数・加点・A側の判定には従来どおり算入する。
  const candidates: { key: string; unit: Unit; score: number }[] = [];
  analysis.forEach((a, i) => {
    if (dupFlags[i]) return;
    // 「重複ではない」と宣言されたシリーズは別内容として扱い、他シリーズと内容キーを共有しない
    const scope = series[i].notDuplicate ? `${i}#` : "";
    const within = a.units.filter((_u, j) => !overLimitUnit[i][j]);
    [...within.filter(isTumblingUnit), ...adoptedHandUnits(within)].forEach((unit) =>
      candidates.push({ key: scope + unit.signature, unit, score: unitScore(unit) }),
    );
  });
  // 同じ内容が複数あるときは難度（点）の高いものだけを採用する（Q&A Q22）。同点なら先に実施した方。
  const bestBySig = new Map<string, { unit: Unit; score: number }>();
  candidates.forEach((c) => {
    const cur = bestBySig.get(c.key);
    if (!cur || c.score > cur.score) bestBySig.set(c.key, { unit: c.unit, score: c.score });
  });
  const chosen = new Set([...bestBySig.values()].map((v) => v.unit));
  const adoptedUnits: Unit[][] = analysis.map((a) => a.units.filter((u) => chosen.has(u)));

  const unitAdopted = analysis.map((a, i) => {
    const adopted = new Set(adoptedUnits[i]);
    return a.units.map((u) => adopted.has(u));
  });

  // ---- 難度点の採用は上位3つまで。内訳表示でも使うのでここで確定する ----
  const adoptUnits = adoptedUnits.flat();
  const sortByDiff = (arr: Unit[]) => [...arr].sort((a, b) => DIFF_VALUE[b.finalDiff] - DIFF_VALUE[a.finalDiff]);
  const topTumbling = sortByDiff(adoptUnits.filter(isTumblingUnit)).slice(0, ADOPT_COUNT);
  const topHand = sortByDiff(adoptUnits.filter(isHandUnit)).slice(0, ADOPT_COUNT);
  const inTop = new Set<Unit>([...topTumbling, ...topHand]);
  const unitInTop = analysis.map((a) => a.units.map((u) => inTop.has(u)));

  // ---- 各シリーズ内訳（先に算出し、総和系グローバル値はこれを再利用）----
  const seriesBreakdowns: SeriesBreakdown[] = series.map((ser, i) => {
    const a = analysis[i];
    const isDup = dupFlags[i];
    // 重複シリーズは D（難度点・加点）に一切算入しない（§3.5.5「全く同じ技は難度として数えない」）
    const tumU = adoptedUnits[i].filter((u) => isTumblingUnit(u) && inTop.has(u));
    const tumDiff = tumU.reduce(
      (s, u) => s + DIFF_SCORE[u.finalDiff] + (u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0),
      0,
    );
    const adoptedSet = new Set(adoptedUnits[i]);
    let throwNo = 0;
    const handRows: HandDiffRow[] = a.units.filter(isHandUnit).map((u) => {
      const label = u.fromRopeJump ? "ロープ跳び" : `投げ${++throwNo}`;
      return {
        label,
        diff: u.finalDiff,
        score: DIFF_SCORE[u.finalDiff],
        adopted: adoptedSet.has(u),
        inTop: inTop.has(u),
      };
    });
    const handDiff = handRows.reduce((s, r) => s + (r.adopted && r.inTop ? r.score : 0), 0);
    const sBonus =
      !isDup && a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus)
        ? SERIES_BONUS
        : 0;

    let techCount = 0;
    if (!isDup) {
      ser.items.forEach((item, j) => {
        if (itemOver[i][j]) return; // 上限超過の投げ受けは加点も数えない
        if (item.kind === "throw") techCount += (item.throwTypes || []).length;
        else if (item.kind === "catch") techCount += (item.catchTypes || []).length;
        else if (item.kind === "skill" && item.isThrow) techCount += (item.throwTypes || []).length;
      });
    }
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
          // 宙返りの連続に含まれないきりもみ系は宙返りとして数えない（Q&A Q7）
          const salto = saltoFlags(skills.map((s) => s.skillId));
          const saltos = skills.filter((_s, k) => salto[k]);
          if (saltos.length > 0 && !saltos.some((s) => s.hasApparatus)) noApp = NO_APP_SALTO_DEDUCTION;
        }
      }
    }

    const exec = Number(ser.executionDeduction) || 0;
    const dPart = tumDiff + handDiff + sBonus + tech + appOp + twoMot;
    const aPart = noApp;
    return { tumDiff, handDiff, handRows, sBonus, tech, appOp, twoMot, noApp, exec, dPart, aPart };
  });

  // ---- D（難度）----
  // A側の判定（方向系・連続宙返り・必須要素）は全ユニットを見る。
  const tumblingUnits = allUnits.filter(isTumblingUnit);

  const tumblingScore = topTumbling.reduce((s, u) => {
    const base = DIFF_SCORE[u.finalDiff];
    const eB = u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0;
    return s + base + eB;
  }, 0);
  const handScore = topHand.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
  const seriesBonus = analysis.some(
    (a, i) => !dupFlags[i] && a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus),
  )
    ? SERIES_BONUS
    : 0;

  const techniqueBonus = seriesBreakdowns.reduce((s, b) => s + b.tech, 0);
  const techniqueCount = Math.round(techniqueBonus / TECHNIQUE_BONUS);
  const apparatusOpBonus = seriesBreakdowns.reduce((s, b) => s + b.appOp, 0);
  const twoThrowMotionBonus = seriesBreakdowns.reduce((s, b) => s + b.twoMot, 0);

  // 要素として数える投げ回数（ジュニアの上限超過分は含めない）
  const totalThrowCount = analysis.reduce(
    (s, a, i) =>
      s + (dupFlags[i] ? 0 : a.units.reduce((t, u, j) => t + (overLimitUnit[i][j] ? 0 : u.throwCount), 0)),
    0,
  );

  // ---- A（芸術と多様性）----
  // 手具操作不足：各シリーズ内訳の noApp 総和 + つなぎ技A難度の手具操作なし、上限 NO_APP_CAP
  // 手具操作なしの減点は投げなしタンブリング塊のみが対象
  const connectNoApparatus = allUnits.some(
    (u) => u.type === "tumbling" && hasConnectWithoutApparatus(u.skills || []),
  );
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
  const throwCountDeduction = totalThrowCount < requiredThrowCount ? THROW_COUNT_DEDUCTION : 0;
  const overThrowCount =
    maxThrowCount !== null ? Math.max(0, performedThrowCount - maxThrowCount) : 0;
  const throwCountOverDeduction = overThrowCount * THROW_COUNT_OVER_DEDUCTION;

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
    ser.items.forEach((item, j) => {
      if (itemOver[i][j]) return; // 上限超過の投げ受けは種類にも数えない
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
  series.forEach((ser, i) =>
    ser.items.forEach((item, j) => {
      if (itemOver[i][j]) return;
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
    {
      key: "count3",
      label: `投げを${requiredThrowCount}回以上実施`,
      passed: totalThrowCount >= requiredThrowCount,
    },
    ...(maxThrowCount !== null
      ? [
          {
            key: "countMax",
            label: `投げは${maxThrowCount}回以内`,
            passed: performedThrowCount <= maxThrowCount,
          },
        ]
      : []),
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

  // ---- §3.2 手具別必須要素（自動判定＋手動チェック）と §3.5.6.3 要求要素の欠如による A減点 ----
  // 右投げ右受け：左手投げでも手以外の投げでもない通常の投げが1回以上あれば実施とみなす。
  const hasRightThrow = series.some((ser) =>
    ser.items.some((item) => {
      if (item.kind === "throw")
        return !(item.reqTypes || []).includes("lefthand") && !(item.throwTypes || []).includes("nonhand");
      if (item.kind === "skill" && item.isThrow) return !(item.throwTypes || []).includes("nonhand");
      return false;
    }),
  );
  const autoPassed: Record<RequiredElementAuto, boolean> = { rightThrow: hasRightThrow };

  const apparatusElementChecks: RequiredCheck[] = APPARATUS_REQUIRED_ELEMENTS[apparatus].map((el) => ({
    key: `appEl_${el.id}`,
    label: el.auto ? `${el.name}（自動判定）` : el.name,
    passed: el.auto ? autoPassed[el.auto] : apparatusElements.includes(el.id),
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
    throwCountOverDeduction +
    saltoChainDeduction +
    varietyDeduction +
    apparatusElementDeduction +
    violationDeduction;
  const aScore = Math.max(0, AE_FULL - aDeduction);
  const eScore = Math.max(0, AE_FULL - executionDeduction);
  const grandTotal = dScore + aScore + eScore;

  return {
    analysis,
    unitAdopted,
    unitInTop,
    dupFlags,
    dupSignatureFlags,
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
    performedThrowCount,
    overThrowCount,
    requiredThrowCount,
    maxThrowCount,
    throwCountDeduction,
    throwCountOverDeduction,
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
