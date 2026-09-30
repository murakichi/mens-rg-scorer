// =====================================================================
// 自動入力（入力補助）：いま入力した末尾から「このあと実施しがちな続き」を予測する
//
// 純粋関数だけ。UI は候補を半透明で見せ、確定されたら `items` をシリーズ末尾に足す。
// 採点には一切触れず、つなぎ・三宙の達成状況だけ `seriesTags` から読む。
// =====================================================================

import { DIFF_SCORE, DIFF_VALUE, ROUNDOFF_SKILL_ID, USE_APPARATUS_TAG, buildTwistSkillId, skillDef } from "./constants";
import { motionDef, motionTimes, prevSkillId, seriesTags, analyzeSeries, thrownCount } from "./analysis";
import { CHAIN_END_SKILLS, endsFacingBackward, THROW_ROLL_MOTION } from "./tumblingChain";
import { itemLabel } from "./templates";
import { NO_VIEW_TAG } from "./autoThrows";
import { computeScore } from "./score";
import type { ApparatusKey, Item, Series } from "./types";

/** 「投げ→伸身前方宙返り1回ひねり」のあとに前転→キャッチが続く、その技 */
export const FRONT_LAYOUT_TWIST_ID = "d_frontlay1";
const FRONT_ID = "b_front";
const FRONT_TWIST_ID = "c_front1full";
const SIDE_SALTO_ID = "b_sidesalto";
/** 投げている間の徒手が、この動作数に達したら「キャッチ→背面投げ→背面キャッチ」を勧める */
export const HAND_MOTIONS_FOR_REPEAT_THROW = 3;

/** この本数目以降の投げは、前転・転がりで終わったら手具を使ったキャッチ（クラブ・リング） */
export const PRESS_CATCH_FROM_THROW = 5;
/** 「タンブリングをすべて満たしている」とみなす必須要素のキー（score.ts の `required`） */
const TUMBLING_REQUIRED_KEYS = ["dir", "throwTum", "triple", "connect", "tumCount"];
const CHENE_ID = "chene";
const ROLL_MOTION_IDS = [THROW_ROLL_MOTION, "roll"];

/** 投げタンをおすすめするときの、構成全体の平均難度点の境目（この値以下ならその段） */
export const THROW_TUM_AVG_FRONT_ROLL_MAX = 0.3;
export const THROW_TUM_AVG_FRONT_SIDE_MAX = 0.4;
/** 0.4超〜0.7未満は前方1回ひねり→側宙。この値以上は伸身前宙→前転／前方1回ひねり→側宙 */
export const THROW_TUM_AVG_LAYOUT_MIN = 0.7;
const FRONT_LAYOUT_ID = buildTwistSkillId({ base: "front", twist: 0, posture: "layout" });

export interface AutoInputSuggestion {
  /** 候補の識別子（同じ候補が続けて出ているかの判定・テスト用） */
  id: string;
  /** 表示用の一行（例：前転→キャッチ） */
  label: string;
  /** シリーズ末尾に足すアイテム */
  items: Item[];
}

const skillItem = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });
const motionItem = (motionId: string): Item => ({ kind: "motion", motionId });
const suggestion = (id: string, items: Item[]): AutoInputSuggestion => ({
  id,
  label: items.map(itemLabel).join("→"),
  items,
});

/** 投げ→(徒手)→キャッチの後に、前転で受けにいく決まりの続き */
const rollThenCatch = (id: string): AutoInputSuggestion =>
  suggestion(id, [motionItem(THROW_ROLL_MOTION), { kind: "catch", catchTypes: [], catchTwo: false }]);

/** 直近の投げ（まだキャッチされていない）の位置。無ければ -1 */
function openThrowIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "catch") return -1;
    if (it.kind === "throw") return i;
  }
  return -1;
}

/**
 * 末尾の入力から続きの候補を返す。先頭が既定の候補で、複数あるときは「別案」で切り替える。
 * @param list 構成全体（つなぎ・三宙が「未達成」かはルーティン全体で見る）
 * @param sIdx いま入力しているシリーズ
 */
export function autoInputSuggestions(
  list: Series[],
  sIdx: number,
  junior = false,
  apparatus: ApparatusKey = "stick",
): AutoInputSuggestion[] {
  const series = list[sIdx];
  if (!series) return [];
  const items = series.items;
  const n = items.length;
  const last = items[n - 1];
  if (!last) return [];

  // ---- 投げのシリーズのあとに投げを足したとき：投げタン未達成なら平均難度に合わせて勧める ----
  if (
    n === 1 &&
    last.kind === "throw" &&
    list.slice(0, sIdx).some((s2) => s2.items.some((it) => it.kind === "throw")) &&
    !list.some((s2) => analyzeSeries(s2, junior).units.some((u) => u.isThrowTumbling))
  ) {
    const scores = list.filter((_, i) => i !== sIdx).flatMap((s2) => analyzeSeries(s2, junior).units.map((u) => DIFF_SCORE[u.finalDiff]));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const catchItem: Item = { kind: "catch", catchTypes: [], catchTwo: false };
    const eps = 1e-9;
    const rollTail = (first: string) => [skillItem(first), motionItem(THROW_ROLL_MOTION), catchItem];
    const twistSide = [skillItem(FRONT_TWIST_ID), skillItem(SIDE_SALTO_ID), catchItem];
    const options: [string, Item[]][] =
      avg <= THROW_TUM_AVG_FRONT_ROLL_MAX + eps
        ? [
            ["front-roll", rollTail(FRONT_ID)],
            ["side", [skillItem(SIDE_SALTO_ID), catchItem]],
          ]
        : avg <= THROW_TUM_AVG_FRONT_SIDE_MAX + eps
          ? [["front-side", [skillItem(FRONT_ID), skillItem(SIDE_SALTO_ID), catchItem]]]
          : avg < THROW_TUM_AVG_LAYOUT_MIN - eps
            ? [["front1twist-side", twistSide]]
            : [
                ["frontLayout-roll", rollTail(FRONT_LAYOUT_ID)],
                ["front1twist-side", twistSide],
              ];
    return options.map(([id, items2]) => suggestion(`throwTumbling-${id}`, items2));
  }

  // ---- 投げまわり ----
  if (last.kind === "skill" && last.skillId) {
    // 宙返り中に投げを選んだ／投げ→伸身前方宙返り1回ひねり → 前転→キャッチ
    if (last.isThrow) return [rollThenCatch("throwInSkill-roll")];
    if (last.skillId === FRONT_LAYOUT_TWIST_ID && items[n - 2]?.kind === "throw") {
      return [rollThenCatch("throwFrontLayoutTwist-roll")];
    }
  }
  if (last.kind === "motion" && last.motionId) {
    const t = openThrowIndex(items);
    /** タンブリングの必須要素がすべて揃っているか（入力し終わったとみなす） */
    const tumblingComplete = () =>
      computeScore(list, apparatus, { junior })
        .required.filter((c) => TUMBLING_REQUIRED_KEYS.includes(c.key))
        .every((c) => c.passed !== false);
    // ロープ：タンブリングの必須要素が揃っていれば、シェネのあとは手以外のキャッチ（足で受ける）
    if (apparatus === "rope" && t >= 0 && last.motionId === CHENE_ID) {
      if (tumblingComplete()) {
        return [suggestion("ropeNonHandCatch", [{ kind: "catch", catchTypes: ["nonhand"], catchTwo: false }])];
      }
    }
    // クラブ・リングの5本目以降の投げが前転・転がりで終わるなら、もう一方の手具で押さえて受ける
    if (
      t >= 0 &&
      (apparatus === "clubs" || apparatus === "ring") &&
      ROLL_MOTION_IDS.includes(last.motionId) &&
      thrownCount(items[t]) === 1 &&
      tumblingComplete()
    ) {
      const isThrowItem = (it: Item) => it.kind === "throw" || (it.kind === "skill" && it.isThrow);
      const before = list.slice(0, sIdx).reduce((n2, s2) => n2 + s2.items.filter(isThrowItem).length, 0);
      const nth = before + items.slice(0, t + 1).filter(isThrowItem).length;
      if (nth >= PRESS_CATCH_FROM_THROW) {
        return [suggestion("pressCatch", [{ kind: "catch", catchTypes: [USE_APPARATUS_TAG], catchTwo: false }])];
      }
    }
    if (t >= 0 && items.slice(t + 1).every((it) => it.kind === "motion")) {
      const total = items
        .slice(t + 1)
        .reduce((sum, it) => sum + (it.kind === "motion" ? (motionDef(it.motionId)?.motions ?? 0) * motionTimes(it.count) : 0), 0);
      if (total >= HAND_MOTIONS_FOR_REPEAT_THROW) {
        return [
          suggestion("throwHand-catchThrowBack", [
            { kind: "catch", catchTypes: [], catchTwo: thrownCount(items[t]) === 2 },
            { kind: "throw", throwTypes: [NO_VIEW_TAG], reqTypes: [] },
            { kind: "catch", catchTypes: [NO_VIEW_TAG], catchTwo: false },
          ]),
        ];
      }
    }
    return [];
  }

  // ---- 宙返りの続き（ロンダート→前向きに降りる宙返り…） ----
  const tags = list.map((s) => seriesTags(s, junior));
  const hasConnect = tags.some((t) => t.includes("connect"));
  const hasSalto3 = tags.some((t) => t.includes("salto3"));
  const isForwardLanding = (id: string) => {
    const sk = skillDef(id);
    return !!sk?.isSalto && !endsFacingBackward(id) && !CHAIN_END_SKILLS.includes(id);
  };
  const skillAt = (i: number) => {
    const it = items[i];
    return it && it.kind === "skill" && it.skillId ? it.skillId : undefined;
  };
  const roundoff = () => suggestion("roundoff", [skillItem(ROUNDOFF_SKILL_ID)]);

  const lastId = skillAt(n - 1);
  if (!lastId) return [];

  // ロンダート→前向きに降りる宙返り
  if (skillAt(n - 2) === ROUNDOFF_SKILL_ID && isForwardLanding(lastId)) {
    const out: AutoInputSuggestion[] = [];
    if (!hasConnect) out.push(roundoff());
    if (!hasSalto3) {
      out.push(suggestion("front-side", [skillItem(FRONT_ID), skillItem(SIDE_SALTO_ID)]));
      out.push(suggestion("front1twist-side", [skillItem(FRONT_TWIST_ID), skillItem(SIDE_SALTO_ID)]));
    }
    return out;
  }
  // ロンダート→前向きに降りる宙返り→前宙
  if (lastId === FRONT_ID && skillAt(n - 3) === ROUNDOFF_SKILL_ID) {
    const mid = skillAt(n - 2);
    if (mid && isForwardLanding(mid) && prevSkillId(items, n - 1) === mid) {
      const out: AutoInputSuggestion[] = [];
      const maxDiff = Math.max(0, ...analyzeSeries(series, junior).units.map((u) => DIFF_VALUE[u.finalDiff]));
      if (!hasConnect && maxDiff < DIFF_VALUE.E) out.push(roundoff());
      if (!hasSalto3) out.push(suggestion("side", [skillItem(SIDE_SALTO_ID)]));
      return out;
    }
  }
  return [];
}
