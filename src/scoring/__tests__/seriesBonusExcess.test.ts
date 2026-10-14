import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { seriesBonusExcess } from "../generateEvaluate";
import type { Series } from "../types";

const S = (...items: Series["items"]): Series => ({ executionDeduction: 0, items });

describe("1シリーズの中の加点は少ないほうを優先（評価）", () => {
  it("加点が1つ以下のシリーズは数えない", () => {
    const none = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(seriesBonusExcess(none)).toBe(0);
    const one = computeScore([S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" })], "stick");
    expect(seriesBonusExcess(one)).toBe(0);
  });

  it("2つ目の加点から1つにつき1と数える", () => {
    const two = computeScore([S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] })], "stick");
    expect(seriesBonusExcess(two)).toBe(1);
    const three = computeScore(
      [S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, { kind: "catch", catchTypes: ["noview"] })],
      "stick",
    );
    expect(seriesBonusExcess(three)).toBe(2);
  });

  it("シリーズをまたいで足さない（別々のシリーズに1つずつなら0）", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }),
      ],
      "stick",
    );
    expect(seriesBonusExcess(r)).toBe(0);
  });
});
