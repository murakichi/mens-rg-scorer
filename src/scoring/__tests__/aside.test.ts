import { describe, it, expect } from "vitest";
import {
  APPARATUS_REQUIRED_ELEMENTS,
  DIFF_SCORE,
  HAND_ELEMENTS,
  SOLO_HAND_ELEMENT_GROUPS,
  soloHandDifficulty,
  soloHandElementScored,
  FLEX_ELEMENT_DEDUCTION,
  BASIC_HAND_ELEMENTS,
  DEEP_MOTION_DEDUCTION,
  DEEP_MOTION_PARTS,
  HAND_OP_CHECKS,
  HAND_OP_CHECK_DEDUCTION,
  APPARATUS_CHARACTER_HINTS,
  ART_DEDUCTION_ITEMS,
  OFF_BODY_TIP,
  OFF_BODY_DEDUCTION_STEP,
  OFF_BODY_REQUIRED_COUNT,
  deepMotionParts,
  offBodyShortage,
} from "../constants";
import { computeScore } from "../score";
import { normalizeIndividualDraft } from "../draft";
import type { Series } from "../types";

const deep = (r: ReturnType<typeof computeScore>, id: string) =>
  r.deepMotionChecks.find((c) => c.key === `deep_${id}`);

describe("基本徒手 — 深い運動の充足", () => {
  it("表のどの基本徒手も深い運動を1つ以上持つ", () => {
    BASIC_HAND_ELEMENTS.forEach((el) => {
      expect(el.parts.length).toBeGreaterThan(0);
      el.parts.forEach((p) => expect(DEEP_MOTION_PARTS.some((x) => x.id === p)).toBe(true));
    });
  });

  it("斜前屈は上半身・下半身の両方を満たす", () => {
    expect([...deepMotionParts(["slantfwd"])].sort()).toEqual(["lower", "upper"]);
  });

  it("胸後反・蛇動は下半身、前屈は上半身", () => {
    expect([...deepMotionParts(["chestback"])]).toEqual(["lower"]);
    expect([...deepMotionParts(["snake"])]).toEqual(["lower"]);
    expect([...deepMotionParts(["forwardbend"])]).toEqual(["upper"]);
  });

  it("未入力なら2部位とも不足で −0.2", () => {
    const r = computeScore([], "stick");
    expect(deep(r, "upper")?.passed).toBe(false);
    expect(deep(r, "lower")?.passed).toBe(false);
    expect(r.deepMotionDeduction).toBeCloseTo(DEEP_MOTION_DEDUCTION * 2, 5);
  });

  it("前屈だけなら下半身が不足（−0.1）", () => {
    const r = computeScore([], "stick", { basicHands: ["forwardbend"] });
    expect(deep(r, "upper")?.passed).toBe(true);
    expect(deep(r, "lower")?.passed).toBe(false);
    expect(r.deepMotionDeduction).toBeCloseTo(DEEP_MOTION_DEDUCTION, 5);
  });

  it("斜前屈1つで両方満たし、減点が消える", () => {
    const base = computeScore([], "stick");
    const r = computeScore([], "stick", { basicHands: ["slantfwd"] });
    expect(r.deepMotionDeduction).toBe(0);
    expect(base.aDeduction - r.aDeduction).toBeCloseTo(DEEP_MOTION_DEDUCTION * 2, 5);
  });

  it("胸後反＋前屈でも両方満たす／知らないidは数えない", () => {
    expect(computeScore([], "stick", { basicHands: ["chestback", "forwardbend"] }).deepMotionDeduction).toBe(0);
    expect(computeScore([], "stick", { basicHands: ["", "nope"] }).deepMotionDeduction).toBeCloseTo(
      DEEP_MOTION_DEDUCTION * 2,
      5,
    );
  });
});

describe("手具操作の多様性", () => {
  const op = (r: ReturnType<typeof computeScore>, id: string) =>
    r.handOpChecks.find((c) => c.key === `handOp_${id}`);

  it("チェック項目は未実施1つにつき −0.1", () => {
    const none = computeScore([], "stick");
    const one = computeScore([], "stick", { handOps: ["twoParts"] });
    expect(op(none, "twoParts")?.passed).toBe(false);
    expect(op(one, "twoParts")?.passed).toBe(true);
    expect(none.handOpDeduction - one.handOpDeduction).toBeCloseTo(HAND_OP_CHECK_DEDUCTION, 5);
  });

  it("両方チェックすれば回数ぶんだけが残る", () => {
    const r = computeScore([], "stick", { handOps: HAND_OP_CHECKS.map((c) => c.id), offBodyCount: 4 });
    expect(r.handOpDeduction).toBe(0);
    expect(op(r, "offBody")?.passed).toBe(true);
  });

  it("身体を離れる手具操作は4回必要で、不足1回につき −0.1", () => {
    [0, 1, 2, 3, 4, 5].forEach((n) => {
      const r = computeScore([], "stick", { handOps: HAND_OP_CHECKS.map((c) => c.id), offBodyCount: n });
      const short = Math.max(0, OFF_BODY_REQUIRED_COUNT - n);
      expect(r.offBodyShort).toBe(short);
      expect(r.handOpDeduction).toBeCloseTo(short * OFF_BODY_DEDUCTION_STEP, 5);
    });
  });

  it("回数は0以上の整数に丸める", () => {
    expect(offBodyShortage(-3)).toBe(OFF_BODY_REQUIRED_COUNT);
    expect(offBodyShortage(2.7)).toBe(OFF_BODY_REQUIRED_COUNT - 2);
    expect(offBodyShortage("3")).toBe(1);
    expect(offBodyShortage(undefined)).toBe(OFF_BODY_REQUIRED_COUNT);
    expect(computeScore([], "stick", { offBodyCount: -2 }).offBodyCount).toBe(0);
  });

  it("全手具で同じ判定（プロペラの代わりに全手具共通で見る）", () => {
    (["stick", "ring", "rope", "clubs"] as const).forEach((ap) => {
      const r = computeScore([], ap, { offBodyCount: 4, handOps: HAND_OP_CHECKS.map((c) => c.id) });
      expect(r.handOpDeduction).toBe(0);
      // 手具別必須要素からプロペラ回旋は外している
      expect(APPARATUS_REQUIRED_ELEMENTS[ap].some((el) => el.name.includes("プロペラ"))).toBe(false);
    });
  });
});

describe("保存データの往復", () => {
  it("基本徒手・手具操作・回数がドラフトに乗る", () => {
    const d = normalizeIndividualDraft({
      apparatus: "clubs",
      series: [],
      basicHands: ["slantfwd", "nope", ""],
      handOps: ["character", "unknown"],
      offBodyCount: "3",
    });
    expect(d?.basicHands).toEqual(["slantfwd"]);
    expect(d?.handOps).toEqual(["character"]);
    expect(d?.offBodyCount).toBe(3);
  });

  it("未指定なら空・0", () => {
    const d = normalizeIndividualDraft({ apparatus: "stick", series: [] });
    expect(d?.basicHands).toEqual([]);
    expect(d?.handOps).toEqual([]);
    expect(d?.offBodyCount).toBe(0);
  });
});

describe("単独の徒手系要素（跳躍・柔軟）", () => {
  it("跳躍は §3.6.1 の表そのままで、個人の難度を持つ", () => {
    const jumps = SOLO_HAND_ELEMENT_GROUPS.find((g) => g.id === "jump")!;
    expect(jumps.scored).toBe(true);
    expect(jumps.items).toHaveLength(12);
    expect(jumps.items.map((j) => j.id)).toEqual(HAND_ELEMENTS.filter((h) => h.group === "jump").map((j) => j.id));
    expect(soloHandDifficulty("j3")).toBe("B"); // とびあがって2回以上のひねり
    expect(soloHandDifficulty("j11")).toBe("A"); // バタフライ
    expect(soloHandDifficulty("j12")).toBe("B"); // バタフライ1回ひねり
  });

  it("柔軟は前後開脚・左右開脚・ブリッジの3つで、難度には数えない", () => {
    const flex = SOLO_HAND_ELEMENT_GROUPS.find((g) => g.id === "flex")!;
    expect(flex.scored).toBe(false);
    expect(flex.items.map((f) => f.name)).toEqual(["前後開脚", "左右開脚", "ブリッジ"]);
    flex.items.forEach((f) => expect(soloHandElementScored(f.id)).toBe(false));
  });

  it("跳躍はそのまま徒手系難度に入る", () => {
    const r = computeScore([], "stick", { handElements: ["j12"] });
    expect(r.handElementRows[0].adopted).toBe(true);
    expect(r.handElementRows[0].inTop).toBe(true);
    expect(r.handScore).toBeCloseTo(DIFF_SCORE.B, 5);
    expect(r.handElementScore).toBeCloseTo(DIFF_SCORE.B, 5);
    expect(r.dScore).toBeCloseTo(DIFF_SCORE.B, 5);
  });

  it("柔軟はD点を動かさず、実施の有無だけをA側で見る", () => {
    const none = computeScore([], "stick");
    expect(none.flexCheck.passed).toBe(false);
    expect(none.flexDeduction).toBeCloseTo(FLEX_ELEMENT_DEDUCTION, 5);

    const r = computeScore([], "stick", { handElements: ["sf_bridge", "sf_split_lr"] });
    expect(r.dScore).toBe(0);
    expect(r.handScore).toBe(0);
    expect(r.handElementRows.every((x) => !x.scored && !x.adopted)).toBe(true);
    expect(r.flexCheck.passed).toBe(true);
    expect(r.flexDeduction).toBe(0);
    expect(none.aDeduction - r.aDeduction).toBeCloseTo(FLEX_ELEMENT_DEDUCTION, 5);
  });

  it("同じ跳躍は何度実施しても1回だけ数える（§3.4.4）", () => {
    const r = computeScore([], "stick", { handElements: ["j12", "j12", "j3"] });
    expect(r.handElementRows.map((x) => x.adopted)).toEqual([true, false, true]);
    expect(r.handElementRows[1].duplicate).toBe(true);
    expect(r.handScore).toBeCloseTo(DIFF_SCORE.B * 2, 5);
  });

  it("上位3つは投げ受けの徒手ユニットと同じ枠を争う", () => {
    const throwSeries: Series = { executionDeduction: 0, items: [{ kind: "throw" }, { kind: "catch" }] };
    const base = computeScore([throwSeries, throwSeries, throwSeries], "stick");
    expect(base.handScore).toBeCloseTo(DIFF_SCORE.A, 5); // 同じ内容なので1つしか採用されない
    const withJump = computeScore([throwSeries, throwSeries, throwSeries], "stick", {
      handElements: ["j12", "j3"],
    });
    // A(投げ受け) + B + B が上位3つ
    expect(withJump.handScore).toBeCloseTo(DIFF_SCORE.A + DIFF_SCORE.B * 2, 5);
    expect(withJump.handElementScore).toBeCloseTo(DIFF_SCORE.B * 2, 5);
  });

  it("4つ以上入れても上位3つまで", () => {
    const r = computeScore([], "stick", { handElements: ["j12", "j3", "j9", "j11"] });
    expect(r.handElementRows.filter((x) => x.inTop)).toHaveLength(3);
    expect(r.handScore).toBeCloseTo(DIFF_SCORE.B * 3, 5);
  });

  it("知らないidは行にもならない", () => {
    const r = computeScore([], "stick", { handElements: ["", "nope"] });
    expect(r.handElementRows).toHaveLength(0);
    expect(r.handScore).toBe(0);
  });

  it("ドラフトを往復する（手具操作を持っていた頃の形も読める）", () => {
    const d = normalizeIndividualDraft({
      apparatus: "stick",
      series: [],
      handElements: ["j12", "nope", { id: "sf_bridge", withApparatus: true }, 3],
    });
    expect(d?.handElements).toEqual(["j12", "sf_bridge"]);
  });
});

describe("画面の説明（ツールチップ）", () => {
  it("深い運動・手具操作の各項目が説明を持つ", () => {
    DEEP_MOTION_PARTS.forEach((p) => expect(p.tip.length).toBeGreaterThan(0));
    HAND_OP_CHECKS.forEach((c) => expect(c.tip.length).toBeGreaterThan(0));
    expect(OFF_BODY_TIP.length).toBeGreaterThan(0);
  });

  it("チェック行が説明を持ち、手具の特性は手具ごとの例を含む", () => {
    (["stick", "ring", "rope", "clubs"] as const).forEach((ap) => {
      const r = computeScore([], ap);
      r.deepMotionChecks.forEach((c) => expect(c.tip).toBeTruthy());
      r.handOpChecks.forEach((c) => expect(c.tip).toBeTruthy());
      const character = r.handOpChecks.find((c) => c.key === "handOp_character")!;
      APPARATUS_CHARACTER_HINTS[ap].forEach((ex) => expect(character.tip).toContain(ex));
    });
  });

  it("手具ごとの特性の例は規則ではなく手具の性質（4手具ぶんある）", () => {
    expect(APPARATUS_CHARACTER_HINTS.stick).toEqual(["様々な位置を持てる"]);
    expect(APPARATUS_CHARACTER_HINTS.clubs).toEqual(["二つある"]);
    expect(APPARATUS_CHARACTER_HINTS.ring).toEqual(["二つある", "体にはめられる", "回せる"]);
    expect(APPARATUS_CHARACTER_HINTS.rope).toEqual(["体に巻き付けられる", "変形できる"]);
  });
});

describe("自動判定している項目はコードの内容を説明に持つ", () => {
  it("必須要素チェックが説明を持つ", () => {
    const r = computeScore([], "stick", { junior: true });
    r.required.forEach((c) => expect(c.tip, c.key).toBeTruthy());
    // ジュニアの投げ上限も説明を持つ
    expect(r.required.find((c) => c.key === "countMax")?.tip).toContain("0.3");
  });

  it("欠点テーブルのうち自動判定が絡む項目だけ説明を持つ", () => {
    const withTip = ART_DEDUCTION_ITEMS.filter((i) => i.tip).map((i) => i.id);
    expect(withTip).toEqual(["handVariety", "tumVariety", "appVariety", "appInTumbling"]);
    // 主観評価だけの項目には説明を置かない（こちらで基準を作らない）
    ["rhythm", "space", "originality", "handRatio", "volume"].forEach((id) =>
      expect(ART_DEDUCTION_ITEMS.find((i) => i.id === id)?.tip).toBeUndefined(),
    );
  });

  it("柔軟のチェックも説明を持つ", () => {
    expect(computeScore([], "stick").flexCheck.tip).toBeTruthy();
  });
});
