import { describe, it, expect } from "vitest";
import { calcTumblingDifficulty } from "../analysis";
import { computeScore } from "../score";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const sk = (skillId: string, extra: Partial<Item> = {}): Item => ({ kind: "skill", skillId, ...extra }) as Item;

// オーナー 2026-11-23：B難度のみの連続は4回以上繰り返してもD
describe("B難度だけの連続はD止まり", () => {
  it("B×2＝C、B×3＝D、B×4・B×5もD", () => {
    expect(calcTumblingDifficulty(["b_front", "b_front"], false)).toBe("C");
    expect(calcTumblingDifficulty(["b_front", "b_front", "b_front"], false)).toBe("D");
    expect(calcTumblingDifficulty(["b_backsalto", "b_tempo", "b_tempo", "b_backsalto"], false)).toBe("D");
    expect(calcTumblingDifficulty(Array(5).fill("b_tempo"), false)).toBe("D");
  });

  it("A難度を挟んでもBだけならD止まり（A難度は数えない）", () => {
    expect(calcTumblingDifficulty(["b_backsalto", "a_roundoff", "b_backsalto", "b_tempo", "b_backsalto"], false)).toBe("D");
  });

  it("C以上が1つでも入れば従来どおり加算する", () => {
    expect(calcTumblingDifficulty(["c_back15", "b_tempo", "b_tempo", "b_backsalto"], false)).toBe("E");
    expect(calcTumblingDifficulty(["b_tempo", "b_tempo", "b_tempo", "c_back15"], false)).toBe("E");
  });

  it("投げの+1は頭打ちのあとに足す（B×4の投げタンはE、B×3の投げタンもE）", () => {
    expect(calcTumblingDifficulty(Array(4).fill("b_tempo"), true)).toBe("E");
    expect(calcTumblingDifficulty(Array(2).fill("b_tempo"), true)).toBe("D");
  });
});

describe("全く同じ形の投げタンは難度に1回だけ（§3.4.4）", () => {
  it("同じ技の並びの投げタンを2本入れると、2本目は難度に採用しない", () => {
    const tt = () => S({ kind: "throw" }, sk("a_roundoff"), sk("b_backsalto"), sk("b_tempo"), { kind: "catch" });
    const one = computeScore([tt()], "stick");
    // シリーズごと同じなら重複シリーズ（難度に何も足さない）
    expect(computeScore([tt(), tt()], "stick").tumblingScore).toBeCloseTo(one.tumblingScore, 5);
    // シリーズの他の部分が違っても、同じ形の投げタンは2本目を採用しない
    const other = S({ kind: "motion", motionId: "chene", count: 1 }, ...tt().items);
    const two = computeScore([tt(), other], "stick");
    expect(two.tumblingScore).toBeCloseTo(one.tumblingScore, 5);
    expect(two.unitAdopted[1].some((a) => a === false)).toBe(true);
    // 「重複ではない」と宣言したシリーズは別の実施として数える（入力で表せない違いがあるとき）
    expect(computeScore([tt(), { ...other, notDuplicate: true }], "stick").tumblingScore).toBeGreaterThan(one.tumblingScore);
  });

  it("投げ方・受け方だけが違っても同じ形とみなす（投げタンの署名は技の並び）", () => {
    const a = S({ kind: "throw" }, sk("b_front"), sk("b_front"), { kind: "catch" });
    const b = S({ kind: "throw", throwTypes: ["noview"] }, sk("b_front"), sk("b_front"), { kind: "catch", catchTypes: ["noview"] });
    const r = computeScore([a, b], "clubs");
    expect(computeScore([a], "clubs").tumblingScore).toBeCloseTo(r.tumblingScore, 5);
  });
});
