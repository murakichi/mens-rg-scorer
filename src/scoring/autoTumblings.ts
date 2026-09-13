// =====================================================================
// タンブリングシリーズの自動生成（ランダム生成用）
//
// 投げ（autoThrows.ts）と同じく、よくあるタンブリングの形をシステム側で組む。
// 並べ方は**入力画面と同じ制約**＋**実際の演技での組み方**で決める：
//  - 後方系はロンダート・バク転から入るか、後ろ向きに降りる宙返りに続けてしか
//    実施できない（`needsRoundoffBefore`。足りなければロンダートを補う）
//  - ロンダート・バク転の直後は後方系しか実施できない（`skillFlowAfter`）
//  - 宙返りを続けるときの系統は**直前の技の降りる向き**で決まる（`leadsBackward`）。
//    後ろ向きに降りれば後方系、前向きに降りれば前方系・側方系
//  - 連続の難度は**だんだん下がる**（後方1回半ひねり→前方1回ひねり→前宙 など）。
//    テンポ宙返り・テンポひねりだけは例外で、そのあと難度が上がってよい
//  - 後方系を続けて実施することは少ないので、テンポ以外の後方系で連続は切る
//    （前方の半ひねりから後方系に入るのは普通に実施する）。
//    ただし後方伸身宙返り（ひねりを含む）の後は 前宙・きりもみ・きりもみ転回 が主流
//  - 宙返りのあとのバク転は（テンポの後を除いて）個人ではまず無いので、つなぎ技は
//    前向きに降りた後のロンダート・側転・ハンドスプリング・とび前転にする
//  - つなぎの最後のただの後方宙返りは上級者は実施しない（B難度がほしいときは
//    ダイビング前宙・後方伸身宙返り）。Dスコアの低い選手・ジュニアは実施するので、
//    候補には残して選ばれにくくするだけにする
//  - 投げ受け（投げタン）は手具の滞空時間の都合で 前方系→前転／前方系→側宙（転宙）。
//    投げたあとにロンダートを入れる形は作らない
//  - とび前転・きりもみ（首から背中にかけて着地する）・きりもみ転回・側宙は連続の最後だけ。
//    その後に技を続けない（入りの技・つなぎ技にも使わない）
//  - 側転は徒手扱いなので、つなぎ技には使わない（側宙への入りには使う）
//  - ハンドスプリング・転宙は実施が少ないので選ばれにくくし、演技内で1回までにする
//  - 単発で高難度な技ほど実施回数・頻度が少ないので、難度が高いほど選ばれにくくする
//  - ジュニアは2回宙返り系を実施しない（`skillOptions` の選択肢に出ない）。
//    一般でも個人で2回宙返り系を実施することはほぼないので、テンプレートに出てくる
//    ときだけ使う。2回宙返りの後に連続・つなぎを続けることもない（後ろ向きに降りる
//    テンポ以外の後方系なので、連続もつなぎも自然に止まる）
//  - Dスコアの低い選手は、ルールの要求を満たしきれない単純なタンブリングを実施する
//    （ロンダート→宙返り1本で終わり／三宙なし／つなぎなし／D難度なし）ので、
//    低いDスコアを狙う構成では候補もそれに寄せる（`basicLevel`）
// 組み立てたシリーズは `tumblingFlowErrors` で入力画面の制約を検算できる。
// =====================================================================

import {
  CATEGORY,
  DIFF_VALUE,
  MAX_DIFF,
  ROUNDOFF_SKILL_ID,
  isBackwardSalto,
  leadsBackward,
  skillDef,
  skillDifficulty,
  skillFlowAfter,
  skillOptions,
} from "./constants";
import { needsRoundoffBefore, prevSkillId, stripForApparatus } from "./analysis";
import { NON_HAND_TAG, autoThrowStyles, type AutoThrowStyle } from "./autoThrows";
import { newTemplateId, type SeriesTemplate } from "./templates";
import type { ApparatusKey, Difficulty, Item, Series } from "./types";

/** 自動生成するタンブリングの形 */
export interface AutoTumblingPattern {
  id: string;
  /** 宙返りの本数（最小・最大とも含む） */
  saltos: { min: number; max: number };
  /** 1本目の宙返りのあとにつなぎ技（A難度）を挟むか */
  connect: boolean;
  /** 投げ受け（投げタン）か */
  throwCatch: boolean;
  /**
   * 投げを**最後の宙返りの最中**に実施するか（`throwCatch` と併用）。
   * 投げてから跳ぶ形は手具の滞空時間に縛られるが、連続の最後に投げるなら
   * 前に何本入れても自由で、三宙と投げタンを1シリーズで両方満たせる。
   */
  throwInSkill?: boolean;
  /** 最後に前転でつなぐか（投げ受けの着地） */
  rollFinish: boolean;
}

export const AUTO_TUMBLING_PATTERNS: AutoTumblingPattern[] = [
  // 宙返りの連続（3本で三宙）。難度はだんだん下がる
  { id: "chain", saltos: { min: 1, max: 3 }, connect: false, throwCatch: false, rollFinish: false },
  // 1本目の後につなぎ技を挟む（前向きに降りて → ロンダート等 → もう1本）
  { id: "connect", saltos: { min: 2, max: 3 }, connect: true, throwCatch: false, rollFinish: false },
  // 投げタン：投げ→前方系→前転→キャッチ
  { id: "throwRoll", saltos: { min: 1, max: 1 }, connect: false, throwCatch: true, rollFinish: true },
  // 投げタン：投げ→前方系→側宙（転宙）→キャッチ
  { id: "throwSalto", saltos: { min: 2, max: 2 }, connect: false, throwCatch: true, rollFinish: false },
  // 投げタン：連続の最後の宙返りの最中に投げて、前転→キャッチ（三宙と投げタンを1本で両立）
  {
    id: "chainThrowInSkill",
    saltos: { min: 2, max: 3 },
    connect: false,
    throwCatch: true,
    throwInSkill: true,
    rollFinish: true,
  },
];

/**
 * 投げタンのキャッチのあとに**連続投げ**を続ける確率。現実にあり得る形で、
 * 投げてから宙返りを実施する形（`throwRoll`・`throwSalto`）のほうが、
 * 宙返りの最中に投げる形（`throwInSkill`）より多い。
 */
export const PAIR_AFTER_THROW_FIRST_CHANCE = 0.5;
export const PAIR_AFTER_THROW_IN_SKILL_CHANCE = 0.2;

/** その形で投げタンのキャッチのあとに連続投げを続ける確率 */
export const pairAfterChance = (pattern: AutoTumblingPattern): number =>
  pattern.throwInSkill ? PAIR_AFTER_THROW_IN_SKILL_CHANCE : PAIR_AFTER_THROW_FIRST_CHANCE;

/**
 * 連続投げの2回目に使える投げ方。手以外の投げは2回目には実施できない。
 * スティックの左手投げ・クラブとリングの二つ投げもここに入る（手元に戻っているので実施できる）。
 */
export function secondThrowStyles(apparatus: ApparatusKey): AutoThrowStyle[] {
  return autoThrowStyles(apparatus).filter((t) => t.id !== NON_HAND_TAG);
}

/** 投げ受けの着地でつなぐ徒手動作（前転） */
export const THROW_ROLL_MOTION = "fwd_roll";

/**
 * その宙返りで終わると、進行方向に対して**後ろ向きで終わる**か。
 *  - 整数ひねりの後方宙返り（半ひねりは前向きに降りる）
 *  - 半ひねり・1回半ひねりの前方宙返り（前方は半ひねりで後ろ向きに降りる）
 * どちらもこの後に何も実施せず終わることはなく（`canEndChain`）、
 * この後に前転を実施することもない（`noRollAfter`）。
 */
export const endsFacingBackward = (id: string): boolean => !!skillDef(id)?.isSalto && leadsBackward(id);

/**
 * 後ろ向きで終わる後方宙返りで**終わってよい確率**。狙うDスコアが上がるほど指数的に
 * 下がり（1点ごとに半分）、複数のシリーズで連続技を検討するレベルで0になる。
 * 0になる水準は必須要素をすべて満たしにいくのと同じ3.0点
 * （`generate.ts` の `REQUIRE_ALL_ELEMENTS_MIN_SCORE` と同じ考え方）。
 */
export const BACKWARD_END_ZERO_SCORE = 3.0;
export const BACKWARD_END_DECAY = 0.5;
export function backwardEndChance(targetScore?: number | null): number {
  // 上限を指定しない＝難度を狙いきる構成なので実施しない
  if (targetScore == null) return 0;
  if (targetScore >= BACKWARD_END_ZERO_SCORE) return 0;
  return BACKWARD_END_DECAY ** Math.max(0, targetScore);
}

/**
 * この技のあとに前転でつながない技。物理的に破綻はしていなくても実際には無い並び。
 *  - 側宙の後の前転
 *  - 後ろ向きで終わる後方宙返りの後の前転
 * 投げ受けはそのままキャッチする。
 */
export const NO_ROLL_AFTER_SKILLS: string[] = ["b_sidesalto"];
export const noRollAfter = (id: string): boolean =>
  NO_ROLL_AFTER_SKILLS.includes(id) || endsFacingBackward(id);

/**
 * 連続の**最後**に置ける技か。後ろ向きで終わる技の後に何も実施せず終わることはない。
 *  - 後方宙返り（整数ひねり）：Dスコアの低い選手は実施するので、`allowBackwardEnd`
 *    （`backwardEndChance` の抽選）が通ったときだけ許す
 *  - 前方の半ひねり・1回半ひねり：実戦で使われることはほぼ無いので、常に許さない
 *  - 2回宙返り系：連続も繋ぎもせずそこで終わる技なので例外
 */
export const canEndChain = (id: string, allowBackwardEnd = false): boolean => {
  if (!endsFacingBackward(id)) return true;
  if (skillDef(id)?.isDoubleSalto) return true;
  return allowBackwardEnd && isBackwardSalto(id);
};

/**
 * 側宙の実施中に投げる構成の重み。クラブでの練習動画はあるが、実戦で使われた記録は
 * 無いので稀。連続の最後で投げる形（`throwInSkill`）で側宙を引く確率を下げる。
 */
export const THROW_IN_SIDE_SALTO_WEIGHT = 0.1;

/** 投げ受けで前方系の宙返りに続けて実施する技（側宙、たまに転宙） */
export const THROW_FINISH_SALTOS: string[] = ["b_sidesalto", "b_tenchu"];

/**
 * 後方伸身宙返り（ひねりの有無を問わない）の後に実施する主流の技。
 * 後ろ向きに降りる技だが、ここだけは連続が切れず前方系に続く。
 * 側宙はこの後の前宙に続けて実施する（前宙（＋側宙））。
 * 実際の多さは 前宙＞きりもみ＞＞きりもみ転回 なので、選ばれやすさに重みを付ける。
 * きりもみ・きりもみ転回は宙返りの連続の中でだけ宙返りとして数える技（Q&A Q7）で、
 * まさにこの位置で実施するので難度の上下は問わない。
 */
export const AFTER_BACK_LAYOUT_SALTOS: { id: string; weight: number }[] = [
  { id: "b_front", weight: 5 },
  { id: "b_kirimomi", weight: 3 },
  { id: "c_kirimomiten", weight: 1 },
];

/** 実施する技の選ばれやすさ（直前の技で変わる。表に無い技は1） */
export function saltoWeights(
  prevId: string,
  junior = false,
  apparatus?: ApparatusKey,
): Record<string, number> {
  const weights = baseSkillWeights(junior, apparatus);
  // テンポひねりの次はテンポ宙返り＞それ以外の宙返り（難度の重みより優先する）
  if (prevId === TEMPO_TWIST_SKILL_ID)
    return { ...weights, [TEMPO_SKILL_ID]: AFTER_TEMPO_TWIST_WEIGHT };
  if (!isBackLayoutSalto(prevId)) return weights;
  // 後方伸身宙返りの後は 前宙＞きりもみ＞＞きりもみ転回（難度の重みより優先する）
  return { ...weights, ...Object.fromEntries(AFTER_BACK_LAYOUT_SALTOS.map((x) => [x.id, x.weight])) };
}

/** 後方伸身宙返り系（ひねりを含む）か */
export function isBackLayoutSalto(id: string): boolean {
  const t = skillDef(id)?.twist;
  return t?.base === "back" && t.posture === "layout";
}

/**
 * つなぎ技のあとに実施することが稀な技。
 * 上級者はつなぎの最後にただの後方宙返りを実施せず、B難度がほしいときは
 * ダイビング前宙・後方伸身宙返りを実施する。ただしDスコアの低い選手・ジュニアは
 * 実施することが十分あるので、候補からは外さず**選ばれにくく**しておく。
 * 高いDを狙う構成では難度で負けるので、そもそも使われない。
 */
export const CONNECT_FINISH_RARE: string[] = ["b_backsalto"];

/** 稀な技の選ばれやすさ（既定の1に対する重み） */
export const RARE_PICK_WEIGHT = 0.2;

/**
 * つなぎ技のあとに**直前より高い難度**の宙返りを実施するときの重み。
 * 連続は難度がだんだん下がるのが普通で（`nextSaltoOptions` の上限）、つなぎで勢いを
 * 作り直しても上げることは少ない（E難度は C→B→B ＞ B→C→B）。禁止はしない。
 */
export const CONNECT_RISE_WEIGHT = 0.3;

/**
 * 実施が少ない技。選ばれにくくし、**演技内で1回まで**にする（`LIMITED_SKILL_MAX`）。
 * ハンドスプリング・転宙は、実施されることはあっても繰り返し使う技ではない。
 */
export const LIMITED_SKILLS: string[] = ["a_handspring", "b_tenchu"];
/** 実施が少ない技を演技内で実施してよい回数 */
export const LIMITED_SKILL_MAX = 1;
const limitedWeights = (): Record<string, number> =>
  Object.fromEntries(LIMITED_SKILLS.map((id) => [id, RARE_PICK_WEIGHT]));

/**
 * 同じ位置に入れられる技のなかでの、実際の演技での多さ（既定1に対する重み）。
 * 難度が同じでも実施の頻度は違うので、難度の重みとは別に掛ける。
 *  - ロンダート ＞ バク転 ＞ ハンドスプリング（入りの技・つなぎ技）
 *  - 前方宙返り1回ひねり ＞ 伸身前宙 ＞ きりもみ転回（C難度の前方系）
 *  - 側宙 ＞ 転宙
 *  - 抱え込み＝伸身 ＞ 屈伸（姿勢）
 *  - 前宙 ＞ 前宙半ひねり
 *  - テンポひねりは後方系のC難度のなかで最も少ない（ただし屈伸より上）
 */
export const SKILL_PICK_WEIGHT: Record<string, number> = {
  // ロンダート（重み無し＝1）＞ バク転 ＞ ハンドスプリング（`LIMITED_SKILLS` で 0.2）
  a_flicflac: 0.5,
  // 前方宙返り1回ひねり（1）＞ 伸身前宙 ＞ きりもみ転回
  c_kirimomiten: 0.3,
  // 側宙（1）＞ 転宙（`LIMITED_SKILLS` で 0.2）
  // 屈伸は抱え込み・伸身より少ない
  b_backtuck: 0.3,
  c_backtuck1full: 0.3,
  // 前宙（1）＞ 前宙半ひねり
  b_fronthalf: 0.5,
  // テンポひねりは後方系のC難度のなかで最も少ない。ただし屈伸より上
  c_tempotwist: 0.5,
};

/**
 * 難度ごとの選ばれやすさ。**単発で高難度な技ほど、演技内での実施回数も頻度も少ない**。
 * 表に無い難度（A〜C）は1（そのまま）。
 */
export const SALTO_DIFFICULTY_WEIGHT: Partial<Record<Difficulty, number>> = { D: 0.6, E: 0.3 };

/**
 * 手具ごとの、単発で高難度な技の出やすさの倍率（`SALTO_DIFFICULTY_WEIGHT` に掛ける）。
 * リングは重く、持ったままひねるのが難しいので、他の手具より更に頻度が低い。
 * 表に無い手具は1（倍率なし）。
 */
export const APPARATUS_HIGH_DIFFICULTY_WEIGHT: Partial<Record<ApparatusKey, number>> = { ring: 0.4 };

/** 手具ごとの単発高難度の出やすさの倍率（既定1） */
export const apparatusHighDifficultyWeight = (apparatus?: ApparatusKey): number =>
  (apparatus && APPARATUS_HIGH_DIFFICULTY_WEIGHT[apparatus]) ?? 1;

/** 単発で高難度とみなす難度（この値以上） */
export const HIGH_DIFFICULTY_MIN: Difficulty = "D";

/** 単発で高難度（D難度以上）な技か */
export function isHighDifficultySkill(id: string, junior = false): boolean {
  const d = skillDifficulty(id, junior);
  return !!d && DIFF_VALUE[d] >= DIFF_VALUE[HIGH_DIFFICULTY_MIN];
}

/** 技の選ばれやすさの土台（高難度の単発・実施が少ない技を下げる） */
function baseSkillWeights(junior: boolean, apparatus?: ApparatusKey): Record<string, number> {
  const weights = limitedWeights();
  const factor = apparatusHighDifficultyWeight(apparatus);
  skillOptions(junior).forEach((sk) => {
    const d = skillDifficulty(sk.id, junior);
    const w = d ? SALTO_DIFFICULTY_WEIGHT[d] : undefined;
    if (w !== undefined) weights[sk.id] = Math.min(weights[sk.id] ?? 1, w * factor);
  });
  // 実施の多さ（難度が同じ技どうしの優先度）を掛ける
  Object.entries(SKILL_PICK_WEIGHT).forEach(([id, w]) => {
    weights[id] = (weights[id] ?? 1) * w;
  });
  return weights;
}

/**
 * つなぎ技のあとの技の選ばれやすさ。
 * 基本技も普通に実施する選手（ジュニア・基本的な構成）には重みを付けない。
 */
export function connectFinishWeights(
  basicLevel = false,
  junior = false,
  apparatus?: ApparatusKey,
): Record<string, number> {
  const weights = baseSkillWeights(junior, apparatus);
  if (basicLevel) return weights;
  return { ...weights, ...Object.fromEntries(CONNECT_FINISH_RARE.map((id) => [id, RARE_PICK_WEIGHT])) };
}

/**
 * テンポ宙返り系。連続の「難度はだんだん下がる」の例外で、この後は難度が上がってよい。
 * 宙返りのあとにバク転を実施するのも、テンポの後だけ。
 */
export const TEMPO_SKILL_ID = "b_tempo";
export const TEMPO_TWIST_SKILL_ID = "c_tempotwist";
export const TEMPO_SKILLS: string[] = [TEMPO_SKILL_ID, TEMPO_TWIST_SKILL_ID];
export const isTempoSalto = (id: string): boolean => TEMPO_SKILLS.includes(id);

/**
 * テンポひねりの次の技の優先度は テンポ宙返り ＞ それ以外の宙返り ＞ バク転。
 * テンポ宙返りだけ重みを上げ、バク転（テンポの後だけ挟めるつなぎ技）は
 * `TEMPO_CONNECT_WEIGHT` で下げる。
 */
export const AFTER_TEMPO_TWIST_WEIGHT = 3;

/**
 * つなぎ技にバク転を使う形（テンポ系の後だけ）の重み。
 * そのまま宙返りを続けるほうが多く、バク転は合理的な理由（つなぎ技の要求）が
 * なければ実施しない。
 */
export const TEMPO_CONNECT_WEIGHT = 0.3;

/**
 * 連続の最後にだけ実施する技。**この後に技を続けて実施することはできない**ので、
 * 入りの技にもつなぎ技にも使わない。
 *  - とび前転・きりもみ：首から背中にかけて着地する
 *  - きりもみ転回：理屈のうえでは続けられるが、実際に続けた選手はいない
 *  - 側宙：連続の最後としてしか実施されない
 */
export const CHAIN_END_SKILLS: string[] = ["a_frontroll", "b_kirimomi", "c_kirimomiten", "b_sidesalto"];
export const endsChain = (id: string): boolean => CHAIN_END_SKILLS.includes(id);

/** 系統ごとの入りの技（空＝助走から直接入る） */
export const TUMBLING_ENTRIES: Record<string, string[][]> = {
  // バク転は合理的な理由が無ければ実施しない。入りに足しても難度も要求も変わらない
  // （つなぎ技として数えるのは宙返り−A難度−宙返りの並びだけ）ので、入りには使わない
  [CATEGORY.BACKWARD]: [[ROUNDOFF_SKILL_ID]],
  // とび前転は首から背中にかけて着地するので、入りの技には使えない
  [CATEGORY.FORWARD]: [[], ["a_handspring"]],
  [CATEGORY.SIDE]: [[], ["a_cartwheel"]],
};

/**
 * つなぎ技（宙返りの間に挟むA難度技）と、そのあとに実施する系統。
 * バク転はテンポの後だけ（`connectOptionsAfter`）。
 */
export const TUMBLING_CONNECTS: { id: string; next: string }[] = [
  { id: ROUNDOFF_SKILL_ID, next: CATEGORY.BACKWARD },
  { id: "a_flicflac", next: CATEGORY.BACKWARD },
  { id: "a_handspring", next: CATEGORY.FORWARD },
  // 側転は徒手扱いなので、宙返りの間に挟んでもつなぎ技にはならない
];

const difficultyValue = (id: string, junior: boolean): number => {
  const d = skillDifficulty(id, junior);
  return d ? DIFF_VALUE[d] : 0;
};

/** 連続に使う宙返り（きりもみ系は宙返りの連続の中でだけ宙返りになるので使わない） */
function saltoList(junior: boolean, prevId?: string): { id: string; category: string }[] {
  return skillOptions(junior, skillFlowAfter(prevId))
    .filter((s) => s.isSalto && !s.saltoOnlyInChain)
    .map((s) => ({ id: s.id, category: s.category }));
}

/** 連続の1本目に実施できる宙返り */
export function firstSaltoOptions(junior = false): string[] {
  return saltoList(junior).map((s) => s.id);
}

/**
 * その宙返りに続けて実施できる宙返り。
 *  - 直前が後ろ向きに降りる技なら後方系、前向きに降りる技なら前方系・側方系
 *  - 難度は直前以下（テンポの後だけ制限なし）
 *  - テンポ以外の後方系のあとは続けない（後方系の連続は実際には少ない）
 */
export function nextSaltoOptions(prevId: string, junior = false): string[] {
  // 首から背中にかけて着地する技（とび前転・きりもみ）の後には続けられない
  if (endsChain(prevId)) return [];
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId)).map((s) => s.id));
  // 後方伸身宙返り（ひねりを含む）の後は 前宙・きりもみ・きりもみ転回
  if (isBackLayoutSalto(prevId))
    return AFTER_BACK_LAYOUT_SALTOS.map((x) => x.id).filter((id) => offered.has(id));
  const backward = leadsBackward(prevId);
  // 後方系を続けて実施することは少ない（テンポは例外）。
  // 前方の半ひねりのように**前方系から後ろ向きに降りた**後に後方系へ入るのは普通に実施する
  // （例：ロンダート→後方1回半ひねり→前宙半ひねり→ダイビング前宙）。
  if (backward && !isTempoSalto(prevId) && isBackwardSalto(prevId)) return [];
  const ceiling = isTempoSalto(prevId) ? MAX_DIFF : difficultyValue(prevId, junior);
  return saltoList(junior, prevId)
    .filter((s) => (backward ? isBackwardSalto(s.id) : !isBackwardSalto(s.id)))
    .filter((s) => difficultyValue(s.id, junior) <= ceiling)
    .map((s) => s.id);
}

/**
 * その宙返りのあとに挟めるつなぎ技。
 *  - 前向きに降りた後：ロンダート・側転・ハンドスプリング・とび前転
 *  - テンポの後：バク転
 *  - それ以外（後ろ向きに降りる宙返りの後）は無し
 */
export function connectOptionsAfter(prevId: string, junior = false): string[] {
  if (endsChain(prevId)) return [];
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId)).map((s) => s.id));
  if (isTempoSalto(prevId)) return ["a_flicflac"].filter((id) => offered.has(id));
  if (leadsBackward(prevId)) return [];
  return TUMBLING_CONNECTS.map((c) => c.id).filter((id) => offered.has(id) && id !== "a_flicflac");
}

/** つなぎ技のあとに実施できる宙返り（つなぎで勢いを作り直すので難度の制限はしない） */
export function saltoOptionsAfterConnect(connectId: string, junior = false): string[] {
  const next = TUMBLING_CONNECTS.find((c) => c.id === connectId)?.next;
  return saltoList(junior, connectId)
    .filter((s) => (next === CATEGORY.SIDE ? s.category !== CATEGORY.BACKWARD : s.category === next))
    .map((s) => s.id);
}

/** その形で取り得る宙返りの本数 */
export function saltoCountRange(pattern: AutoTumblingPattern): number[] {
  const range: number[] = [];
  for (let n = pattern.saltos.min; n <= pattern.saltos.max; n++) range.push(n);
  return range;
}

/** 1本ぶんの自動生成の内容 */
export interface AutoTumblingSpec {
  pattern: AutoTumblingPattern;
  /** 実施する宙返りの本数 */
  saltoCount: number;
  /** 入りの技 */
  entry: string[];
  /** 宙返りの並び（`saltoCount` 本ぶんを前から使う） */
  saltoIds: string[];
  /** つなぎ技のid（`pattern.connect` のときだけ。1本目の後に入る） */
  connectId: string;
  /** 後ろ向きで終わる後方宙返りで終わってよい候補か（`backwardEndChance` の抽選結果） */
  allowBackwardEnd?: boolean;
  /**
   * 投げタンのキャッチのあとに続ける投げ受けの投げ方（連続投げの2回目）。
   * 未指定なら続けない。
   */
  secondThrow?: AutoThrowStyle;
}

const skillItem = (skillId: string, isThrow = false): Item => ({
  kind: "skill",
  skillId,
  hasApparatus: true,
  isThrow,
});

/** 自動生成の内容からシリーズを組み立てる */
export function buildAutoTumblingSeries(spec: AutoTumblingSpec): Series {
  const { pattern } = spec;
  const items: Item[] = [];
  // 技の最中に投げる形では、先頭に投げを置かず最後の宙返りに投げを付ける
  if (pattern.throwCatch && !pattern.throwInSkill) items.push({ kind: "throw" });
  spec.entry.forEach((id) => items.push(skillItem(id)));
  const saltos = spec.saltoIds.slice(0, spec.saltoCount);
  saltos.forEach((id, i) => {
    if (pattern.connect && i === 1 && spec.connectId) items.push(skillItem(spec.connectId));
    // 入力画面と同じで、そのままでは後方系に入れない位置ではロンダートを補う
    const next = skillItem(id, pattern.throwInSkill && i === saltos.length - 1);
    if (needsRoundoffBefore([...items, next], items.length)) items.push(skillItem(ROUNDOFF_SKILL_ID));
    items.push(next);
  });
  // 投げ受けの着地は前転でつなぐ（側宙の後は前転を実施しないので、そのまま受ける）
  if (pattern.rollFinish && !noRollAfter(saltos[saltos.length - 1]))
    items.push({ kind: "motion", motionId: THROW_ROLL_MOTION, count: 1 });
  if (pattern.throwCatch) items.push({ kind: "catch" });
  // 投げタンのキャッチのあとに連続投げを続ける形
  if (pattern.throwCatch && spec.secondThrow) {
    const style = spec.secondThrow;
    items.push({
      kind: "throw",
      ...(style.reqTypes ? { reqTypes: [...style.reqTypes] } : {}),
      ...(style.throwTypes ? { throwTypes: [...style.throwTypes] } : {}),
    });
    items.push({ kind: "catch", ...(style.two ? { catchTwo: true } : {}) });
  }
  return { executionDeduction: 0, items };
}

/**
 * 入力画面の制約に反する並びを挙げる（空なら入力画面でもそのまま入力できる）。
 * 判定は入力画面のプルダウンと同じ関数で行う（系統の絞り込みが変わっても追随する）。
 *  - その位置の選択肢に出る技か（`skillOptions(junior, skillFlowAfter(prev))`。
 *    ロンダート・バク転の直後は後方系だけ、ジュニアは2回宙返り系なし）
 *  - 後方系はロンダートを補わずに実施できる位置にあること（`needsRoundoffBefore`）
 */
export function tumblingFlowErrors(series: Series, junior = false): string[] {
  const errors: string[] = [];
  series.items.forEach((item, i) => {
    if (item.kind !== "skill" || !item.skillId) return;
    const name = skillDef(item.skillId)?.name ?? item.skillId;
    if (needsRoundoffBefore(series.items, i)) errors.push(`${i + 1}番目の${name}：手前にロンダートが必要`);
    const prev = prevSkillId(series.items, i);
    if (!skillOptions(junior, skillFlowAfter(prev)).some((s) => s.id === item.skillId)) {
      const prevName = prev ? skillDef(prev)?.name ?? prev : "先頭";
      errors.push(`${i + 1}番目の${name}：${prevName}の位置では選べない技`);
    }
  });
  return errors;
}

/** 表示名。中身はシリーズの内容で分かるので、種類だけを出す。 */
export const autoTumblingName = (spec: AutoTumblingSpec): string =>
  spec.pattern.throwCatch ? "自動生成の投げタン" : "自動生成のタンブリング";

function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 候補をできる限り被らせずに配る（ひと回りしたら並べ直す） */
function cycler<T>(list: T[], rand: () => number): () => T {
  let rest: T[] = [];
  return () => {
    if (rest.length === 0) rest = shuffled(list, rand);
    return rest.pop() as T;
  };
}

/**
 * 同じ技の繰り返しは避けて1つ選ぶ（他に無ければ繰り返しも許す）。
 * `weights` を渡すと実際の演技での多さに寄せて選ぶ（表に無い技は1）。
 */
function pickDifferent(
  options: string[],
  used: string[],
  rand: () => number,
  weights: Record<string, number> = {},
): string | null {
  if (options.length === 0) return null;
  const fresh = options.filter((id) => !used.includes(id));
  const list = fresh.length > 0 ? fresh : options;
  const weightOf = (id: string) => weights[id] ?? 1;
  let left = rand() * list.reduce((n, id) => n + weightOf(id), 0);
  for (const id of list) {
    left -= weightOf(id);
    if (left < 0) return id;
  }
  return list[list.length - 1];
}

export interface AutoTumblingOptions {
  junior?: boolean;
  /**
   * 組む手具。単発で高難度な技の出やすさが手具で変わる
   * （`APPARATUS_HIGH_DIFFICULTY_WEIGHT`：リングは重く持ったままひねりにくい）。
   */
  apparatus?: ApparatusKey;
  /**
   * 基本的な構成の選手か（低いDスコアを狙う構成）。
   * Dスコアの低い選手は、ルールの要求を満たしきれない単純なタンブリングを実施する：
   * ロンダート→宙返り1本で終わり／三宙なし（2本まで）／つなぎなし／D難度なし。
   * ただの後方宙返りのような基本技も普通に実施するので、稀な技の重み付けもしない。
   */
  basicLevel?: boolean;
  /**
   * 狙うDスコアの上限（`maxScore`）。後ろ向きで終わる後方宙返りで終わる確率に使う
   * （`backwardEndChance`）。未指定＝上限なしは難度を狙いきる構成として扱う。
   */
  targetScore?: number | null;
  /**
   * 使ってよい転回技のid。登録テンプレートに出てくる技を渡すと、その選手が
   * 実際に実施している技だけで組み立てる（技そのものではなく**組み合わせ**を自動化する）。
   * 未指定・空なら技の一覧すべてを使う。
   */
  skillIds?: string[];
  /** 乱数（テスト用に差し替え可能） */
  random?: () => number;
  /** 作る候補の数の上限（既定＝形 × 宙返りの組み合わせ） */
  limit?: number;
}

/** 1つの形につき作る候補の数（宙返りの種類を変えた別案） */
export const AUTO_TUMBLING_VARIANTS = 5;

/** 基本的な構成の選手が実施する技の難度の上限（D難度なし） */
export const BASIC_LEVEL_MAX_DIFF = DIFF_VALUE.C;
/** 基本的な構成の選手の連続宙返りの本数（三宙なし・2回で終わり） */
export const BASIC_LEVEL_MAX_SALTOS = 2;

// ---- 同じ難度に到達する組み方の優先度（実際の演技での多さ） ----

/**
 * タンブリングで同じ難度に到達する組み方の並び（前が実施が多い。同じ配列内は同順位）。
 * 難度点は同じなので、生成の評価では順位ぶんだけ僅かに差を付ける
 * （`SHAPE_PRIORITY_WEIGHT`。点数は犠牲にしない）。
 *  - E難度：C→B→B ＞ D→B ＝ C→C ＞ C→C→B ＞ B→B→B→B ＞ その他 ＞ 単発E
 *  - D難度：C→B ＝ B→B→B ＞ その他 ＞ 単発D
 */
export const TUMBLING_SHAPE_ORDER: Partial<Record<Difficulty, Difficulty[][][]>> = {
  E: [[["C", "B", "B"]], [["D", "B"], ["C", "C"]], [["C", "C", "B"]], [["B", "B", "B", "B"]]],
  D: [[["C", "B"], ["B", "B", "B"]]],
};

/** タンブリングの組み方の内容（難度の並びと、組み方の見分けに使う情報） */
export interface TumblingShape {
  /** A難度以外（宙返り）の難度の並び */
  seq: Difficulty[];
  /** 連続の最後の宙返りの最中に投げたか（false＝投げてから実施する／投げなし） */
  throwInSkill: boolean;
  /** つなぎ技（宙返りの間のA難度）を挟んだか */
  hasConnect: boolean;
  /** 最後の宙返りが側宙・転宙か */
  finishSide: boolean;
  /** 受けの直前を前転でつないだか */
  rollFinish: boolean;
}

/** シリーズの組み方を読み取る（宙返りが無ければ null） */
export function readTumblingShape(series: Series, junior = false): TumblingShape | null {
  const seq: Difficulty[] = [];
  let throwInSkill = false;
  let hasConnect = false;
  let finishSide = false;
  let rollFinish = false;
  series.items.forEach((item) => {
    if (item.kind === "skill" && item.skillId) {
      const d = skillDifficulty(item.skillId, junior);
      if (item.isThrow) throwInSkill = true;
      if (d === "A") {
        // 宙返りの間に入ったA難度＝つなぎ技（入りの技は宙返りの前なので数えない）
        if (seq.length > 0 && skillDef(item.skillId)?.isConnectA) hasConnect = true;
        return;
      }
      if (d) seq.push(d);
      finishSide = THROW_FINISH_SALTOS.includes(item.skillId);
      rollFinish = false;
      return;
    }
    if (item.kind === "motion" && item.motionId === THROW_ROLL_MOTION && seq.length > 0) rollFinish = true;
  });
  return seq.length > 0 ? { seq, throwInSkill, hasConnect, finishSide, rollFinish } : null;
}

/** 投げのないタンブリングの組み方の順位（0が最上位） */
export function tumblingShapeRank(shape: TumblingShape, unitDiff: Difficulty): number {
  const ranks = TUMBLING_SHAPE_ORDER[unitDiff];
  if (!ranks) return 0;
  const key = shape.seq.join(",");
  const i = ranks.findIndex((group) => group.some((sh) => sh.join(",") === key));
  if (i >= 0) return i;
  // 単発（その難度の技1本）が最後、表に無い組み方はその1つ前（＝その他）
  return shape.seq.length === 1 ? ranks.length + 1 : ranks.length;
}

/**
 * 投げタンの組み方の順位（0が最上位）。実際の演技での多さは
 *  - E難度：C＋側宙 ＝ D＋前転 ＞ つなぎを挟んで最後のBで投げ ＞ 連続の最後のBで投げ
 *    ＞ C＋側宙以外の宙返り ＞ その他 ＞ 単発E
 *  - D難度：前方のC＋前転 ＝ 前方のB＋側宙（転宙） ＞ C難度のシリーズ中に投げ ＞ その他
 */
export function throwTumblingShapeRank(shape: TumblingShape, unitDiff: Difficulty): number {
  const { seq, throwInSkill, hasConnect, finishSide, rollFinish } = shape;
  const single = seq.length === 1 && seq[0] === unitDiff;
  if (unitDiff === "E") {
    if (single) return 5;
    if (!throwInSkill) {
      if (seq.length === 2 && seq[0] === "C" && finishSide) return 0;
      if (seq.length === 1 && seq[0] === "D" && rollFinish) return 0;
      if (seq.length === 2 && seq[0] === "C") return 3;
      return 4;
    }
    return hasConnect ? 1 : 2;
  }
  if (unitDiff === "D") {
    if (!throwInSkill) {
      if (seq.length === 1 && seq[0] === "C" && rollFinish) return 0;
      if (seq.length === 2 && seq[0] === "B" && finishSide) return 0;
    }
    if (throwInSkill && seq.includes("C")) return 1;
    return 2;
  }
  return 0;
}

/** 前方系の宙返り（投げタンの1本目）か */
const isForwardSalto = (id: string): boolean => skillDef(id)?.category === CATEGORY.FORWARD;

/**
 * タンブリングの候補を作る。形ごとに宙返りの種類・入りの技・本数を
 * できる限り被らないように配る（`cycler`）。
 */
export function autoTumblingSpecs(opts: AutoTumblingOptions = {}): AutoTumblingSpec[] {
  const rand = opts.random ?? Math.random;
  const junior = !!opts.junior;
  const basicLevel = !!opts.basicLevel;
  const apparatus = opts.apparatus;
  // 使ってよい技の範囲（指定が無ければ全部）。基本的な構成ではD難度以上を使わない
  const allowed = opts.skillIds && opts.skillIds.length > 0 ? new Set(opts.skillIds) : null;
  const usable = (ids: string[]) =>
    ids.filter(
      (id) =>
        (!allowed || allowed.has(id)) &&
        (!basicLevel || difficultyValue(id, junior) <= BASIC_LEVEL_MAX_DIFF) &&
        // 個人で2回宙返り系を実施することはほぼない。実際に実施している（テンプレートに
        // 出てくる）ときだけ使い、技の一覧からは組み立てない
        (!skillDef(id)?.isDoubleSalto || !!allowed?.has(id)),
    );

  const specs: AutoTumblingSpec[] = [];
  // 連続投げの2回目の投げ方は、できる限り被らないように配る
  const secondThrowCyclers = new Map<string, () => AutoThrowStyle>();
  const nextSecondThrow = (app: ApparatusKey): AutoThrowStyle => {
    let next = secondThrowCyclers.get(app);
    if (!next) {
      next = cycler(secondThrowStyles(app), rand);
      secondThrowCyclers.set(app, next);
    }
    return next();
  };
  AUTO_TUMBLING_PATTERNS.forEach((rawPattern) => {
    // 基本的な構成ではつなぎ技を実施せず、連続も2本まで
    if (basicLevel && rawPattern.connect) return;
    const pattern =
      basicLevel && rawPattern.saltos.max > BASIC_LEVEL_MAX_SALTOS
        ? {
            ...rawPattern,
            saltos: {
              min: Math.min(rawPattern.saltos.min, BASIC_LEVEL_MAX_SALTOS),
              max: BASIC_LEVEL_MAX_SALTOS,
            },
          }
        : rawPattern;
    // 投げタンの1本目は前方系（手具の滞空時間の都合で後方系は実施しない）
    const firsts = usable(firstSaltoOptions(junior))
      // 投げてから実施する投げ受けの1本目は前方系（手具の滞空時間の都合で後方系は実施しない）。
      // 連続の最後に投げる形は投げる前が普通のタンブリングなので、この制限は無い
      .filter((id) => !pattern.throwCatch || pattern.throwInSkill || isForwardSalto(id))
      // つなぎの形は、つなぎ技を挟める技（前向きに降りる技・テンポ）だけを1本目にする
      .filter((id) => !pattern.connect || usable(connectOptionsAfter(id, junior)).length > 0);
    if (firsts.length === 0) return;
    const nextCount = cycler(saltoCountRange(pattern), rand);
    const weights = baseSkillWeights(junior, apparatus);
    /** 1本目：できるだけ別の技を使いつつ、高難度の単発・実施が少ない技は選ばれにくくする */
    const firstsUsed: string[] = [];
    // つなぎの形でテンポ系を1本目にすると、つなぎ技はバク転しかない（`connectOptionsAfter`）。
    // バク転を挟むより宙返りを続けるほうが多いので、その形は選ばれにくくする
    const firstWeights = pattern.connect
      ? {
          ...weights,
          ...Object.fromEntries(
            TEMPO_SKILLS.map((id) => [id, (weights[id] ?? 1) * TEMPO_CONNECT_WEIGHT]),
          ),
        }
      : weights;
    const nextFirst = () => {
      const id = pickDifferent(firsts, firstsUsed, rand, firstWeights);
      if (id) firstsUsed.push(id);
      return id;
    };
    /** その技に続けて実施できる宙返り（投げ受けは側宙・転宙だけ） */
    const continuations = (prevId: string) =>
      usable(nextSaltoOptions(prevId, junior)).filter(
        (id) => !pattern.throwCatch || pattern.throwInSkill || THROW_FINISH_SALTOS.includes(id),
      );
    for (let v = 0; v < AUTO_TUMBLING_VARIANTS; v++) {
      const count = nextCount();
      let saltoIds: string[] = [];
      let connectId = "";
      // 目標の本数まで続く1本目が引けるまで何回か引き直す（後ろ向きに降りる技は連続しない）
      for (let attempt = 0; attempt < firsts.length && saltoIds.length < count; attempt++) {
        const first = nextFirst();
        if (!first) break;
        const ids = [first];
        let cid = "";
        // つなぎ技は1本目の後
        if (pattern.connect) {
          // つなぎ技も実施の多さで選ぶ（ロンダート＞バク転＞ハンドスプリング）
          cid = pickDifferent(usable(connectOptionsAfter(first, junior)), [], rand, weights) ?? "";
          if (!cid) continue;
          const afterOptions = usable(saltoOptionsAfterConnect(cid, junior));
          const finishWeights = connectFinishWeights(junior || basicLevel, junior, apparatus);
          // つなぎの後に難度が上がる組み方は少ない（C→B→B ＞ B→C→B）
          const firstValue = difficultyValue(first, junior);
          const afterWeights = Object.fromEntries(
            afterOptions.map((id) => [
              id,
              (finishWeights[id] ?? 1) *
                (difficultyValue(id, junior) > firstValue ? CONNECT_RISE_WEIGHT : 1),
            ]),
          );
          const after = pickDifferent(afterOptions, ids, rand, afterWeights);
          if (!after) continue;
          ids.push(after);
        }
        // 残りは「向きと難度」のルールで続ける
        while (ids.length < pattern.saltos.max) {
          const prev = ids[ids.length - 1];
          const base = saltoWeights(prev, junior, apparatus);
          // 側宙の実施中に投げる構成は稀（連続の最後の宙返りで投げる形だけ側宙を下げる）
          const weightsForNext = pattern.throwInSkill
            ? { ...base, b_sidesalto: (base["b_sidesalto"] ?? 1) * THROW_IN_SIDE_SALTO_WEIGHT }
            : base;
          const next = pickDifferent(continuations(prev), ids, rand, weightsForNext);
          if (!next) break;
          ids.push(next);
        }
        if (ids.length > saltoIds.length) {
          saltoIds = ids;
          connectId = cid;
        }
      }
      if (saltoIds.length < pattern.saltos.min) continue;
      // 続かなかったぶんは本数を減らす
      let saltoCount = Math.max(pattern.saltos.min, Math.min(count, saltoIds.length));
      // 後ろ向きで終わる後方宙返りで終わるかは、狙うDスコアで決まる確率で抽選する
      const allowBackwardEnd = rand() < backwardEndChance(opts.targetScore);
      while (
        saltoCount > pattern.saltos.min &&
        !canEndChain(saltoIds[saltoCount - 1], allowBackwardEnd)
      )
        saltoCount -= 1;
      if (!canEndChain(saltoIds[saltoCount - 1], allowBackwardEnd)) continue;
      // 投げタンのキャッチのあとに連続投げを続けるか（投げてから跳ぶ形のほうが多い）
      const secondThrow =
        pattern.throwCatch && apparatus && rand() < pairAfterChance(pattern)
          ? nextSecondThrow(apparatus)
          : undefined;
      specs.push({
        pattern,
        saltoCount,
        entry: [],
        saltoIds,
        connectId,
        allowBackwardEnd,
        ...(secondThrow ? { secondThrow } : {}),
      });
    }
  });

  // 入りの技は1本目の系統に合わせて配る（投げてから実施する投げタンには付けない）。
  // 入りの技も実施の多さで選ぶ（ロンダート＞バク転＞ハンドスプリング）
  const entryUsed = new Map<string, string[]>();
  const entryWeight = (entry: string[]) =>
    entry.reduce((w, id) => w * (SKILL_PICK_WEIGHT[id] ?? 1), 1);
  specs.forEach((spec) => {
    if (spec.pattern.throwCatch && !spec.pattern.throwInSkill) return;
    const category = skillDef(spec.saltoIds[0])?.category ?? CATEGORY.FORWARD;
    const entries = (TUMBLING_ENTRIES[category] ?? [[]]).filter(
      (entry) => entry.length === 0 || usable(entry).length === entry.length,
    );
    const list = entries.length > 0 ? entries : [[]];
    const keys = list.map((_, i) => String(i));
    const weights = Object.fromEntries(list.map((entry, i) => [String(i), entryWeight(entry)]));
    const used = entryUsed.get(category) ?? [];
    const key = pickDifferent(keys, used, rand, weights) ?? keys[0];
    used.push(key);
    entryUsed.set(category, used);
    spec.entry = list[Number(key)];
  });

  const limit = Math.max(0, opts.limit ?? specs.length);
  return shuffled(specs, rand).slice(0, limit);
}

/**
 * 構成のなかで実際に使っている転回技のid。
 * 自動生成のタンブリングをこの範囲に絞ると、その選手が実施できる技だけで組める。
 * 徒手として入れた転回技（側転・きりもみ等）も実施している技なので含める。
 */
export function usedSkillIds(list: Series[]): string[] {
  const ids = new Set<string>();
  list.forEach((ser) =>
    ser.items.forEach((item) => {
      if (item.kind === "skill" && item.skillId) ids.add(item.skillId);
      if (item.kind === "motion" && skillDef(item.motionId)) ids.add(item.motionId);
    }),
  );
  return [...ids];
}

/**
 * ランダム生成の候補として渡す自動生成のタンブリング。
 * 組み立てた内容（`spec`）を持たせて、生成側が宙返りの本数を調整できるようにする。
 */
export interface AutoTumblingTemplate extends SeriesTemplate {
  auto: true;
  apparatus: ApparatusKey;
  spec: AutoTumblingSpec;
}

const autoTemplate = (
  apparatus: ApparatusKey,
  spec: AutoTumblingSpec,
  id = newTemplateId(),
): AutoTumblingTemplate => ({
  id,
  name: autoTumblingName(spec),
  apparatus,
  updatedAt: 0,
  auto: true,
  spec,
  // 手具が1つの種目では投げている間に手具操作ができないので、その手具に合わせて落とす
  series: stripForApparatus([buildAutoTumblingSeries(spec)], apparatus)[0],
});

/** 自動生成のタンブリングを、ランダム生成の候補（シリーズテンプレート）として返す */
export function autoTumblingTemplates(
  apparatus: ApparatusKey,
  opts: AutoTumblingOptions = {},
): AutoTumblingTemplate[] {
  return autoTumblingSpecs({ apparatus, ...opts }).map((spec) => autoTemplate(apparatus, spec));
}

/** 自動生成のタンブリングの候補か */
export function isAutoTumblingTemplate(t: SeriesTemplate): t is AutoTumblingTemplate {
  return !!t.auto && Array.isArray((t as AutoTumblingTemplate).spec?.saltoIds);
}

/** 宙返りの本数だけを変えた候補。形の範囲外・組み立てた本数より多い・変化なしなら null。 */
export function withSaltoCount(t: AutoTumblingTemplate, saltoCount: number): AutoTumblingTemplate | null {
  if (saltoCount === t.spec.saltoCount) return null;
  if (!saltoCountRange(t.spec.pattern).includes(saltoCount)) return null;
  if (saltoCount > t.spec.saltoIds.length) return null;
  // 連続の終わり方は候補を作ったときの抽選に従う
  if (!canEndChain(t.spec.saltoIds[saltoCount - 1], t.spec.allowBackwardEnd)) return null;
  return autoTemplate(t.apparatus, { ...t.spec, saltoCount }, t.id);
}
