// =====================================================================
// タンブリングの選ばれやすさ（重み）と抽選の確率
//
// 「できる／できない」は `tumblingChain.ts`。ここに置くのは**どれくらいの頻度で
// 実施されるか**だけで、実際の演技での多さをそのまま数にしたもの：
//  - 単発で高難度な技ほど実施回数も頻度も少ない（`SALTO_DIFFICULTY_WEIGHT`）
//  - 同じ難度でも技によって実施の多さが違う（`SKILL_PICK_WEIGHT`）
//  - ハンドスプリング・転宙は実施が少なく、演技内で1回まで（`LIMITED_SKILLS`）
//  - Dスコアの低い選手と上級者では終わり方・入り方が変わる（狙うDスコアで減衰させる）
// 値はすべて**実測して決めた**もので、根拠は `app-scoring-spec.md` と work-logs に残す。
// =====================================================================

import {
  ANY_SKILL_FLOW,
  JUNIOR_SKILL_DIFFICULTY,
  CATEGORY,
  DIFF_VALUE,
  maxDiff,
  skillDef,
  skillDifficulty,
  skillOptions,
} from "./constants";
import {
  AFTER_BACK_LAYOUT_BACKWARD_SALTOS,
  AFTER_BACK_LAYOUT_SALTOS,
  CHAIN_END_SKILLS,
  DIFFICULTY_RISE_AFTER,
  TEMPO_SKILL_ID,
  SIDE_SALTO_ID,
  TEMPO_TWIST_SKILL_ID,
  TENCHU_SKILL_ID,
  endsFacingBackward,
  isBackLayoutSalto,
  noRollAfter,
} from "./tumblingChain";
import type { AutoTumblingPattern } from "./tumblingPatterns";
import type { ApparatusKey, Difficulty, FutureLevel } from "./types";

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
 * 投げタンの投げを**二つ投げ**にする確率（クラブ・リングだけ）。
 * 立って両方の手具を投げてからタンブリングし、2つ同時キャッチで受ける形。
 * 必須投げ（二つ投げ）と転回系の投げ受けを1シリーズで両方満たせる。
 * 技の最中に投げる形（`throwInSkill`）では使わない：宙返りの最中に両方を投げるのは実施されないし、
 * 必須投げは投げアイテムにしか付かない。
 */
export const TWO_THROW_IN_TUMBLING_CHANCE = 0.3;

/**
 * 投げタンの着地を前転でつないだあと、**手具を使ったキャッチ（押さえつけ）**で受ける確率。
 * クラブ・リングは転がり・前転のあと押さえつけて受けるのが定番
 * （スティック・ロープは手具が1つなので `stripForApparatus` が落とす）。
 */
export const ROLL_FINISH_PRESS_CATCH_CHANCE = 0.5;

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

/** 稀な終わり方をしてよい確率 */
export const RARE_CHAIN_END_CHANCE = 0.1;

/**
 * **つなぎ技のあとに後方伸身宙返り系を1本だけ**実施して終わる形
 * （2回半ひねり→ロンダート→後方伸身1回半ひねり など）は、上級者ではあまり実施されない。
 * あり得ない並びではないので `LAYOUT_AFTER_CONNECT_CHANCE` の確率では許し、
 * それ以外は**もう1本（前方系）続ける**（後方伸身の後は `AFTER_BACK_LAYOUT_SALTOS`）。
 * Dスコアの低い選手（`basicLevel`）はそのまま終わってよい。
 */
export const LAYOUT_AFTER_CONNECT_CHANCE = 0.1;

export const CONNECT_AT_SECOND_CHANCE = 0.4;

/**
 * **前方系の宙返りで終わったあとは、大抵そのまま前転をする**
 * （後方系→前方系の連続でも同じ）。前宙だけは前転のありなし両方あるので半々
 * （`ROLL_AFTER_FRONT_CHANCE`）、それ以外の前方系（前方1回ひねり・伸身前宙など）は
 * ほぼ必ず前転をする（`ROLL_AFTER_FORWARD_CHANCE`）。
 * 首から背中に着地する技（とび前転・きりもみ系＝`CHAIN_END_SKILLS`）と
 * 側宙・後ろ向きで終わる技のあとは前転をしない（`noRollAfter`）。
 */
export const FRONT_SALTO_ID = "b_front";

export const ROLL_AFTER_FORWARD_CHANCE = 0.9;

export const ROLL_AFTER_FRONT_CHANCE = 0.5;

/**
 * **前向きで終わる後方宙返り**（半ひねり系・ダイビング前宙）のあとは、前転・そのまま終了・前宙
 * どれも普通に実施される（つなぎの後半に抱え込みを実施したときもこれ）。
 */
export const ROLL_AFTER_BACK_FORWARD_LANDING_CHANCE = 0.5;

/**
 * **切り返し**（後ろ向きで終わる宙返りから前方系を実施する並び）のあとは前転をしないことが多い。
 */
export const ROLL_AFTER_SWITCH_CHANCE = 0.2;

export function rollAfterChance(id: string, prevId?: string): number {
  const def = skillDef(id);
  if (!def?.isSalto) return 0;
  // 首から背中に着地する技（とび前転・きりもみ系）・側宙・後ろ向きで終わる技のあとは何もしない
  if (noRollAfter(id) || CHAIN_END_SKILLS.includes(id)) return 0;
  // 前向きで終わる後方宙返り（`noRollAfter` を通っているので半ひねり系・ダイビング前宙だけ）
  if (def.category === CATEGORY.BACKWARD) return ROLL_AFTER_BACK_FORWARD_LANDING_CHANCE;
  if (def.category !== CATEGORY.FORWARD) return 0;
  // 切り返し（後ろ向きで終わる宙返り→前方系）のあとは前転をしないことが多い
  if (prevId && endsFacingBackward(prevId)) return ROLL_AFTER_SWITCH_CHANCE;
  return id === FRONT_SALTO_ID ? ROLL_AFTER_FRONT_CHANCE : ROLL_AFTER_FORWARD_CHANCE;
}

/**
 * 宙返りの途中で投げる投げタン（`throwInSkill`）で、**ロンダートから入る**
 * （＝後方系の宙返りから始める）ことを優先する重み。
 */
export const THROW_IN_SKILL_ROUNDOFF_WEIGHT = 3;

/**
 * ロンダートから入る（＝後方系の宙返りから始める）ことを優先する重み。投げタンに限らず
 * 通常のタンブリングもロンダート入りがいちばん多いが、狙うDスコアが上がるほど前方系・側方系から
 * 直接入る形が増えるので、目標Dスコアで減衰させる（1点ごとに `ROUNDOFF_ENTRY_DECAY` 倍、1未満にはしない）。
 * 低いDスコアでつなぎ技を満たす形（ロンダート→宙返り→つなぎ→宙返り）はとくに多いので、
 * `ROUNDOFF_ENTRY_CONNECT_MAX_SCORE` 未満のつなぎの形ではさらに優先する。
 * 上限を指定しない＝難度を狙いきる構成では優先しない。
 */
export const ROUNDOFF_ENTRY_WEIGHT = 3;

export const ROUNDOFF_ENTRY_DECAY = 0.7;

export const ROUNDOFF_ENTRY_CONNECT_BOOST = 2;

export const ROUNDOFF_ENTRY_CONNECT_MAX_SCORE = 3.0;

export function roundoffEntryWeight(targetScore?: number | null, connect = false): number {
  if (targetScore == null) return 1;
  const lowConnect = connect && targetScore < ROUNDOFF_ENTRY_CONNECT_MAX_SCORE;
  const base = ROUNDOFF_ENTRY_WEIGHT * (lowConnect ? ROUNDOFF_ENTRY_CONNECT_BOOST : 1);
  return Math.max(1, base * ROUNDOFF_ENTRY_DECAY ** Math.max(0, targetScore));
}

/**
 * 側宙の実施中に投げる構成の重み。クラブでの練習動画はあるが、実戦で使われた記録は
 * 無いので稀。連続の最後で投げる形（`throwInSkill`）で側宙を引く確率を下げる。
 */
export const THROW_IN_SIDE_SALTO_WEIGHT = 0.1;

/**
 * **その技の実施中に投げるのが稀**な宙返りの重み（連続の最後で投げる形だけに効く）。
 * きりもみ転回は側宙と同じ扱い：首から背中にかけて着地する技なので、その最中に投げた例は無い。
 * ここを下げないと、側宙を下げたぶんきりもみ転回が繰り上がってしまう
 * （実測：`chainThrowInSkill` の最後が きりもみ転回21% ＞ 側宙8% になっていた）。
 */
export const THROW_IN_SALTO_WEIGHT: Record<string, number> = {
  [SIDE_SALTO_ID]: THROW_IN_SIDE_SALTO_WEIGHT,
  c_kirimomiten: THROW_IN_SIDE_SALTO_WEIGHT,
};

/**
 * **ひねりのある前方系の宙返りの最中に投げる**のはかなり難しい。実施例が無いとまでは
 * 言えないので上の 0.1 より上に置く。日本トップの実例は**ひねりの無い前宙**で投げる形
 * （ロンダート→後方伸身2回半ひねり→前宙(投げ)→前転→キャッチ）。
 * 技を1つずつ並べるのではなく**ひねりの有無で判定する**のは、1つ下げると隣が繰り上がる
 * （前方宙返り1回ひねりを下げると伸身前宙1回ひねりが出てくる）のを防ぐため。
 */
export const THROW_IN_TWIST_SALTO_WEIGHT = 0.3;

/** その技の実施中に投げる形の重み（1＝下げない） */
export const throwInSaltoWeight = (id: string): number => {
  const fixed = THROW_IN_SALTO_WEIGHT[id];
  if (fixed != null) return fixed;
  const twist = skillDef(id)?.twist;
  if (twist?.base === "front" && twist.twist > 0) return THROW_IN_TWIST_SALTO_WEIGHT;
  return 1;
};

/**
 * つなぎ技のあとの宙返りで投げる形（`connectThrowInSkill`）で、その宙返りに選ばれやすい技。
 * 実施されるのは**大抵ダイビング前宙か前宙**なので、つなぎのあとの抽選でこの2つを強く引く。
 */
export const THROW_AFTER_CONNECT_SALTOS: string[] = ["b_divefront", "b_front"];
export const THROW_AFTER_CONNECT_WEIGHT = 5;

/** その形を残す確率 */
export const BACK_TO_FORWARD_THROW_CHANCE = 0.15;

export const DIFFICULTY_RISE_WEIGHT = 0.3;

/** 実施する技の選ばれやすさ（直前の技で変わる。表に無い技は1） */
export function saltoWeights(
  prevId: string,
  junior = false,
  apparatus?: ApparatusKey,
  future: FutureLevel = null,
): Record<string, number> {
  const weights = baseSkillWeights(junior, apparatus, future);
  // 難度が上がる例外（後方半ひねり→前方1回ひねり など）は機会が少ない
  (DIFFICULTY_RISE_AFTER[prevId] ?? []).forEach((id) => {
    weights[id] = (weights[id] ?? 1) * DIFFICULTY_RISE_WEIGHT;
  });
  // テンポひねりの次はテンポ宙返り＞それ以外の宙返り（難度の重みより優先する）
  if (prevId === TEMPO_TWIST_SKILL_ID)
    return withHarderThanRated({ ...weights, [TEMPO_SKILL_ID]: AFTER_TEMPO_TWIST_WEIGHT });
  if (!isBackLayoutSalto(prevId)) return withHarderThanRated(weights);
  // 後方伸身宙返りの後は 前宙＞きりもみ＞＞きりもみ転回（難度の重みより優先する）。
  // 後方系を続ける形（抱え込みの半ひねり系）はさらに少ない
  return withHarderThanRated({
    ...weights,
    ...Object.fromEntries(
      [...AFTER_BACK_LAYOUT_SALTOS, ...AFTER_BACK_LAYOUT_BACKWARD_SALTOS].map((x) => [x.id, x.weight]),
    ),
  });
}

/** 表記より難しい技の重みに難度1段ぶんの倍率を掛ける（位置ごとの重みの後に効かせる） */
function withHarderThanRated(weights: Record<string, number>): Record<string, number> {
  const out = { ...weights };
  HARDER_THAN_RATED.forEach((id) => {
    out[id] = (out[id] ?? 1) * HARDER_THAN_RATED_WEIGHT;
  });
  return out;
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
export const LIMITED_SKILLS: string[] = ["a_handspring", TENCHU_SKILL_ID];

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
  // ロンダート（重み無し＝1）＞ バク転 ＞ ハンドスプリング
  a_flicflac: 0.5,
  // ハンドスプリングは実施がとくに少ないので、`LIMITED_SKILLS` の 0.2 にさらに掛けて
  // 実質 0.1（ロンダート 1 ＞ バク転 0.5 ＞ ハンドスプリング 0.1）にする
  a_handspring: 0.5,
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
export const SALTO_DIFFICULTY_WEIGHT: Partial<Record<Difficulty, number>> = {
  D: 0.6,
  E: 0.3,
  // 十年後モードのF・G難度。Eからさらに半分ずつ（単発の高難度ほど実施は少ない）
  F: 0.15,
  G: 0.08,
};

/**
 * **その時代の上限難度の単発**の選ばれやすさ。現行規則ではE難度がそれで、
 * 全国大会の最大Dスコアが5.0〜5.1という水準でも**単発のE難度は実戦でほぼ実施されない**
 * （実施例自体はある）。E難度のユニットは単発ではなく C→B→B のような連続で作る。
 * 単発と連続で点数は同じ0.7なので貪欲法はどちらでもよく、頻度は抽選が決められる
 * （実測・E難度の単発／構成：上限4.0〜5.0で 0.20〜0.42本 → **0.11〜0.18本**。
 *  実Dは 4.40／4.81、上限なしで 4.96 と変わらない）。
 * 十年後モードでは上限が上がるので、**その上限（F・G）に同じ扱いが移り**、
 * Eは普通の高難度（`SALTO_DIFFICULTY_WEIGHT`）に戻る。
 */
export const TOP_SINGLE_WEIGHT = 0.05;

/**
 * **難度の表記より実際の難しさが一段上**の技。首や背中から着地する技・軸のずれる技は、
 * 規則上の難度は低くても実施の難しさが頭ひとつ抜けている（転宙・きりもみ・きりもみ転回）。
 * **難度点は規則どおりのまま**で、頻度の計算だけ1段上の難度として扱う：
 *  - 単発の選ばれやすさ（`SALTO_DIFFICULTY_WEIGHT` / `TOP_SINGLE_WEIGHT`）
 *  - 狙うDスコアごとの難度の上限（`SKILL_MAX_DIFF_STEPS`。C止まりの構成にきりもみ転回は出ない）
 * 後方伸身宙返りの後だけは位置ごとの実測（`AFTER_BACK_LAYOUT_SALTOS`：前宙5＞きりもみ3＞
 * きりもみ転回1）が重みを上書きするので、そこはこの補正の対象外。
 */
export const HARDER_THAN_RATED: string[] = [TENCHU_SKILL_ID, "b_kirimomi", "c_kirimomiten"];

/** 頻度の計算で使う難度の値（表記より難しい技は1段上として数える） */
export function frequencyDiffValue(
  id: string,
  junior = false,
  future: FutureLevel = null,
): number {
  const d = skillDifficulty(id, junior, future);
  const base = d ? DIFF_VALUE[d] : 0;
  return HARDER_THAN_RATED.includes(id) ? base + 1 : base;
}

/**
 * 表記より難しい技の選ばれやすさに掛ける倍率＝**難度1段ぶん**
 * （`SALTO_DIFFICULTY_WEIGHT` の C→D の比と同じ 0.6）。
 * 難度の表（`SALTO_DIFFICULTY_WEIGHT`）はD難度以上しか区別しないので、B→Cの技
 * （転宙・きりもみ）は表の引き直しでは変わらない。位置ごとの重み
 * （`AFTER_BACK_LAYOUT_SALTOS`：きりもみが実際に出てくるのはこの位置）にも効かせたいので、
 * 難度を引き直すのではなく**倍率として最後に掛ける**。
 */
export const HARDER_THAN_RATED_WEIGHT = 0.6;

/** その技が「表記より難しい」なら難度1段ぶんの倍率、そうでなければ1 */
export const harderThanRatedWeight = (id: string): number =>
  HARDER_THAN_RATED.includes(id) ? HARDER_THAN_RATED_WEIGHT : 1;

/** 単発の技の難度ごとの選ばれやすさ（その時代の上限難度だけ `TOP_SINGLE_WEIGHT` に抑える） */
export function saltoDifficultyWeight(d: Difficulty, future: FutureLevel = null): number {
  const base = SALTO_DIFFICULTY_WEIGHT[d];
  if (base === undefined) return 1;
  return DIFF_VALUE[d] >= maxDiff(future) ? Math.min(base, TOP_SINGLE_WEIGHT) : base;
}

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
export function isHighDifficultySkill(id: string, junior = false, future: FutureLevel = null): boolean {
  const d = skillDifficulty(id, junior, future);
  return !!d && DIFF_VALUE[d] >= DIFF_VALUE[HIGH_DIFFICULTY_MIN];
}

/**
 * ジュニアで難度が格上げされる技（`JUNIOR_SKILL_DIFFICULTY`：ダイビング前宙・
 * 後方宙返り半ひねり・後方伸身宙返り半ひねり）を優先する構成の、狙うDスコアの上限。
 * ジュニアで低いDスコアを狙うなら、格上げされたこれらの技から難度を取るのが自然。
 */
export const JUNIOR_UPGRADE_BOOST_MAX_SCORE = 3.0;

/** そのときの選ばれやすさの倍率 */
export const JUNIOR_UPGRADE_BOOST = 2;

/** ジュニアで格上げされる技の重みを上げた選ばれやすさ（条件を満たさなければそのまま） */
export function withJuniorBoost(
  weights: Record<string, number>,
  junior: boolean,
  targetScore?: number | null,
): Record<string, number> {
  if (!junior || targetScore == null || targetScore >= JUNIOR_UPGRADE_BOOST_MAX_SCORE) return weights;
  const boosted = { ...weights };
  Object.keys(JUNIOR_SKILL_DIFFICULTY).forEach((id) => {
    boosted[id] = (boosted[id] ?? 1) * JUNIOR_UPGRADE_BOOST;
  });
  return boosted;
}

/** 技の選ばれやすさの土台（高難度の単発・実施が少ない技を下げる） */
export function baseSkillWeights(
  junior: boolean,
  apparatus?: ApparatusKey,
  future: FutureLevel = null,
): Record<string, number> {
  const weights = limitedWeights();
  const factor = apparatusHighDifficultyWeight(apparatus);
  skillOptions(junior, ANY_SKILL_FLOW, future).forEach((sk) => {
    const d = skillDifficulty(sk.id, junior, future);
    const w = d ? saltoDifficultyWeight(d, future) : undefined;
    if (w !== undefined && w !== 1) weights[sk.id] = Math.min(weights[sk.id] ?? 1, w * factor);
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
  future: FutureLevel = null,
): Record<string, number> {
  const weights = baseSkillWeights(junior, apparatus, future);
  if (basicLevel) return weights;
  return { ...weights, ...Object.fromEntries(CONNECT_FINISH_RARE.map((id) => [id, RARE_PICK_WEIGHT])) };
}

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
