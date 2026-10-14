import { describe, it, expect } from "vitest";
import { duplicateSeriesAt } from "./seriesEdit";
import { computeScore } from "../scoring/score";
import type { Item, Series } from "../scoring/types";

const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });

const ser = (over: Partial<Series> = {}): Series => ({
  executionDeduction: 0,
  items: [skill("a_roundoff"), skill("b_backsalto")],
  ...over,
});

describe("シリーズの複製", () => {
  it("直後に挿す（他のシリーズの並びは変えない）", () => {
    const list = [ser(), ser({ items: [skill("b_front")] }), ser({ items: [skill("b_backsalto")] })];
    const next = duplicateSeriesAt(list, 1);
    expect(next).toHaveLength(4);
    expect(next[0]).toEqual(list[0]);
    expect(next[3]).toEqual(list[2]);
    // 1 と 2 が同じ構成
    expect(next[2].items).toEqual(next[1].items);
  });

  it("先頭・末尾でも正しい位置に入る", () => {
    const list = [ser({ items: [skill("b_front")] }), ser({ items: [skill("b_backsalto")] })];
    expect(duplicateSeriesAt(list, 0).map((s) => (s.items[0] as { skillId: string }).skillId)).toEqual([
      "b_front",
      "b_front",
      "b_backsalto",
    ]);
    expect(duplicateSeriesAt(list, 1).map((s) => (s.items[0] as { skillId: string }).skillId)).toEqual([
      "b_front",
      "b_backsalto",
      "b_backsalto",
    ]);
  });

  it("実施減点は引き継がない（採点ごとの入力なので）", () => {
    const next = duplicateSeriesAt([ser({ executionDeduction: 0.4 })], 0);
    expect(next[0].executionDeduction).toBe(0.4); // 元はそのまま
    expect(next[1].executionDeduction).toBe(0);
  });

  it("「別内容」の宣言は引き継がない（コピー直後は文字どおり同一内容）", () => {
    const next = duplicateSeriesAt([ser({ notDuplicate: true })], 0);
    expect(next[0].notDuplicate).toBe(true);
    expect(next[1].notDuplicate).toBeUndefined();
  });

  it("中身までコピーされる（元をいじってもコピーは変わらない）", () => {
    const list = [ser()];
    const next = duplicateSeriesAt(list, 0);
    next[0].items[0] = skill("b_front");
    expect((next[1].items[0] as { skillId: string }).skillId).toBe("a_roundoff");
  });

  it("範囲外の添字なら何もしない", () => {
    const list = [ser()];
    expect(duplicateSeriesAt(list, 5)).toBe(list);
    expect(duplicateSeriesAt(list, -1)).toBe(list);
    expect(duplicateSeriesAt([], 0)).toEqual([]);
  });
});

describe("複製した直後の採点", () => {
  /** 投げ→シェネ→キャッチ（Dに乗るシリーズ） */
  const throwSeries = (): Series => ({
    executionDeduction: 0,
    items: [
      { kind: "throw", throwTypes: [], reqTypes: [] },
      { kind: "motion", motionId: "chene", count: 2 },
      { kind: "catch", catchTypes: [] },
    ],
  });

  it("複製直後は重複扱いになり、Dは増えない（§3.4.4）", () => {
    const one = [throwSeries()];
    const two = duplicateSeriesAt(one, 0);
    const before = computeScore(one, "stick", {});
    const after = computeScore(two, "stick", {});
    // 同じ内容が2本あっても難度は1本ぶんしか数えない
    expect(after.dupSignatureFlags[1]).toBe(true);
    expect(after.tumblingScore + after.handScore).toBe(before.tumblingScore + before.handScore);
  });

  it("編集して差が付けば重複が解ける", () => {
    const two = duplicateSeriesAt([throwSeries()], 0);
    expect(computeScore(two, "stick", {}).dupSignatureFlags[1]).toBe(true);
    // コピーのほうのシェネの回数を変える＝別の構成になる
    const edited = structuredClone(two);
    (edited[1].items[1] as { count: number }).count = 4;
    expect(computeScore(edited, "stick", {}).dupSignatureFlags[1]).toBe(false);
  });
});
