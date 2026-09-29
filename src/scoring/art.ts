// =====================================================================
// §3.5.6.4 芸術と多様性（A）の欠点テーブルの自動判定
//
// 規則に明確な基準はないが、「種類がいくつあるか」「操作をどれだけ行ったか」は
// 構成の入力から数えられる。数えられる5項目（徒手系の多様性・転回系の多様性・
// さまざまな操作・転回中の操作・徒手の割合）はここで機械的に判定し、演技全体を
// 見ないと判断できない4項目（リズム変化・空間使用・独創性・運動量）は手入力に残す。
//
// しきい値は `constants.ts` の ART_*_STEPS。上位構成が減点0、内容の乏しい構成が
// 満額に近い減点になるように置いてある。
// =====================================================================

import {
  ART_APP_IN_TUM_STEPS,
  ART_APP_KIND_STEPS,
  ART_APP_PAIR_STEPS,
  ART_HAND_AXIS_STEPS,
  ART_HAND_COMBO_STEPS,
  ART_HAND_KIND_STEPS,
  ART_HAND_RATIO_STEPS,
  ART_TUM_KIND_STEPS,
  ART_TUM_POSTURE_STEPS,
  ART_TUM_SHAPE_STEPS,
  artDeductionItem,
  skillDef,
  stepDeduction,
} from "./constants";
import {
  handsEmptyFlags,
  hasConnect,
  isHandUnit,
  isTumblingUnit,
  motionDef,
  motionTimes,
  saltoFlags,
} from "./analysis";
import type { ApparatusKey, Series, SeriesAnalysis } from "./types";

export interface ArtAutoContext {
  /** `stripForApparatus` 済みのシリーズ（採点に効く内容だけ） */
  series: Series[];
  /** series と同じ並びの解析結果 */
  analysis: SeriesAnalysis[];
  apparatus: ApparatusKey;
  junior: boolean;
  /** 投げ方の種類数（`computeScore` の多様性判定と同じ集計を使う） */
  throwKindCount: number;
  /** 受け方の種類数 */
  catchKindCount: number;
}

/** 自動判定した1項目の減点と、その内訳（UIの説明に出す） */
export interface ArtAutoRow {
  id: string;
  value: number;
  notes: string[];
}

/** 1つの観点の判定結果 */
interface Axis {
  deduction: number;
  note: string;
}

/** 「多いほど良い」観点を1つ測る。note は測定値と減点を人が読める形にしたもの */
function axis(label: string, measured: string, value: number, steps: number[]): Axis {
  const deduction = stepDeduction(value, steps);
  return { deduction, note: `${label} ${measured}${deduction > 0 ? `（−${deduction.toFixed(1)}）` : ""}` };
}

/** 観点をまとめて1項目の減点にする（項目の上限で丸める） */
function row(id: string, axes: Axis[]): ArtAutoRow {
  const max = artDeductionItem(id)?.max ?? 0;
  const sum = axes.reduce((s, a) => s + a.deduction, 0);
  return { id, value: Math.min(Math.round(sum * 10) / 10, max), notes: axes.map((a) => a.note) };
}

/**
 * 徒手動作の種類キー。シェネは腕の使い方で別の技になる（Q&A Q28）ので分けて数える。
 * 徒手扱いの転回技（側転など）は技そのものが種類になる。
 */
function motionKindKey(item: Extract<Series["items"][number], { kind: "motion" }>): string {
  if (!item.hands) return item.motionId;
  return `${item.motionId}:${item.handsType || "hands"}`;
}

/** 投げ方・受け方のスタイルキー（技術タグの組み合わせ。無指定は通常） */
const styleKey = (types: string[] | undefined, prefix = ""): string =>
  prefix + ([...(types || [])].sort().join("+") || "通常");

export function artAutoDeductions(ctx: ArtAutoContext): ArtAutoRow[] {
  const { series, analysis, apparatus, junior } = ctx;
  const units = analysis.flatMap((a) => a.units);
  const tumUnits = units.filter(isTumblingUnit);
  const handUnits = units.filter(isHandUnit);

  // ---- 転回系の種類・組み合わせの多様性 ----
  const saltoKinds = new Set<string>();
  const postureKinds = new Set<string>();
  const shapeKinds = new Set<string>();
  tumUnits.forEach((u) => {
    const ids = u.skills.map((s) => s.skillId);
    const salto = saltoFlags(ids);
    let saltoCount = 0;
    ids.forEach((id, i) => {
      if (!salto[i]) return;
      saltoCount += 1;
      saltoKinds.add(id);
      const t = skillDef(id)?.twist;
      // ひねりと姿勢を持たない宙返り（側宙・テンポ・きりもみなど）はまとめて1種類
      postureKinds.add(t ? `${t.posture}/${t.twist > 0 ? "twist" : "plain"}` : "other");
    });
    shapeKinds.add(`${saltoCount}/${hasConnect(u.skills) ? 1 : 0}/${u.isThrowTumbling ? 1 : 0}`);
  });
  const tumVariety = row("tumVariety", [
    axis("宙返りの技の種類", `${saltoKinds.size}種類`, saltoKinds.size, ART_TUM_KIND_STEPS),
    axis("姿勢・ひねりの幅", `${postureKinds.size}種類`, postureKinds.size, ART_TUM_POSTURE_STEPS),
    axis("タンブリングの形", `${shapeKinds.size}種類`, shapeKinds.size, ART_TUM_SHAPE_STEPS),
  ]);

  // ---- アイテムを1度だけ走査して、徒手・操作・転回中の操作をまとめて数える ----
  const motionKinds = new Set<string>();
  const axisKinds = new Set<string>();
  const pairs = new Set<string>();
  // 手具を保持できる転回技のうち、実際に操作した数
  let opTotal = 0;
  let opDone = 0;
  series.forEach((ser) => {
    // 手具が空中にある間の技は操作できないので分母から外す
    const empty = handsEmptyFlags(ser.items, apparatus);
    let lastThrow = "";
    ser.items.forEach((item, j) => {
      if (item.kind === "motion") {
        if (!item.motionId || motionTimes(item.count) === 0) return;
        const def = motionDef(item.motionId, junior);
        if (!def) return;
        motionKinds.add(motionKindKey(item));
        axisKinds.add(def.vertical > 0 ? "vertical" : "horizontal");
      } else if (item.kind === "skill") {
        if (!item.skillId) return;
        const def = skillDef(item.skillId);
        if (!def) return;
        if (def.isHandElement) {
          // 側転など徒手扱いの転回技は徒手動作として数える（すべて縦回転）
          motionKinds.add(item.skillId);
          axisKinds.add("vertical");
          return;
        }
        if (item.isThrow) lastThrow = styleKey(item.throwTypes, "転回中の");
        if (!empty[j]) {
          opTotal += 1;
          if (item.hasApparatus) opDone += 1;
        }
      } else if (item.kind === "throw") {
        lastThrow = styleKey([...(item.throwTypes || []), ...(item.reqTypes || [])]);
      } else if (item.kind === "catch") {
        pairs.add(`${lastThrow}>${styleKey(item.catchTypes)}`);
      }
    });
  });

  // ---- 徒手系の種類・組み合わせの多様性 ----
  const handCombos = new Set(handUnits.map((u) => u.signatures[0]));
  const handVariety = row("handVariety", [
    axis("徒手動作の種類", `${motionKinds.size}種類`, motionKinds.size, ART_HAND_KIND_STEPS),
    axis("回転軸", `${axisKinds.size}種類`, axisKinds.size, ART_HAND_AXIS_STEPS),
    axis("徒手の組み合わせ", `${handCombos.size}種類`, handCombos.size, ART_HAND_COMBO_STEPS),
  ]);

  // ---- さまざまな操作 ----
  // 投げ方・受け方の種類数（不足そのものは「投げ受けの操作」として別に減点済み）と、
  // 投げ方→受け方の組み合わせの種類数を見る。
  const kindCount = ctx.throwKindCount + ctx.catchKindCount;
  const appVariety = row("appVariety", [
    axis("投げ方＋受け方の種類", `${kindCount}種類`, kindCount, ART_APP_KIND_STEPS),
    axis("投げ受けの組み合わせ", `${pairs.size}種類`, pairs.size, ART_APP_PAIR_STEPS),
  ]);

  // ---- 転回中の操作 ----
  const opRatio = opTotal > 0 ? opDone / opTotal : 1;
  const appInTumbling = row("appInTumbling", [
    opTotal > 0
      ? axis("手具を持てる転回技の操作率", `${opDone}/${opTotal}`, opRatio, ART_APP_IN_TUM_STEPS)
      : { deduction: 0, note: "手具を持てる転回技なし" },
  ]);

  // ---- 徒手の割合 ----
  const unitTotal = handUnits.length + tumUnits.length;
  const handRatioValue = unitTotal > 0 ? handUnits.length / unitTotal : 0;
  const handRatio = row("handRatio", [
    axis(
      "徒手系の割合",
      `${handUnits.length}/${unitTotal}`,
      handRatioValue,
      ART_HAND_RATIO_STEPS,
    ),
  ]);

  return [handVariety, tumVariety, appVariety, appInTumbling, handRatio];
}
