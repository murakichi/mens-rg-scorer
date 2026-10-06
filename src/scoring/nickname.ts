// =====================================================================
// 略称：シリーズを現場の呼び方（ロンダーバック・一回半前宙投げ …）で読む
// 表示専用。採点には一切関わらない。
// =====================================================================
import { CATEGORY, LEFT_HAND_THROW_TAG, TWO_THROW_TAG, USE_APPARATUS_TAG, HAND_MOTIONS, MOTION_OPTIONS, skillDef } from "./constants";
import type { CatchItem, Item, Series, SkillItem } from "./types";


/** ひねり回数の読み：0.5 → 半、1 → 一回、1.5 → 一回半 */
function twistReading(twist: number): string {
  if (twist === 0.5) return "半";
  const whole = Math.floor(twist);
  return `${String(whole)}回${twist % 1 !== 0 ? "半" : ""}`;
}

/** 投げ・キャッチの種類を「背面／手以外／手具」の接頭辞にする */
function tagPrefix(tags: string[] = []): string {
  return (tags.includes("noview") ? "背面" : "") + (tags.includes("nonhand") ? "手以外" : "") + (tags.includes(USE_APPARATUS_TAG) ? "手具" : "");
}

function throwReading(tags: string[] = [], req: string[] = []): string {
  const lead = req.includes(LEFT_HAND_THROW_TAG) ? "左手" : "";
  return tagPrefix(tags) + lead + (req.includes(TWO_THROW_TAG) ? "二つ" : "") + "投げ";
}

/** 通常のキャッチ（その他を含む）は読まない */
function catchReading(tags: string[] = []): string {
  const p = tagPrefix(tags);
  return p ? `${p}キャッチ` : "";
}

/** 技そのものの略称（投げ・受けの印は含まない） */
function skillReading(skillId: string): string {
  const sk = skillDef(skillId);
  if (!sk) return "";
  if (sk.id === "a_flicflac") return "バック";
  if (sk.id === "b_tempo") return "テンポ";
  const t = sk.twist;
  if (t) {
    const pre = t.posture === "pike" ? "屈伸" : t.posture === "layout" ? "伸身" : "";
    if (t.base === "back") {
      if (t.posture === "layout" && t.twist === 0) return "スワン";
      if (t.posture === "layout" && t.twist === 0.5) return "ハーフ";
      if (t.twist === 0) return pre ? pre : "後宙";
      return pre + twistReading(t.twist);
    }
    return t.twist === 0 ? `${pre}前宙` : pre + twistReading(t.twist);
  }
  // ムーンサルト・ルドルフのように括弧書きの通称がある技はそちらで呼ぶ
  const m = sk.name.match(/（(.+)）/);
  return m ? m[1] : sk.name;
}

const isBackTwist = (id: string) => skillDef(id)?.twist?.base === "back";
const isForwardSalto = (id: string) => {
  const d = skillDef(id);
  return !!d?.isSalto && d.category === CATEGORY.FORWARD;
};
const isSalto = (it?: Item) => it?.kind === "skill" && !!skillDef(it.skillId)?.isSalto;

/** 投げ・受けの印（読みが空でない＝名前を落とせない） */
function skillMark(it: SkillItem): string {
  let s = "";
  if (it.isThrow) s += throwReading(it.throwTypes, it.reqTypes);
  if (it.isCatch) s += catchReading(it.catchTypes);
  return s;
}

/** 連続したタンブリング技（途中に徒手・投げ・キャッチを挟まない並び）を1つの呼び名にする */
function readRun(run: SkillItem[]): string {
  const hasBack = run.some((r) => r.skillId === "a_flicflac");
  const saltos = run.filter((r) => isSalto(r)).length;
  let out = "";
  for (let i = 0; i < run.length; i++) {
    const it = run[i];
    const next = run[i + 1];
    const prev = run[i - 1];
    const mark = skillMark(it);
    if (it.skillId === "a_roundoff") {
      if (next?.skillId === "a_flicflac") out += "ロンダー" + mark;
      else if (!mark && isSalto(prev) && isSalto(next)) out += "つなぎ";
      else if (!mark && i === 0 && next?.skillId === "b_backsalto" && !hasBack && saltos === 1 && !skillMark(next)) {
        out += "ロン宙";
        i++;
      } else if (!mark && !hasBack && isSalto(next)) {
        // バク転を含まない連続では、頭のロンダートは呼ばない
      } else out += "ロンダート" + mark;
      continue;
    }
    // 後方系→前方系の連続は「○○切り返し」。次が前宙ならその前宙は呼ばず、
    // 前宙以外（前宙半ひねり・転宙など）なら切り返しの後ろにその技が続く。
    // 前宙の後に技が続くときも、続きはそのまま読む
    if (!mark && next && !skillMark(next) && isBackTwist(it.skillId) && isForwardSalto(next.skillId)) {
      // ひねりからの切り返しは「n回ひねり切り返し」（ハーフ・スワン・ひねり無しはそのまま）
      const base = skillReading(it.skillId);
      const t = skillDef(it.skillId)?.twist;
      out += base + (t && t.twist > 0 && base !== "ハーフ" ? "ひねり" : "") + "切り返し";
      if (next.skillId === "b_front") i++;
      continue;
    }
    out += skillReading(it.skillId) + mark;
  }
  return out;
}

function readMotion(it: Item): string {
  if (it.kind !== "motion") return "";
  const n = it.count === undefined ? 1 : Number(it.count);
  if (!(n > 0)) return "";
  const name = skillDef(it.motionId)
    ? skillReading(it.motionId)
    : (MOTION_OPTIONS.find((o) => o.id === it.motionId) ?? HAND_MOTIONS.find((o) => o.id === it.motionId))?.name ?? "";
  return n > 1 ? String(n) + name : name;
}

/** ユニット（投げ〜キャッチ）の中身を左から読む */
function readUnit(parts: Item[], lead: string): string {
  let out = lead;
  let run: SkillItem[] = [];
  const flush = () => {
    out += readRun(run);
    run = [];
  };
  for (const p of parts) {
    if (p.kind === "skill") run.push(p);
    else {
      flush();
      out += readMotion(p);
    }
  }
  flush();
  return out;
}

/**
 * シリーズの略称。投げ〜キャッチを1ユニットとして続けて読み、ユニット間は「・」で区切る。
 * 例：ロンダート→バク転 ＝ ロンダーバック、投げ→一回半→前宙(投げ)… ＝ 一回半前宙投げ。
 */
export function seriesNickname(series: Series): string {
  const units: string[] = [];
  let lead = "";
  let parts: Item[] = [];
  const close = (tail: string) => {
    const s = readUnit(parts, lead) + tail;
    if (s) units.push(s);
    lead = "";
    parts = [];
  };
  for (const it of series.items) {
    if (it.kind === "throw") {
      close("");
      lead = throwReading(it.throwTypes, it.reqTypes);
    } else if (it.kind === "catch") {
      close(catchReading((it as CatchItem).catchTypes));
    } else if (it.kind === "skill" || it.kind === "motion") {
      parts.push(it);
    }
  }
  close("");
  return units.join("・");
}
