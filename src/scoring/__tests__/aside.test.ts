import { describe, it, expect } from "vitest";
import {
  APPARATUS_REQUIRED_ELEMENTS,
  BASIC_HAND_ELEMENTS,
  DEEP_MOTION_DEDUCTION,
  DEEP_MOTION_PARTS,
  HAND_OP_CHECKS,
  HAND_OP_CHECK_DEDUCTION,
  OFF_BODY_DEDUCTION_STEP,
  OFF_BODY_REQUIRED_COUNT,
  deepMotionParts,
  offBodyShortage,
} from "../constants";
import { computeScore } from "../score";
import { normalizeIndividualDraft } from "../draft";

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
