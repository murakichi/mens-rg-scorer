// =====================================================================
// 自動入力（入力補助）：いま入力した末尾から「このあと実施しがちな続き」を予測する
//
// 純粋関数だけ。UI は候補を半透明で見せ、確定されたら `items` をシリーズ末尾に足す。
// 採点には一切触れず、つなぎ・三宙の達成状況だけ `seriesTags` から読む。
// =====================================================================

import {
  DIFF_VALUE,
  LEFT_HAND_THROW_TAG,
  ROUNDOFF_SKILL_ID,
  buildTwistSkillId,
  SIDE_THROW_TAG,
  USE_APPARATUS_TAG,
  skillDef,
} from "./constants";
import {
  motionDef,
  motionTimes,
  prevSkillId,
  seriesTags,
  analyzeSeries,
  saltoFlags,
  thrownCount,
} from "./analysis";
import {
  CHAIN_END_SKILLS,
  isTempoSalto,
  TEMPO_SKILL_ID,
  TEMPO_TWIST_SKILL_ID,
  endsFacingBackward,
  THROW_ROLL_MOTION,
} from "./tumblingChain";
import { itemLabel } from "./templates";
import { NO_VIEW_TAG } from "./autoThrows";
import { computeScore } from "./score";
import type { ApparatusKey, Item, Series, TwistParams } from "./types";

/** 「投げ→伸身前方宙返り1回ひねり」のあとに前転→キャッチが続く、その技 */
export const FRONT_LAYOUT_TWIST_ID = "d_frontlay1";
const FRONT_ID = "b_front";
/** 伸身前宙1回ひねり（`FRONT_LAYOUT_TWIST_ID` と同じ技） */
const FRONT_LAYOUT_ID_TWIST = FRONT_LAYOUT_TWIST_ID;
const FRONT_TWIST_ID = "c_front1full";
const KIRIMOMI_TEN_ID = "c_kirimomiten";
/** テンポひねりの次に出す技：テンポ／ハーフ（後方宙返り半ひねり）／後方伸身宙返り2回半ひねり */
const TEMPO_TWIST_NEXT = [TEMPO_SKILL_ID, "b_backhalf", "d_backlay25"];
const KIRIMOMI_ID = "b_kirimomi";
/** 後ろ向きで終わる宙返りのあと、他のシリーズの平均難度の境目（以下／超）。0.7以上できりもみ転回も出す */
export const AFTER_BACK_NONE_MAX = 0.2;
export const AFTER_BACK_FRONT_MAX = 0.3;
export const AFTER_BACK_KIRIMOMI_MAX = 0.5;
const FLICFLAC_ID = "a_flicflac";
/** テンポのあとの「宙返り→前宙」の宙返り（前向きに降りる後方の半ひねり系）を選ぶ、他のシリーズの平均難度の境目 */
export const TEMPO_AVG_LOW_MAX = 0.3;
export const TEMPO_AVG_MID_MAX = 0.5;
const TEMPO_LOW: TwistParams = { base: "back", twist: 0.5, posture: "tuck" };
const TEMPO_MID: TwistParams = { base: "back", twist: 1.5, posture: "tuck" };
const TEMPO_LAYOUT: TwistParams = { base: "back", twist: 0, posture: "layout" };
const TEMPO_HIGH: TwistParams = { base: "back", twist: 2.5, posture: "layout" };
const DIVING_FRONT_ID = "b_divefront";
const SIDE_SALTO_ID = "b_sidesalto";
/** 投げている間の徒手が、この動作数に達したら「キャッチ→背面投げ→背面キャッチ」を勧める */
export const HAND_MOTIONS_FOR_REPEAT_THROW = 3;

/** この本数目以降の投げは、前転・転がりで終わったら手具を使ったキャッチ（クラブ・リング） */
export const PRESS_CATCH_FROM_THROW = 5;
/** 「タンブリングをすべて満たしている」とみなす必須要素のキー（score.ts の `required`） */
const TUMBLING_REQUIRED_KEYS = [
  "dir",
  "throwTum",
  "triple",
  "connect",
  "tumCount",
];
const CHENE_ID = "chene";
/** 投げ→シェネがこの回数以下なら、キャッチ／前転→キャッチを勧める */
export const CHENE_CATCH_MAX_COUNT = 3;
const ROLL_MOTION_ID = "roll";
const ROLL_MOTION_IDS = [THROW_ROLL_MOTION, ROLL_MOTION_ID];

/** 投げタンをおすすめするときの、構成全体の平均難度点の境目（この値以下ならその段） */
export const THROW_TUM_AVG_FRONT_ROLL_MAX = 0.3;
export const THROW_TUM_AVG_FRONT_SIDE_MAX = 0.5;
/** 0.5超〜0.7未満は前方1回ひねり→前転。この値以上は伸身前宙1回ひねり→前転／前方1回ひねり→側宙 */
export const THROW_TUM_AVG_LAYOUT_MIN = 0.7;

export interface AutoInputSuggestion {
  /** 候補の識別子（同じ候補が続けて出ているかの判定・テスト用） */
  id: string;
  /** 表示用の一行（例：前転→キャッチ） */
  label: string;
  /** シリーズ末尾に足すアイテム */
  items: Item[];
}

const skillItem = (skillId: string): Item => ({
  kind: "skill",
  skillId,
  hasApparatus: false,
  isThrow: false,
});
const motionItem = (motionId: string): Item => ({ kind: "motion", motionId });
const suggestion = (id: string, items: Item[]): AutoInputSuggestion => ({
  id,
  label: items.map(itemLabel).join("→"),
  items,
});

/** 投げ→(徒手)→キャッチの後に、前転で受けにいく決まりの続き */
const rollThenCatch = (id: string): AutoInputSuggestion =>
  suggestion(id, [
    motionItem(THROW_ROLL_MOTION),
    { kind: "catch", catchTypes: [], catchTwo: false },
  ]);

/** 直近の投げ（まだキャッチされていない）の位置。無ければ -1 */
function openThrowIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "catch") return -1;
    if (it.kind === "throw") return i;
  }
  return -1;
}

/** 手具が空中にある（投げてまだキャッチしていない）ときの、その投げの位置。技の最中の投げも含む。無ければ -1 */
function airborneIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "catch") return -1;
    if (it.kind === "throw" || (it.kind === "skill" && it.isThrow)) return i;
  }
  return -1;
}

/**
 * 末尾の入力から続きの候補を返す。先頭が既定の候補で、複数あるときは「別案」で切り替える。
 * @param list 構成全体（つなぎ・三宙が「未達成」かはルーティン全体で見る）
 * @param sIdx いま入力しているシリーズ
 */
function coreSuggestions(
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

  const routineAverage = (): number =>
    averageDifficulty(list, sIdx, junior, apparatus);
  const eps = 1e-9;

  // ---- スティックの左手投げ×横投げ：1シェネ→キャッチ ----
  if (
    apparatus === "stick" &&
    n === 1 &&
    last.kind === "throw" &&
    (last.reqTypes || []).includes(LEFT_HAND_THROW_TAG) &&
    (last.throwTypes || []).includes(SIDE_THROW_TAG)
  ) {
    return [
      suggestion("leftHandSide-chene-catch", [
        { kind: "motion", motionId: CHENE_ID, count: 1 },
        { kind: "catch", catchTypes: [], catchTwo: false },
      ]),
    ];
  }

  // ---- クラブ・リングの横投げ：もう一方の手具で押さえて受ける ----
  if (
    (apparatus === "clubs" || apparatus === "ring") &&
    last.kind === "throw" &&
    (last.throwTypes || []).includes(SIDE_THROW_TAG) &&
    thrownCount(last) === 1
  ) {
    return [
      suggestion("sideThrow-pressCatch", [
        { kind: "catch", catchTypes: [USE_APPARATUS_TAG], catchTwo: false },
      ]),
    ];
  }

  // ---- 投げを足したとき：投げタン未実施・投げ実施済み・タンブリング実施済みなら平均難度に合わせて勧める ----
  if (
    n === 1 &&
    last.kind === "throw" &&
    !list.some((s2) =>
      analyzeSeries(s2, junior).units.some((u) => u.isThrowTumbling),
    ) &&
    list.some(
      (s2, i) => i !== sIdx && s2.items.some((it) => it.kind === "throw"),
    ) &&
    list.some(
      (s2, i) =>
        i !== sIdx &&
        analyzeSeries(s2, junior).units.some((u) => u.type === "tumbling"),
    )
  ) {
    const avg = routineAverage();
    const catchItem: Item = { kind: "catch", catchTypes: [], catchTwo: false };
    const rollTail = (first: string) => [
      skillItem(first),
      motionItem(THROW_ROLL_MOTION),
      catchItem,
    ];
    const twistSide = [
      skillItem(FRONT_TWIST_ID),
      skillItem(SIDE_SALTO_ID),
      catchItem,
    ];
    const options: [string, Item[]][] =
      avg <= THROW_TUM_AVG_FRONT_ROLL_MAX + eps
        ? [
            ["front-roll", rollTail(FRONT_ID)],
            ["side", [skillItem(SIDE_SALTO_ID), catchItem]],
          ]
        : avg <= THROW_TUM_AVG_FRONT_SIDE_MAX + eps
          ? [
              [
                "front-side",
                [skillItem(FRONT_ID), skillItem(SIDE_SALTO_ID), catchItem],
              ],
            ]
          : avg < THROW_TUM_AVG_LAYOUT_MIN - eps
            ? [["front1twist-roll", rollTail(FRONT_TWIST_ID)]]
            : [
                ["frontLayout1twist-roll", rollTail(FRONT_LAYOUT_ID_TWIST)],
                ["front1twist-side", twistSide],
              ];
    return options.map(([id, items2]) =>
      suggestion(`throwTumbling-${id}`, items2),
    );
  }

  // ---- 平均難度が高いときの 投げ→前宙 → きりもみ転回→キャッチ ----
  if (
    last.kind === "skill" &&
    last.skillId === FRONT_ID &&
    items[n - 2]?.kind === "throw" &&
    routineAverage() >= THROW_TUM_AVG_LAYOUT_MIN - eps
  ) {
    return [
      suggestion("throwFront-kirimomiten", [
        skillItem(KIRIMOMI_TEN_ID),
        { kind: "catch", catchTypes: [], catchTwo: false },
      ]),
    ];
  }

  // ---- 投げまわり ----
  if (last.kind === "skill" && last.skillId) {
    // 宙返り中に投げを選んだ／投げ→伸身前方宙返り1回ひねり → 前転→キャッチ
    if (last.isThrow) return [rollThenCatch("throwInSkill-roll")];
    if (
      last.skillId === FRONT_LAYOUT_TWIST_ID &&
      items[n - 2]?.kind === "throw"
    ) {
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
        return [
          suggestion("ropeNonHandCatch", [
            { kind: "catch", catchTypes: ["nonhand"], catchTwo: false },
          ]),
        ];
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
      const isThrowItem = (it: Item) =>
        it.kind === "throw" || (it.kind === "skill" && it.isThrow);
      const before = list
        .slice(0, sIdx)
        .reduce((n2, s2) => n2 + s2.items.filter(isThrowItem).length, 0);
      const nth = before + items.slice(0, t + 1).filter(isThrowItem).length;
      if (nth >= PRESS_CATCH_FROM_THROW) {
        return [
          suggestion("pressCatch", [
            { kind: "catch", catchTypes: [USE_APPARATUS_TAG], catchTwo: false },
          ]),
        ];
      }
    }
    if (t >= 0 && items.slice(t + 1).every((it) => it.kind === "motion")) {
      const total = items
        .slice(t + 1)
        .reduce(
          (sum, it) =>
            sum +
            (it.kind === "motion"
              ? (motionDef(it.motionId)?.motions ?? 0) * motionTimes(it.count)
              : 0),
          0,
        );
      if (total >= HAND_MOTIONS_FOR_REPEAT_THROW && !hasConsecutiveThrowElsewhere(list, sIdx)) {
        return [
          suggestion("throwHand-catchThrowBack", [
            {
              kind: "catch",
              catchTypes: [],
              catchTwo: thrownCount(items[t]) === 2,
            },
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
    return (
      !!sk?.isSalto && !endsFacingBackward(id) && !CHAIN_END_SKILLS.includes(id)
    );
  };
  const skillAt = (i: number) => {
    const it = items[i];
    return it && it.kind === "skill" && it.skillId ? it.skillId : undefined;
  };
  const roundoff = () => suggestion("roundoff", [skillItem(ROUNDOFF_SKILL_ID)]);

  const lastId = skillAt(n - 1);
  if (!lastId) return [];

  // テンポのあと：①平均難度に応じた宙返り→前宙 ②三宙を実施済みならバク転
  // テンポひねりのあとは、テンポ・ハーフ・後方伸身宙返り2回半ひねり
  if (lastId === TEMPO_TWIST_SKILL_ID) {
    return TEMPO_TWIST_NEXT.map((id) => suggestion(`tempoTwist-${id}`, [skillItem(id)]));
  }
  if (isTempoSalto(lastId)) {
    const avg = averageDifficulty(list, sIdx, junior, apparatus);
    // 平均難度で段を決め、ほかのタンブリングで実施済み（同じ技は難度に数えない）なら一段下げる：
    // 二回半 → 一回半 → ハーフ → 伸身宙返り
    const ladder = [TEMPO_HIGH, TEMPO_MID, TEMPO_LOW, TEMPO_LAYOUT];
    let step = avg <= TEMPO_AVG_LOW_MAX + eps ? 2 : avg <= TEMPO_AVG_MID_MAX + eps ? 1 : 0;
    const doneElsewhere = (id: string) =>
      list.some((s2, i) => i !== sIdx && s2.items.some((it) => it.kind === "skill" && it.skillId === id));
    while (step < ladder.length - 1 && doneElsewhere(buildTwistSkillId(ladder[step]))) step++;
    const twist = ladder[step];
    const out = [suggestion("tempo-salto-front", [skillItem(buildTwistSkillId(twist)), skillItem(FRONT_ID)])];
    if (hasSalto3) out.push(suggestion("tempo-flicflac", [skillItem(FLICFLAC_ID)]));
    return out;
  }

  // 後ろ向きで終わる宙返りのあと：他のシリーズの平均難度に応じて 前宙／きりもみ／前宙→側宙／きりもみ転回
  if (skillDef(lastId)?.isSalto && endsFacingBackward(lastId)) {
    const avg = averageDifficulty(list, sIdx, junior, apparatus);
    if (avg <= AFTER_BACK_NONE_MAX + eps) return [];
    const out = [suggestion("afterBack-front", [skillItem(FRONT_ID)])];
    if (avg > AFTER_BACK_FRONT_MAX + eps) out.push(suggestion("afterBack-kirimomi", [skillItem(KIRIMOMI_ID)]));
    if (avg > AFTER_BACK_KIRIMOMI_MAX + eps) {
      // 三宙が未達成で、このシリーズがつなぎでないときだけ 前宙→側宙
      const seriesIsConnect = seriesTags(series, junior).includes("connect");
      if (!hasSalto3 && !seriesIsConnect) {
        out.push(suggestion("afterBack-front-side", [skillItem(FRONT_ID), skillItem(SIDE_SALTO_ID)]));
      }
    }
    if (avg >= THROW_TUM_AVG_LAYOUT_MIN - eps) out.push(suggestion("afterBack-kirimomiten", [skillItem(KIRIMOMI_TEN_ID)]));
    return out;
  }

  // ダイビング前宙以外の宙返りからロンダートでつないだら、ダイビング前宙
  const beforeId = skillAt(n - 2);
  if (
    lastId === ROUNDOFF_SKILL_ID &&
    beforeId &&
    beforeId !== DIVING_FRONT_ID &&
    skillDef(beforeId)?.isSalto
  ) {
    return [suggestion("roundoff-divingFront", [skillItem(DIVING_FRONT_ID)])];
  }

  // ロンダート→前向きに降りる宙返り
  if (skillAt(n - 2) === ROUNDOFF_SKILL_ID && isForwardLanding(lastId)) {
    const out: AutoInputSuggestion[] = [];
    if (!hasConnect) out.push(roundoff());
    if (!hasSalto3) {
      out.push(
        suggestion("front-side", [
          skillItem(FRONT_ID),
          skillItem(SIDE_SALTO_ID),
        ]),
      );
      out.push(
        suggestion("front1twist-side", [
          skillItem(FRONT_TWIST_ID),
          skillItem(SIDE_SALTO_ID),
        ]),
      );
    }
    return out;
  }
  // ロンダート→前向きに降りる宙返り→前宙
  if (lastId === FRONT_ID && skillAt(n - 3) === ROUNDOFF_SKILL_ID) {
    const mid = skillAt(n - 2);
    if (mid && isForwardLanding(mid) && prevSkillId(items, n - 1) === mid) {
      const out: AutoInputSuggestion[] = [];
      const maxDiff = Math.max(
        0,
        ...analyzeSeries(series, junior).units.map(
          (u) => DIFF_VALUE[u.finalDiff],
        ),
      );
      if (!hasConnect && maxDiff < DIFF_VALUE.E) out.push(roundoff());
      if (!hasSalto3) out.push(suggestion("side", [skillItem(SIDE_SALTO_ID)]));
      return out;
    }
  }
  return [];
}

/** 平均に使う上位ユニットの数（難度点で採られる数 `ADOPT_COUNT` に合わせる） */
export const AVERAGE_TOP_COUNT = 3;

/**
 * 難度として有効なユニットの難度点。入力中のシリーズは含めず、採用された（重複でない）うえで
 * 上位3つに入ったタンブリングと徒手系のユニットだけを拾う。
 * 連続投げの2回目（同じシリーズの2つ目以降の投げ）は数えない。
 */
export function effectiveScores(
  list: Series[],
  sIdx: number,
  junior: boolean,
  apparatus: ApparatusKey,
): number[] {
  const others = list.filter((_, i) => i !== sIdx);
  if (others.length === 0) return [];
  // 目安の計算だけは十年後モードの F（0.9）まで内部で数える。E（0.7）で頭打ちにすると、
  // 実際には F 相当の徒手（シェネ×5 など）が E と区別できなくなる。画面の採点には影響しない
  const result = computeScore(others, apparatus, { junior, future: "F" });
  const scores: number[] = [];
  result.seriesBreakdowns.forEach((b) => {
    b.tumRows.forEach((r) => {
      if (r.adopted && r.inTop) scores.push(r.score);
    });
    b.handRows.forEach((r) => {
      // ラベルは 投げ1・投げ2…（同じシリーズ内の順）。2つ目以降は連続投げの2回目
      const nth = /^投げ(\d+)$/.exec(r.label);
      if (nth && Number(nth[1]) >= 2) return;
      if (r.adopted && r.inTop) scores.push(r.score);
    });
  });
  return scores;
}

/**
 * 候補を選ぶための、構成の難度の目安。有効なユニット（`effectiveScores`）のうち
 * **難度の高い上位3つの平均**。加点や必須要素を満たすためだけの低難度の投げは
 * 上位に入らないので、狙っている難度のレベルがそのまま出る（ユニットが3つ未満ならある分だけ）。
 */
export function averageDifficulty(
  list: Series[],
  sIdx: number,
  junior: boolean,
  apparatus: ApparatusKey,
): number {
  const top = effectiveScores(list, sIdx, junior, apparatus)
    .sort((x, y) => y - x)
    .slice(0, AVERAGE_TOP_COUNT);
  return top.length ? top.reduce((x, y) => x + y, 0) / top.length : 0;
}

/** 転がりに切り替えて受けにいく、動作数とシリーズ平均の下限 */
export const ROLL_CATCH_MIN_MOTIONS = 3;
export const ROLL_CATCH_MIN_AVG = 0.5;

/**
 * 投げている間に前転を入れたとき：第一候補はキャッチ。動作が3以上で構成の平均難度が0.5以上なら
 * 前転の代わりに 転がり→キャッチ を第一候補にする（そのほかの候補は別案に残す）。
 */
function baseSuggestions(
  list: Series[],
  sIdx: number,
  junior: boolean,
  apparatus: ApparatusKey,
): AutoInputSuggestion[] {
  const core = coreSuggestions(list, sIdx, junior, apparatus);
  const items = list[sIdx]?.items ?? [];
  const last = items[items.length - 1];
  const t = openThrowIndex(items);
  // 投げ→シェネ（合計3回以下）：キャッチ、もしくは前転→キャッチ
  if (
    last &&
    last.kind === "motion" &&
    last.motionId === CHENE_ID &&
    t >= 0 &&
    items.slice(t + 1).every((it) => it.kind === "motion")
  ) {
    const cheneTotal = items
      .slice(t + 1)
      .reduce(
        (sum, it) =>
          sum + (it.kind === "motion" && it.motionId === CHENE_ID ? motionTimes(it.count) : 0),
        0,
      );
    if (cheneTotal >= 1 && cheneTotal <= CHENE_CATCH_MAX_COUNT) {
      const catchItem: Item = {
        kind: "catch",
        catchTypes: [],
        catchTwo: thrownCount(items[t]) === 2,
      };
      const out: AutoInputSuggestion[] = [];
      // すでにキャッチ1つだけの候補（ロープの手以外のキャッチなど）があれば先に置く
      if (core[0]?.items.length === 1 && core[0].items[0].kind === "catch") out.push(core[0]);
      out.push(
        suggestion("chene-catch", [catchItem]),
        suggestion("chene-roll-catch", [motionItem(THROW_ROLL_MOTION), catchItem]),
        ...core.slice(out.length),
      );
      return out;
    }
  }
  if (!last || last.kind !== "motion" || last.motionId !== THROW_ROLL_MOTION)
    return core;
  // 手具が空中にある間（投げアイテムも技の最中の投げも）の前転は、どんな状況でもキャッチを勧める
  const air = airborneIndex(items);
  if (air < 0) return core;
  if (t < 0 || !items.slice(t + 1).every((it) => it.kind === "motion")) {
    if (core[0]?.items.length === 1 && core[0].items[0].kind === "catch")
      return core;
    return [
      suggestion("air-roll-catch", [
        {
          kind: "catch",
          catchTypes: [],
          catchTwo: thrownCount(items[air]) === 2,
        },
      ]),
      ...core,
    ];
  }
  const total = items
    .slice(t + 1)
    .reduce(
      (sum, it) =>
        sum +
        (it.kind === "motion"
          ? (motionDef(it.motionId)?.motions ?? 0) * motionTimes(it.count)
          : 0),
      0,
    );
  const catchItem: Item = {
    kind: "catch",
    catchTypes: [],
    catchTwo: thrownCount(items[t]) === 2,
  };
  const out: AutoInputSuggestion[] = [];
  if (total >= ROLL_CATCH_MIN_MOTIONS) {
    const avg = averageDifficulty(list, sIdx, junior, apparatus);
    if (avg >= ROLL_CATCH_MIN_AVG - 1e-9)
      out.push(
        suggestion("roll-catch", [motionItem(ROLL_MOTION_ID), catchItem]),
      );
  }
  // 第一候補（または転がりの次）はキャッチ。候補がすでにキャッチ1つだけならそれを使う
  if (core[0]?.items.length === 1 && core[0].items[0].kind === "catch")
    out.push(...core);
  else out.push(suggestion("catch", [catchItem]), ...core);
  return out;
}

/** ほかのシリーズに連続投げ（1シリーズ内に投げが2回以上）があるか */
export function hasConsecutiveThrowElsewhere(list: Series[], sIdx: number): boolean {
  return list.some(
    (s2, i) =>
      i !== sIdx &&
      s2.items.filter((it) => it.kind === "throw" || (it.kind === "skill" && it.isThrow)).length >= 2,
  );
}

/** 直近の（まだキャッチされていない）投げが横投げか。投げアイテムも技の最中の投げも見る */
function openThrowIsSide(items: Item[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "catch") return false;
    if (
      (it.kind === "throw" || (it.kind === "skill" && it.isThrow)) &&
      it.throwTypes?.includes(SIDE_THROW_TAG)
    ) {
      return true;
    }
    if (it.kind === "throw" || (it.kind === "skill" && it.isThrow))
      return false;
  }
  return false;
}

/**
 * 続きの候補を返す。クラブ・リングで横投げのあとにキャッチが候補に挙がるときは、
 * そのキャッチを手具を使ったキャッチ（もう一方の手具で押さえる）にする。
 */
function withSideThrowCatch(
  list: Series[],
  sIdx: number,
  junior = false,
  apparatus: ApparatusKey = "stick",
): AutoInputSuggestion[] {
  const base = baseSuggestions(list, sIdx, junior, apparatus);
  const items = list[sIdx]?.items ?? [];
  if (
    (apparatus !== "clubs" && apparatus !== "ring") ||
    !openThrowIsSide(items)
  )
    return base;
  const last = items[items.length - 1];
  // 二つ投げは、もう一方の手具も空中にあるので押さえられない
  if (
    last &&
    thrownCount(
      items
        .slice()
        .reverse()
        .find(
          (it) => it.kind === "throw" || (it.kind === "skill" && it.isThrow),
        ) ?? last,
    ) === 2
  ) {
    return base;
  }
  return base.map((sg) => {
    const k = sg.items.findIndex((it) => it.kind === "catch");
    if (k < 0) return sg;
    const next = sg.items.slice();
    next[k] = {
      kind: "catch",
      catchTypes: [USE_APPARATUS_TAG],
      catchTwo: false,
    };
    return { ...sg, items: next };
  });
}

/** つなぎのあとの宙返りの連続は、この本数までにする（3本になると三宙になる） */
export const POST_CONNECT_SALTO_MAX = 2;

/**
 * つなぎ（宙返り→A難度のつなぎ技→宙返り）の**二回目の宙返り**のあとに宙返りを足す候補は、
 * つなぎのあとの連続が三宙にならないところで打ち切る（打ち切って何も残らない候補は出さない）。
 */
function capPostConnectSaltos(series: Series | undefined, suggestions: AutoInputSuggestion[]): AutoInputSuggestion[] {
  const items = series?.items ?? [];
  const ids = items.map((it) => (it.kind === "skill" ? it.skillId : ""));
  // 末尾の宙返りの連続の始まり
  const flags = saltoFlags(ids);
  let start = items.length;
  while (start > 0 && flags[start - 1]) start--;
  if (start === items.length) return suggestions;
  // その連続の手前が「つなぎ技」で、さらにその手前が宙返りなら、つなぎのあとの連続
  const connect = skillDef(ids[start - 1] ?? "");
  const beforeConnect = start >= 2 && flags[start - 2];
  if (!connect?.isConnectA || !beforeConnect) return suggestions;
  const already = items.length - start;
  return suggestions.flatMap((sg) => {
    const seq = [...ids, ...sg.items.map((it) => (it.kind === "skill" ? it.skillId : ""))];
    const f = saltoFlags(seq);
    let run = already;
    let keep = sg.items.length;
    for (let k = 0; k < sg.items.length; k++) {
      // 宙返りでないアイテム（つなぎ・キャッチなど）で連続は途切れる
      run = f[items.length + k] ? run + 1 : 0;
      if (run > POST_CONNECT_SALTO_MAX) {
        keep = k;
        break;
      }
    }
    if (keep === sg.items.length) return [sg];
    if (keep === 0) return [];
    const kept = sg.items.slice(0, keep);
    return [{ ...sg, items: kept, label: kept.map(itemLabel).join("→") }];
  });
}

/** 続きの候補を返す（入力中のシリーズの末尾から。先頭が既定の候補） */
export function autoInputSuggestions(
  list: Series[],
  sIdx: number,
  junior = false,
  apparatus: ApparatusKey = "stick",
): AutoInputSuggestion[] {
  return capPostConnectSaltos(list[sIdx], withSideThrowCatch(list, sIdx, junior, apparatus));
}
