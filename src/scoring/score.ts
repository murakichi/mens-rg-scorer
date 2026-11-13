// =====================================================================
// 演技全体の採点（純粋関数）
//
// UI から採点ロジックを完全に分離する。各シリーズ内訳(seriesBreakdowns)を
// 先に算出し、リテラルな総和になるグローバル加点・減点はそれを再利用して
// 二重実装を避ける。
// =====================================================================

import {
  CATEGORY,
  DIFF_VALUE,
  DIFF_SCORE,
  SERIES_BONUS,
  SIDE_THROW_TAG,
  NO_ROTATION_TAG,
  TECHNIQUE_BONUS,
  APPARATUS_OP_BONUS,
  resolveRopeJump,
  ROPE_JUMPS,
  ropeJumpShapeDef,
  ropeJumpDifficulty,
  ropeJumpKey,
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
  REQUIRED_ELEMENT_DEDUCTION,
  MISSING_ELEMENT_DEDUCTION,
  VIOLATION_DEDUCTION,
  APPARATUS_REQUIRED_ELEMENTS,
  type RequiredElementAuto,
  VIOLATION_OPTIONS,
  skillDef,
  ART_DEDUCTION_ITEMS,
  clampArtDeduction,
  canOperateApparatus,
  DEEP_MOTION_PARTS,
  DEEP_MOTION_DEDUCTION,
  deepMotionParts,
  handOpChecksFor,
  HAND_OP_CHARACTER_ID,
  HAND_OP_CHECK_DEDUCTION,
  APPARATUS_CHARACTER_HINTS,
  OFF_BODY_TIP,
  OFF_BODY_REQUIRED_COUNT,
  OFF_BODY_DEDUCTION_STEP,
  offBodyShortage,
  soloHandElementDef,
  soloHandElementScored,
  countsAsFlex,
  FLEX_ELEMENT_DEDUCTION,
  APPARATUS_USE,
} from "./constants";
import {
  analyzeSeries,
  seriesSignature,
  maxSaltoChain,
  saltoFlags,
  motionDef,
  motionTimes,
  hasConnect,
  hasConnectWithoutApparatus,
  stripForApparatus,
  tumblingVariety,
  tumblingOperation,
  type TumblingVariety,
  type TumblingOperation,
  hoistRopeJumps,
  thrownCount,
  caughtCount,
  isCatchItem,
} from "./analysis";
import type { ApparatusKey, Difficulty, FutureLevel, Item, RopeJumpItem, Series, SeriesAnalysis, Unit } from "./types";

/** シリーズ内のユニット1つ分の難度点の内訳（表示用） */
export interface DiffRow {
  /** 表示用ラベル（投げ1／ロープ跳び／タンブリング1 など） */
  label: string;
  diff: Difficulty;
  score: number;
  /** 難度として採用されたか（重複・同一内容・連続投げのA難度は false） */
  adopted: boolean;
  /** 難度点の上位3つに入ったか */
  inTop: boolean;
}

/** 旧名（徒手系の行）。互換のため別名として残す。 */
export type HandDiffRow = DiffRow;

/**
 * 投げ・受け1つの技術加点の状況（UIの表示用）。
 *  - `earned`：加点になった（`points` 点）
 *  - `none`：加点になるチェック（視野外・手以外・手具を使った）が無い
 *  - `duplicate`：全く同じ投げ方・受け方がすでに加点済み（§3.5.5.5(2)「同じ技は重複して数えない」）
 *  - `dupSeries`：シリーズ全体が重複なので加点しない
 *  - `over`：投げの上限を超えた（ジュニアの6回目以降）
 */
export interface TechStatus {
  status: "earned" | "none" | "duplicate" | "dupSeries" | "over";
  points: number;
  /** その投げ・受けに付いた加点になるチェックの数（加点されたかどうかに関係なく） */
  bonusTags: number;
}

export interface SeriesBreakdown {
  tumDiff: number;
  handDiff: number;
  /** タンブリング難度点の塊ごとの内訳（不採用・上位3外も含む） */
  tumRows: DiffRow[];
  /** 徒手難度点の投げごとの内訳（不採用・上位3外も含む） */
  handRows: DiffRow[];
  sBonus: number;
  tech: number;
  /** アイテムごとの技術加点の状況（投げ・受けでないアイテムは null） */
  techItems: (TechStatus | null)[];
  appOp: number;
  twoMot: number;
  noApp: number;
  exec: number;
  dPart: number;
  aPart: number;
}

/** 単独で実施した徒手系要素（跳躍・柔軟）1件の内訳 */
/** 構成全体の跳びリスト（ロープ）の1行ぶんの評価 */
export interface RopeJumpRow {
  /** 跳びシリーズの番号と、その中での位置（UIの行と対応づける） */
  group: number;
  index: number;
  name: string;
  /** クロス・回数を反映した表示名（例：3重跳び（後ろ）・クロス×2） */
  label: string;
  difficulty: Difficulty;
  score: number;
  /** 同じ跳びをすでに数えているか（§3.4.4 同じ技は1回だけ） */
  duplicate: boolean;
  /** 難度の候補になったか（回数が1以上＆重複でない） */
  adopted: boolean;
  /** 上位3つに入って徒手系難度点に数えたか */
  inTop: boolean;
  /**
   * 隣り合う3重跳びをまとめた連続の2つ目以降なら、まとめ役（連続の先頭）の `index`。
   * この行は単独では難度に数えず、先頭の行が連続全体（回数の合計）で評価される。
   */
  runHead?: number;
}

export interface HandElementRow {
  /** 入力配列での位置（UIの行と対応づける） */
  index: number;
  id: string;
  name: string;
  /** §3.6.1 の分類（jump / flex） */
  group: string;
  /** 個人での難度 */
  difficulty: Difficulty;
  score: number;
  /** 徒手系難度に算入する群か（跳躍＝する／柔軟＝しない） */
  scored: boolean;
  /** 同じ要素をすでに数えているか（§3.4.4 同じ技は1回だけ） */
  duplicate: boolean;
  /** 難度の候補になったか（算入する群＆重複でない） */
  adopted: boolean;
  /** 徒手系の上位3つに入ったか */
  inTop: boolean;
}

export interface RequiredCheck {
  key: string;
  label: string;
  passed: boolean | null;
  /** 不足しているときのA減点（表示用。合計は各減点項目として aDeduction に入る） */
  deduction?: number;
  /** 画面のツールチップに出す説明 */
  tip?: string;
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

  /** 単独で実施した徒手系要素（跳躍・柔軟）の内訳 */
  handElementRows: HandElementRow[];
  /** ロープの跳び（構成全体のリスト）の評価。難度は徒手系難度の候補として上位3つを争う */
  ropeJumpRows: RopeJumpRow[];
  /** そのうち徒手系難度点に入った合計（handScore の一部） */
  ropeJumpScore: number;
  /** そのうち徒手系難度点に入った合計（handScore の一部） */
  handElementScore: number;

  // A
  /** 基本徒手から判定した深い運動の充足（上半身・下半身） */
  deepMotionChecks: RequiredCheck[];
  deepMotionDeduction: number;
  /** 柔軟の徒手を実施したか（難度には数えない） */
  flexCheck: RequiredCheck;
  flexDeduction: number;
  /** 手具操作の多様性チェック（2部位以上・特性・身体を離れる操作） */
  handOpChecks: RequiredCheck[];
  handOpDeduction: number;
  /** 身体を離れる手具操作の回数と不足回数 */
  offBodyCount: number;
  offBodyShort: number;
  apparatusElementChecks: RequiredCheck[];
  apparatusElementDeduction: number;
  violationChecks: RequiredCheck[];
  violationDeduction: number;
  /** §3.5.6.4 欠点テーブルの合計減点 */
  artDeduction: number;
  /**
   * 欠点テーブルの項目のうち、自動判定の減点が同じ項目に属するもの（§3.5.6.4 と §7.4.1 の整合）。
   * 「徒手系の種類・組み合わせの多様性」＝深い運動＋柔軟、「さまざまな操作」＝手具操作の多様性チェック（身体を離れる操作を含む）。
   * 手入力ぶんと自動判定ぶんを合わせて項目の上限（各1.00）で頭打ちにする。
   */
  artItemTotals: { id: string; name: string; manual: number; auto: number; total: number; max: number }[];
  /** 上の頭打ちで A減点から戻した量（自動判定と手入力の合計が項目の上限を超えた分） */
  artCapExcess: number;
  /** 欠点テーブルの内訳（入力があった項目だけでなく全項目を返す） */
  artRows: { id: string; name: string; group: string; max: number; note: string; value: number }[];
  /**
   * 「転回系の種類・組み合わせの多様性」の**自動計算**（`tumblingVariety`）。
   * A減点には自動では入れない（手動入力の欄に入れる値として画面に出す）。
   */
  tumVariety: TumblingVariety;
  /**
   * 「転回中の操作」の**自動計算**（`tumblingOperation`）。
   * こちらも A減点には自動では入れない（自動計算ボタンで手入力欄に入れる値）。
   */
  tumOperation: TumblingOperation;
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
  /** その他の投げ・その他のキャッチの回数（種類数に足されている分。重複シリーズでも数える） */
  varietyDeduction: number;
  /** 必須要素チェックのうち投げタン・つなぎ技・タンブリング本数の欠如（各 −0.30） */
  missingElementDeduction: number;
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
/** そのユニットが難度点に寄与する点数。採用の優劣比較に使う。 */
const unitScore = (u: Unit) => DIFF_SCORE[u.finalDiff];

export interface ComputeOptions {
  overallExecutionDeduction?: number;
  /** §3.2 実施した手具別必須要素のid */
  apparatusElements?: string[];
  /** §3.5.6.3 該当した違反・欠如のid */
  violations?: string[];
  /** ジュニア適用規則（変更規則1）で採点するか */
  junior?: boolean;
  /**
   * 十年後モードの上限難度（"F" / "G"）。null・未指定なら現行規則どおりE止め。
   * F・G難度を認定するだけで、他の規則（加点・減点・必須要素）は現行のまま。
   */
  future?: FutureLevel;
  /** §3.5.6.4 芸術と多様性の欠点テーブル（項目id → 減点）。審判の主観評価。 */
  artDeductions?: Record<string, number>;
  /** 実施した基本徒手のid（BASIC_HAND_ELEMENTS）。深い運動の充足を判定する。 */
  basicHands?: string[];
  /** 実施した手具操作のチェック項目id（HAND_OP_CHECKS）。 */
  handOps?: string[];
  /** 身体を離れる手具操作の回数。 */
  offBodyCount?: number;
  /** 単独で実施した徒手系要素（跳躍・柔軟）のid。跳躍は徒手系難度、柔軟は実施の有無だけを見る。 */
  handElements?: string[];
  /** ロープの跳びシリーズ（跳びの連続ごとのリスト）。同じシリーズで隣り合う跳びが連続した跳び。ロープ以外では無視する。 */
  ropeJumps?: RopeJumpItem[][];
}

/**
 * 1回の投げ・受けの種類。チェックした組み合わせ全体で1種類とし、被りは組み合わせが同じかで見る
 * （横投げ＋手具を使った投げ と 横投げだけ は別の投げ方）。
 * 右手・左手・二つ投げ（必須投げ・`reqTypes`）は種類に影響しない。チェックが無ければ `plain`。
 */
const kindKey = (types: string[], plain = "normal"): string => {
  const parts = [...new Set(types)].sort();
  return parts.length > 0 ? parts.join("+") : plain;
};

/** 投げ上げか（技の最中の投げを含む） */
const isThrowAt = (item: Item | undefined): boolean =>
  !!item && (item.kind === "throw" || (item.kind === "skill" && !!item.isThrow));

/**
 * §3.5.5.5(1) 難易度の高い連続した投げ受けの「つながった投げ受け」を、属するユニットの添字の組で返す。
 *  - ② 受けると同時に次の投げ（全手具）：キャッチの**直後**（間に何も挟まない）に次の投げがある →
 *    そのキャッチのユニットと次の投げのユニット
 *  - ① 次々に投げる（リング・クラブ）：手具が空中にあるうちに次を投げる → 1つ目を投げてから
 *    空中の手具が無くなるまでに通ったユニットすべて
 * 二つ投げ（1回の投げで2つ）だけでは「次々に」にならない。
 */
export function linkedThrowSpans(items: Item[], unitOfItem: number[], apparatus: ApparatusKey): number[][] {
  const spans: number[][] = [];
  const unitAt = (k: number) => unitOfItem[k] ?? -1;
  items.forEach((item, k) => {
    if (isCatchItem(item) && isThrowAt(items[k + 1])) spans.push([unitAt(k), unitAt(k + 1)]);
  });
  if (APPARATUS_USE[apparatus]) {
    let inAir = 0;
    let span: number[] | null = null;
    let start: number[] = [];
    items.forEach((item, k) => {
      if (span || inAir > 0) (span ?? start).push(unitAt(k));
      if (isThrowAt(item)) {
        if (inAir > 0 && !span) span = [...start];
        if (inAir === 0) start = [unitAt(k)];
        inAir += thrownCount(item);
      }
      if (isCatchItem(item)) {
        inAir = Math.max(0, inAir - caughtCount(item));
        if (inAir === 0) {
          if (span) spans.push(span);
          span = null;
          start = [];
        }
      }
    });
    if (span) spans.push(span);
  }
  return spans.map((s) => [...new Set(s.filter((u) => u >= 0))]);
}

export function computeScore(
  rawSeries: Series[],
  apparatus: ApparatusKey,
  opts: ComputeOptions = {},
): ScoreResult {
  // 手具を切り替えても他の手具のテンプレートを読み込んでもシリーズの中身は残るが、
  // その手具で入力できない内容（スティックの「手具を使ったキャッチ」・ロープ以外の
  // ロープ跳びなど）は入力画面に出ないので、採点にも効かせない
  // 旧データでシリーズの中に入っていたロープ跳びは、構成全体の跳びリストへ移して数える
  const hoisted = hoistRopeJumps(rawSeries);
  const series = stripForApparatus(hoisted.series, apparatus);
  const {
    overallExecutionDeduction = 0,
    apparatusElements = [],
    violations = [],
    junior = false,
    future = null,
    artDeductions = {},
    basicHands = [],
    handOps = [],
    offBodyCount = 0,
    handElements = [],
    ropeJumps: ropeJumpInput = [],
  } = opts;
  const ropeJumps: RopeJumpItem[][] = apparatus === "rope" ? [...ropeJumpInput, ...hoisted.jumps] : [];
  const analysis = series.map((ser) => analyzeSeries(ser, junior, future));
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
  // 重複シリーズ（全く同じシリーズの2本目）の投げも実施した投げなので、回数には数える
  // （難度・加点には数えないのは従来どおり）。
  const overLimitUnit = (() => {
    let n = 0;
    return analysis.map((a) =>
      a.units.map((u) => {
        if (u.throwCount === 0) return false;
        const over = maxThrowCount !== null && n >= maxThrowCount;
        n += u.throwCount;
        return over;
      }),
    );
  })();
  // アイテム単位（多様性・技術加点・必須投げの判定用）。投げと同じ順序で数える。
  const overLimitItem = (() => {
    let n = 0;
    return series.map((ser) =>
      ser.items.map((item) => {
        const isThrowItem = item.kind === "throw" || (item.kind === "skill" && !!item.isThrow);
        if (!isThrowItem) return false;
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
      if (item.kind === "catch" || (item.kind === "skill" && item.isCatch)) return last;
      return false;
    });
  });

  // 実施した投げ回数（上限超過分も含む。減点の算出に使う）
  // 重複シリーズの投げも実施した投げとして数える
  const performedThrowCount = analysis.reduce((s, a) => s + a.throwCount, 0);

  // ---- 難度点に採用するユニットをシリーズ順に確定する ----
  // 重複シリーズは全除外。演技全体で同じ内容の難度は1回しか数えない（§3.4.4）。
  // 連続投げの2回目以降も難度の候補には入る（難度が低ければ上位3つから漏れるだけ）。
  // 不採用でも本数・投げ回数・加点・A側の判定には従来どおり算入する。
  const candidates: { keys: string[]; unit: Unit; score: number }[] = [];
  analysis.forEach((a, i) => {
    if (dupFlags[i]) return;
    // 「重複ではない」と宣言されたシリーズは別内容として扱い、他シリーズと内容キーを共有しない
    const scope = series[i].notDuplicate ? `${i}#` : "";
    const within = a.units.filter((_u, j) => !overLimitUnit[i][j]);
    [...within.filter(isTumblingUnit), ...within.filter(isHandUnit)].forEach((unit, k) => {
      // 「その他」の手ありシェネを含むユニットは、いくつあっても重複と見なさない
      const uniq = unit.neverDuplicate ? `${i}#${k}#` : scope;
      candidates.push({
        keys: unit.signatures.map((sig) => uniq + sig),
        unit,
        score: unitScore(unit),
      });
    });
  });
  // 同じ内容が複数あるときは難度（点）の高いものだけを採用する（Q&A Q22）。同点なら先に実施した方。
  // キーを複数持つユニット（手あり／手なしのシェネ混在）は、どれかが埋まっていれば不採用。
  const takenKeys = new Set<string>();
  const chosen = new Set<Unit>();
  [...candidates]
    .map((c, order) => ({ ...c, order }))
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .forEach((c) => {
      if (c.keys.some((k) => takenKeys.has(k))) return;
      c.keys.forEach((k) => takenKeys.add(k));
      chosen.add(c.unit);
    });
  const adoptedUnits: Unit[][] = analysis.map((a) => a.units.filter((u) => chosen.has(u)));

  const unitAdopted = analysis.map((a, i) => {
    const adopted = new Set(adoptedUnits[i]);
    return a.units.map((u) => adopted.has(u));
  });

  // ---- 単独で実施した徒手系要素（跳躍・柔軟）----
  // 跳躍は §3.6.1 の個人難度を徒手系難度として採用する（§3.5.5.3(1)）。
  // 同じ要素を何度実施しても難度は1回だけ数える（§3.4.4）。
  // 柔軟は難度に数えず、実施したかどうかだけをA側で見る。
  const seenElementIds = new Set<string>();
  const handElementRows: HandElementRow[] = handElements.flatMap((id, index) => {
    const def = soloHandElementDef(id);
    if (!def) return [];
    const scored = soloHandElementScored(id);
    const duplicate = seenElementIds.has(id);
    if (!duplicate && scored) seenElementIds.add(id);
    return [
      {
        index,
        id,
        name: def.name,
        group: def.group,
        difficulty: def.solo,
        score: DIFF_SCORE[def.solo],
        scored,
        duplicate,
        adopted: scored && !duplicate,
        inTop: false,
      },
    ];
  });

  // ---- ロープの跳び（構成全体のリスト）----
  // 跳び1つごとに §3.5.5.3 の表から難度を引く。回数0の跳びは数えず、同じ跳びは1回だけ数える（§3.4.4）。
  const seenJumpKeys = new Set<string>();
  // 同じ跳びシリーズで隣り合う3重跳びは1つの連続として評価する（「3重とび2回」「3回以上の連続した3重跳び」）。
  // 形を変えて跳んだ3重跳び（様々な跳び②）を1行ずつ入れても、連続の難度は失われない。回数0の跳びは並びを切らない。
  const tripleRuns = ropeJumps.map((jumps) => {
    const headOf: number[] = jumps.map(() => -1);
    const totals = new Map<number, { count: number; allBack: boolean }>();
    let head = -1;
    jumps.forEach((item, index) => {
      const r = resolveRopeJump(item);
      if (!r || r.count === 0) return;
      if (r.def.rotations !== 3) {
        head = -1;
        return;
      }
      if (head < 0) head = index;
      headOf[index] = head;
      const t = totals.get(head) ?? { count: 0, allBack: true };
      totals.set(head, { count: t.count + r.count, allBack: t.allBack && r.def.direction === "back" });
    });
    return { headOf, totals };
  });
  const ropeJumpRows: RopeJumpRow[] = ropeJumps.flatMap((jumps, group) => jumps.flatMap((item, index) => {
    const resolved = resolveRopeJump(item);
    if (!resolved) return [];
    const run = tripleRuns[group];
    const head = run.headOf[index];
    const members = head >= 0 ? run.headOf.filter((h) => h === head).length : 1;
    // 連続の2つ目以降：先頭の行にまとめるので、ここでは数えない
    if (head >= 0 && head !== index && members > 1)
      return [
        {
          group,
          index,
          name: resolved.def.name,
          label: `${resolved.def.name}（前の3重跳びと連続）`,
          difficulty: ropeJumpDifficulty(resolved),
          score: 0,
          duplicate: false,
          adopted: false,
          inTop: false,
          runHead: head,
        },
      ];
    // 連続の先頭：回数を連続全体の合計にして評価する（前後が混じる「2回」は前回し側で見る）
    const total = head >= 0 && members > 1 ? run.totals.get(head)! : null;
    const r = total
      ? {
          ...resolved,
          def: total.allBack ? resolved.def : (ROPE_JUMPS.find((j) => j.rotations === 3 && j.direction === "front") ?? resolved.def),
          count: total.count,
        }
      : resolved;
    const key = ropeJumpKey(r);
    const counted = r.count > 0;
    const duplicate = counted && seenJumpKeys.has(key);
    if (counted) seenJumpKeys.add(key);
    const diff = ropeJumpDifficulty(r);
    return [
      {
        group,
        index,
        name: r.def.name,
        label: total
          ? `3重跳びの連続×${r.count}`
          : `${r.def.name}${r.cross ? "・クロス" : ""}${r.count > 1 ? `×${r.count}` : ""}`,
        difficulty: diff,
        score: DIFF_SCORE[diff],
        duplicate,
        adopted: counted && !duplicate,
        inTop: false,
      },
    ];
  }));

  // ---- 難度点の採用は上位3つまで。内訳表示でも使うのでここで確定する ----
  const adoptUnits = adoptedUnits.flat();
  const sortByDiff = (arr: Unit[]) => [...arr].sort((a, b) => DIFF_VALUE[b.finalDiff] - DIFF_VALUE[a.finalDiff]);
  const topTumbling = sortByDiff(adoptUnits.filter(isTumblingUnit)).slice(0, ADOPT_COUNT);
  // 徒手系は「投げ受けのユニット」と「単独の徒手系要素」が同じ枠を争う
  const handCandidates: { value: number; score: number; unit?: Unit; row?: HandElementRow; jump?: RopeJumpRow }[] = [
    ...adoptUnits
      .filter(isHandUnit)
      .map((u) => ({ value: DIFF_VALUE[u.finalDiff], score: DIFF_SCORE[u.finalDiff], unit: u })),
    ...handElementRows
      .filter((r) => r.adopted)
      .map((r) => ({ value: DIFF_VALUE[r.difficulty], score: r.score, row: r })),
    ...ropeJumpRows
      .filter((r) => r.adopted)
      .map((r) => ({ value: DIFF_VALUE[r.difficulty], score: r.score, jump: r })),
  ];
  // 同点はユニットを先に置いている（並べ替えは安定なので従来の採用が変わらない）
  const topHandAll = [...handCandidates].sort((a, b) => b.value - a.value).slice(0, ADOPT_COUNT);
  topHandAll.forEach((c) => {
    if (c.row) c.row.inTop = true;
    if (c.jump) c.jump.inTop = true;
  });
  const topHand = topHandAll.flatMap((c) => (c.unit ? [c.unit] : []));
  const inTop = new Set<Unit>([...topTumbling, ...topHand]);
  const unitInTop = analysis.map((a) => a.units.map((u) => inTop.has(u)));

  // ---- 技術加点・二つ投げ4動作加点の重複判定（§3.5.5.5(2)「同じ技は重複して数えない」）----
  // ①〜⑦すべてに掛かる但し書き。演技全体で全く同じ投げ方・受け方は最初の1回だけ加点する。
  // 視野外の投げ・手具を使った投げ自体は何回やってもよく、ダメなのは姿勢まで全く同じもの。
  // 「全く同じ」は投げ／受けの技術タグに加え、加点にならない横投げ・無回転・手以外の受け方の種類、
  // 技の最中ならその技まで含めて判定する。
  // 右手・左手・両手の違いは投げ方の種類とみなさない：左手投げも二つ投げ（両手投げ）も、
  // その受けの2つ同時キャッチもキーに入れない（必須要素の判定にだけ使う）。
  // 「重複ではない」と宣言されたシリーズは、難度と同じく他シリーズとキーを共有しない。
  const techSeen = new Set<string>();
  const twoMotSeen = new Set<string>();
  const sortedJoin = (xs: string[] | undefined) => [...(xs || [])].sort().join(",");
  const throwTechKey = (item: { throwTypes?: string[] }, skillId: string) =>
    `T|${skillId}|${sortedJoin(item.throwTypes)}`;
  const catchTechKey = (item: { catchTypes?: string[]; nonHandKind?: string }, skillId: string) => {
    const kind = (item.catchTypes || []).includes("nonhand") ? item.nonHandKind || "" : "";
    return `C|${skillId}|${sortedJoin(item.catchTypes)}|${kind}`;
  };

  // ---- 各シリーズ内訳（先に算出し、総和系グローバル値はこれを再利用）----
  const seriesBreakdowns: SeriesBreakdown[] = series.map((ser, i) => {
    const a = analysis[i];
    const isDup = dupFlags[i];
    // 重複シリーズは D（難度点・加点）に一切算入しない（§3.5.5「全く同じ技は難度として数えない」）
    const adoptedSet = new Set(adoptedUnits[i]);
    let tumNo = 0;
    const tumRows: DiffRow[] = a.units.filter(isTumblingUnit).map((u) => {
      tumNo += 1;
      return {
        label: u.isThrowTumbling ? `投げタン${tumNo}` : `タンブリング${tumNo}`,
        diff: u.finalDiff,
        score: unitScore(u),
        adopted: adoptedSet.has(u),
        inTop: inTop.has(u),
      };
    });
    const tumDiff = tumRows.reduce((s, r) => s + (r.adopted && r.inTop ? r.score : 0), 0);
    let throwNo = 0;
    let handNo = 0;
    const handRows: DiffRow[] = a.units.filter(isHandUnit).map((u) => {
      // 投げを含まない徒手系ユニット（タンブリングの合間の徒手など）は「徒手n」と表示する
      const label = u.isThrow ? `投げ${++throwNo}` : `徒手${++handNo}`;
      return {
        label,
        diff: u.finalDiff,
        score: DIFF_SCORE[u.finalDiff],
        adopted: adoptedSet.has(u),
        inTop: inTop.has(u),
      };
    });
    const handDiff = handRows.reduce((s, r) => s + (r.adopted && r.inTop ? r.score : 0), 0);
    // 上限超過（ジュニアの6回目以降）の投げは加点にも数えない
    const countedThrows = a.units.reduce((n, u, j) => n + (overLimitUnit[i][j] ? 0 : u.throwCount), 0);
    // §3.5.5.5(1)：つながった投げ受け（受けると同時に次の投げ／リング・クラブで次々に投げる）の中に
    // D難度以上の投げ受けがあるときだけ。同じシリーズに投げが2回あるだけでは加点しない
    const sBonus =
      !isDup &&
      countedThrows >= 2 &&
      linkedThrowSpans(ser.items, a.unitOfItem ?? [], apparatus).some((span) =>
        span.some((j) => {
          const u = a.units[j];
          if (!u || overLimitUnit[i][j] || u.type !== "throw") return false;
          // ①で2つ目が空中にある間の徒手（投げを含まないユニット）は、その難度で見る
          return u.hasDPlus || (!u.isThrow && DIFF_VALUE[u.finalDiff] >= DIFF_VALUE.D);
        }),
      )
        ? SERIES_BONUS
        : 0;

    let techCount = 0;
    const techScope = ser.notDuplicate ? `${i}#` : "";
    // 横投げ・無回転は投げ方の種類として数えるだけで、技術加点にはしない
    const bonusThrowTypes = (item: { throwTypes?: string[] }) =>
      (item.throwTypes || []).filter((t) => t !== SIDE_THROW_TAG && t !== NO_ROTATION_TAG).length;
    const techItems: (TechStatus | null)[] = ser.items.map((item, j) => {
      // 投げ・受けごとに、加点の対象になるチェック数とキーを出す
      const target =
        item.kind === "throw"
          ? { key: throwTechKey(item, ""), n: bonusThrowTypes(item) }
          : item.kind === "catch"
            ? { key: catchTechKey(item, ""), n: (item.catchTypes || []).length }
            : item.kind === "skill" && item.isThrow
              ? { key: throwTechKey(item, item.skillId), n: bonusThrowTypes(item) }
              : // 技の最中の受けもキャッチと同じく技術加点に数える
                item.kind === "skill" && item.isCatch
                ? { key: catchTechKey(item, item.skillId), n: (item.catchTypes || []).length }
                : null;
      if (!target) return null;
      const st = (status: TechStatus["status"], points = 0): TechStatus => ({ status, points, bonusTags: target.n });
      if (isDup) return st("dupSeries");
      if (itemOver[i][j]) return st("over"); // 上限超過の投げ受けは加点も数えない
      if (target.n <= 0) return st("none");
      // 同じ投げ方・受け方は演技全体で1回だけ（§3.5.5.5(2) の但し書き）
      const k = techScope + target.key;
      if (techSeen.has(k)) return st("duplicate");
      techSeen.add(k);
      techCount += target.n;
      return st("earned", target.n * TECHNIQUE_BONUS);
    });
    const tech = techCount * TECHNIQUE_BONUS;

    let appOp = 0;
    if (!isDup) {
      const ops = ser.items.filter(
        (item) => item.kind === "skill" && item.hasApparatus && canOperateApparatus(item.skillId),
      ).length;
      // 「投げ**または**2回以上の操作」（§3.5.5.5(3)）。技の最中に投げれば、手具操作のチェックが
      // 無くても条件を満たす（投げは手具を保持した技から離す動作なので、操作の入力は要らない。
      // きりもみ系の視野外投げも同じ）。手具が1つの種目では投げた後は保持できないので、この形になる
      const heldThrow = ser.items.some((item) => item.kind === "skill" && !!item.skillId && item.isThrow);
      if (ops >= 2 || heldThrow) {
        const maxD = a.units.reduce(
          (m, u, j) => (overLimitUnit[i][j] ? m : Math.max(m, DIFF_VALUE[u.finalDiff] || 0)),
          0,
        );
        // 十年後モードではE難度を超える転回系もこの加点の対象（現行規則では上限がEなので同じ）
        if (maxD >= DIFF_VALUE.E) appOp = APPARATUS_OP_BONUS;
      }
    }

    let twoMot = 0;
    if (!isDup) {
      let inTwo = false;
      let motSum = 0;
      let added = false;
      // 二つ投げの間の徒手の内容（種類→回数、順不同）。同じ内容は演技全体で1回だけ加点する（⑦の但し書き）
      let motKeys = new Map<string, number>();
      const fin = () => {
        if (inTwo && motSum >= 4 && !added) {
          const key = (ser.notDuplicate ? `${i}#` : "") + [...motKeys].map(([k, n]) => `${k}:${n}`).sort().join(",");
          if (!twoMotSeen.has(key)) {
            twoMotSeen.add(key);
            twoMot += TWOTHROW_MOTION_BONUS;
          }
          added = true;
        }
        inTwo = false;
        motSum = 0;
        motKeys = new Map();
        added = false;
      };
      ser.items.forEach((item, j) => {
        if (item.kind === "throw" || (item.kind === "skill" && item.isThrow)) {
          fin();
          // 上限超過（ジュニアの6回目以降）の二つ投げは加点に数えない
          if (!itemOver[i][j] && (item.reqTypes || []).includes("twothrow")) inTwo = true;
        } else if (item.kind === "catch" || (item.kind === "skill" && item.isCatch)) {
          fin();
        } else if (item.kind === "motion" && inTwo) {
          const m = motionDef(item.motionId, junior);
          if (m) {
            const times = motionTimes(item.count);
            motSum += m.motions * times;
            const mk = `${item.motionId}:${item.hands ? item.handsType || "h" : ""}`;
            if (times > 0) motKeys.set(mk, (motKeys.get(mk) || 0) + times);
          }
        }
      });
      fin();
    }

    let noApp = 0;
    if (!isDup && a.throwCount === 0) {
      const skills = ser.items
        .filter(
          (item): item is Extract<typeof item, { kind: "skill" }> => item.kind === "skill" && !!item.skillId,
        )
        // きりもみ系は実施中に手具を操作できないので、入力に残っていても操作として数えない
        .map((item) => ({ ...item, hasApparatus: !!item.hasApparatus && canOperateApparatus(item.skillId) }));
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
    return { tumDiff, handDiff, tumRows, handRows, sBonus, tech, techItems, appOp, twoMot, noApp, exec, dPart, aPart };
  });

  // ---- D（難度）----
  // A側の判定（方向系・連続宙返り・必須要素）は全ユニットを見る。
  const tumblingUnits = allUnits.filter(isTumblingUnit);

  const tumblingScore = topTumbling.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
  // 徒手系難度点＝上位3つ（投げ受けのユニット＋単独の徒手系要素）
  const handScore = topHandAll.reduce((s, c) => s + c.score, 0);
  const handElementScore = topHandAll.reduce((s, c) => s + (c.row ? c.score : 0), 0);
  const ropeJumpScore = topHandAll.reduce((s, c) => s + (c.jump ? c.score : 0), 0);
  // シリーズ内訳（sBonus）と同じ条件。上限超過の投げ・ユニットは数えない
  const seriesBonus = seriesBreakdowns.some((b) => b.sBonus > 0) ? SERIES_BONUS : 0;

  const techniqueBonus = seriesBreakdowns.reduce((s, b) => s + b.tech, 0);
  const techniqueCount = Math.round(techniqueBonus / TECHNIQUE_BONUS);
  // §3.5.5.5(3) は「最大0.10点」。技の最中の投げと手具操作2回以上は同じ加点なので重複しない
  const apparatusOpBonus = seriesBreakdowns.some((b) => b.appOp > 0) ? APPARATUS_OP_BONUS : 0;
  const twoThrowMotionBonus = seriesBreakdowns.reduce((s, b) => s + b.twoMot, 0);

  // 要素として数える投げ回数（ジュニアの上限超過分は含めない）。
  // 全く同じシリーズの2本目（重複シリーズ）も投げ回数には数える
  const totalThrowCount = analysis.reduce(
    (s, a, i) => s + a.units.reduce((t, u, j) => t + (overLimitUnit[i][j] ? 0 : u.throwCount), 0),
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

  // 方向系は転回技の系統で数える。徒手扱いの技（側転）は数えない
  const allTumblingSkills = tumblingUnits.flatMap((u) => u.skills);
  const cats = new Set(
    allTumblingSkills
      .map((s) => skillDef(s.skillId))
      .filter((d) => d && !d.isHandElement)
      .map((d) => d!.category),
  );
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

  // 投げ方・受け方の種類カウント（重複シリーズは除外）
  const throwKinds = new Set<string>();
  const catchKinds = new Set<string>();
  series.forEach((ser, i) => {
    const isDup = dupFlags[i];
    ser.items.forEach((item, j) => {
      if (itemOver[i][j]) return; // 上限超過の投げ受けは種類にも数えない
      if (item.kind === "throw") {
        if (isDup) return;
        // 1回の投げは1種類（チェックの組み合わせ全体）として数える
        throwKinds.add(kindKey(item.throwTypes || []));
      } else if (item.kind === "skill" && item.isThrow) {
        const types = item.throwTypes || [];
        if (isDup) return;
        // 1回の投げは1種類（チェックの組み合わせ全体）。チェックが無ければ投げタン
        throwKinds.add(kindKey(types, "tumthrow"));
      } else if (item.kind === "catch" || (item.kind === "skill" && item.isCatch)) {
        if (isDup) return;
        // 1回の受けは1種類（チェックの組み合わせ全体）として数える。
        // タンブリングの最中の受けは、最中の投げ（投げタン）と同じく別の1種類（チェックが無ければ「投げタン」の受け）
        catchKinds.add(kindKey(item.catchTypes || [], item.kind === "skill" ? "tumcatch" : "normal"));
      }
    });
  });
  const throwKindCount = throwKinds.size;
  const catchKindCount = catchKinds.size;
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

  const performedThrowTypes = new Set<string>();
  series.forEach((ser, i) =>
    ser.items.forEach((item, j) => {
      if (itemOver[i][j]) return;
      if (item.kind === "throw" || (item.kind === "skill" && item.isThrow))
        (item.reqTypes || []).forEach((t) => performedThrowTypes.add(t));
    }),
  );
  const required: RequiredCheck[] = [
    {
      key: "dir",
      label: "前方系・側方系・後方系をすべて含む",
      passed: cats.has(CATEGORY.FORWARD) && cats.has(CATEGORY.SIDE) && cats.has(CATEGORY.BACKWARD),
      deduction: directionDeduction,
      tip: "タンブリング技の系統で数える。側転は徒手扱いなので、側方系はロンダート・側宙で満たす。1系統不足につき −0.3",
    },
    {
      key: "throwTum",
      label: "1本以上が投げタン",
      passed: hasThrowTumbling,
      // 減点は §3.2 手具別必須要素「転回系の投げ受け」（−0.3）で1回だけ引く。ここでは引かない（二重計上しない）
      deduction: 0,
      tip: "投げ受けの間に転回系を実施する、または転回系の最中に投げる。1本あればよい（その転回系は難度が1ランク上がる）。不足の減点は手具別必須要素「転回系の投げ受け」の −0.3 で計上する",
    },
    {
      key: "triple",
      label: "1本以上が宙返り3回以上連続",
      passed: hasTriple,
      deduction: saltoChainDeduction,
      tip: "宙返り系が途切れず続いた回数。A難度技（ロンダート・バク転・ハンドスプリング等）は連鎖を切る。きりもみ系は宙返りの連続の中でだけ宙返りとして数える。2連続で −0.1、無しで −0.2",
    },
    {
      key: "connect",
      label: "1本以上がつなぎ技（宙返り間にA難度を挟む）",
      passed: hasConn,
      deduction: MISSING_ELEMENT_DEDUCTION,
      tip: "宙返りと宙返りの間にA難度技を挟む。側転は徒手扱いなのでつなぎ技にならない。手具操作は不要だが、操作が無いと別に −0.2",
    },
    {
      key: "count3",
      label: `投げを${requiredThrowCount}回以上実施`,
      passed: totalThrowCount >= requiredThrowCount,
      deduction: THROW_COUNT_DEDUCTION,
      tip: `技の最中の投げも1回として数える。ジュニアは2回以上（現在の必要回数 ${requiredThrowCount}回）`,
    },
    ...(maxThrowCount !== null
      ? [
          {
            key: "countMax",
            label: `投げは${maxThrowCount}回以内`,
            passed: performedThrowCount <= maxThrowCount,
            deduction: throwCountOverDeduction,
            tip: `ジュニア適用規則。${maxThrowCount}回を超えた投げは難度・加点・必須要素のどれにも数えず、1回につき −0.3`,
          },
        ]
      : []),
    {
      key: "tumCount",
      label: "タンブリング3本以上",
      passed: nonDupTumblingCount >= 3,
      deduction: MISSING_ELEMENT_DEDUCTION,
      tip: "投げを挟まない連続したタンブリングが1本。投げタンは投げ側に数える。内容が同じ重複シリーズは数えない",
    },
    // 手具別の必須投げ（左手投げ／二つ同時投げ）は §3.2 手具別必須要素として自動判定する
  ];

  // ロープ固有の要求要素（§3.2(3) ③〜⑥）。判定結果は手具別必須要素の自動判定に渡す。
  let jumpVarietyBonus = 0;
  const ropeAuto = { ropeTriple: false, ropeMoving: false, ropeFront: false, ropeBack: false };
  if (apparatus === "rope") {
    // 「連続」は同じ跳びシリーズの中で続けて並べた跳びで見る（シリーズが分かれていれば別々の実施）。
    // 回数入力があるので、1つの跳びに回数を入れても、種類の違う跳びを続けても数えられる。
    // 回数0の跳びは並びを切らずに数えない。
    type Jump = {
      rotations: number;
      direction: "front" | "back";
      moving: boolean;
      count: number;
      /** 体の形と跳び方（クロス）の組。②の「形が違う」の判定に使う */
      form: string;
      spinTwice: boolean;
    };
    const runs: Jump[][] = ropeJumps.map((jumps) =>
      jumps.flatMap((item) => {
        const r = resolveRopeJump(item);
        return r && r.count > 0
          ? [
              {
                rotations: r.def.rotations,
                direction: r.def.direction,
                moving: !!item.isMoving6m,
                count: r.count,
                form: `${ropeJumpShapeDef(item.shape)?.id ?? "plain"}:${r.cross ? "cross" : ""}`,
                spinTwice: !!item.spinTwice,
              },
            ]
          : [];
      }),
    );
    const allJumps = runs.flat();
    // 条件に合う跳びが途切れずに続いた回数の最大値
    const longestRun = (fits: (j: Jump) => boolean): number =>
      Math.max(
        0,
        ...runs.map((run) => {
          let best = 0;
          let cur = 0;
          run.forEach((j) => {
            cur = fits(j) ? cur + j.count : 0;
            best = Math.max(best, cur);
          });
          return best;
        }),
      );

    ropeAuto.ropeTriple = allJumps.some((j) => j.rotations >= 3);
    ropeAuto.ropeMoving = longestRun((j) => j.moving) >= 3;
    ropeAuto.ropeFront = longestRun((j) => !j.moving && j.direction === "front") >= 2;
    ropeAuto.ropeBack = longestRun((j) => !j.moving && j.direction === "back") >= 2;

    // §3.5.5.5(4) 様々な跳びに対する加点（①〜③のどれか、最大0.10）
    // ① 6m以上移動の連続跳びに2重跳び（rotations≧2）が3回以上：
    //    3回以上続く6m移動の跳びの並びの中に、2重跳び以上が3回以上ある。
    const movingRunHasDoubles = runs.some((run) => {
      let total = 0;
      let doubles = 0;
      let hit = false;
      const close = () => {
        if (total >= 3 && doubles >= 3) hit = true;
        total = 0;
        doubles = 0;
      };
      run.forEach((j) => {
        if (!j.moving) return close();
        total += j.count;
        if (j.rotations >= 2) doubles += j.count;
      });
      close();
      return hit;
    });
    // ② 3重跳びを3回続けた中で、各跳びの体の形・跳び方（伸身・抱え込み・開脚・屈伸・クロスなど）がすべて違う。
    //    同じ跳びシリーズの中で3重跳びが途切れずに続く並びから、連続する3回を見る（回数は同じ形の繰り返し）。
    const tripleFormsDiffer = runs.some((run) => {
      const forms: (string | null)[] = run.flatMap((j) => Array<string | null>(j.count).fill(j.rotations === 3 ? j.form : null));
      return forms.some((f, k) => k >= 2 && f !== null && forms[k - 1] !== null && forms[k - 2] !== null &&
        new Set([f, forms[k - 1], forms[k - 2]]).size === 3);
    });
    // ③ その場での回転跳びで、2重跳び以上の間に体が2回転する
    const spinDouble = allJumps.some((j) => j.spinTwice && !j.moving && j.rotations >= 2);
    if (movingRunHasDoubles || tripleFormsDiffer || spinDouble) jumpVarietyBonus = JUMP_VARIETY_BONUS;
  }

  const missing = required.filter((r) => r.passed === false);
  // つなぎ技・タンブリング本数の欠如（他の項目は固有の減点として既に計上している）。
  // 投げタンの欠如は手具別必須要素「転回系の投げ受け」と同じ内容なので、そちらで1回だけ引く
  const missingElementKeys = ["connect", "tumCount"];
  const missingElementDeduction =
    missing.filter((r) => missingElementKeys.includes(r.key)).length * MISSING_ELEMENT_DEDUCTION;

  // ---- §3.2 手具別必須要素（自動判定＋手動チェック）と §3.5.6.3 要求要素の欠如による A減点 ----
  // 右投げ右受け：左手投げでも手以外の投げでもない通常の投げが1回以上あれば実施とみなす。
  const hasRightThrow = series.some((ser) =>
    ser.items.some((item) => {
      if (item.kind === "throw")
        return !(item.reqTypes || []).includes("lefthand") && !(item.throwTypes || []).includes("nonhand");
      if (item.kind === "skill" && item.isThrow)
        return !(item.reqTypes || []).includes("lefthand") && !(item.throwTypes || []).includes("nonhand");
      return false;
    }),
  );
  // 転回系の投げ受け＝投げタン。1本以上あれば実施とみなす。
  const autoPassed: Record<RequiredElementAuto, boolean> = {
    rightThrow: hasRightThrow,
    // 左手投げ・二つ同時投げは必須投げのチェックから判定する（技の最中の投げも数える）
    leftThrow: performedThrowTypes.has("lefthand"),
    twoThrow: performedThrowTypes.has("twothrow"),
    throwTumbling: hasThrowTumbling,
    ...ropeAuto,
  };

  const apparatusElementChecks: RequiredCheck[] = APPARATUS_REQUIRED_ELEMENTS[apparatus].map((el) => ({
    key: `appEl_${el.id}`,
    label: el.auto ? `${el.name}（自動判定）` : el.name,
    passed: el.auto ? autoPassed[el.auto] : apparatusElements.includes(el.id),
  }));
  const apparatusElementDeduction =
    apparatusElementChecks.filter((c) => !c.passed).length * REQUIRED_ELEMENT_DEDUCTION;

  // ---- 基本徒手（深い運動の充足）と手具操作の多様性 ----
  const coveredParts = deepMotionParts(basicHands);
  const deepMotionChecks: RequiredCheck[] = DEEP_MOTION_PARTS.map((part) => ({
    key: `deep_${part.id}`,
    label: part.name,
    passed: coveredParts.has(part.id),
    deduction: DEEP_MOTION_DEDUCTION,
    tip: part.tip,
  }));
  const deepMotionDeduction = deepMotionChecks.filter((c) => !c.passed).length * DEEP_MOTION_DEDUCTION;

  // 柔軟は難度に数えないので、実施したかどうかだけを見る
  const flexCheck: RequiredCheck = {
    key: "flexElement",
    label: "柔軟の徒手を実施",
    passed: handElements.some((id) => countsAsFlex(id)),
    deduction: FLEX_ELEMENT_DEDUCTION,
    tip: "前後開脚・左右開脚・ブリッジのいずれか。反り身の跳躍も柔軟性として数える",
  };
  const flexDeduction = flexCheck.passed ? 0 : FLEX_ELEMENT_DEDUCTION;

  const offBodyShort = offBodyShortage(offBodyCount);
  const offBodyDeduction = offBodyShort * OFF_BODY_DEDUCTION_STEP;
  const handOpChecks: RequiredCheck[] = [
    ...handOpChecksFor(apparatus).map((c) => ({
      key: `handOp_${c.id}`,
      label: c.name,
      passed: handOps.includes(c.id),
      deduction: HAND_OP_CHECK_DEDUCTION,
      tip: c.id === HAND_OP_CHARACTER_ID ? `${c.tip}（例：${APPARATUS_CHARACTER_HINTS[apparatus].join("／")}）` : c.tip,
    })),
    {
      key: "handOp_offBody",
      label: `身体を離れる手具操作${OFF_BODY_REQUIRED_COUNT}回以上（${Math.max(0, Math.floor(Number(offBodyCount) || 0))}回）`,
      passed: offBodyShort === 0,
      deduction: offBodyDeduction,
      tip: OFF_BODY_TIP,
    },
  ];
  const handOpDeduction =
    handOpChecks.filter((c) => c.key !== "handOp_offBody" && !c.passed).length * HAND_OP_CHECK_DEDUCTION +
    offBodyDeduction;

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
  // §3.5.6.4 欠点テーブル（主観評価の手入力）
  const artRows = ART_DEDUCTION_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    group: item.group,
    max: item.max,
    note: item.note,
    value: clampArtDeduction(item.id, artDeductions[item.id]),
  }));
  const artDeduction = artRows.reduce((s, r) => s + r.value, 0);
  // 自動判定の減点は欠点テーブルの項目に属するので、手入力と合わせて項目の上限で頭打ちにする
  const round1 = (v: number) => Math.round(v * 100) / 100;
  const artAuto: Record<string, number> = {
    handVariety: deepMotionDeduction + flexDeduction,
    appVariety: handOpDeduction,
  };
  const artItemTotals = artRows
    .filter((r) => r.id in artAuto)
    .map((r) => {
      const auto = round1(artAuto[r.id]);
      return { id: r.id, name: r.name, manual: r.value, auto, total: round1(Math.min(r.max, r.value + auto)), max: r.max };
    });
  const artCapExcess = round1(artItemTotals.reduce((s, t) => s + (t.manual + t.auto - t.total), 0));
  // 転回系の多様性は自動で計算して返すだけ（A減点に入れるかは入力しだい）
  const tumVariety = tumblingVariety(series, junior);
  const tumOperation = tumblingOperation(series, apparatus);

  const aDeduction =
    artDeduction +
    noApparatusDeduction +
    directionDeduction +
    throwCountDeduction +
    throwCountOverDeduction +
    saltoChainDeduction +
    varietyDeduction +
    missingElementDeduction +
    deepMotionDeduction +
    flexDeduction +
    handOpDeduction +
    apparatusElementDeduction +
    violationDeduction -
    artCapExcess;
  // 減点はすべて 0.05 刻み以上なので、浮動小数の誤差（9.9999…）を 0.01 で丸める
  const aDeductionRounded = Math.round(aDeduction * 100) / 100;
  const aScore = Math.max(0, AE_FULL - aDeductionRounded);
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
    handElementRows,
    handElementScore,
    ropeJumpRows,
    ropeJumpScore,
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
    artDeduction,
    artItemTotals,
    artCapExcess,
    artRows,
    tumVariety,
    tumOperation,
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
    missingElementDeduction,
    deepMotionChecks,
    deepMotionDeduction,
    flexCheck,
    flexDeduction,
    handOpChecks,
    handOpDeduction,
    offBodyCount: Math.max(0, Math.floor(Number(offBodyCount) || 0)),
    offBodyShort,
    aDeduction: aDeductionRounded,
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
