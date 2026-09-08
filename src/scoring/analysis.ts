// =====================================================================
// シリーズ単位の分析ロジック（純粋関数）
// =====================================================================

import {
  DIFF_VALUE,
  VALUE_DIFF,
  MAX_DIFF,
  HAND_MOTIONS,
  APPARATUS_COUNT,
  skillDef,
  skillDifficulty,
  ropeJumpDef,
} from "./constants";
import type {
  Difficulty,
  Series,
  SeriesAnalysis,
  Unit,
} from "./types";

/** タンブリング塊の難度を算出。先頭技の値 + 以降の非A技ごとに +1、投げ含みで +1、E止め。 */
export function calcTumblingDifficulty(
  skillIds: string[],
  hasThrow: boolean,
  junior = false,
): Difficulty | null {
  const diffs = skillIds
    .map((id) => skillDifficulty(id, junior))
    .filter((d): d is Difficulty => !!d && d !== "A");
  if (diffs.length === 0) return null;
  let v = DIFF_VALUE[diffs[0]];
  for (let i = 1; i < diffs.length; i++) v += DIFF_VALUE[diffs[i]] - 1;
  if (hasThrow) v += 1;
  return VALUE_DIFF[Math.min(v, MAX_DIFF)];
}

/** 徒手難度。縦3動作は無条件E、それ以外は動作数を A 起点で加算。 */
export function calcHandDifficulty(motionCount: number, verticalThree: boolean): Difficulty {
  if (verticalThree) return "E";
  return VALUE_DIFF[Math.min(DIFF_VALUE.A + motionCount, MAX_DIFF)];
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
export function handMotionsOfSkill(skillId: string, junior = false): number {
  const d = skillDifficulty(skillId, junior);
  return d ? Math.max(1, DIFF_VALUE[d] - 1) : 0;
}

/**
 * 徒手動作アイテムの内容。動作数プルダウンのほか、徒手扱いの転回技（側転・きりもみ等）も選べる。
 */
export function motionDef(
  id: string,
  junior = false,
): { motions: number; verticalThree: boolean; vertical: number } | null {
  const m = HAND_MOTIONS.find((x) => x.id === id);
  if (m) return { motions: m.motions, verticalThree: !!m.verticalThree, vertical: m.vertical ? m.motions : 0 };
  if (skillDef(id)) {
    const n = handMotionsOfSkill(id, junior);
    // 徒手扱いの転回技はすべて縦回転の徒手
    return { motions: n, verticalThree: false, vertical: n };
  }
  return null;
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
  throwItems: number;
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
function unitSignature(
  tumblingSkillIds: string[],
  motionCount: number,
  verticalThree: boolean,
  junior: boolean,
): string {
  // 難度に効く非A難度技だけをキーにする（つなぎ技のA難度技は含めない：Q&A Q22）
  const tumIds = tumblingSkillIds.filter((id) => skillDifficulty(id, junior) !== "A");
  if (tumIds.length > 0) return `tum:${tumIds.join(">")}`;
  return `hand:m${motionCount}${verticalThree ? "v" : ""}`;
}

function finalizeUnit(buf: UnitBuffer, junior: boolean): Unit {
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
  const skillMotions = ids.reduce((n, id, i) => n + (tumFlags[i] ? 0 : handMotionsOfSkill(id, junior)), 0);
  const motionCount = buf.motionCount + skillMotions;
  // 縦回転の徒手が3動作分そろえば縦3動作（E難度）
  const verticalThree = buf.verticalThree || buf.verticalCount + skillMotions >= VERTICAL_THREE_COUNT;

  const tumblingDiff = hasTumbling ? calcTumblingDifficulty(tumblingSkillIds, isThrow, junior) : null;
  const handDiff = isThrow || motionCount > 0 ? calcHandDifficulty(motionCount, verticalThree) : null;

  const signature = unitSignature(tumblingSkillIds, motionCount, verticalThree, junior);

  if (!isThrow) {
    // 投げなし：転回系があればタンブリング塊、無ければ徒手系（縦の一回転の徒手など）
    if (hasTumbling) {
      return {
        type: "tumbling",
        isThrow: false,
        throwCount: 0,
        skillThrow: false,
        signature,
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
      signature,
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
    signature,
    skills: buf.skills,
    handDiff,
    tumblingDiff,
    finalDiff,
    diffFromHand,
    hasApparatus,
    hasDPlus,
  };
}

/**
 * items を左から走査し、catch を区切りに unit へ分類する中核関数。
 * 投げを含まない連続技 → tumbling、投げを含む塊 → throw。
 * junior＝ジュニア適用規則（変更規則1）での難度認定を使う。
 */
export function analyzeSeries(series: Series, junior = false): SeriesAnalysis {
  const units: Unit[] = [];
  let throwCount = 0;
  let buf: UnitBuffer | null = null;
  const newBuf = (): UnitBuffer => ({
    skills: [],
    motionCount: 0,
    verticalCount: 0,
    verticalThree: false,
    throwItems: 0,
  });
  const flush = () => {
    if (buf && (buf.skills.length || buf.motionCount > 0 || buf.throwItems > 0)) {
      const u = finalizeUnit(buf, junior);
      if (u.finalDiff) units.push(u);
      const skillThrows = buf.skills.filter((s) => s.isThrow).length;
      throwCount += buf.throwItems + skillThrows;
    }
    buf = null;
  };
  series.items.forEach((item) => {
    if (item.kind === "catch") {
      flush();
    } else if (item.kind === "throw") {
      if (!buf) buf = newBuf();
      buf.throwItems += 1;
    } else if (item.kind === "skill") {
      if (!item.skillId) return;
      if (!buf) buf = newBuf();
      buf.skills.push({ skillId: item.skillId, hasApparatus: !!item.hasApparatus, isThrow: !!item.isThrow });
    } else if (item.kind === "motion") {
      if (!buf) buf = newBuf();
      const m = motionDef(item.motionId, junior);
      if (m) {
        buf.motionCount += m.motions;
        buf.verticalCount += m.vertical;
        if (m.verticalThree) buf.verticalThree = true;
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
      signature: `rope:${ropeMaxId}`,
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

/** 手元/空中の手具数をシミュレートし、投げ・キャッチの過不足を警告として返す（採点には非影響） */
export function checkApparatusFlow(series: Series, apparatusKey: keyof typeof APPARATUS_COUNT): string[] {
  const total = APPARATUS_COUNT[apparatusKey];
  let inHand = total;
  let inAir = 0;
  const errors: string[] = [];
  series.items.forEach((item, idx) => {
    if (item.kind === "throw") {
      const num = (item.reqTypes || []).includes("twothrow") ? 2 : 1;
      if (inHand < num) errors.push(`${idx + 1}番目の投げ：手元の手具が足りません`);
      const t = Math.min(num, inHand);
      inHand -= t;
      inAir += t;
    } else if (item.kind === "skill" && item.isThrow) {
      if (inHand < 1) errors.push(`${idx + 1}番目の技の最中の投げ：手元の手具が足りません`);
      else {
        inHand -= 1;
        inAir += 1;
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
export function seriesSignature(series: Series): string {
  return JSON.stringify(
    series.items.map((item) => {
      if (item.kind === "throw")
        return { k: "throw", req: [...(item.reqTypes || [])].sort(), types: [...(item.throwTypes || [])].sort() };
      if (item.kind === "catch")
        return { k: "catch", types: [...(item.catchTypes || [])].sort(), two: !!item.catchTwo };
      if (item.kind === "skill") return { k: "skill", id: item.skillId, thr: !!item.isThrow };
      if (item.kind === "motion") return { k: "motion", id: item.motionId };
      if (item.kind === "ropeJump") return { k: "ropeJump", id: item.jumpId };
      return { k: "?" };
    }),
  );
}
