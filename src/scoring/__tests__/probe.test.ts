import { describe, it, expect } from "vitest";
import { describeText, itemText, matchesChain, parseQuery, probe, seededRandom, verdict } from "../probe";
import type { Series } from "../types";

const series = (items: Series["items"]): Series => ({ items } as Series);

describe("probe（○○は生成される？の確認）", () => {
  it("検索語は →／->／> で連鎖に分かれる", () => {
    expect(parseQuery("前宙→きりもみ転回")).toEqual(["前宙", "きりもみ転回"]);
    expect(parseQuery(" 前宙 > 側宙 ")).toEqual(["前宙", "側宙"]);
    expect(parseQuery("前宙")).toEqual(["前宙"]);
  });

  it("技の最中の投げ・タグも検索対象で、連鎖は隣り合う順だけ当たる", () => {
    const s = series([
      { kind: "throw", reqTypes: ["twothrow"] },
      { kind: "skill", skillId: "a_roundoff", isThrow: true },
      { kind: "catch" },
    ] as Series["items"]);
    expect(itemText(s.items[0])).toBe("投げ[twothrow]");
    expect(matchesChain(s, ["twothrow"])).toBe(true);
    expect(matchesChain(s, ["ロンダート(投げ)"])).toBe(true);
    expect(matchesChain(s, ["投げ", "ロンダート", "キャッチ"])).toBe(true);
    expect(matchesChain(s, ["ロンダート", "投げ[twothrow]"])).toBe(false);
    expect(matchesChain(s, ["キャッチ", "投げ"])).toBe(false);
    expect(describeText(s)).toContain("→");
  });

  it("シリーズ全体の指定（exact）と * は、長さと端が合うときだけ当たる", () => {
    const s = series([
      { kind: "throw" },
      { kind: "motion", motionId: "chene", count: 3 },
      { kind: "catch" },
    ] as Series["items"]);
    expect(matchesChain(s, ["投げ", "シェネ×3", "キャッチ"], true)).toBe(true);
    expect(matchesChain(s, ["投げ", "*", "キャッチ"], true)).toBe(true);
    expect(matchesChain(s, ["投げ", "シェネ×3"], true)).toBe(false);
    expect(matchesChain(s, ["投げ", "シェネ×3"])).toBe(true);
    expect(matchesChain(s, ["投げ", "シェネ×2", "キャッチ"], true)).toBe(false);
  });

  it("同じ種なら同じ結果になる", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("候補と生成を数え、候補にある形は『出る』か『評価で負け』に分かれる", () => {
    const [row] = probe({
      query: "投げ",
      apparatuses: ["stick"],
      maxScores: [null],
      rarities: [50],
      runs: 1,
      seed: 1,
    });
    expect(row.candidates).toBeGreaterThan(0);
    expect(row.candidateHits).toBeGreaterThan(0);
    expect(row.routineHits).toBeLessThanOrEqual(row.routines);
    expect(verdict(row)).not.toContain("候補にない");
    expect(
      verdict({ ...row, candidateHits: 0, routineHits: 0 }),
    ).toContain("候補にない");
  });
});
