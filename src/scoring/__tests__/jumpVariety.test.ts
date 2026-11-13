import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { normalizeRopeJumps } from "../draft";
import type { RopeJumpItem } from "../types";

const J = (jumpId: string, extra: Partial<RopeJumpItem> = {}): RopeJumpItem => ({ kind: "ropeJump", jumpId, ...extra });
const bonus = (...groups: RopeJumpItem[][]) => computeScore([], "rope", { ropeJumps: groups }).jumpVarietyBonus;

// §3.5.5.5(4) 様々な跳びに対する加点（最大0.10）
describe("様々な跳び ② 3重跳び連続3回で形がすべて違う", () => {
  it("伸身・抱え込み・開脚の3重跳びを続けて跳ぶと加点", () => {
    expect(bonus([J("3b", { shape: "layout" }), J("3b", { shape: "tuck" }), J("3f", { shape: "straddle" })])).toBeCloseTo(0.1, 5);
  });

  it("クロスも形の違いとして数える（ふつう・クロス・伸身）", () => {
    expect(bonus([J("3b"), J("3b", { cross: true }), J("3b", { shape: "layout" })])).toBeCloseTo(0.1, 5);
  });

  it("同じ形が混じる・回数で3回にしただけでは加点しない", () => {
    expect(bonus([J("3b", { shape: "layout" }), J("3b", { shape: "tuck" }), J("3b", { shape: "layout" })])).toBe(0);
    expect(bonus([J("3b", { shape: "layout", count: 3 })])).toBe(0);
  });

  it("間に3重以外の跳びが入る・跳びシリーズが分かれると連続にならない", () => {
    expect(bonus([J("3b", { shape: "layout" }), J("2b"), J("3b", { shape: "tuck" }), J("3b", { shape: "straddle" })])).toBe(0);
    expect(bonus([J("3b", { shape: "layout" }), J("3b", { shape: "tuck" })], [J("3b", { shape: "straddle" })])).toBe(0);
  });

  it("長い並びの途中の3回でもよい", () => {
    expect(bonus([J("3b", { shape: "layout", count: 2 }), J("3b", { shape: "tuck" }), J("3b", { shape: "pike" })])).toBeCloseTo(0.1, 5);
  });

  it("体の形は難度に効かない", () => {
    const a = computeScore([], "rope", { ropeJumps: [[J("3b", { shape: "layout" })]] });
    const b = computeScore([], "rope", { ropeJumps: [[J("3b")]] });
    expect(a.handScore).toBeCloseTo(b.handScore, 5);
  });
});

describe("様々な跳び ③ その場で体が2回転", () => {
  it("2重跳び以上で体が2回転すれば加点", () => {
    expect(bonus([J("2b", { spinTwice: true })])).toBeCloseTo(0.1, 5);
    expect(bonus([J("3f", { spinTwice: true })])).toBeCloseTo(0.1, 5);
  });

  it("1重跳び・移動しながらでは加点しない", () => {
    expect(bonus([J("1f", { spinTwice: true })])).toBe(0);
    expect(bonus([J("2b", { spinTwice: true, isMoving6m: true })])).toBe(0);
  });

  it("①②③が重なっても0.10まで", () => {
    expect(
      bonus(
        [J("2b", { spinTwice: true })],
        [J("3b", { shape: "layout" }), J("3b", { shape: "tuck" }), J("3b", { shape: "straddle" })],
      ),
    ).toBeCloseTo(0.1, 5);
  });

  it("ロープ以外では採点しない", () => {
    expect(computeScore([], "stick", { ropeJumps: [[J("2b", { spinTwice: true })]] }).jumpVarietyBonus).toBe(0);
  });
});

describe("保存データの往復", () => {
  it("体の形と体の2回転を読み込む（知らない形は落とす）", () => {
    const [g] = normalizeRopeJumps([[{ kind: "ropeJump", jumpId: "3b", shape: "tuck", spinTwice: true }, { kind: "ropeJump", jumpId: "3b", shape: "??" }]]);
    expect(g[0]).toMatchObject({ shape: "tuck", spinTwice: true });
    expect(g[1].shape).toBeUndefined();
  });
});

// 隣り合う3重跳びは1つの連続として難度を評価する（オーナー確認）。
// 形を変えて1行ずつ入れても「3回以上の連続した3重跳び＝D」が失われない。
describe("隣り合う3重跳びはまとめて1つの連続", () => {
  const rows = (...jumps: RopeJumpItem[]) => computeScore([], "rope", { ropeJumps: [jumps] });

  it("形を変えた3重跳び3回は、×3と同じくD 1つ", () => {
    const split = rows(J("3b", { shape: "layout" }), J("3b", { shape: "tuck" }), J("3b", { cross: true }));
    const merged = rows(J("3b", { count: 3 }));
    expect(split.handScore).toBeCloseTo(merged.handScore, 5);
    expect(split.handScore).toBeCloseTo(0.5, 5);
    expect(split.ropeJumpRows[0].label).toBe("3重跳びの連続×3");
    expect(split.ropeJumpRows.slice(1).every((x) => x.runHead === 0 && !x.adopted)).toBe(true);
    // 様々な跳び②も付く
    expect(split.jumpVarietyBonus).toBeCloseTo(0.1, 5);
  });

  it("2回の連続は前後で難度が違う（後ろD・前C、前後が混じれば前回し側）", () => {
    expect(rows(J("3b"), J("3b", { shape: "tuck" })).handScore).toBeCloseTo(0.5, 5);
    expect(rows(J("3f"), J("3f", { shape: "tuck" })).handScore).toBeCloseTo(0.3, 5);
    expect(rows(J("3b"), J("3f")).handScore).toBeCloseTo(0.3, 5);
  });

  it("3重以外の跳びが間に入れば別々の跳び", () => {
    const r = rows(J("3b"), J("2b"), J("3b", { cross: true }));
    expect(r.ropeJumpRows.every((x) => x.runHead === undefined)).toBe(true);
    // 後ろ3重 C ＋ 後ろ2重 B ＋ 後ろ3重クロス D
    expect(r.handScore).toBeCloseTo(0.3 + 0.2 + 0.5, 5);
  });
});
