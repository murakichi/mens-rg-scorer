// =====================================================================
// タンブリングの連鎖のルール（何に何が続けられるか／どこで終われるか）
//
// 並べ方は**入力画面と同じ制約**＋**実際の演技での組み方**で決まる：
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
//  - 投げ受け（投げタン）は手具の滞空時間の都合で 前方系→前転／前方系→側宙（転宙）。
//    投げたあとにロンダートを入れる形は作らない
//  - とび前転・きりもみ（首から背中にかけて着地する）・きりもみ転回・側宙は連続の最後だけ。
//    その後に技を続けない（入りの技・つなぎ技にも使わない）
//  - 側転は徒手扱いなので、つなぎ技には使わない（側宙への入りには使う）
//  - ジュニアは2回宙返り系を実施しない（`skillOptions` の選択肢に出ない）。
//    2回宙返りの後に連続・つなぎを続けることもない（後ろ向きに降りるテンポ以外の
//    後方系なので、連続もつなぎも自然に止まる）
//
// ここに置くのは**できる／できない**だけで、選ばれやすさ（重み）と抽選の確率は
// `tumblingWeights.ts`。両方を突き合わせた遷移表は `tumblingTransitions.ts`。
// 組み立てたシリーズは `tumblingFlowErrors` で入力画面の制約を検算できる。
// =====================================================================

import {
  CATEGORY,
  DIFF_VALUE,
  DIVING_SKILL_ID,
  maxDiff,
  ROUNDOFF_SKILL_ID,
  isBackwardSalto,
  leadsBackward,
  skillDef,
  skillDifficulty,
  skillFlowAfter,
  skillOptions,
} from "./constants";
import { needsRoundoffBefore, prevSkillId } from "./analysis";
import { NO_VIEW_TAG } from "./autoThrows";
import { DEFAULT_CONNECT_AT, type AutoTumblingPattern } from "./tumblingPatterns";
import type { FutureLevel, Series } from "./types";

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

/** 側宙。連続の最後にしか実施されず、その後に前転もしない */
export const SIDE_SALTO_ID = "b_sidesalto";

/** 転宙 */
export const TENCHU_SKILL_ID = "b_tenchu";

/**
 * その技のあとに実施できるのが**側宙だけ**の技。
 * 転宙は、そのまま終わるか側宙に続けるかのどちらかしか実施されない：
 * ほかの宙返りを続けることも、つなぎ技を挟むことも、前転でつなぐこともない
 * （前転は `NO_ROLL_AFTER_SKILLS` が落とす）。
 */
export const ONLY_SIDE_SALTO_AFTER: string[] = [TENCHU_SKILL_ID];
export const onlySideSaltoAfter = (id: string): boolean => ONLY_SIDE_SALTO_AFTER.includes(id);

/**
 * この技のあとに前転でつながない技。物理的に破綻はしていなくても実際には無い並び。
 *  - 側宙の後の前転
 *  - 転宙の後の前転（転宙はそのまま終わるか側宙に続けるかだけ）
 *  - 後ろ向きで終わる後方宙返りの後の前転
 *  - 連続を終える技（`CHAIN_END_SKILLS`）の後の前転：とび前転・きりもみは首から背中にかけて、
 *    ダイビングは頭から着地するので、前転でつなぐことはできない
 * 投げ受けはそのままキャッチする。
 */
export const NO_ROLL_AFTER_SKILLS: string[] = [SIDE_SALTO_ID, TENCHU_SKILL_ID];

export const noRollAfter = (id: string): boolean =>
  NO_ROLL_AFTER_SKILLS.includes(id) || endsFacingBackward(id) || endsChain(id);

/**
 * シリーズの最後に実施することが**稀**な技。上級者は後方宙返り半ひねりで終わらず、
 * 大抵その後に前宙か側宙を実施する。Dスコアの低い選手（`basicLevel`）は実施する。
 */
export const RARE_CHAIN_END_SKILLS: string[] = ["b_backhalf"];

/** つなぎ技のあとに伸身を1本だけ実施して終わる形か（`saltoIds` の n 本ぶんで判定） */
export const layoutOnlyAfterConnect = (
  pattern: AutoTumblingPattern,
  saltoIds: string[],
  n: number,
  connectAt = DEFAULT_CONNECT_AT,
): boolean =>
  !!pattern.connect && n === connectAt + 1 && isBackLayoutSalto(saltoIds[connectAt]);

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

/** 前方系の宙返り（投げタンの1本目）か */
export const isForwardSalto = (id: string): boolean => skillDef(id)?.category === CATEGORY.FORWARD;

/**
 * **後ろ向きで終わる宙返り → 前方系の宙返り**の位置で投げる形か。
 * この位置で投げた例は無いので基本作らないが、きりもみで視野外に投げる形だけは
 * 物理的にあり得て見栄えも悪くないので、低い確率で残す
 * （`KIRIMOMI_THROW_SKILL_ID` / `BACK_TO_FORWARD_THROW_CHANCE`）。
 */
export const isBackToForwardThrow = (prevId: string | undefined, skillId: string): boolean =>
  !!prevId && leadsBackward(prevId) && isForwardSalto(skillId);

/** その位置で投げてよい唯一の技（視野外投げで実施する） */
export const KIRIMOMI_THROW_SKILL_ID = "b_kirimomi";

/** 技の最中の投げに付ける技術タグ（後ろ向き→前方系のきりもみは視野外投げ） */
export const throwInSkillTypes = (prevId: string | undefined, skillId: string): string[] | undefined =>
  isBackToForwardThrow(prevId, skillId) ? [NO_VIEW_TAG] : undefined;

/**
 * 投げ受け（投げてから跳ぶ形）で前方系の宙返りに続けて実施する技。
 * 側宙が主で、転宙・きりもみ転回もある（実施の多さは 側宙 ＞ きりもみ転回 ＞ 転宙。
 * 重みは `SKILL_PICK_WEIGHT` / `LIMITED_SKILLS` がそのまま効くので、ここでは並べるだけ）。
 * きりもみは入れない（首から背中にかけて着地するので、そのまま受けに繋げられない）。
 */
export const THROW_FINISH_SALTOS: string[] = [SIDE_SALTO_ID, TENCHU_SKILL_ID, "c_kirimomiten"];

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

/**
 * 後方伸身宙返りの後に**後方系で**続けられる技。
 * 主流は上の前方系だが、後方伸身2回ひねり→抱え込みの1回半ひねり のように
 * 後方系を続ける選手もいる。数は少ないので重みは低くし、連続の原則どおり
 * **難度は直前以下**に限る。続けられるのは**後ろ向きに降りる後方伸身（整数ひねり）の後だけ**で、
 * 半ひねり系（前向きに降りる）から後方系に入るにはロンダートが要る＝つなぎの形になる
 * （`nextSaltoOptions`）。抱え込みの半ひねり系は前向きに降りるので、
 * そのまま前方系に続けて三宙にできる。
 */
export const AFTER_BACK_LAYOUT_BACKWARD_SALTOS: { id: string; weight: number }[] = [
  { id: "c_back15", weight: 0.5 },
  { id: "b_backhalf", weight: 0.5 },
];

/**
 * 直前の技より**難度の高い**技を続けてよい例外。
 * 後方系のあとにそれより難度の高い前方系を実施する機会は少ないが、
 * 後方宙返り半ひねりのあとに前方宙返り1回ひねり（さらにそこから前宙）を実施する選手はいる。
 * 機会は少ないので選ばれやすさも下げる（`DIFFICULTY_RISE_WEIGHT`）。
 */
export const DIFFICULTY_RISE_AFTER: Record<string, string[]> = {
  b_backhalf: ["c_front1full"],
};

/** 後方伸身宙返り系（ひねりを含む）か */
export function isBackLayoutSalto(id: string): boolean {
  const t = skillDef(id)?.twist;
  return t?.base === "back" && t.posture === "layout";
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
 * 連続の最後にだけ実施する技。**この後に技を続けて実施することはできない**ので、
 * 入りの技にもつなぎ技にも使わない。
 *  - とび前転・きりもみ：首から背中にかけて着地する
 *  - きりもみ転回：理屈のうえでは続けられるが、実際に続けた選手はいない
 *  - 側宙：連続の最後としてしか実施されない
 */
export const CHAIN_END_SKILLS: string[] = [
  "a_frontroll",
  "b_kirimomi",
  "c_kirimomiten",
  SIDE_SALTO_ID,
  // ダイビングは頭から着地するので、この後に技を続けることはできない
  DIVING_SKILL_ID,
];

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

export const difficultyValue = (id: string, junior: boolean, future: FutureLevel = null): number => {
  const d = skillDifficulty(id, junior, future);
  return d ? DIFF_VALUE[d] : 0;
};

/**
 * 前方系の宙返りのあとに実施するきりもみ系。前宙→きりもみ転回 は実施される
 * （投げ→前宙→きりもみ転回→キャッチ）。きりもみ系は宙返りの連続の中でだけ宙返りになるので
 * `saltoList` には入っておらず、**難度の上限（連続は難度が下がる）も掛けない**
 * ——きりもみ転回のC難度は「連続が1段上がった」という意味ではないため。
 * 選ばれやすさは `SKILL_PICK_WEIGHT`（きりもみ転回 0.3）がそのまま効くので、
 * 側宙（1）より低く、転宙（`LIMITED_SKILLS` の 0.2）より高い。
 * きりもみは入れない：首から背中にかけて着地するので、そのまま受けには繋げられない
 * （後方伸身のあとだけは連続の技として実施するので `AFTER_BACK_LAYOUT_SALTOS` にある）。
 */
export const AFTER_FORWARD_KIRIMOMI: string[] = ["c_kirimomiten"];

/** 連続に使う宙返り（きりもみ系は宙返りの連続の中でだけ宙返りになるので使わない） */
function saltoList(
  junior: boolean,
  prevId?: string,
  future: FutureLevel = null,
): { id: string; category: string }[] {
  return skillOptions(junior, skillFlowAfter(prevId), future)
    .filter((s) => s.isSalto && !s.saltoOnlyInChain)
    .map((s) => ({ id: s.id, category: s.category }));
}

/** 連続の1本目に実施できる宙返り */
export function firstSaltoOptions(junior = false, future: FutureLevel = null): string[] {
  return saltoList(junior, undefined, future).map((s) => s.id);
}

/**
 * その宙返りに続けて実施できる宙返り。
 *  - 直前が後ろ向きに降りる技なら後方系、前向きに降りる技なら前方系・側方系
 *  - 難度は直前以下（テンポの後だけ制限なし）
 *  - テンポ以外の後方系のあとは続けない（後方系の連続は実際には少ない）
 */
export function nextSaltoOptions(prevId: string, junior = false, future: FutureLevel = null): string[] {
  // 首から背中にかけて着地する技（とび前転・きりもみ）の後には続けられない
  if (endsChain(prevId)) return [];
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId), future).map((s) => s.id));
  // 転宙の後は側宙だけ（それ以外は続けない）
  if (onlySideSaltoAfter(prevId)) return [SIDE_SALTO_ID].filter((id) => offered.has(id));
  // 後方伸身宙返り（ひねりを含む）の後は 前宙・きりもみ・きりもみ転回。
  // 抱え込みの半ひねり系で後方系を続ける選手もいるので、難度が上がらない範囲で残す
  if (isBackLayoutSalto(prevId)) {
    const ceiling = difficultyValue(prevId, junior, future);
    return [
      ...AFTER_BACK_LAYOUT_SALTOS.map((x) => x.id),
      // 後方系をそのまま続けられるのは**後ろ向きに降りる**後方伸身（整数ひねり）の後だけ。
      // 前向きに降りる半ひねり系から後方系に入るにはロンダートが要り、それはつなぎの形になる
      ...(leadsBackward(prevId)
        ? AFTER_BACK_LAYOUT_BACKWARD_SALTOS.map((x) => x.id).filter(
            (id) => difficultyValue(id, junior, future) <= ceiling,
          )
        : []),
    ].filter((id) => offered.has(id));
  }
  const backward = leadsBackward(prevId);
  // 後方系を続けて実施することは少ない（テンポは例外）。
  // 前方の半ひねりのように**前方系から後ろ向きに降りた**後に後方系へ入るのは普通に実施する
  // （例：ロンダート→後方1回半ひねり→前宙半ひねり→ダイビング前宙）。
  if (backward && !isTempoSalto(prevId) && isBackwardSalto(prevId)) return [];
  const ceiling = isTempoSalto(prevId) ? maxDiff(future) : difficultyValue(prevId, junior, future);
  // 難度が上がってよい例外（後方宙返り半ひねり→前方宙返り1回ひねり など）
  const rise = DIFFICULTY_RISE_AFTER[prevId] ?? [];
  const list = saltoList(junior, prevId, future)
    .filter((s) => (backward ? isBackwardSalto(s.id) : !isBackwardSalto(s.id)))
    .filter((s) => difficultyValue(s.id, junior, future) <= ceiling || rise.includes(s.id))
    .map((s) => s.id);
  // きりもみ系は `saltoList` に入っていない（宙返りの連続の中でだけ宙返りになる）ので、
  // 前方系のあとに実施するものだけここで足す
  const kirimomi = backward
    ? []
    : AFTER_FORWARD_KIRIMOMI.filter((id) => offered.has(id) && !list.includes(id));
  return [...list, ...kirimomi];
}

/**
 * その宙返りのあとに挟めるつなぎ技。
 *  - 前向きに降りた後：ロンダート・側転・ハンドスプリング・とび前転
 *  - テンポの後：バク転
 *  - それ以外（後ろ向きに降りる宙返りの後）は無し
 */
export function connectOptionsAfter(prevId: string, junior = false, future: FutureLevel = null): string[] {
  if (endsChain(prevId)) return [];
  // 転宙の後は側宙に続けるか終わるかだけで、つなぎ技は挟まない
  if (onlySideSaltoAfter(prevId)) return [];
  const offered = new Set(skillOptions(junior, skillFlowAfter(prevId), future).map((s) => s.id));
  if (isTempoSalto(prevId)) return ["a_flicflac"].filter((id) => offered.has(id));
  if (leadsBackward(prevId)) return [];
  return TUMBLING_CONNECTS.map((c) => c.id).filter((id) => offered.has(id) && id !== "a_flicflac");
}

/** つなぎ技のあとに実施できる宙返り（つなぎで勢いを作り直すので難度の制限はしない） */
export function saltoOptionsAfterConnect(
  connectId: string,
  junior = false,
  future: FutureLevel = null,
): string[] {
  const next = TUMBLING_CONNECTS.find((c) => c.id === connectId)?.next;
  return saltoList(junior, connectId, future)
    .filter((s) => (next === CATEGORY.SIDE ? s.category !== CATEGORY.BACKWARD : s.category === next))
    .map((s) => s.id);
}

/**
 * **連続を終える技の後に技・徒手動作が続いている**並びを挙げる。
 * とび前転・きりもみは首から背中にかけて、ダイビングは頭から着地し、側宙は連続の最後にしか
 * 実施しない（`CHAIN_END_SKILLS`）ので、その後に技も前転も続けられない
 * （投げ受けのキャッチは続けられるので、キャッチは対象外）。
 * 自動生成は作らないが、手入力・インポート・古い保存データでは起こりうるので、
 * 入力画面でも警告として出す（`SeriesCard`。採点には影響しない）。
 */
export function tumblingChainEndErrors(series: Series): string[] {
  const errors: string[] = [];
  series.items.forEach((item, i) => {
    if (item.kind !== "skill" || !item.skillId || !endsChain(item.skillId)) return;
    const next = series.items[i + 1];
    if (next?.kind !== "skill" && next?.kind !== "motion") return;
    const name = skillDef(item.skillId)?.name ?? item.skillId;
    errors.push(`${i + 1}番目の${name}：この技の後に技・徒手動作は続けられない`);
  });
  return errors;
}

/**
 * 入力画面の制約に反する並びを挙げる（空なら入力画面でもそのまま入力できる）。
 * 判定は入力画面のプルダウンと同じ関数で行う（系統の絞り込みが変わっても追随する）。
 *  - その位置の選択肢に出る技か（`skillOptions(junior, skillFlowAfter(prev))`。
 *    ロンダート・バク転の直後は後方系だけ、ジュニアは2回宙返り系なし）
 *  - 後方系はロンダートを補わずに実施できる位置にあること（`needsRoundoffBefore`）
 *  - 連続を終える技の後に何も続けていないこと（`tumblingChainEndErrors`）
 */
export function tumblingFlowErrors(series: Series, junior = false, future: FutureLevel = null): string[] {
  const errors: string[] = [...tumblingChainEndErrors(series)];
  series.items.forEach((item, i) => {
    if (item.kind !== "skill" || !item.skillId) return;
    const name = skillDef(item.skillId)?.name ?? item.skillId;
    if (needsRoundoffBefore(series.items, i)) errors.push(`${i + 1}番目の${name}：手前にロンダートが必要`);
    const prev = prevSkillId(series.items, i);
    if (!skillOptions(junior, skillFlowAfter(prev), future).some((s) => s.id === item.skillId)) {
      const prevName = prev ? skillDef(prev)?.name ?? prev : "先頭";
      errors.push(`${i + 1}番目の${name}：${prevName}の位置では選べない技`);
    }
  });
  return errors;
}
