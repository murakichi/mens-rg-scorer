// =====================================================================
// 改善提案：今の構成を「1手だけ」変えた候補を並べる
//
// 生成（generate.ts）がゼロから組むのに対して、こちらは **すでにある構成の
// 次の一手** を出す。候補は入力画面で実際にできる操作だけに限り、評価は
// `computeScore` を候補ごとに呼んで D と A残点 の差を取るだけ — 採点の解釈を
// ここに持ち込まない（採点の唯一の出どころは score.ts のまま）。
// =====================================================================

import { needsRoundoffBefore, prevSkillId, roundoffItem, stripForApparatus } from "./analysis";
import {
  CATCH_OPTIONS_APPARATUS,
  CATCH_OPTIONS_COMMON,
  SKILL_THROW_OPTIONS_COMMON,
  THROW_OPTIONS_APPARATUS,
  ROUNDOFF_SKILL_ID,
  THROW_OPTIONS_COMMON,
  skillDef,
  skillFlowAfter,
  skillOptions,
} from "./constants";
import { computeScore, type ComputeOptions } from "./score";
import { SALTO_DIFFICULTY_WEIGHT, SKILL_PICK_WEIGHT } from "./autoTumblings";
import type { ApparatusKey, Item, Series, Skill } from "./types";

/** 提案の種類。表示のグループ分けと、同点のときの並び順に使う。 */
export type SuggestionKind =
  | "skill"
  | "addSkill"
  | "apparatusOp"
  | "throwType"
  | "catchType"
  | "removeSeries";

export const SUGGESTION_KIND_NAMES: Record<SuggestionKind, string> = {
  skill: "技を変える",
  addSkill: "技を足す",
  apparatusOp: "手具操作を足す",
  throwType: "投げ方を足す",
  catchType: "受け方を足す",
  removeSeries: "シリーズを削る",
};

/**
 * 同じ点差になったときの並び順。実際の演技で先に手を付けるのはどれか、という順。
 * 「技を変える」は構成そのものが変わるので最後（ほかは足すだけで済む）。
 */
const KIND_ORDER: SuggestionKind[] = [
  "apparatusOp",
  "catchType",
  "throwType",
  "addSkill",
  "removeSeries",
  "skill",
];

export interface Suggestion {
  /** React の key / テストの識別子 */
  id: string;
  kind: SuggestionKind;
  /** 対象シリーズ（0始まり）。UIのジャンプ導線に使う */
  seriesIndex: number;
  /** 何をするか（日本語1行） */
  label: string;
  dDelta: number;
  aDelta: number;
  /** dDelta + aDelta。並び順の主キー */
  totalDelta: number;
  /** その1手を当てた構成。表示だけの今は差分の根拠として持つ */
  series: Series[];
}

export interface SuggestOptions extends ComputeOptions {
  /** 返す最大件数（既定10件） */
  limit?: number;
}

export const DEFAULT_SUGGESTION_LIMIT = 10;

/** 点差が出たとみなす最小値（浮動小数の誤差を無視する） */
const EPSILON = 1e-9;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 候補1つ。評価前の状態。 */
interface Candidate {
  kind: SuggestionKind;
  seriesIndex: number;
  label: string;
  series: Series[];
  /**
   * 同じ場所への候補をまとめるキー。1箇所につき1件だけ残すことで、
   * 「ロンダートをE難度9種類に変える」が9行並ぶのを防ぐ。
   */
  target: string;
  /**
   * どれだけ現実に実施されるか（大きいほど普通）。生成器が使っているのと同じ重み。
   * 同じ点差なら、実際によく行われる＝小さい一手のほうを見せる。
   */
  realism: number;
}

/** その技がどれだけ実施されるか。生成器の重みをそのまま使う。 */
const skillRealism = (skill: Skill): number =>
  (SKILL_PICK_WEIGHT[skill.id] ?? 1) * (SALTO_DIFFICULTY_WEIGHT[skill.difficulty] ?? 1);

/** シリーズ i のアイテムを差し替えた構成を作る（ほかのシリーズはそのまま） */
function withItems(list: Series[], sIdx: number, items: Item[]): Series[] {
  return list.map((ser, i) => (i === sIdx ? { ...ser, items } : ser));
}

/**
 * 技の差し替えと、タンブリングへの技の追加。
 * 選択肢は入力画面と同じ `skillOptions(junior, skillFlowAfter(prev))` に限り、
 * 後方系を前向きの位置に置いたときは編集画面と同じくロンダートを挿入する
 * （`SeriesListEditor.updateItem` と同じ手順 — 提案どおりに操作すれば同じ結果になる）。
 */
function skillEdits(list: Series[], junior: boolean): Candidate[] {
  const out: Candidate[] = [];
  list.forEach((ser, sIdx) => {
    ser.items.forEach((item, iIdx) => {
      if (item.kind !== "skill" || !item.skillId) return;
      const current = skillDef(item.skillId);
      const currentName = current?.name ?? item.skillId;

      // --- 置き換え ---
      const flow = skillFlowAfter(prevSkillId(ser.items, iIdx));
      skillOptions(junior, flow).forEach((skill) => {
        if (skill.id === item.skillId) return;
        const items = ser.items.map((x, k) => (k === iIdx ? { ...x, skillId: skill.id } : x));
        const roundoff = needsRoundoffBefore(items, iIdx);
        if (roundoff) items.splice(iIdx, 0, roundoffItem());
        // ロンダートを別の技にすると、その前にロンダートが入り直す＝実質「1本足す」
        const isInsertion = roundoff && item.skillId === ROUNDOFF_SKILL_ID;
        out.push({
          kind: isInsertion ? "addSkill" : "skill",
          seriesIndex: sIdx,
          target: `${isInsertion ? "addSkill" : "skill"}:${sIdx}:${iIdx}`,
          realism: skillRealism(skill),
          label: isInsertion
            ? `シリーズ${sIdx + 1}のロンダートの後に「${skill.name}」を足す`
            : `シリーズ${sIdx + 1}の「${currentName}」を「${skill.name}」に変える${
                roundoff ? "（前にロンダートが入る）" : ""
              }`,
          series: withItems(list, sIdx, items),
        });
      });

      // --- タンブリングの最後に1本足す（連続した技の並びの末尾だけ）---
      const next = ser.items[iIdx + 1];
      if (next?.kind === "skill") return;
      skillOptions(junior, skillFlowAfter(item.skillId)).forEach((skill) => {
        const items = [...ser.items];
        items.splice(iIdx + 1, 0, { kind: "skill", skillId: skill.id, hasApparatus: false, isThrow: false });
        const roundoff = needsRoundoffBefore(items, iIdx + 1);
        if (roundoff) items.splice(iIdx + 1, 0, roundoffItem());
        out.push({
          kind: "addSkill",
          seriesIndex: sIdx,
          target: `addSkill:${sIdx}:${iIdx}`,
          realism: skillRealism(skill),
          // 挿入されるロンダートも「1手」の内訳なので隠さない
          label: `シリーズ${sIdx + 1}の「${currentName}」の後に${
            roundoff ? "ロンダート→" : ""
          }「${skill.name}」を足す`,
          series: withItems(list, sIdx, items),
        });
      });
    });
  });
  return out;
}

/**
 * 手具操作を足す。投げている最中の技には付けられないが、その判定は
 * `stripForApparatus` が落としてくれるので、ここでは付けるだけでよい
 * （落ちた候補は点差が0になって最後に捨てられる）。
 */
function apparatusOps(list: Series[]): Candidate[] {
  const out: Candidate[] = [];
  list.forEach((ser, sIdx) => {
    ser.items.forEach((item, iIdx) => {
      if (item.kind !== "skill" || !item.skillId || item.hasApparatus) return;
      const items = ser.items.map((x, k) => (k === iIdx ? { ...x, hasApparatus: true } : x));
      out.push({
        kind: "apparatusOp",
        seriesIndex: sIdx,
        target: `apparatusOp:${sIdx}:${iIdx}`,
        realism: 1,
        label: `シリーズ${sIdx + 1}の「${skillDef(item.skillId)?.name ?? item.skillId}」に手具操作を付ける`,
        series: withItems(list, sIdx, items),
      });
    });
  });
  return out;
}

/** 投げ方・受け方の技術タグを1つ足す */
function styleTags(list: Series[], apparatus: ApparatusKey): Candidate[] {
  const out: Candidate[] = [];
  const add = (
    kind: SuggestionKind,
    sIdx: number,
    iIdx: number,
    field: "throwTypes" | "catchTypes",
    options: { id: string; name: string }[],
    ser: Series,
    what: string,
  ) => {
    const item = ser.items[iIdx] as Item & Record<string, string[] | undefined>;
    const held = item[field] ?? [];
    options.forEach((opt) => {
      if (held.includes(opt.id)) return;
      const items = ser.items.map((x, k) => (k === iIdx ? { ...x, [field]: [...held, opt.id] } : x));
      out.push({
        kind,
        seriesIndex: sIdx,
        target: `${kind}:${sIdx}:${iIdx}`,
        // その他の投げ・受けは可能な限り使わない（生成器と同じ扱い）
        realism: opt.id === "other" ? 0.1 : 1,
        label: `シリーズ${sIdx + 1}の${what}を「${opt.name}」にする`,
        series: withItems(list, sIdx, items),
      });
    });
  };
  list.forEach((ser, sIdx) => {
    ser.items.forEach((item, iIdx) => {
      if (item.kind === "throw")
        add("throwType", sIdx, iIdx, "throwTypes", [...THROW_OPTIONS_COMMON, ...THROW_OPTIONS_APPARATUS], ser, "投げ");
      else if (item.kind === "catch")
        add("catchType", sIdx, iIdx, "catchTypes", [...CATCH_OPTIONS_COMMON, ...CATCH_OPTIONS_APPARATUS], ser, "キャッチ");
      else if (item.kind === "skill" && item.isThrow)
        add("throwType", sIdx, iIdx, "throwTypes", SKILL_THROW_OPTIONS_COMMON, ser, "技中の投げ");
    });
  });
  // その手具で入力できないタグは落とす（落ちた候補は点差0になって捨てられる）
  return out.map((c) => ({ ...c, series: stripForApparatus(c.series, apparatus) }));
}

/** シリーズを1本削る。難度に採用されず減点だけ連れてくるシリーズが見つかる。 */
function seriesRemovals(list: Series[]): Candidate[] {
  if (list.length <= 1) return [];
  return list.map((_, sIdx) => ({
    kind: "removeSeries" as const,
    seriesIndex: sIdx,
    target: `removeSeries:${sIdx}`,
    realism: 1,
    label: `シリーズ${sIdx + 1}を削る`,
    series: list.filter((_, i) => i !== sIdx),
  }));
}

/**
 * 今の構成を1手だけ変えた改善案を、効果の大きい順に返す。
 * 効果は D（難度点＋加点）と A残点 の合計差。E（実施減点）は審判が付けるもので
 * 構成では動かせないので見ない。
 */
export function suggestImprovements(
  series: Series[],
  apparatus: ApparatusKey,
  opts: SuggestOptions = {},
): Suggestion[] {
  const { limit = DEFAULT_SUGGESTION_LIMIT, ...scoreOpts } = opts;
  const junior = !!scoreOpts.junior;
  const base = computeScore(series, apparatus, scoreOpts);
  const baseTotal = base.dScore + base.aScore;

  const candidates = [
    ...apparatusOps(series),
    ...styleTags(series, apparatus),
    ...seriesRemovals(series),
    ...skillEdits(series, junior),
  ];

  // 1箇所につき最良の1件だけ残す。同じ点差なら、実際によく行われる小さい一手を選ぶ。
  const best = new Map<string, Suggestion & { realism: number }>();
  const seenSeries = new Set<string>();
  candidates.forEach((c) => {
    const r = computeScore(c.series, apparatus, scoreOpts);
    const total = r.dScore + r.aScore - baseTotal;
    if (total <= EPSILON) return;
    const entry = {
      id: c.target,
      kind: c.kind,
      seriesIndex: c.seriesIndex,
      label: c.label,
      dDelta: round1(r.dScore - base.dScore),
      aDelta: round1(r.aScore - base.aScore),
      totalDelta: round1(total),
      series: c.series,
      realism: c.realism,
    };
    const prev = best.get(c.target);
    if (!prev || entry.totalDelta > prev.totalDelta || (entry.totalDelta === prev.totalDelta && entry.realism > prev.realism))
      best.set(c.target, entry);
  });

  const out: Suggestion[] = [];
  [...best.values()].forEach(({ realism: _realism, ...sug }) => {
    // 別の言い方で同じ構成になるものは1つだけ
    const key = JSON.stringify(sug.series);
    if (seenSeries.has(key)) return;
    seenSeries.add(key);
    out.push(sug);
  });

  out.sort(
    (a, b) =>
      b.totalDelta - a.totalDelta ||
      b.dDelta - a.dDelta ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.seriesIndex - b.seriesIndex,
  );
  return out.slice(0, limit);
}
