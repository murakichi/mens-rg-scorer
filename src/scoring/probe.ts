// =====================================================================
// 「○○は生成される？」を一度に確かめる（`scripts/probe.mjs` / `npm run probe`）
//
// 候補の作り方は持たない。`autoPool` と `generateRoutine` をそのまま呼ぶので、
// 生成に新しい形が増えても、ここは変えずにその形が数えられる。
//  - 候補の段階：自動生成の候補（宙返りの本数違いも含む）に、その技・形があるか
//  - 生成の段階：実際に N 本生成して、何本に出たか
//  - 候補にあるのに出ない／候補にも無い、を切り分けて原因の手がかりを出す
// 採点側は何も読まない・書かない。
// =====================================================================

import { SKILL_LIST, skillBlockedReason } from "./constants";
import { usableSkills } from "./tumblingTransitions";
import { autoPool, autoVariants } from "./generateSearch";
import { BASIC_LEVEL_MAX_SCORE } from "./generateWeights";
import { generateRoutine } from "./generate";
import { itemLabel } from "./templates";
import type { ApparatusKey, FutureLevel, Item, Series } from "./types";

/** 検索語：「前宙→きりもみ転回」のように → ／ -> ／ > で区切ると連鎖（隣り合う順）で探す */
export function parseQuery(query: string): string[] {
  return query
    .split(/→|->|>/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * アイテム1つの検索用の文字列。画面の名前（`itemLabel`）に、見た目に出ない指定を足す：
 * 技の最中の投げ・受け `(投げ)`/`(受)`、手具操作 `(操作)`、技術タグ・必須投げの id `[noview,twothrow]`。
 * 「前宙」は前宙に、「前宙(投げ)」は投げながらの前宙に、「twothrow」は二つ投げに当たる。
 */
export function itemText(item: Item): string {
  const rec = item as unknown as Record<string, unknown>;
  const mods: string[] = [];
  // `itemLabel` は技の最中の投げ・受けを「技名(投)」「技名(受)」で出すので、
  // ここで同じ指定を二重に付けないように落としてから付け直す（検索語はこちらの表記に揃える）
  const label = itemLabel(item).replace(/\((?:投|受)\)$/, "");
  if (rec.isThrow) mods.push("(投げ)");
  if (rec.isCatch) mods.push("(受)");
  if (rec.hasApparatus) mods.push("(操作)");
  const tags = [rec.reqTypes, rec.throwTypes, rec.catchTypes]
    .flatMap((v) => (Array.isArray(v) ? (v as string[]) : []))
    .filter(Boolean);
  if (rec.catchTwo) tags.push("catchTwo");
  if (tags.length > 0) mods.push(`[${tags.join(",")}]`);
  return `${label}${mods.join("")}`;
}

/**
 * シリーズの中に、検索語が隣り合う順で並んでいるところがあるか。
 * `*` はどのアイテム1つにも当たる。`exact` なら**シリーズ全体**が検索語と同じ長さで
 * 並ぶときだけ（シリーズごと指定するとき用。始まりも終わりも一致させる）。
 */
export function matchesChain(series: Series, terms: string[], exact = false): boolean {
  if (terms.length === 0) return false;
  const texts = series.items.map(itemText);
  if (exact && texts.length !== terms.length) return false;
  const at = (i: number) => terms.every((t, k) => t === "*" || texts[i + k].includes(t));
  for (let i = 0; i + terms.length <= texts.length; i++) if (at(i)) return true;
  return false;
}

/** 表示用：検索用の文字列で並べた全体（`投げ[twothrow]→前宙(投げ)→…`） */
export const describeText = (series: Series): string => series.items.map(itemText).join("→");

export interface ProbeOptions {
  query: string;
  apparatuses: ApparatusKey[];
  /** Dスコアの上限（null＝制限なし）。並べた数だけ行が増える */
  maxScores: (number | null)[];
  minScore?: number | null;
  /** 珍しさ（0〜100）。並べた数だけ行が増える */
  rarities: number[];
  /** 1行あたりに生成する構成の数 */
  runs: number;
  junior?: boolean;
  future?: FutureLevel;
  seed?: number;
  /** 検索語をシリーズ全体として探す（`matchesChain` の `exact`） */
  exact?: boolean;
}

export interface ProbeRow {
  apparatus: ApparatusKey;
  maxScore: number | null;
  rarity: number;
  /** 自動生成の候補（宙返りの本数違いを含む）の数と、そのうち当たったもの */
  candidates: number;
  candidateHits: number;
  /** 生成できた構成の数と、そのうち当たったもの（シリーズ単位の当たりも） */
  routines: number;
  routineHits: number;
  seriesHits: number;
  /** 当たったシリーズの例（重複なし、最大3件） */
  examples: string[];
  /** 候補の当たりの例（重複なし、最大3件） */
  candidateExamples: string[];
}

export interface SkillDiagnosis {
  id: string;
  name: string;
  /** 条件に関わらず使えない理由（ジュニア禁止・団体のみ・十年後モード専用） */
  blocked: string;
  /** 自動生成では組み立てない技（ダイビング） */
  noAuto: boolean;
  /** 上限ごとに、自動生成の技の候補に入るか */
  usableAt: { maxScore: number | null; usable: boolean }[];
}

/** 乱数（`--seed` で同じ結果を再現できる） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pushUnique = (list: string[], s: string, max = 3) => {
  if (list.length < max && !list.includes(s)) list.push(s);
};

/** 検索語に名前が当たる技が、その条件で自動生成の候補に入れるか */
export function diagnoseSkills(opts: ProbeOptions): SkillDiagnosis[] {
  const terms = parseQuery(opts.query);
  const junior = !!opts.junior;
  const future = opts.future ?? null;
  const hit = new Map<string, (typeof SKILL_LIST)[number]>();
  for (const s of SKILL_LIST) if (terms.some((t) => s.name.includes(t))) hit.set(s.id, s);
  return [...hit.values()].map((s) => ({
    id: s.id,
    name: s.name,
    blocked: skillBlockedReason(s.id, junior, future),
    noAuto: !!s.noAuto,
    usableAt: opts.maxScores.map((maxScore) => ({
      maxScore,
      usable:
        usableSkills({
          junior,
          future,
          basicLevel: maxScore != null && maxScore < BASIC_LEVEL_MAX_SCORE,
          targetScore: maxScore,
        })([s.id]).length > 0,
    })),
  }));
}

export function probe(opts: ProbeOptions): ProbeRow[] {
  const terms = parseQuery(opts.query);
  const rows: ProbeRow[] = [];
  const base = opts.seed ?? 1;
  let k = 0;
  for (const apparatus of opts.apparatuses)
    for (const maxScore of opts.maxScores)
      for (const rarity of opts.rarities) {
        const rand = seededRandom(base + k++);
        const gen = {
          apparatus,
          junior: !!opts.junior,
          future: opts.future ?? null,
          minScore: opts.minScore ?? null,
          maxScore,
          rarity,
        };
        const row: ProbeRow = {
          apparatus,
          maxScore,
          rarity,
          candidates: 0,
          candidateHits: 0,
          routines: 0,
          routineHits: 0,
          seriesHits: 0,
          examples: [],
          candidateExamples: [],
        };
        const pool = autoPool(gen, [], rand).flatMap((t) => [t, ...autoVariants(t)]);
        for (const t of pool) {
          row.candidates++;
          if (matchesChain(t.series, terms, opts.exact)) {
            row.candidateHits++;
            pushUnique(row.candidateExamples, describeText(t.series));
          }
        }
        for (let i = 0; i < opts.runs; i++) {
          const r = generateRoutine([], { ...gen, random: rand });
          if (!r) continue;
          row.routines++;
          const hits = r.series.filter((s) => matchesChain(s, terms, opts.exact));
          if (hits.length > 0) row.routineHits++;
          row.seriesHits += hits.length;
          hits.forEach((s) => pushUnique(row.examples, describeText(s)));
        }
        rows.push(row);
      }
  return rows;
}

// ---------------------------------------------------------------------
// 到達可能性（`--reach`）：生成（N本）を回さず、候補の抽選だけを多数の種で掃いて
// 「理論上その形が候補に出うるか」を1回で調べる。
//  - 評価・探索（`generateRoutine`）を呼ばないので、生成の何十倍も速い
//  - 抽選（確率ゲート・候補数の上限）は毎回引き直すので、種を掃いた和集合を取る
//  - 技の並びの組み合わせは膨大で形の空間は出し尽くせないので、「出ない」は
//    抽選を掃いた範囲での否定（証明ではない）。代わりに検索語ごとの当たりを返し、
//    連鎖のどの語が1つも出ないのか／各語は出るのに並びが出ないのかを切り分ける
// ---------------------------------------------------------------------

export interface ReachRow {
  apparatus: ApparatusKey;
  maxScore: number | null;
  rarity: number;
  /** 掃いた種の数 */
  seeds: number;
  /** 和集合に出た形（重複なし）の数と、そのうち当たったもの */
  shapes: number;
  hits: number;
  /** 当たった種の数（高いほど出やすい。抽選ゲートの強さの目安） */
  hitSeeds: number;
  /** 検索語ごとに、その語を含むアイテムが1つでもある形の数（連鎖の切り分け用） */
  termHits: { term: string; shapes: number }[];
  examples: string[];
}

/** 乱数が常に一定値を返す（確率ゲートを全部開く0／全部閉じる 0.999 の両端を掃くため） */
const constantRandom = (v: number) => () => v;

export function reach(opts: ProbeOptions & { seeds?: number }): ReachRow[] {
  const terms = parseQuery(opts.query);
  const seeds = Math.max(1, opts.seeds ?? 200);
  const base = opts.seed ?? 1;
  const rows: ReachRow[] = [];
  for (const apparatus of opts.apparatuses)
    for (const maxScore of opts.maxScores)
      for (const rarity of opts.rarities) {
        const gen = {
          apparatus,
          junior: !!opts.junior,
          future: opts.future ?? null,
          minScore: opts.minScore ?? null,
          maxScore,
          rarity,
        };
        const seen = new Set<string>();
        const termShapes = new Map<string, Set<string>>(terms.filter((t) => t !== "*").map((t) => [t, new Set()]));
        const hitShapes = new Set<string>();
        let hitSeeds = 0;
        const sweep = (rand: () => number) => {
          let hit = false;
          for (const t of autoPool(gen, [], rand).flatMap((x) => [x, ...autoVariants(x)])) {
            const key = describeText(t.series);
            seen.add(key);
            const texts = t.series.items.map(itemText);
            for (const [term, set] of termShapes) if (texts.some((x) => x.includes(term))) set.add(key);
            if (matchesChain(t.series, terms, opts.exact)) {
              hit = true;
              hitShapes.add(key);
            }
          }
          if (hit) hitSeeds++;
        };
        sweep(constantRandom(0));
        sweep(constantRandom(0.999));
        for (let i = 0; i < seeds; i++) sweep(seededRandom(base + i));
        rows.push({
          apparatus,
          maxScore,
          rarity,
          seeds,
          shapes: seen.size,
          hits: hitShapes.size,
          hitSeeds,
          termHits: [...termShapes].map(([term, set]) => ({ term, shapes: set.size })),
          examples: [...hitShapes].slice(0, 3),
        });
      }
  return rows;
}

export function reachVerdict(row: ReachRow): string {
  if (row.hits > 0) return `候補に出る（${row.seeds + 2}回の抽選中 ${row.hitSeeds} 回）`;
  const missing = row.termHits.filter((t) => t.shapes === 0).map((t) => t.term);
  if (missing.length > 0)
    return `候補に出ない（「${missing.join("」「")}」を含む形が1つも無い＝この条件では作られない。形・重み0・上限・手具の制約）`;
  return row.termHits.length > 1
    ? "各語は出るが、この並び・組み合わせは出ない（連鎖の規則か、抽選で外れた。--seeds を増やして確認）"
    : "見つからず（抽選を掃いた範囲では出ない。--seeds を増やして確認）";
}

/** 結果の読み方：候補の段階で落ちているか、評価で落ちているか */
export function verdict(row: ProbeRow): string {
  if (row.candidateHits === 0) return "この抽選の候補にない（形・連鎖・重み0・上限・手具の制約。抽選は毎回引き直すので、少ないときは --seed を変えて再確認）";
  if (row.routineHits === 0) return "候補にはあるが採用されない（評価で負けている）";
  return "出る";
}
