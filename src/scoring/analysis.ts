// =====================================================================
// シリーズ単位の分析ロジック（純粋関数）
// =====================================================================

import {
  DIFF_VALUE,
  VALUE_DIFF,
  MAX_DIFF,
  clampDifficulty,
  futureHandValue,
  HAND_MOTIONS,
  DEFAULT_HANDS_TYPE,
  HANDS_TYPE_OTHER,
  APPARATUS_COUNT,
  APPARATUS_USE,
  REQUIRED_THROW_OPTIONS,
  USE_APPARATUS_TAG,
  requiredThrowName,
  skillDef,
  skillDifficulty,
  skillDifficultyAt,
  ropeJumpDef,
  isBackwardSalto,
  isBackwardSkill,
  leadsBackward,
  ROUNDOFF_SKILL_ID,
  TWO_THROW_TAG,
  artDeductionItem,
  TUM_VARIETY_ITEM_ID,
  TUM_VARIETY_DEDUCTION_STEP,
  canOperateApparatus,
} from "./constants";
import type {
  ApparatusKey,
  Difficulty,
  FutureLevel,
  Item,
  Series,
  SeriesAnalysis,
  Unit,
} from "./types";

/**
 * iIdx の直前に実施する技のid。投げ・キャッチはタンブリングの流れを切らないので飛ばす。
 * 徒手として入れた転回技（ロンダート等）も技として見る。
 */
export function prevSkillId(items: Item[], iIdx: number): string | undefined {
  for (let i = iIdx - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "skill") return it.skillId || undefined;
    if (it.kind === "motion") return it.motionId || undefined;
    if (it.kind === "ropeJump") return undefined;
  }
  return undefined;
}

/** 自動で補うロンダートのアイテム */
export const roundoffItem = (): Item => ({
  kind: "skill",
  skillId: ROUNDOFF_SKILL_ID,
  hasApparatus: false,
  isThrow: false,
});

/**
 * 手前にロンダートを補う位置か。後方系はロンダート・バク転から入るか、
 * 後ろ向きに降りる宙返りに続けてしか実施できないので、そうでない位置で
 * 後方系を選んだときはロンダートを挟む。
 *  - 何も無いところ（直前に技が無い）でいきなり後方の宙返りを選んだとき
 *    （バク転は立ちバク転があるのでそのまま）
 *  - 前方系や半ひねり系・ダイビング前宙（前向きに降りる技）の後に後方系を選んだとき
 */
export function needsRoundoffBefore(items: Item[], iIdx: number): boolean {
  const it = items[iIdx];
  if (!it || it.kind !== "skill" || !it.skillId) return false;
  if (!isBackwardSkill(it.skillId)) return false;
  const prev = prevSkillId(items, iIdx);
  if (!prev) return isBackwardSalto(it.skillId);
  return !leadsBackward(prev);
}

/**
 * タンブリング塊の難度を算出。先頭技の値 + 以降の非A技ごとに +1、投げ含みで +1。
 * 上限は現行規則ならE、十年後モードならその上限（F・G）。
 */
export function calcTumblingDifficulty(
  skillIds: string[],
  hasThrow: boolean,
  junior = false,
  future: FutureLevel = null,
): Difficulty | null {
  const diffs = skillIds
    // 位置で難度が変わる特例（宙返りの直後のダイビングは格上げ）があるので位置つきで引く
    .map((_id, i) => skillDifficultyAt(skillIds, i, junior, future))
    .filter((d): d is Difficulty => !!d && d !== "A");
  if (diffs.length === 0) return null;
  let v = DIFF_VALUE[diffs[0]];
  for (let i = 1; i < diffs.length; i++) v += DIFF_VALUE[diffs[i]] - 1;
  if (hasThrow) v += 1;
  return clampDifficulty(v, future);
}

/**
 * 徒手難度。動作数を A 起点で加算し、**縦3動作は最低E**（§3.5.5.3）。
 * 十年後モードでは、縦回転を重く数えた動作量（`futureHandValue`）でF・Gまで伸びる
 * — 縦3動作の「最低E」も上書きではなく最低保証なので、縦3動作に動作を足せば難度は上がる。
 */
export function calcHandDifficulty(
  motionCount: number,
  verticalThree: boolean,
  future: FutureLevel = null,
  verticalCount = 0,
): Difficulty {
  let value = DIFF_VALUE.A + motionCount;
  if (verticalThree) value = Math.max(value, DIFF_VALUE.E);
  if (future) value = Math.max(value, futureHandValue(motionCount, verticalCount));
  return clampDifficulty(value, future);
}

/**
 * 並びの各技を宙返りとして数えるかを判定する（Q&A Q7）。
 * きりもみ・きりもみ転回（`saltoOnlyInChain`）は、隣に本物の宙返りがある＝宙返りの連続に
 * 含まれる場合のみ宙返りとして扱う。きりもみ同士が並んだだけでは連続とみなさない。
 */
export function saltoFlags(skillIds: string[]): boolean[] {
  const defs = skillIds.map((id) => skillDef(id));
  const genuine = defs.map((d) => !!d?.isSalto && !d?.saltoOnlyInChain);
  /** 左右いずれかに本物の宙返りが隣接するか（間のつなぎ技A難度は読み飛ばす） */
  const nextToGenuine = (i: number): boolean => {
    for (const step of [-1, 1]) {
      for (let j = i + step; j >= 0 && j < defs.length; j += step) {
        if (genuine[j]) return true;
        if (!defs[j]?.isConnectA) break; // つなぎ技以外に当たったら打ち切り
      }
    }
    return false;
  };
  return defs.map((d, i) => {
    if (!d?.isSalto) return false;
    if (!d.saltoOnlyInChain) return true;
    return nextToGenuine(i);
  });
}

/**
 * 各技を転回系として扱うか。宙返り（`saltoFlags`）と、宙返りの間に挟んだつなぎ技のA難度技。
 * ここで false になった技は「縦の一回転の徒手」として徒手系の動作に数える（Q&A Q7）。
 */
export function tumblingFlags(skillIds: string[]): boolean[] {
  const salto = saltoFlags(skillIds);
  return skillIds.map((id, i) => {
    if (salto[i]) return true;
    return !!skillDef(id)?.isConnectA && !!salto[i - 1] && !!salto[i + 1];
  });
}

/**
 * 転回系として扱わない技が徒手系難度に持ち込む動作数。
 * A難度技（側転・ロンダート・バク転・ハンドスプリング・とび前転）は縦の一回転の徒手で1動作、
 * きりもみ（B）は1動作、きりもみ転回（C）は2動作＝難度をそのまま徒手系難度に読み替える。
 */
export function handMotionsOfSkill(skillId: string, junior = false, future: FutureLevel = null): number {
  const d = skillDifficulty(skillId, junior, future);
  return d ? Math.max(1, DIFF_VALUE[d] - 1) : 0;
}

/**
 * 徒手動作アイテムの内容。動作数プルダウンのほか、徒手扱いの転回技（側転・きりもみ等）も選べる。
 */
export function motionDef(
  id: string,
  junior = false,
  future: FutureLevel = null,
): {
  motions: number;
  verticalThree: boolean;
  vertical: number;
  hasHandsOption: boolean;
  generic: boolean;
} | null {
  const m = HAND_MOTIONS.find((x) => x.id === id);
  if (m)
    return {
      motions: m.motions,
      verticalThree: !!m.verticalThree,
      vertical: m.vertical ? m.motions : 0,
      hasHandsOption: !!m.hasHandsOption,
      // 旧データの「n動作」は種類が特定できない汎用動作
      generic: !!m.legacy && !m.verticalThree,
    };
  if (skillDef(id)) {
    const n = handMotionsOfSkill(id, junior, future);
    // 徒手扱いの転回技はすべて縦回転の徒手
    return { motions: n, verticalThree: false, vertical: n, hasHandsOption: false, generic: false };
  }
  return null;
}

/** 徒手動作アイテムの連続回数（未指定・不正値は1回） */
/**
 * 徒手動作の実施回数。未指定（新規追加した直後）は1回、0を入れたら0回として扱う。
 * 0回の動作は難度にも技の構成にも数えない。
 */
export function motionTimes(count: number | undefined): number {
  if (count === undefined || count === null) return 1;
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, n);
}

/** skillIds 内の最大連続宙返り数 */
export function maxSaltoChain(skillIds: string[]): number {
  const flags = saltoFlags(skillIds);
  let max = 0;
  let run = 0;
  flags.forEach((isSalto) => {
    if (isSalto) {
      run += 1;
      max = Math.max(max, run);
    } else {
      run = 0;
    }
  });
  return max;
}

/** 宙返り−A難度−宙返りの並びがあるか（つなぎ技） */
export function hasConnect(skills: Unit["skills"]): boolean {
  const salto = saltoFlags(skills.map((s) => s.skillId));
  for (let i = 1; i < skills.length - 1; i++) {
    const cur = skillDef(skills[i].skillId);
    if (salto[i - 1] && cur?.isConnectA && salto[i + 1]) return true;
  }
  return false;
}

/** つなぎ技のA難度に手具操作が付いていないものがあるか */
export function hasConnectWithoutApparatus(skills: Unit["skills"]): boolean {
  const salto = saltoFlags(skills.map((s) => s.skillId));
  for (let i = 1; i < skills.length - 1; i++) {
    const cur = skillDef(skills[i].skillId);
    if (salto[i - 1] && cur?.isConnectA && salto[i + 1] && !skills[i].hasApparatus) return true;
  }
  return false;
}

interface UnitBuffer {
  skills: Unit["skills"];
  motionCount: number;
  /** うち縦回転の徒手の動作数。3以上で縦3動作（E難度）とみなす。 */
  verticalCount: number;
  verticalThree: boolean;
  /** 手を上げずに実施したシェネの数 */
  cheneNoHands: number;
  /** 手ありで実施したシェネの種類（HANDS_TYPES の id） */
  cheneHandsTypes: Set<string>;
  /** 「その他」の手ありシェネを含むか（いくつあっても重複と見なさない） */
  hasOtherHands: boolean;
  /** 徒手の内訳（動作id → 実施回数）。順序は問わないが内訳が違えば別の技。 */
  composition: Map<string, number>;
  throwItems: number;
}

/** 内訳（動作id → 回数）を順序に依存しない文字列にする */
function compositionKey(composition: Map<string, number>): string {
  return [...composition.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, n]) => `${id}:${n}`)
    .join(",");
}

/** 縦3動作とみなす動作数 */
const VERTICAL_THREE_COUNT = 3;

/**
 * 難度の内容キー。§3.4.4「全く同じ技は難度として数えない」の判定に使う。
 * - 技を含むユニット（タンブリング塊・投げタン）＝転回系：難度に効く非A難度技の並び。
 *   手具を持っての前宙と投げての前宙は「同じ前宙」なので、投げの有無やA難度技は含めない（Q&A Q22）。
 * - 技を含まない投げ受け＝徒手系：投げとキャッチの間の動作数。
 * 技術タグ（視野外・手以外・背面投げ等）はいずれも難度の内容ではないので含めない。
 */
/**
 * 内容キーを返す。徒手系は**内訳（動作の種類×回数）**で判定する。順序が違っても同じ技だが、
 * 内訳が違えば（4シェネ と 3シェネ＋前転 など）別の技。
 * 手あり／手なしのシェネが混在した場合は、どちらの内容とも同じ技として扱うためキーを2つ返す
 * （Q&A Q21：2シェネ＋手を上げた2シェネは、普通の4シェネとも手を上げた4シェネとも同じ技）。
 */
function unitSignatures(
  buf: UnitBuffer,
  tumblingSkillIds: string[],
  composition: Map<string, number>,
  junior: boolean,
  future: FutureLevel,
): string[] {
  // 難度に効く非A難度技だけをキーにする（つなぎ技のA難度技は含めない：Q&A Q22）
  const tumIds = tumblingSkillIds.filter((id) => skillDifficulty(id, junior, future) !== "A");
  if (tumIds.length > 0) return [`tum:${tumIds.join(">")}`];
  const base = `hand:${compositionKey(composition)}`;
  const { cheneNoHands, cheneHandsTypes } = buf;
  if (cheneHandsTypes.size === 0) return [base];
  // 手ありの種類ごとにキーを持つ。手なしと混在していれば手なしのキーとも同じ技として扱う
  const keys = [...cheneHandsTypes].sort().map((t) => `${base}:h:${t}`);
  return cheneNoHands > 0 ? [base, ...keys] : keys;
}

function finalizeUnit(buf: UnitBuffer, junior: boolean, future: FutureLevel): Unit {
  const hasSkill = buf.skills.length > 0;
  const skillThrow = buf.skills.some((s) => s.isThrow);
  const isThrow = buf.throwItems > 0 || skillThrow;
  const throwCount = buf.throwItems + buf.skills.filter((s) => s.isThrow).length;
  const hasApparatus = buf.skills.some((s) => s.hasApparatus);

  // 転回系として扱う技と、徒手系の動作に数える技に分ける（Q&A Q7）
  const ids = buf.skills.map((s) => s.skillId);
  const tumFlags = tumblingFlags(ids);
  const tumblingSkillIds = ids.filter((_id, i) => tumFlags[i]);
  const hasTumbling = tumblingSkillIds.length > 0;
  const skillMotions = ids.reduce((n, id, i) => n + (tumFlags[i] ? 0 : handMotionsOfSkill(id, junior, future)), 0);
  const motionCount = buf.motionCount + skillMotions;
  // 徒手として数える技も内訳に含める（タンブリング技として入れても徒手動作として入れても同じ）
  const composition = new Map(buf.composition);
  ids.forEach((id, i) => {
    if (tumFlags[i]) return;
    composition.set(id, (composition.get(id) ?? 0) + 1);
  });
  // 徒手扱いの転回技（側転・きりもみ等）はすべて縦回転（`motionDef` と同じ扱い）
  const verticalCount = buf.verticalCount + skillMotions;
  // 縦回転の徒手が3動作分そろえば縦3動作（E難度）
  const verticalThree = buf.verticalThree || verticalCount >= VERTICAL_THREE_COUNT;

  const tumblingDiff = hasTumbling ? calcTumblingDifficulty(tumblingSkillIds, isThrow, junior, future) : null;
  const handDiff =
    isThrow || motionCount > 0
      ? calcHandDifficulty(motionCount, verticalThree, future, verticalCount)
      : null;

  const signatures = unitSignatures(buf, tumblingSkillIds, composition, junior, future);
  const neverDuplicate = buf.hasOtherHands;

  if (!isThrow) {
    // 投げなし：転回系があればタンブリング塊、無ければ徒手系（縦の一回転の徒手など）
    if (hasTumbling) {
      return {
        type: "tumbling",
        isThrow: false,
        throwCount: 0,
        skillThrow: false,
        signatures,
        skills: buf.skills,
        finalDiff: tumblingDiff as Difficulty,
        hasApparatus,
        hasDPlus: false,
      };
    }
    return {
      type: "throw",
      isThrow: false,
      throwCount: 0,
      skillThrow: false,
      isThrowTumbling: false,
      signatures,
      neverDuplicate,
      skills: buf.skills,
      handDiff,
      tumblingDiff: null,
      finalDiff: handDiff as Difficulty,
      diffFromHand: true,
      hasApparatus,
      hasDPlus: false,
    };
  }
  const handV = handDiff ? DIFF_VALUE[handDiff] : 0;
  const tumbV = tumblingDiff ? DIFF_VALUE[tumblingDiff] : 0;
  const finalDiff = (handV >= tumbV ? handDiff : tumblingDiff) as Difficulty;
  const diffFromHand = handV >= tumbV;
  const hasDPlus =
    DIFF_VALUE[finalDiff] >= DIFF_VALUE.D && (motionCount >= 3 || buf.verticalThree || hasSkill);
  return {
    type: "throw",
    isThrow: true,
    throwCount,
    skillThrow,
    isThrowTumbling: hasTumbling,
    signatures,
    neverDuplicate,
    skills: buf.skills,
    handDiff,
    tumblingDiff,
    finalDiff,
    diffFromHand,
    hasApparatus,
    hasDPlus,
  };
}

/** 徒手として数える要素か（徒手動作アイテム・徒手扱いの技＝側転） */
function isHandItem(item: Item): boolean {
  if (item.kind === "motion") return !!item.motionId && motionTimes(item.count) > 0;
  return item.kind === "skill" && !!item.skillId && !!skillDef(item.skillId)?.isHandElement;
}

/** 転回技か（徒手扱いの技は除く） */
function isTumblingItem(item: Item): boolean {
  return item.kind === "skill" && !!item.skillId && !skillDef(item.skillId)?.isHandElement;
}

/** 投げ上げか（技の最中の投げを含む） */
function isThrowItem(item: Item): boolean {
  return item.kind === "throw" || (item.kind === "skill" && !!item.isThrow);
}

/**
 * ユニットを区切る位置（その手前で区切る）を返す。
 *
 * キャッチで区切るほかに、**タンブリングの合間の徒手（側転・徒手動作）でも区切る**。
 * 前宙→前転→前宙 なら「前宙（タンブリング）／前転（徒手）／前宙（タンブリング）」の
 * 3つとしてそれぞれ評価する。徒手の前後どちらかに転回技が無いとき（着地の前転など）は区切らない。
 *
 * **投げ上げている間は区切らない**（投げ〜キャッチの間で徒手とタンブリングが混ざった
 * ときの裁定は従来どおり1つの塊のまま）。
 */
export function unitSplitFlags(items: Item[]): boolean[] {
  const split = items.map(() => false);
  // キャッチで区切られた区間ごとに見る
  const segments: [number, number][] = [];
  let from = 0;
  items.forEach((item, i) => {
    if (item.kind === "catch") {
      segments.push([from, i]);
      from = i + 1;
    }
  });
  segments.push([from, items.length]);

  segments.forEach(([start, end]) => {
    /** その徒手がタンブリングの合間か（前後に転回技がある） */
    const between = (i: number) =>
      isHandItem(items[i]) &&
      // 投げ上げている間（手具が空中にある間）は区切らない
      !items.slice(start, i).some(isThrowItem) &&
      items.slice(start, i).some(isTumblingItem) &&
      items.slice(i + 1, end).some(isTumblingItem);
    let last: "tumbling" | "hand" | null = null;
    for (let i = start; i < end; i++) {
      if (between(i)) {
        if (last === "tumbling") split[i] = true;
        last = "hand";
      } else if (isTumblingItem(items[i]) || isThrowItem(items[i])) {
        // 徒手のあとの転回技（そこに向けた投げ上げを含む）から次の塊にする
        if (last === "hand") split[i] = true;
        last = "tumbling";
      }
    }
  });
  return split;
}

/**
 * items を左から走査し、catch を区切りに unit へ分類する中核関数。
 * 投げを含まない連続技 → tumbling、投げを含む塊 → throw。
 * junior＝ジュニア適用規則（変更規則1）での難度認定を使う。
 * future＝十年後モードの上限難度（null で現行規則どおりE止め）。
 */
export function analyzeSeries(series: Series, junior = false, future: FutureLevel = null): SeriesAnalysis {
  const units: Unit[] = [];
  let throwCount = 0;
  let buf: UnitBuffer | null = null;
  const newBuf = (): UnitBuffer => ({
    skills: [],
    motionCount: 0,
    verticalCount: 0,
    verticalThree: false,
    cheneNoHands: 0,
    cheneHandsTypes: new Set<string>(),
    hasOtherHands: false,
    composition: new Map(),
    throwItems: 0,
  });
  const flush = () => {
    if (buf && (buf.skills.length || buf.motionCount > 0 || buf.throwItems > 0)) {
      const u = finalizeUnit(buf, junior, future);
      if (u.finalDiff) units.push(u);
      const skillThrows = buf.skills.filter((s) => s.isThrow).length;
      throwCount += buf.throwItems + skillThrows;
    }
    buf = null;
  };
  const splitBefore = unitSplitFlags(series.items);
  series.items.forEach((item, i) => {
    // タンブリングの合間の徒手はここで区切る（徒手の手前・徒手の直後）
    if (splitBefore[i]) flush();
    if (item.kind === "catch") {
      flush();
    } else if (item.kind === "throw") {
      if (!buf) buf = newBuf();
      buf.throwItems += 1;
    } else if (item.kind === "skill") {
      if (!item.skillId) return;
      if (!buf) buf = newBuf();
      buf.skills.push({
        skillId: item.skillId,
        // きりもみ系は手具操作ができないので、入力に残っていても操作として数えない
        hasApparatus: !!item.hasApparatus && canOperateApparatus(item.skillId),
        isThrow: !!item.isThrow,
      });
    } else if (item.kind === "motion") {
      if (!buf) buf = newBuf();
      const m = motionDef(item.motionId, junior, future);
      const times = motionTimes(item.count);
      // 0回の動作は何も数えない（構成にも入れない）
      if (m && times > 0) {
        buf.motionCount += m.motions * times;
        buf.verticalCount += m.vertical * times;
        if (m.verticalThree) buf.verticalThree = true;
        if (m.hasHandsOption) {
          if (item.hands) {
            const type = item.handsType || DEFAULT_HANDS_TYPE;
            buf.cheneHandsTypes.add(type);
            if (type === HANDS_TYPE_OTHER) buf.hasOtherHands = true;
          } else {
            buf.cheneNoHands += m.motions * times;
          }
        }
        // 旧データの汎用動作（1〜4動作）は種類を区別できないので、まとめて動作数で数える
        const key = m.generic ? "m" : item.motionId;
        const n = m.generic ? m.motions * times : times;
        buf.composition.set(key, (buf.composition.get(key) ?? 0) + n);
      }
    }
  });
  flush();

  // ロープ跳び：シリーズ内の最高難度の跳びを独立した徒手系難度ユニットとして追加
  let ropeMax = 0;
  let ropeMaxId = "";
  series.items.forEach((item) => {
    if (item.kind === "ropeJump") {
      const j = ropeJumpDef(item.jumpId);
      if (j && DIFF_VALUE[j.difficulty] > ropeMax) {
        ropeMax = DIFF_VALUE[j.difficulty];
        ropeMaxId = j.id;
      }
    }
  });
  if (ropeMax > 0) {
    const diff = VALUE_DIFF[Math.min(ropeMax, MAX_DIFF)];
    units.push({
      type: "throw",
      isThrow: true,
      throwCount: 0,
      skillThrow: false,
      isThrowTumbling: false,
      fromRopeJump: true,
      signatures: [`rope:${ropeMaxId}`],
      skills: [],
      handDiff: diff,
      tumblingDiff: null,
      finalDiff: diff,
      diffFromHand: true,
      hasApparatus: true,
      hasDPlus: ropeMax >= DIFF_VALUE.D,
    });
  }

  return { units, throwCount };
}

// ---- その手具では入力できない内容（別の手具から残ったもの） ----
//
// 手具を切り替えても、他の手具のシリーズテンプレートを読み込んでも、シリーズの中身は
// そのまま残る。入力画面はその手具で入力できるものしか出さないので、残った内容は
// **画面に出ないまま採点に効いてしまう**（スティックに残った「手具を使ったキャッチ」で
// 技術加点＋0.1、ロープ跳びで難度＋0.3 など）。採点も編集もここを通して弾く。

/** 手具固有の入力（その手具で入力できるものだけを true にする） */
const canUseApparatusTag = (apparatus: ApparatusKey): boolean => APPARATUS_USE[apparatus];
const canUseReqType = (apparatus: ApparatusKey, id: string): boolean =>
  REQUIRED_THROW_OPTIONS[apparatus].some((o) => o.id === id);
const canUseRopeJump = (apparatus: ApparatusKey): boolean => apparatus === "rope";

/**
 * その投げで手元から離れる手具の数。二つ投げなら2つ、それ以外は1つ。
 * 投げアイテムでも技の最中の投げでも同じ（`SkillItem.reqTypes` も見る）。
 */
export const thrownCount = (item: Item): number =>
  (item.kind === "throw" || (item.kind === "skill" && item.isThrow)) &&
  (item.reqTypes || []).includes(TWO_THROW_TAG)
    ? 2
    : 1;

/**
 * 各アイテムを実施する時点で**手元に手具が無い**か（投げてからキャッチするまで）。
 * 手具が1つの種目では投げている間ずっと手元が空になるので、その間の技に手具操作は
 * 付けられない（クラブ・リングでも二つ投げの間は同じ）。
 * 技の最中の投げは開始時は手元にあるので、その技自体は手具操作ありでよい。
 */
export function handsEmptyFlags(items: Item[], apparatus: ApparatusKey): boolean[] {
  const total = APPARATUS_COUNT[apparatus];
  let inHand = total;
  return items.map((item) => {
    if (item.kind === "throw") {
      inHand = Math.max(0, inHand - thrownCount(item));
      return false;
    }
    if (item.kind === "catch") {
      inHand = Math.min(total, inHand + (item.catchTwo ? 2 : 1));
      return false;
    }
    const empty = inHand === 0;
    if (item.kind === "skill" && item.isThrow) inHand = Math.max(0, inHand - thrownCount(item));
    return empty;
  });
}

/**
 * 各アイテムの位置で **2つ同時キャッチ**を入力できるか。
 * 手具が2つある種目（クラブ・リング）で、そのキャッチの時点で**2つとも空中にある**
 * ときだけ（＝二つ投げで両方を投げている間）。片方が手元にあるなら同時には受けられない。
 */
export function catchTwoFlags(items: Item[], apparatus: ApparatusKey): boolean[] {
  const total = APPARATUS_COUNT[apparatus];
  let inHand = total;
  return items.map((item) => {
    if (item.kind === "throw") {
      inHand = Math.max(0, inHand - thrownCount(item));
      return false;
    }
    if (item.kind === "catch") {
      const allowed = total > 1 && inHand === 0;
      inHand = Math.min(total, inHand + (item.catchTwo ? 2 : 1));
      return allowed;
    }
    if (item.kind === "skill" && item.isThrow) inHand = Math.max(0, inHand - thrownCount(item));
    return false;
  });
}

/** 手具固有の入力の表示名（`apparatusBlockers` が返す） */
export const APPARATUS_INPUT_NAMES = {
  useapp: "手具を使った投げ・キャッチ",
  catchTwo: "2つ同時キャッチ",
  ropeJump: "ロープ跳び",
  handsEmptyOp: "投げている間の手具操作",
} as const;

/** その手具では入力できない内容の一覧（無ければ空。確認ダイアログの文面に使う） */
export function apparatusBlockers(list: Series[], apparatus: ApparatusKey): string[] {
  const reasons = new Set<string>();
  const tags = canUseApparatusTag(apparatus);
  list.forEach((ser) => {
    const empty = handsEmptyFlags(ser.items, apparatus);
    ser.items.forEach((item, i) => {
      // 投げている間（手元に手具が無い間）は手具操作ができない
      if (item.kind === "skill" && item.hasApparatus && empty[i])
        reasons.add(APPARATUS_INPUT_NAMES.handsEmptyOp);
      if (item.kind === "throw") {
        if (!tags && (item.throwTypes || []).includes(USE_APPARATUS_TAG))
          reasons.add(APPARATUS_INPUT_NAMES.useapp);
        (item.reqTypes || []).forEach((id) => {
          if (!canUseReqType(apparatus, id))
            reasons.add(requiredThrowName(id));
        });
      }
      if (item.kind === "skill") {
        if (!tags && (item.throwTypes || []).includes(USE_APPARATUS_TAG))
          reasons.add(APPARATUS_INPUT_NAMES.useapp);
        // 技の最中の投げの必須投げ（二つ投げ）も、その手具で入力できなければ落とす
        (item.reqTypes || []).forEach((id) => {
          if (!canUseReqType(apparatus, id)) reasons.add(requiredThrowName(id));
        });
      }
      if (item.kind === "catch") {
        if (!tags && (item.catchTypes || []).includes(USE_APPARATUS_TAG))
          reasons.add(APPARATUS_INPUT_NAMES.useapp);
        if (!tags && item.catchTwo) reasons.add(APPARATUS_INPUT_NAMES.catchTwo);
      }
      if (item.kind === "ropeJump" && !canUseRopeJump(apparatus))
        reasons.add(APPARATUS_INPUT_NAMES.ropeJump);
    });
  });
  return [...reasons];
}

/**
 * その手具では入力できない内容を落とした構成。
 * 何も落とすものが無ければ**同じ配列をそのまま返す**（採点のたびに複製しない）。
 */
export function stripForApparatus(list: Series[], apparatus: ApparatusKey): Series[] {
  if (apparatusBlockers(list, apparatus).length === 0) return list;
  const tags = canUseApparatusTag(apparatus);
  const withoutTag = (ids?: string[]) => (ids || []).filter((id) => tags || id !== USE_APPARATUS_TAG);
  const withoutReq = (ids?: string[]) => (ids || []).filter((id) => canUseReqType(apparatus, id));
  return list.map((ser) => {
    const empty = handsEmptyFlags(ser.items, apparatus);
    const emptyOf = new Map(ser.items.map((item, i) => [item, empty[i]]));
    return {
      ...ser,
      items: ser.items
        .filter((item) => item.kind !== "ropeJump" || canUseRopeJump(apparatus))
        .map((item) => {
          // 投げている間は手具操作ができない
          if (item.kind === "skill" && item.hasApparatus && emptyOf.get(item))
            return {
              ...item,
              hasApparatus: false,
              throwTypes: withoutTag(item.throwTypes),
              reqTypes: withoutReq(item.reqTypes),
            };
          if (item.kind === "throw")
            return {
              ...item,
              throwTypes: withoutTag(item.throwTypes),
              reqTypes: withoutReq(item.reqTypes),
            };
          if (item.kind === "skill" && (item.throwTypes || item.reqTypes))
            return {
              ...item,
              throwTypes: withoutTag(item.throwTypes),
              reqTypes: withoutReq(item.reqTypes),
            };
          if (item.kind === "catch")
            return {
              ...item,
              catchTypes: withoutTag(item.catchTypes),
              catchTwo: tags ? item.catchTwo : false,
            };
          return item;
        }),
    };
  });
}

/** 手元/空中の手具数をシミュレートし、投げ・キャッチの過不足を警告として返す（採点には非影響） */
export function checkApparatusFlow(series: Series, apparatusKey: keyof typeof APPARATUS_COUNT): string[] {
  const total = APPARATUS_COUNT[apparatusKey];
  let inHand = total;
  let inAir = 0;
  const errors: string[] = [];
  series.items.forEach((item, idx) => {
    if (item.kind === "throw") {
      const num = thrownCount(item);
      if (inHand < num) errors.push(`${idx + 1}番目の投げ：手元の手具が足りません`);
      const t = Math.min(num, inHand);
      inHand -= t;
      inAir += t;
    } else if (item.kind === "skill" && item.isThrow) {
      const num = thrownCount(item);
      if (inHand < num) errors.push(`${idx + 1}番目の技の最中の投げ：手元の手具が足りません`);
      else {
        inHand -= num;
        inAir += num;
      }
    } else if (item.kind === "catch") {
      const num = item.catchTwo ? 2 : 1;
      if (inAir < num) errors.push(`${idx + 1}番目のキャッチ：空中に手具がありません`);
      const c = Math.min(num, inAir);
      inAir -= c;
      inHand += c;
    }
  });
  if (inAir > 0) errors.push("シリーズ終了時に空中の手具が残っています（キャッチ不足）");
  return errors;
}

/** 重複シリーズ判定用の正規化シグネチャ */
/**
 * **転回系の種類・組み合わせの多様性**（§3.5.6.4 の欠点テーブル）の自動判定。
 * A難度の転回技（ロンダート・バク転・側転など）は数えず、**宙返り（B難度以上の転回技）**だけを数える。
 * 全部違う技なら減点なし、同じ技を繰り返したぶん（`repeats`＝実施数−種類数）だけ減点する。
 * ひねり・姿勢が違えば別の技（`skillId` が違う）として数える。
 */
export interface TumblingVariety {
  /** 実施した宙返り（A難度を除く転回技）の数 */
  total: number;
  /** そのうち何種類か */
  distinct: number;
  /** 種類が減っているぶん（＝ total − distinct） */
  repeats: number;
  /** 自動計算した減点（`TUM_VARIETY_DEDUCTION_STEP` × repeats、項目の上限で丸め） */
  deduction: number;
}

export function tumblingVariety(list: Series[], junior = false): TumblingVariety {
  const ids: string[] = [];
  list.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind !== "skill" || !item.skillId) return;
      if (skillDifficulty(item.skillId, junior) === "A") return;
      ids.push(item.skillId);
    }),
  );
  const total = ids.length;
  const distinct = new Set(ids).size;
  const repeats = Math.max(0, total - distinct);
  const max = artDeductionItem(TUM_VARIETY_ITEM_ID)?.max ?? 0;
  const deduction = Math.min(max, Math.round(repeats * TUM_VARIETY_DEDUCTION_STEP * 10) / 10);
  return { total, distinct, repeats, deduction };
}

export function seriesSignature(series: Series): string {
  return JSON.stringify(
    series.items.map((item) => {
      if (item.kind === "throw")
        return { k: "throw", req: [...(item.reqTypes || [])].sort(), types: [...(item.throwTypes || [])].sort() };
      if (item.kind === "catch")
        return { k: "catch", types: [...(item.catchTypes || [])].sort(), two: !!item.catchTwo };
      if (item.kind === "skill")
        return {
          k: "skill",
          id: item.skillId,
          thr: !!item.isThrow,
          req: [...(item.reqTypes || [])].sort(),
        };
      if (item.kind === "motion")
        return {
          k: "motion",
          id: item.motionId,
          hands: !!item.hands,
          ht: item.hands ? item.handsType || DEFAULT_HANDS_TYPE : "",
          n: motionTimes(item.count),
        };
      if (item.kind === "ropeJump") return { k: "ropeJump", id: item.jumpId };
      return { k: "?" };
    }),
  );
}


// ---- シリーズのタグ（検索・一覧表示用）----

export type SeriesTagId = "throw" | "throwTum" | "salto3" | "connect";

/** シリーズに付くタグの定義（表示順） */
export const SERIES_TAGS: { id: SeriesTagId; name: string; title: string }[] = [
  { id: "throw", name: "投げ", title: "投げ上げを含む" },
  { id: "throwTum", name: "投げタン", title: "転回系の投げ受け（投げタン）を含む" },
  { id: "salto3", name: "三宙", title: "宙返りを3回以上連続" },
  { id: "connect", name: "つなぎ", title: "宙返りの間にA難度のつなぎ技を挟む" },
];

/** シリーズの内容から付くタグを求める（入力から自動判定。順序は SERIES_TAGS） */
export function seriesTags(series: Series, junior = false): SeriesTagId[] {
  const a = analyzeSeries(series, junior);
  const tags: SeriesTagId[] = [];
  if (a.throwCount > 0) tags.push("throw");
  if (a.units.some((u) => u.isThrowTumbling)) tags.push("throwTum");
  if (a.units.some((u) => maxSaltoChain(u.skills.map((s) => s.skillId)) >= SALTO_CHAIN_TAG_MIN)) tags.push("salto3");
  if (a.units.some((u) => hasConnect(u.skills))) tags.push("connect");
  return tags;
}

/** 「三宙」とみなす連続宙返りの回数 */
export const SALTO_CHAIN_TAG_MIN = 3;
