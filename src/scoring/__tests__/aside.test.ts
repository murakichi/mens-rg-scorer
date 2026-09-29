import { describe, it, expect } from "vitest";
import {
  APPARATUS_REQUIRED_ELEMENTS,
  DIFF_SCORE,
  HAND_ELEMENTS,
  SOLO_HAND_ELEMENT_GROUPS,
  soloHandDifficulty,
  BASIC_HAND_ELEMENTS,
  DEEP_MOTION_DEDUCTION,
  DEEP_MOTION_PARTS,
  HAND_OP_CHECKS,
  HAND_OP_CHECK_DEDUCTION,
  APPARATUS_CHARACTER_HINTS,
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

describe("単独の徒手系要素（跳躍・柔軟）— §3.5.5.3(1)", () => {
  it("跳躍は §3.6.1 の表そのままで、個人の難度を持つ", () => {
    const jumps = SOLO_HAND_ELEMENT_GROUPS.find((g) => g.id === "jump")!.items;
    expect(jumps).toHaveLength(12);
    expect(jumps.map((j) => j.id)).toEqual(HAND_ELEMENTS.filter((h) => h.group === "jump").map((j) => j.id));
    expect(soloHandDifficulty("j3")).toBe("B"); // とびあがって2回以上のひねり
    expect(soloHandDifficulty("j11")).toBe("A"); // バタフライ
    expect(soloHandDifficulty("j12")).toBe("B"); // バタフライ1回ひねり
  });

  it("柔軟は前後開脚・左右開脚・ブリッジの3つ", () => {
    const flex = SOLO_HAND_ELEMENT_GROUPS.find((g) => g.id === "flex")!.items;
    expect(flex.map((f) => f.name)).toEqual(["前後開脚", "左右開脚", "ブリッジ"]);
    flex.forEach((f) => expect(f.solo).toBe("A"));
  });

  it("手具操作を伴うものだけ徒手系難度に採用する", () => {
    const off = computeScore([], "stick", { handElements: [{ id: "j12" }] });
    expect(off.handElementRows[0].adopted).toBe(false);
    expect(off.handScore).toBe(0);

    const on = computeScore([], "stick", { handElements: [{ id: "j12", withApparatus: true }] });
    expect(on.handElementRows[0].adopted).toBe(true);
    expect(on.handElementRows[0].inTop).toBe(true);
    expect(on.handScore).toBeCloseTo(DIFF_SCORE.B, 5);
    expect(on.handElementScore).toBeCloseTo(DIFF_SCORE.B, 5);
    expect(on.dScore).toBeCloseTo(DIFF_SCORE.B, 5);
  });

  it("同じ要素は何度実施しても1回だけ数える（§3.4.4）", () => {
    const r = computeScore([], "stick", {
      handElements: [
        { id: "j12", withApparatus: true },
        { id: "j12", withApparatus: true },
        { id: "j3", withApparatus: true },
      ],
    });
    expect(r.handElementRows.map((x) => x.adopted)).toEqual([true, false, true]);
    expect(r.handElementRows[1].duplicate).toBe(true);
    expect(r.handScore).toBeCloseTo(DIFF_SCORE.B * 2, 5);
  });

  it("上位3つは投げ受けの徒手ユニットと同じ枠を争う", () => {
    // 投げ→キャッチ（徒手0動作＝A）だけの3シリーズ
    const throwSeries: Series = { executionDeduction: 0, items: [{ kind: "throw" }, { kind: "catch" }] };
    const base = computeScore([throwSeries, throwSeries, throwSeries], "stick");
    expect(base.handScore).toBeCloseTo(DIFF_SCORE.A, 5); // 同じ内容なので1つしか採用されない
    const withJump = computeScore([throwSeries, throwSeries, throwSeries], "stick", {
      handElements: [
        { id: "j12", withApparatus: true },
        { id: "j3", withApparatus: true },
      ],
    });
    // A(投げ受け) + B + B が上位3つ
    expect(withJump.handScore).toBeCloseTo(DIFF_SCORE.A + DIFF_SCORE.B * 2, 5);
    expect(withJump.handElementScore).toBeCloseTo(DIFF_SCORE.B * 2, 5);
  });

  it("4つ以上入れても上位3つまで", () => {
    const r = computeScore([], "stick", {
      handElements: ["j12", "j3", "j9", "j11"].map((id) => ({ id, withApparatus: true })),
    });
    expect(r.handElementRows.filter((x) => x.inTop)).toHaveLength(3);
    expect(r.handScore).toBeCloseTo(DIFF_SCORE.B * 3, 5);
  });

  it("知らないidは行にもならない", () => {
    const r = computeScore([], "stick", { handElements: [{ id: "", withApparatus: true }, { id: "nope" }] });
    expect(r.handElementRows).toHaveLength(0);
    expect(r.handScore).toBe(0);
  });

  it("ドラフトを往復する", () => {
    const d = normalizeIndividualDraft({
      apparatus: "stick",
      series: [],
      handElements: [{ id: "j12", withApparatus: true }, { id: "nope" }, { id: "sf_bridge" }, "x"],
    });
    expect(d?.handElements).toEqual([
      { id: "j12", withApparatus: true },
      { id: "sf_bridge", withApparatus: false },
    ]);
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
