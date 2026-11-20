/**
 * 自動生成の「質」を測る（`npm run quality`、`__tests__/generateQuality.test.ts`）。
 *
 * 生成は乱数に敏感で、**乱数を1回足すだけで**ほかの抽選がずれ、結果が大きく揺れる
 * （2026-11-18：クラブの「下限4.2で6ユニット全部E」が 42/50→34/50。`docs/generator-notes.md`）。
 * 形を足す・重みを変えるたびに、点数の取り方が悪くなっていないかを同じ物差しで比べられるよう、
 * 固定の場面（手具 × Dスコアの要求）と固定の種で生成し、指標を出す。
 *
 * 指標は**採点そのもの**（`computeScore`）と生成の約束事（範囲・必須要素・全部E・加点の重複）だけを見る。
 * 「この形が何%出る」のような味付けの割合は入れない（それは個別の `slowIt` テストの役目）。
 *
 * 基準値は `__tests__/quality-baseline.json`。`npm run quality -- --update` で今の値に書き換える
 * （生成を意図して変えたときだけ。下がったまま書き換えない）。
 */
import { generateRoutine } from "./generate";
import { allEShortfall, duplicateTechCount } from "./generateEvaluate";
import { seededRandom } from "./probe";
import { computeScore } from "./score";
import type { ApparatusKey } from "./types";

/** 1つの場面（手具 × Dスコアの要求） */
export interface QualityScenario {
  id: string;
  apparatus: ApparatusKey;
  minScore?: number;
  maxScore?: number;
  /** 構成数の倍率（揺れを小さくしたい場面だけ増やす） */
  runScale?: number;
}

const APPARATUSES: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];

/**
 * 測る場面。低め（上限3.0）・中くらい（上限4.5）・上限なし・上級（下限4.2＝6ユニット全部E）。
 * 上限は「その水準の選手」、下限4.2は「全部E難度を狙う選手」を想定している。
 */
export const QUALITY_SCENARIOS: QualityScenario[] = APPARATUSES.flatMap((apparatus) => [
  { id: `${apparatus}/max3.0`, apparatus, maxScore: 3.0 },
  { id: `${apparatus}/max4.5`, apparatus, maxScore: 4.5 },
  { id: `${apparatus}/none`, apparatus },
  // 全部Eの割合は揺れが大きいので、この場面だけ構成数を増やす（25×2.4＝60）
  { id: `${apparatus}/min4.2`, apparatus, minScore: 4.2, runScale: 2.4 },
]);

/** 1場面あたりに生成する構成の数（既定）。多いほど揺れは小さいが時間がかかる（1構成0.2〜0.4秒） */
export const QUALITY_DEFAULT_RUNS = 25;

/** 指標。上がるほど良いもの（`higher`）と、下がるほど良いもの（`lower`）がある */
export interface QualityMetrics {
  /** 生成できた構成の数 */
  n: number;
  /** Dスコアが要求の範囲（下限〜上限）に入った割合 */
  inRange: number;
  /** Dスコアの平均 */
  avgD: number;
  /** Aスコアの平均（減点の少なさ） */
  avgA: number;
  /** 必須要素の不足が1つも無い割合 */
  fullElements: number;
  /** 採点される6ユニットが全部E難度（以上）の割合 */
  allE: number;
  /**
   * E難度に届いていない採点ユニットの数の平均（`allEShortfall`）。全部Eの割合より揺れが小さく、
   * 全部Eを狙う仕組みが効かなくなったときにはっきり上がる（重みを0にすると 0.30→0.47／0.33→0.58、
   * 乱数の並びがずれただけでも 0.33→0.47 になった例がある。2026-11-20）
   */
  eShort: number;
  /** 加点済みと全く同じ投げ方・受け方（加点にならない技術タグ）の1構成あたりの数 */
  dupTech: number;
}

export type MetricKey = Exclude<keyof QualityMetrics, "n">;

/** 指標の向きと、基準値からどこまで下がってよいか（揺れの幅。25構成でおよそ2標準偏差） */
export const METRIC_RULES: Record<MetricKey, { better: "higher" | "lower"; tolerance: number; label: string }> = {
  inRange: { better: "higher", tolerance: 0.12, label: "範囲内" },
  avgD: { better: "higher", tolerance: 0.12, label: "D平均" },
  avgA: { better: "higher", tolerance: 0.12, label: "A平均" },
  fullElements: { better: "higher", tolerance: 0.15, label: "必須充足" },
  allE: { better: "higher", tolerance: 0.2, label: "全部E" },
  eShort: { better: "lower", tolerance: 0.15, label: "E不足" },
  dupTech: { better: "lower", tolerance: 0.15, label: "加点重複" },
};

/** その場面で生成の約束事として見る指標（全部Eは下限4.2の場面だけ） */
export const scenarioMetrics = (s: QualityScenario): MetricKey[] =>
  (["inRange", "avgD", "avgA", "fullElements", "dupTech"] as MetricKey[]).concat(
    s.minScore !== undefined && s.minScore >= 4.2 ? ["allE", "eShort"] : [],
  );

/** 種から乱数を作る。場面ごとに同じ種の列を使う */
const seedOf = (k: number) => seededRandom(k * 7919 + 13);

/** 1場面を測る */
export function measureQuality(s: QualityScenario, baseRuns = QUALITY_DEFAULT_RUNS): QualityMetrics {
  const runs = Math.round(baseRuns * (s.runScale ?? 1));
  let n = 0;
  let inRange = 0;
  let sumD = 0;
  let sumA = 0;
  let full = 0;
  let allE = 0;
  let dup = 0;
  let short = 0;
  for (let k = 1; k <= runs; k++) {
    const r = generateRoutine([], {
      apparatus: s.apparatus,
      minScore: s.minScore,
      maxScore: s.maxScore,
      random: seedOf(k),
    });
    if (!r) continue;
    const sc = computeScore(r.series, s.apparatus);
    n += 1;
    const d = sc.dScore;
    if ((s.minScore === undefined || d >= s.minScore - 1e-9) && (s.maxScore === undefined || d <= s.maxScore + 1e-9))
      inRange += 1;
    sumD += d;
    sumA += sc.aScore;
    if (sc.missing.length === 0) full += 1;
    const miss = allEShortfall(sc);
    if (miss === 0) allE += 1;
    short += miss;
    dup += duplicateTechCount(sc);
  }
  const avg = (x: number) => (n > 0 ? x / n : 0);
  return {
    n,
    inRange: avg(inRange),
    avgD: avg(sumD),
    avgA: avg(sumA),
    fullElements: avg(full),
    allE: avg(allE),
    eShort: avg(short),
    dupTech: avg(dup),
  };
}

/** 基準値と比べて悪くなった指標（許容幅を超えたもの） */
export function qualityRegressions(
  s: QualityScenario,
  now: QualityMetrics,
  base: Partial<QualityMetrics> | undefined,
): { key: MetricKey; now: number; base: number }[] {
  if (!base) return [];
  return scenarioMetrics(s).flatMap((key) => {
    const b = base[key];
    if (typeof b !== "number") return [];
    const { better, tolerance } = METRIC_RULES[key];
    const worse = better === "higher" ? now[key] < b - tolerance : now[key] > b + tolerance;
    return worse ? [{ key, now: now[key], base: b }] : [];
  });
}

/** 基準値ファイルの形 */
export interface QualityBaseline {
  /** 測ったときの1場面あたりの構成数 */
  runs: number;
  /** 測った日（メモ） */
  measuredAt: string;
  scenarios: Record<string, QualityMetrics>;
}
