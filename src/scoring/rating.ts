// =====================================================================
// レーティング（実施できる技・シリーズの総合評価）
//
// 採点（`computeScore`）とは別物で、**ルールの難度を土台に、練習状況（実施できる確度）と
// ルールの加点を足して**「いま実施できる技・シリーズの強さ」を1つの数字にする。
// 採点側はここを一切読まない。調整値はこのファイルの先頭にまとめてある。
//
//   評価値 ＝ （ルール難度点 ＋ ルールの加点） × 確度（難度・加点から機械的に決まり、人が点を足す入力は無い）
//   ルールの加点 ＝ そのシリーズを `computeScore` に通した 技術加点・手具操作加点・二つ投げの徒手動作加点。
//   演技全体で1回だけの加点（シリーズ加点・様々な跳び）は入力ごとの評価に足さない。
//   加点は投げ・操作の質なので、投げを含むシリーズでは技と投げの確度の低いほうを掛ける。
//   レーティング ＝ 重複を畳んだ評価値の上位 `RATING_ADOPT_COUNT` 個の合計
//
// E より上（F・G）に届く経路は **「技そのものがF・G」「質の高い連続（上位2技の組み合わせ）」** だけ。
// 連続の長さ・動作数・同じ技の繰り返しでは E で止まる（低難度を並べて水増しできない）。
// =====================================================================

import {
  APPARATUS,
  DIFF_SCORE,
  DIFF_VALUE,
  VALUE_DIFF,
  skillDef,
  skillDifficulty,
} from "./constants";
import { analyzeSeries, stripForApparatus, tumblingFlags } from "./analysis";
import { computeScore } from "./score";
import { describeSeries } from "./templates";
import type { ApparatusKey, Difficulty, Item, Series, Unit } from "./types";

// ---- 調整値 ----

/** 実施できる度合い（A＝試合で実施できる … E＝不可）。確度は評価値に掛ける。 */
export type PerformGrade = "A" | "B" | "C" | "D" | "E";

export const PERFORM_GRADES: {
  id: PerformGrade;
  name: string;
  /** 技・タンブリングでの意味（どこでできるか） */
  note: string;
  /** 投げでの意味（どれだけ正確に決まるか。投げはトランポリン等で練習しないので場所では測らない） */
  throwNote: string;
  confidence: number;
}[] = [
  {
    id: "A",
    name: "A",
    note: "試合で実施できる",
    throwNote: "試合でも狙いどおりに決まる（ほぼ落とさない）",
    confidence: 1.0,
  },
  {
    id: "B",
    name: "B",
    note: "フロアでできる",
    throwNote: "練習ではよく決まるが、試合では落とすことがある",
    confidence: 0.6,
  },
  {
    id: "C",
    name: "C",
    note: "エアマットでできる",
    throwNote: "決まる・落とすが半々くらい",
    confidence: 0.3,
  },
  {
    id: "D",
    name: "D",
    note: "タントラ・トランポリンならできる・回ったことがある",
    throwNote: "たまに決まる程度",
    confidence: 0.1,
  },
  { id: "E", name: "E", note: "不可", throwNote: "投げられない・決まらない", confidence: 0 },
];

export const DEFAULT_PERFORM_GRADE: PerformGrade = "A";


/** 評価に採用する上位の数 */
export const RATING_ADOPT_COUNT = 10;
/**
 * 同じ難度の中でも**難しい技**の差別化。難度点に足す小さな加点で、技ごとに表で持つ（`DIFF_SCORE` の刻み 0.1 未満にして、
 * 難度の順序は変えない＝同じ難度の中でだけ効く）。ユニット（連続）には、含まれる技のうち最大の1つだけを足す
 * （同じ技を並べても、難しい技を重ねても増えない）。きりもみ・きりもみ転回は宙返りの連続に含まれるときだけ（徒手動作の扱いのときは対象外）。
 */
export const RATING_SKILL_PREMIUM: Record<string, number> = {
  b_tenchu: 0.05, // 転宙（B）
  b_kirimomi: 0.05, // きりもみ（B）
  c_kirimomiten: 0.05, // きりもみ転回（C）
};

/** そのユニットの難しい技の加点（転回系として数える技のうち最大の1つ） */
export function skillPremium(unit: Unit): { premium: number; skillId: string | null } {
  const ids = unit.skills.map((s) => s.skillId);
  const flags = tumblingFlags(ids);
  let best = { premium: 0, skillId: null as string | null };
  ids.forEach((id, i) => {
    const v = flags[i] ? (RATING_SKILL_PREMIUM[id] ?? 0) : 0;
    if (v > best.premium) best = { premium: v, skillId: id };
  });
  return best;
}

/** 同じ宙返りを続けて数える上限（4つ目からは連続に数えない） */
export const RATING_SAME_SALTO_MAX = 3;
/** 「質の高い連続」とみなすのに全員が満たすべき最低難度（連続に含まれる非A難度技すべて） */
export const RATING_CHAIN_MIN_DIFF: Difficulty = "C";
/**
 * 質の高い連続の換算値の閾値。連続のうち**難度の高い上位2技**だけを、ルールの連続と同じ式
 * （先頭＋以降は −1）で足した値。3つ目以降は足さないので、長く並べても上がらない。
 *   D＋C＝6（F）／E＋C＝7（F）／D＋D＝7（F）／E＋D＝8（G）／C＋C＝5（E止まり）
 */
export const RATING_CHAIN_F_VALUE = 6;
export const RATING_CHAIN_G_VALUE = 8;

export const performConfidence = (g: PerformGrade | undefined): number =>
  PERFORM_GRADES.find((x) => x.id === g)?.confidence ?? 0;

export function normalizePerformGrade(v: unknown, fallback: PerformGrade = DEFAULT_PERFORM_GRADE): PerformGrade {
  return PERFORM_GRADES.some((g) => g.id === v) ? (v as PerformGrade) : fallback;
}

// ---- 手具 ----

/** 手具無し（タンブリング・徒手だけ。投げ・キャッチ・手具操作を持たない） */
export const NO_APPARATUS = "none";
/** 共通（どの手具でも使える入力。手具固有の入力を持たず、スティック扱いで評価する。テンプレートの「共通」と同じ） */
export const COMMON_RATING_APPARATUS = "common";
export type RatingApparatus = ApparatusKey | typeof NO_APPARATUS | typeof COMMON_RATING_APPARATUS;

export const RATING_APPARATUS_OPTIONS: { id: RatingApparatus; name: string }[] = [
  { id: NO_APPARATUS, name: "手具無し" },
  { id: COMMON_RATING_APPARATUS, name: "共通" },
  ...(Object.keys(APPARATUS) as ApparatusKey[]).map((id) => ({ id, name: APPARATUS[id].name })),
];

export const DEFAULT_RATING_APPARATUS: RatingApparatus = "stick";

export function normalizeRatingApparatus(v: unknown): RatingApparatus {
  return v === NO_APPARATUS || v === COMMON_RATING_APPARATUS || (typeof v === "string" && v in APPARATUS)
    ? (v as RatingApparatus)
    : DEFAULT_RATING_APPARATUS;
}

/** 採点（加点の計算）に使う手具。手具無し・共通はスティック扱い。 */
export const scoringApparatusOf = (a: RatingApparatus): ApparatusKey =>
  a === NO_APPARATUS || a === COMMON_RATING_APPARATUS ? "stick" : a;

/** 手具固有の入力（二つ投げ・左手投げ・横投げ・手具を使った投げ／キャッチ・2つ同時キャッチ・ロープ跳び）を外す。共通の入力にする。 */
export function stripForCommon(series: Series): Series {
  const tags = (ids?: string[]) => (ids || []).filter((id) => id !== "side" && id !== "useapp");
  const items = series.items
    .filter((item) => item.kind !== "ropeJump")
    .map((item): Item => {
      if (item.kind === "throw") return { ...item, throwTypes: tags(item.throwTypes), reqTypes: [] };
      if (item.kind === "catch") return { ...item, catchTypes: tags(item.catchTypes), catchTwo: false };
      if (item.kind === "skill")
        return {
          ...item,
          throwTypes: tags(item.throwTypes),
          reqTypes: [],
          catchTypes: tags(item.catchTypes),
          catchTwo: false,
        };
      return item;
    });
  return { ...series, items };
}

/** 手具に関わる入力（投げ・キャッチ・手具操作・技の最中の投げ受け）を外す。手具無しの入力にする。 */
export function stripAllApparatus(series: Series): Series {
  const items = series.items
    .filter((item) => item.kind !== "throw" && item.kind !== "catch" && item.kind !== "ropeJump")
    .map((item): Item => {
      if (item.kind !== "skill") return item;
      const { hasApparatus: _a, isThrow: _t, isCatch: _c, throwTypes: _tt, reqTypes: _r, catchTypes: _ct, catchTwo: _c2, ...rest } = item;
      return { ...rest, hasApparatus: false, isThrow: false };
    });
  return { ...series, items: items.length ? items : [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }] };
}

/** 入力をその手具で表せる形に直す（手具で入力できない内容を落とす）。 */
export function seriesForApparatus(series: Series, apparatus: RatingApparatus): Series {
  if (apparatus === NO_APPARATUS) return stripAllApparatus(series);
  if (apparatus === COMMON_RATING_APPARATUS) return stripForCommon(series);
  return stripForApparatus([series], apparatus)[0];
}

// ---- 入力 ----

/** 入力1件。技ひとつもシリーズも `Series` で表す（技ひとつ＝アイテム1つのシリーズ）。 */
export interface RatingEntry {
  /** 一覧で見分けるための名前（任意） */
  name?: string;
  /** 手具（4種、または手具無し）。手具で入力できない内容は評価に入らず、重複もこの単位で判定する。 */
  apparatus: RatingApparatus;
  series: Series;
  /** 技・シリーズを実施できる度合い */
  grade: PerformGrade;
}

export function normalizeRatingEntries(v: unknown): RatingEntry[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw): RatingEntry[] => {
    const e = raw as Partial<RatingEntry> | null;
    if (!e || typeof e !== "object" || !e.series || !Array.isArray(e.series.items)) return [];
    return [
      {
        ...(typeof e.name === "string" && e.name ? { name: e.name } : {}),
        apparatus: normalizeRatingApparatus(e.apparatus),
        series: e.series,
        grade: normalizePerformGrade(e.grade),
      },
    ];
  });
}

// ---- 難度の評価 ----

/**
 * 同じ宙返りが `RATING_SAME_SALTO_MAX` を超えて続く分を取り除く（水増し防止）。
 * 隣り合うアイテム同士だけを見る（間に別の技・徒手が入れば別の連続）。
 * 投げ・受けを伴うアイテムは落とさない（ユニットの区切りが変わるため）。
 */
export function capRepeatedSaltos(series: Series): { series: Series; trimmed: number } {
  let run = 0;
  let last = "";
  let trimmed = 0;
  const items = series.items.filter((item) => {
    if (item.kind !== "skill" || !item.skillId || !skillDef(item.skillId)?.isSalto) {
      run = 0;
      last = "";
      return true;
    }
    run = item.skillId === last ? run + 1 : 1;
    last = item.skillId;
    if (run > RATING_SAME_SALTO_MAX && !item.isThrow && !item.isCatch) {
      trimmed += 1;
      return false;
    }
    return true;
  });
  return trimmed === 0 ? { series, trimmed } : { series: { ...series, items }, trimmed };
}

export type RaiseSource = "skill" | "chain" | null;

/** そのユニットの「E超え」の評価。ルール難度（E止め）の土台から引き上げて返す。 */
export function ratedDifficulty(
  unit: Unit,
  /** ルール難度（E止め）の土台。投げタンの転回側を評価するときは転回側の難度を渡す。 */
  baseDiff: Difficulty = unit.finalDiff,
): { diff: Difficulty; raise: RaiseSource } {
  const base = baseDiff;
  const ids = unit.skills.map((s) => s.skillId);
  const flags = tumblingFlags(ids);
  // 評価の対象にするのは転回系の技だけ（徒手として数える技は動作数の側で評価済み）
  const tumIds = ids.filter((_id, i) => flags[i]);
  // 十年後の技を含めて引くため、上限なし（G）で難度を取る。ジュニアは対象外
  const values = tumIds
    .map((id) => skillDifficulty(id, false, "G"))
    .filter((d): d is Difficulty => !!d && d !== "A")
    .map((d) => DIFF_VALUE[d]);
  if (values.length === 0) return { diff: base, raise: null };

  // ① 技そのものがF・G
  const inherent = Math.max(...values);
  // ② 質の高い連続：非A難度技が2つ以上で、すべて C以上。上位2技の換算値で F／G
  const quality = values.length >= 2 && values.every((v) => v >= DIFF_VALUE[RATING_CHAIN_MIN_DIFF]);
  const [top1 = 0, top2 = 0] = [...values].sort((a, b) => b - a);
  const folded = top1 + top2 - 1;
  const chain = !quality
    ? 0
    : folded >= RATING_CHAIN_G_VALUE
      ? DIFF_VALUE.G
      : folded >= RATING_CHAIN_F_VALUE
        ? DIFF_VALUE.F
        : 0;

  const best = Math.max(DIFF_VALUE[base], inherent, chain);
  if (best <= DIFF_VALUE[base]) return { diff: base, raise: null };
  return { diff: VALUE_DIFF[Math.min(best, DIFF_VALUE.G)], raise: inherent >= chain ? "skill" : "chain" };
}

// ---- 評価 ----

export interface RatingCandidate {
  entryIndex: number;
  unitIndex: number;
  /** 一覧に出す名前（入力に名前があればそれ、無ければ構成の要約） */
  label: string;
  /** 手具（重複の判定はこの単位。手具が違えば別の実施として数える） */
  apparatus: RatingApparatus;
  /** 投げを含む塊か */
  isThrow: boolean;
  /** 投げタンを投げ（徒手）と転回に分けたうちの、どちら側の候補か。投げタンでなければ null */
  part: "throw" | "tumbling" | null;
  /** 確度に使ったランク（入力のランク） */
  grade: PerformGrade;
  confidence: number;
  /** ルールどおりの難度（E止め） */
  ruleDiff: Difficulty;
  /** E超えを認めた難度（認めなければ ruleDiff と同じ） */
  ratedDiff: Difficulty;
  raise: RaiseSource;
  /** 難しい技の加点（`RATING_SKILL_PREMIUM`。同じ難度の中での差別化）。0なら対象の技なし */
  premium: number;
  /** 難しい技の加点の元になった技のid */
  premiumSkillId: string | null;
  /** 難度点（確度を掛ける前。難しい技の加点を含み、ルールの加点は含まない） */
  points: number;
  /** ルールの加点（技術・手具操作・二つ投げの徒手動作）。入力ごとに1回、評価値がいちばん高い塊にだけ載せる。 */
  bonus: number;
  /** points × 確度 ＋ bonus × 加点の確度 */
  value: number;
  /** E超え無しの評価値（ルール難度＋加点のみ） */
  ruleValue: number;
  /** 試合で実施できる（A）ときの評価値（確度1.0） */
  matchValue: number;
  /** 同じ宙返りの繰り返しを数えなかった個数 */
  trimmed: number;
  signatures: string[];
  neverDuplicate: boolean;
  adopted: boolean;
  /** 採用されなかった理由 */
  skipped?: "duplicate" | "contained" | "over";
}

export interface RatingResult {
  candidates: RatingCandidate[];
  /** 採用した上位の評価値の合計 */
  total: number;
  /** 同じ候補を「ルール難度のみ」で数えた合計 */
  ruleTotal: number;
  /** 試合で実施できる（A）ものだけで数えた合計（確度1.0） */
  matchTotal: number;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

const tumSeq = (c: RatingCandidate): string[] | null => {
  const s = c.signatures[0];
  return s && s.startsWith("tum:") ? s.slice(4).split(">") : null;
};

/** `inner` が `outer` の連続した部分列か（同じ長さは含まない） */
function isProperSublist(inner: string[], outer: string[]): boolean {
  if (inner.length >= outer.length) return false;
  for (let i = 0; i + inner.length <= outer.length; i++) {
    if (inner.every((id, j) => outer[i + j] === id)) return true;
  }
  return false;
}

/**
 * 評価値の降順に、重複（同じ内容・長い連続に含まれるだけの短い連続）を畳んで上位を採用する。
 * 同点は先に入力したほうが残る。
 */
function adopt(
  cands: RatingCandidate[],
  valueOf: (c: RatingCandidate) => number,
  count: number,
): Map<RatingCandidate, RatingCandidate["skipped"] | null> {
  const order = [...cands].sort((a, b) => valueOf(b) - valueOf(a) || cands.indexOf(a) - cands.indexOf(b));
  const result = new Map<RatingCandidate, RatingCandidate["skipped"] | null>();
  const seen = new Set<string>();
  let taken = 0;
  order.forEach((c) => {
    const key = (sig: string) => `${c.apparatus}|${sig}`;
    if (!c.neverDuplicate && c.signatures.some((sig) => seen.has(key(sig)))) {
      result.set(c, "duplicate");
      return;
    }
    const seq = tumSeq(c);
    if (
      seq &&
      order.some((o) => {
        const oseq = o === c || o.apparatus !== c.apparatus ? null : tumSeq(o);
        return !!oseq && valueOf(o) >= valueOf(c) && isProperSublist(seq, oseq);
      })
    ) {
      result.set(c, "contained");
      return;
    }
    if (!c.neverDuplicate) c.signatures.forEach((sig) => seen.add(key(sig)));
    if (taken >= count) {
      result.set(c, "over");
      return;
    }
    taken += 1;
    result.set(c, null);
  });
  return result;
}

/** そのシリーズ単体のルールの加点（技術加点＋手具操作加点＋二つ投げの徒手動作加点）。 */
export function entryBonus(series: Series, apparatus: ApparatusKey): number {
  const b = computeScore([series], apparatus).seriesBreakdowns[0];
  return b ? round(b.tech + b.appOp + b.twoMot) : 0;
}

/** 入力された技・シリーズからレーティングを計算する（採点とは独立）。 */
export function computeRating(entries: RatingEntry[], count = RATING_ADOPT_COUNT): RatingResult {
  const candidates: RatingCandidate[] = [];
  entries.forEach((entry, entryIndex) => {
    const first = candidates.length;
    // 手具で入力できない内容は落とす。手具無しは手具に関わる入力を全部外す（採点はスティック扱い）
    const entryApparatus = normalizeRatingApparatus(entry.apparatus);
    const { series, trimmed } = capRepeatedSaltos(seriesForApparatus(entry.series, entryApparatus));
    const bonus = entryBonus(series, scoringApparatusOf(entryApparatus));
    // 加点も入力のランクの確度で割り引く
    const bonusConf = performConfidence(entry.grade);
    // 現行規則（E止め）で解析し、E超えは ratedDifficulty が別に認める
    const analysis = analyzeSeries(series, false, null);
    analysis.units.forEach((unit, unitIndex) => {
      // 投げタン（投げ＋転回系）は、投げ（徒手）と転回を**別々の候補**にして両方を評価する。
      // ルールでは両者の高いほうを1つの難度にするが、レーティングでは両方が上位を争える
      const split = !!unit.isThrowTumbling && !!unit.tumblingDiff && !!unit.handDiff;
      const parts: { part: RatingCandidate["part"]; ruleDiff: Difficulty; signatures: string[]; throwSide: boolean }[] =
        split
          ? [
              { part: "tumbling", ruleDiff: unit.tumblingDiff as Difficulty, signatures: unit.signatures, throwSide: false },
              // 投げ側が A（動作なし）なら評価に値しないので出さない
              ...(DIFF_VALUE[unit.handDiff as Difficulty] > DIFF_VALUE.A
                ? [
                    {
                      part: "throw" as const,
                      ruleDiff: unit.handDiff as Difficulty,
                      signatures: unit.handSignatures ?? [],
                      throwSide: true,
                    },
                  ]
                : []),
            ]
          : [{ part: null, ruleDiff: unit.finalDiff, signatures: unit.signatures, throwSide: false }];
      parts.forEach((p) => {
        // 転回側は転回系の質（F・G）を、投げ側は動作数なのでルール難度（E止め）のまま評価する
        const { diff, raise } = p.part === "throw" ? { diff: p.ruleDiff, raise: null as RaiseSource } : ratedDifficulty(unit, p.ruleDiff);
        // 確度は入力のランク1つ。ランクの意味は技（どこでできるか）と投げ（どれだけ正確に決まるか）で読み替える
        const grade = entry.grade;
        const confidence = performConfidence(grade);
        // 同じ難度の中で難しい技（転宙・きりもみ・きりもみ転回）を高く評価する。投げ側（徒手）には付かない
        const { premium, skillId: premiumSkillId } = p.throwSide ? { premium: 0, skillId: null } : skillPremium(unit);
        const points = round(DIFF_SCORE[diff] + premium);
        candidates.push({
          entryIndex,
          unitIndex,
          label: entry.name || describeSeries(entry.series),
          apparatus: entryApparatus,
          isThrow: unit.isThrow,
          part: p.part,
          grade,
          confidence,
          ruleDiff: p.ruleDiff,
          ratedDiff: diff,
          raise,
          points,
          premium,
          premiumSkillId,
          bonus: 0,
          value: round(points * confidence),
          ruleValue: round(DIFF_SCORE[p.ruleDiff] * confidence),
          matchValue: confidence === 1 ? points : 0,
          trimmed,
          signatures: p.signatures,
          neverDuplicate: !!unit.neverDuplicate,
          adopted: false,
        });
      });
    });
    // 加点は入力ごとに1回だけ、そのシリーズでいちばん評価値の高い塊に載せる
    const mine = candidates.slice(first);
    const host = mine.reduce<RatingCandidate | null>((best, c) => (!best || c.value > best.value ? c : best), null);
    if (host && bonus > 0) {
      host.bonus = bonus;
      host.value = round(host.value + bonus * bonusConf);
      host.ruleValue = round(host.ruleValue + bonus * bonusConf);
      host.matchValue = host.confidence === 1 ? round(host.matchValue + bonus) : 0;
    }
  });

  const main = adopt(candidates, (c) => c.value, count);
  candidates.forEach((c) => {
    const skipped = main.get(c);
    c.adopted = skipped === null;
    if (skipped) c.skipped = skipped;
  });
  const sum = (m: Map<RatingCandidate, unknown>, valueOf: (c: RatingCandidate) => number): number =>
    round([...m.entries()].filter(([, s]) => s === null).reduce((n, [c]) => n + valueOf(c), 0));

  const ruleMap = adopt(candidates, (c) => c.ruleValue, count);
  // 試合で実施できるものだけ（確度1.0）。A以外は0扱いなので採用の並びで自然に落ちる
  const matchValue = (c: RatingCandidate) => c.matchValue;
  const matchMap = adopt(candidates, matchValue, count);
  return {
    candidates,
    total: sum(main, (c) => c.value),
    ruleTotal: sum(ruleMap, (c) => c.ruleValue),
    matchTotal: sum(matchMap, matchValue),
  };
}

// ---- 保存（端末ごとの localStorage。テンプレート・技の重みと同じ名前空間）----

export const RATING_STORAGE_KEY = "mens-rg-scorer:rating:v1";

export function loadRatingEntries(): RatingEntry[] {
  try {
    const raw = localStorage.getItem(RATING_STORAGE_KEY);
    return raw ? normalizeRatingEntries(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveRatingEntries(entries: RatingEntry[]): void {
  try {
    localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 保存できない環境（プライベートモード等）でも入力は続けられる
  }
}
