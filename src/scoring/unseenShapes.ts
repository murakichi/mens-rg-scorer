/**
 * **実施例の無い形**（現実的だが競技での実施例が無い）の宣言。
 *
 * 「日本トップレベルなら実施するかもしれないが、実際に見たことはない」技・投げ受けを
 * 自動生成にどれくらい出すかは、**1か所で宣言する**。ここを1行足すのが、
 * この種の形を追加する作業のすべてになる。
 *
 * ## なぜ1か所なのか（頻度を決める場所が2つあった）
 *
 * 出現率は本来「抽選（候補に出す確率）」で決めたい。ところが貪欲法は
 * **候補にあって点が上がるなら必ず採る**ので、評価の重みが「その形が稼ぐ点数」を
 * 下回っている間、抽選は在庫を決めるだけで出現率を決められない
 * （実測：候補の3%にしか付けていない形が、生成結果の55〜80%に入った）。
 * かといって重みを要求Dスコアで動かすと、稼ぐ点数と交差する一点で
 * 0件→13/20に跳ねる**崖**になる（実測：要求値5.0で1件、5.3で13件）。
 *
 * そこで **評価では「その形が稼ぐ点数」をそのまま打ち消す**（`earns`）。
 * 点数的に中立になるので、貪欲法は進んで狙いに行かず、出現率は抽選（`chance`）だけで決まり、
 * 要求Dスコアに対して滑らかに上がる。それでも嫌いたいぶんは `extra` に書く
 * （＝現実志向の重み。0.1〜0.9 の段に属する）。
 *
 * ## 中立化が効く範囲（割り切り）
 *
 * `earns` で厳密に打ち消せるのは、稼ぎが**技術加点**（1タグ＝`TECHNIQUE_BONUS`、上限なし）の形だけ。
 * 稼ぎが「手具別必須要素を満たす」側にある形（投げタンの左手投げ）は、必須要素の重み
 * （`REQUIRED_ELEMENT_WEIGHT`＝10）を打ち消すわけにはいかないので中立化できない。
 * そこは「同じ必須要素を満たす普通の形が候補に必ずある」ことで抑える（必須要素ぶんは
 * どちらを選んでも同額なので、比較では相殺される）。その形の `earns` は0で、`extra` だけを持つ。
 */
import { LEFT_HAND_THROW_TAG, NO_VIEW_TAG, TECHNIQUE_BONUS } from "./constants";
import type { Series } from "./types";

/**
 * 「要求するDスコアが上がるほど出やすくなる」カーブの形
 * （`HARD_THROW_FREE_SCORE` の「要求値を超えるまで抑える」の逆向き）。
 */
export interface UnseenChance {
  /** 要求値が `riseFrom` 以下のときの確率 */
  base: number;
  /** ここを超えたところから上がり始める要求Dスコア */
  riseFrom: number;
  /** 要求値1点あたりの上がり幅 */
  risePerPoint: number;
  /** 上限 */
  max: number;
}

/**
 * 既定のカーブ：要求値4.5以下は3%、そこから1点ごとに+0.3して40%で止まる。
 * 実測（`unseenChance`）：指定なし〜4.5で3% ／ 5.0で18% ／ 5.5で33% ／ 6.0以上で40%。
 */
export const UNSEEN_CHANCE_DEFAULT: UnseenChance = {
  base: 0.03,
  riseFrom: 4.5,
  risePerPoint: 0.3,
  max: 0.4,
};

/** 要求Dスコア（`minScore`）から、その形を候補に出す確率を返す */
export function unseenChance(demandScore?: number | null, curve: UnseenChance = UNSEEN_CHANCE_DEFAULT): number {
  const over = Math.max(0, (demandScore ?? 0) - curve.riseFrom);
  return Math.min(curve.max, curve.base + over * curve.risePerPoint);
}

/** 実施例の無い形の識別子 */
export type UnseenShapeId = "leftHandNoViewThrow" | "throwTumBackCatch" | "throwTumLeftHandThrow";

export interface UnseenShape {
  id: UnseenShapeId;
  /** 日本語名（テストとログ用） */
  label: string;
  /** 候補に出す確率のカーブ */
  chance: UnseenChance;
  /** その形が稼ぐ点数。評価はこれをそのまま打ち消す（＝点数的に中立にする） */
  earns: number;
  /** 中立化のうえで、さらに嫌うぶん */
  extra: number;
  /** 構成の中にその形がいくつあるか */
  count: (series: Series[]) => number;
}

/** 構成の各シリーズに転回系が含まれるか（＝投げタンになりうるか） */
const hasSkill = (ser: Series): boolean => ser.items.some((it) => it.kind === "skill" && !!it.skillId);

export const UNSEEN_SHAPES: UnseenShape[] = [
  {
    id: "leftHandNoViewThrow",
    label: "左手投げ＋視野外の投げ",
    chance: UNSEEN_CHANCE_DEFAULT,
    // 視野外のタグぶんの技術加点を稼ぐ（左手投げは必須要素側なので加点しない）
    earns: TECHNIQUE_BONUS,
    extra: 0,
    count: (series) =>
      series.reduce(
        (n, ser) =>
          n +
          ser.items.filter(
            (item) =>
              item.kind === "throw" &&
              (item.reqTypes || []).includes(LEFT_HAND_THROW_TAG) &&
              (item.throwTypes || []).includes(NO_VIEW_TAG),
          ).length,
        0,
      ),
  },
  {
    id: "throwTumBackCatch",
    label: "投げタンの背面キャッチ",
    chance: UNSEEN_CHANCE_DEFAULT,
    earns: TECHNIQUE_BONUS,
    extra: 0,
    count: (series) =>
      series.reduce(
        (n, ser) =>
          hasSkill(ser)
            ? n +
              ser.items.filter((item) => item.kind === "catch" && (item.catchTypes || []).includes(NO_VIEW_TAG))
                .length
            : n,
        0,
      ),
  },
  {
    id: "throwTumLeftHandThrow",
    label: "投げタンの左手投げ",
    chance: UNSEEN_CHANCE_DEFAULT,
    // 稼ぎは手具別必須要素（左手投げ）なので、打ち消せない。普通の投げ受けでも同じだけ稼ぐため
    // 比較では相殺され、ここでは「進んでは実施しない」ぶんだけを嫌う
    earns: 0,
    extra: TECHNIQUE_BONUS,
    count: (series) =>
      series.reduce(
        (n, ser) =>
          hasSkill(ser)
            ? n +
              ser.items.filter(
                (item) =>
                  item.kind === "throw" &&
                  (item.reqTypes || []).includes(LEFT_HAND_THROW_TAG) &&
                  // 視野外と同時の形は `leftHandNoViewThrow` で数えているので二重に数えない
                  !(item.throwTypes || []).includes(NO_VIEW_TAG),
              ).length
            : n,
        0,
      ),
  },
];

const SHAPE_BY_ID = new Map<UnseenShapeId, UnseenShape>(UNSEEN_SHAPES.map((s) => [s.id, s]));

export const unseenShape = (id: UnseenShapeId): UnseenShape => {
  const shape = SHAPE_BY_ID.get(id);
  if (!shape) throw new Error(`unknown unseen shape: ${id}`);
  return shape;
};

/** その形を候補に出す確率（候補づくりから呼ぶ唯一の入口） */
export const unseenShapeChance = (id: UnseenShapeId, demandScore?: number | null): number =>
  unseenChance(demandScore, unseenShape(id).chance);

/** 1つあたりに評価が引く点数（稼ぐぶんの打ち消し＋嫌うぶん） */
export const unseenShapeWeight = (shape: UnseenShape): number => shape.earns + shape.extra;

/** 構成に含まれる実施例の無い形の、評価での減点（評価から呼ぶ唯一の入口） */
export const unseenPenalty = (series: Series[]): number =>
  UNSEEN_SHAPES.reduce((sum, shape) => sum + shape.count(series) * unseenShapeWeight(shape), 0);
