// =====================================================================
// 構成の評価
//
// 「その構成がどれくらい良いか」を1つの数（`Evaluation.value`）にする。
// 中身は **D + A残点** を軸に、`generateWeights.ts` の重み × ここで数えた個数を引いたもの：
//
//   value = -(範囲外 + 本数超過) * 100      … 難度では覆せない
//           - 満たせていない必須要素          … `shortfallPenalty`
//           + Dスコア + 難度への上乗せ + A残点
//           - 実在の好みに合わない形（投げの回数・その他の投げ受け・縦3動作 …）
//           - タイブレーク（多様性・組み方・自動生成 …）
//
// 必須要素の不足もジュニアの投げ超過もA減点に出るので、この1つの数だけで
// 「必須要素を満たしつつ難度を上げ、範囲に収める」方向に進む。
// 探索（`generateSearch.ts`）はこの数が上がるかどうかだけを見る。
// =====================================================================

import { motionDef, motionTimes } from "./analysis";
import { OTHER_TAG } from "./autoThrows";
import {
  LIMITED_SKILLS,
  LIMITED_SKILL_MAX,
  apparatusHighDifficultyWeight,
  isHighDifficultySkill,
  readTumblingShape,
  throwTumblingShapeRank,
  tumblingShapeRank,
} from "./autoTumblings";
import {
  APPARATUS_REQUIRED_ELEMENTS,
  DIFF_VALUE,
  USE_APPARATUS_TAG,
  skillDef,
} from "./constants";
import {
  AUTO_SERIES_WEIGHT,
  A_PRIORITY,
  A_PRIORITY_WEIGHT,
  DEFAULT_MAX_THROW_TUMBLING,
  DEFAULT_MAX_TUMBLINGS,
  DIFFICULTY_PREFERENCE_WEIGHT,
  EXTRA_THROW_OPERATION_WEIGHT,
  FINISH_CATCH_TAG,
  FINISH_CATCH_WEIGHT,
  HARD_THROW_MAX_MOTIONS,
  HARD_THROW_TAGS,
  HARD_THROW_WEIGHT,
  HIGH_DIFFICULTY_WEIGHT,
  LIMITED_SKILL_WEIGHT,
  OTHER_STYLE_WEIGHT,
  REPEATABLE_SALTOS,
  REQUIRED_ELEMENT_WEIGHT,
  SALTO_VARIETY_WEIGHT,
  SHAPE_PRIORITY_WEIGHT,
  THROW_ORDER_WEIGHT,
  TUMBLING_PREFERENCE_WEIGHT,
  VERTICAL_THREE_MOTIONS,
  VERTICAL_THREE_THROW_WEIGHT,
  requiresAllElements,
  suppressHardThrow,
  throwCountPenalty,
} from "./generateWeights";
import { computeScore, type ScoreResult } from "./score";
import type { GenerateOptions } from "./generateOptions";
import type { SeriesTemplate } from "./templates";
import type { ApparatusKey, FutureLevel, Series } from "./types";

/** 演技全体での、実施が少ない技の回数（技idごと） */
export function limitedSkillCounts(series: Series[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => {
    if (LIMITED_SKILLS.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId) add(item.skillId);
      if (item.kind === "motion" && item.motionId) add(item.motionId);
    }),
  );
  return counts;
}

/** 演技全体での、単発で高難度（D難度以上）な技の数 */
export function highDifficultyCount(
  series: Series[],
  junior = false,
  future: FutureLevel = null,
): number {
  let n = 0;
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId && isHighDifficultySkill(item.skillId, junior, future))
        n += 1;
    }),
  );
  return n;
}

/**
 * 構成全体で、実施されにくい組み方ぶんの順位の合計（`TUMBLING_SHAPE_ORDER`）。
 * 転回系のユニットが1つのシリーズだけを見る（テンプレートの複合シリーズは対象外）。
 */
export function shapeRankTotal(
  series: Series[],
  r: ScoreResult,
  junior = false,
  future: FutureLevel = null,
): number {
  let total = 0;
  series.forEach((ser, i) => {
    const units = (r.analysis[i]?.units ?? []).filter((u) => u.type === "tumbling" || u.isThrowTumbling);
    if (units.length !== 1) return;
    const shape = readTumblingShape(ser, junior, future);
    if (!shape) return;
    total += units[0].isThrowTumbling
      ? throwTumblingShapeRank(shape, units[0].finalDiff)
      : tumblingShapeRank(shape, units[0].finalDiff);
  });
  return total;
}

/** その構成で「手以外・手具を使った投げのあとに徒手を2動作以上または転回系」を実施している回数 */
export function hardThrowCount(series: Series[], junior = false, future: FutureLevel = null): number {
  let count = 0;
  series.forEach((ser) => {
    let open = false;
    let hard = false;
    let motions = 0;
    let skills = 0;
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        open = true;
        hard = (item.throwTypes || []).some((t) => HARD_THROW_TAGS.includes(t));
        motions = 0;
        skills = 0;
        return;
      }
      if (!open) return;
      if (item.kind === "motion") {
        const def = motionDef(item.motionId, junior, future);
        if (def) motions += motionTimes(item.count);
        return;
      }
      if (item.kind === "skill") {
        skills += 1;
        return;
      }
      if (item.kind === "catch") {
        if (hard && (motions > HARD_THROW_MAX_MOTIONS || skills > 0)) count += 1;
        open = false;
        hard = false;
      }
    });
  });
  return count;
}

/** そのシリーズが手具の締めの受け方で終わっているか */
export function endsWithFinishCatch(series: Series, apparatus: ApparatusKey): boolean {
  const tag = FINISH_CATCH_TAG[apparatus];
  if (!tag) return false;
  const last = series.items[series.items.length - 1];
  return last?.kind === "catch" && (last.catchTypes || []).includes(tag);
}

/** 構成が手具の締めの受け方で終わっていないか（締め方の無い手具では常に false） */
export function missesFinishCatch(series: Series[], apparatus: ApparatusKey): boolean {
  if (!FINISH_CATCH_TAG[apparatus] || series.length === 0) return false;
  return !endsWithFinishCatch(series[series.length - 1], apparatus);
}

/** その他の投げ・その他のキャッチの回数 */
export function otherStyleCount(series: Series[]): number {
  let count = 0;
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "throw" || (item.kind === "skill" && item.isThrow))
        count += (item.throwTypes || []).filter((t) => t === OTHER_TAG).length;
      else if (item.kind === "catch") count += (item.catchTypes || []).filter((t) => t === OTHER_TAG).length;
    }),
  );
  return count;
}

export function verticalThreeThrowCount(
  series: Series[],
  junior = false,
  future: FutureLevel = null,
): number {
  let count = 0;
  series.forEach((ser) => {
    let vertical = 0;
    let open = false;
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        vertical = 0;
        open = true;
        return;
      }
      if (item.kind === "motion" && open) {
        const def = motionDef(item.motionId, junior, future);
        if (def) vertical += def.vertical * motionTimes(item.count);
        return;
      }
      if (item.kind === "catch" && open) {
        if (vertical >= VERTICAL_THREE_MOTIONS && !(item.catchTypes || []).includes(USE_APPARATUS_TAG))
          count += 1;
        open = false;
      }
    });
  });
  return count;
}

/** 難度に採用されない投げ受けに入っている徒手操作のぶん（A難度＝操作なしを0とする） */
export function extraThrowOperation(r: ScoreResult): number {
  let total = 0;
  r.analysis.forEach((a, i) =>
    a.units.forEach((u, j) => {
      if (u.throwCount === 0 || u.isThrowTumbling) return;
      if (r.unitInTop[i]?.[j]) return;
      total += DIFF_VALUE[u.finalDiff] - DIFF_VALUE.A;
    }),
  );
  return total;
}

/**
 * 連続投げ（1つのシリーズに投げ受けが2つ以上）のうち、**2回目以降のほうが難度が高い**
 * シリーズの数。1回目のほうが高いのが普通だが、逆の構成も現実にあるので、
 * `THROW_ORDER_WEIGHT`（難度点の刻みより小さい）だけ弱く嫌うだけにする。
 * 投げタンは転回系の難度で決まるので数えない。
 */
export function reversedThrowOrderCount(r: ScoreResult): number {
  let n = 0;
  r.analysis.forEach((a) => {
    const diffs = a.units
      .filter((u) => u.throwCount > 0 && !u.isThrowTumbling)
      .map((u) => DIFF_VALUE[u.finalDiff]);
    if (diffs.length < 2) return;
    if (Math.max(...diffs.slice(1)) > diffs[0]) n += 1;
  });
  return n;
}

/** 演技全体で同じ宙返りを繰り返した回数（2回目以降を数える。前宙は数えない）。 */
export function saltoRepeatCount(series: Series[]): number {
  const counts = new Map<string, number>();
  series.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind !== "skill" || !item.skillId) return;
      if (REPEATABLE_SALTOS.includes(item.skillId)) return;
      if (!skillDef(item.skillId)?.isSalto) return;
      counts.set(item.skillId, (counts.get(item.skillId) ?? 0) + 1);
    }),
  );
  let repeats = 0;
  counts.forEach((n) => (repeats += Math.max(0, n - 1)));
  return repeats;
}

/** 範囲から外れた分のペナルティ。範囲内なら0。 */
export function rangePenalty(d: number, min?: number | null, max?: number | null): number {
  let p = 0;
  if (min != null && d < min) p += min - d;
  if (max != null && d > max) p += d - max;
  return p;
}

export interface Evaluation {
  value: number;
  dScore: number;
  aScore: number;
  missing: string[];
  /** ルールの投げ回数（一般3回・ジュニア2回）に足りていないか。Dスコアに関係なく必ず満たす */
  throwCountUnmet: boolean;
}

/**
 * 構成の良さ。範囲外は強いペナルティ、そのうえで D + A残点 を最大化する。
 * 必須要素の不足・ジュニアの投げ超過はA減点として効くので、これだけで
 * 「必須要素を満たしつつ難度を上げる」方向に進む。
 */
export function evaluate(series: Series[], opts: GenerateOptions, autoCount = 0): Evaluation {
  const r = computeScore(series, opts.apparatus, { junior: !!opts.junior, future: opts.future ?? null });
  const penalty = rangePenalty(r.dScore, opts.minScore, opts.maxScore);
  // 投げタンの本数制限（既定1本）。超えた分は範囲外と同じ強さで嫌う。
  const maxThrowTum = opts.maxThrowTumbling ?? DEFAULT_MAX_THROW_TUMBLING;
  const throwTumCount = r.analysis.reduce(
    (n, a) => n + a.units.filter((u) => u.isThrowTumbling).length,
    0,
  );
  const overThrowTum = Math.max(0, throwTumCount - maxThrowTum);
  // タンブリングは投げタンを含めて3本までしか評価されない。4本目は入れない
  const overTumbling = Math.max(0, r.nonDupTumblingCount - (opts.maxTumblings ?? DEFAULT_MAX_TUMBLINGS));
  // 単発で高難度（D難度以上）な技は数が少ない。上限は決めず、重みで抑える
  const highDifficulty = highDifficultyCount(series, !!opts.junior, opts.future ?? null);
  // 実施が少ない技（ハンドスプリング・転宙）は演技内で1回まで。使うこと自体も弱く嫌う
  const limited = limitedSkillCounts(series);
  let limitedUsed = 0;
  let overLimited = 0;
  limited.forEach((n) => {
    limitedUsed += n;
    overLimited += Math.max(0, n - LIMITED_SKILL_MAX);
  });
  // 同じ宙返りの繰り返しは弱く嫌う（同点のときに多様な構成が選ばれる程度）
  const variety = saltoRepeatCount(series) * SALTO_VARIETY_WEIGHT;
  // 転回系の多様性の減点（§3.5.6.4）は手入力の項目だが、自動計算した値を評価では負う。
  // 上級者（難度の高い構成）になるほど宙返りの種類が増えるので、この減点は自然に小さくなる
  const tumVariety = r.tumVariety.deduction;
  // 同じ難度なら、より実施される組み方（C→B→B など）を選ぶ
  const shape = shapeRankTotal(series, r, !!opts.junior, opts.future ?? null) * SHAPE_PRIORITY_WEIGHT;
  // 連続投げは1回目のほうが難度が高いのが普通（逆の構成も現実にあるので弱く嫌うだけ）
  const throwOrder = reversedThrowOrderCount(r) * THROW_ORDER_WEIGHT;
  // 投げ上げの回数はDスコアに応じた最頻値に寄せる
  const throwCount = throwCountPenalty(r.performedThrowCount, r.dScore, !!opts.junior);
  // 難度に採用されない投げは加点だけを狙うので、操作を足さない
  const extraOperation = extraThrowOperation(r) * EXTRA_THROW_OPERATION_WEIGHT;
  // 前転3回（縦3動作）を手具を使ったキャッチ以外で受ける形は基本実施しない
  const verticalThree =
    verticalThreeThrowCount(series, !!opts.junior, opts.future ?? null) * VERTICAL_THREE_THROW_WEIGHT;
  // その他の投げ・その他のキャッチは可能な限り使わない
  const otherStyle = otherStyleCount(series) * OTHER_STYLE_WEIGHT;
  // クラブは押さえてキャッチ、ロープは足に絡めたキャッチで演技を締める
  const finishCatch = missesFinishCatch(series, opts.apparatus) ? FINISH_CATCH_WEIGHT : 0;
  // 手以外・手具を使った投げのあとに徒手を多く実施する形は、要求値が5.0を超えるまで嫌う
  const hardThrow = suppressHardThrow(opts)
    ? hardThrowCount(series, !!opts.junior, opts.future ?? null) * HARD_THROW_WEIGHT
    : 0;
  // 満たせていないA側の要求（優先順位つき）。ある程度のDスコアを狙う構成では必ず満たしにいく
  const shortfall = shortfallPenalty(r, opts.apparatus, requiresAllElements(opts));
  // 自動生成は同点ならテンプレートに譲る（多様性と同じく、点数は犠牲にしない重み）
  const auto = autoCount * AUTO_SERIES_WEIGHT;
  return {
    value:
      -(penalty + overThrowTum + overTumbling + overLimited) * 100 -
      shortfall +
      r.dScore +
      // 加点よりも高難度の実施を優先する（タンブリングの難度はさらに優先する）
      (r.tumblingScore + r.handScore) * DIFFICULTY_PREFERENCE_WEIGHT +
      r.tumblingScore * TUMBLING_PREFERENCE_WEIGHT +
      r.aScore -
      variety -
      tumVariety -
      shape -
      throwOrder -
      throwCount -
      extraOperation -
      verticalThree -
      otherStyle -
      finishCatch -
      hardThrow -
      auto -
      limitedUsed * LIMITED_SKILL_WEIGHT -
      (highDifficulty * (opts.highDifficultyWeight ?? HIGH_DIFFICULTY_WEIGHT)) /
        apparatusHighDifficultyWeight(opts.apparatus),
    dScore: r.dScore,
    aScore: r.aScore,
    missing: r.missing.map((m) => m.label),
    throwCountUnmet: r.required.some((c) => c.key === "count3" && c.passed === false),
  };
}

/**
 * 満たせていないA側の要求に対する評価の引き算。
 * `mandatory` なら1つにつき `REQUIRED_ELEMENT_WEIGHT`（必ず満たしにいく）、
 * それに加えて優先順位ぶんの小さな重み（同点のときのタイブレーク）を足す。
 * 手動チェックの手具別必須要素（ころがし等）とロープ跳びは生成では満たせないので数えない。
 */
export function shortfallPenalty(r: ScoreResult, apparatus: ApparatusKey, mandatory: boolean): number {
  let total = 0;
  const add = (unmet: boolean, priority: number) => {
    if (unmet) total += (mandatory ? REQUIRED_ELEMENT_WEIGHT : 0) + priority * A_PRIORITY_WEIGHT;
  };
  const failed = (key: string) => r.required.some((c) => c.key === key && c.passed === false);
  // 投げの回数はA側の最優先。Dスコアが低い構成でも**ルールの回数は必ず満たす**
  // （0〜1点台の選手が満たさないのはタンブリング側の要求で、投げの回数は投げるだけ）
  if (failed("count3") || failed("countMax"))
    total += REQUIRED_ELEMENT_WEIGHT + A_PRIORITY.throwCount * A_PRIORITY_WEIGHT;
  APPARATUS_REQUIRED_ELEMENTS[apparatus].forEach((el) => {
    // 投げ・受けの要求だけ（ロープ跳び・手動チェックの項目は生成では動かせない）
    if (el.auto !== "rightThrow" && el.auto !== "leftThrow" && el.auto !== "twoThrow") return;
    add(
      r.apparatusElementChecks.some((c) => c.key === `appEl_${el.id}` && !c.passed),
      A_PRIORITY.apparatusThrow,
    );
  });
  add(failed("throwTum"), A_PRIORITY.throwTumbling);
  add(r.varietyDeduction > 0, A_PRIORITY.variety);
  add(failed("connect"), A_PRIORITY.connect);
  add(failed("triple"), A_PRIORITY.triple);
  add(r.connectNoApparatus, A_PRIORITY.connectApparatus);
  add(failed("dir"), A_PRIORITY.other);
  add(failed("tumCount"), A_PRIORITY.other);
  return total;
}

/** テンプレートの並びを、採点できるシリーズの並びに直す */
export const seriesOf = (list: SeriesTemplate[]): Series[] => list.map((t) => structuredClone(t.series));

/** テンプレートの並びを評価する（自動生成の本数もここで数える） */
export const evaluateUsed = (list: SeriesTemplate[], opts: GenerateOptions): Evaluation =>
  evaluate(seriesOf(list), opts, list.filter((t) => t.auto).length);
