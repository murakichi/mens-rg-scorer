import { describe, it, expect } from "vitest";
import {
  calcTumblingDifficulty,
  calcHandDifficulty,
  maxSaltoChain,
  hasConnect,
  hasConnectWithoutApparatus,
  analyzeSeries,
  seriesSignature,
} from "../analysis";
import type { Series, Item } from "../types";

// テストヘルパー：items から Series を組む
const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });

describe("calcTumblingDifficulty", () => {
  it("単一の非A技はその難度を返す", () => {
    expect(calcTumblingDifficulty(["b_backsalto"], false)).toBe("B");
  });
  it("2技目以降は (難度-1) を加算して格上げする", () => {
    // B(2) + (B-1=1) = 3 → C
    expect(calcTumblingDifficulty(["b_backsalto", "b_front"], false)).toBe("C");
  });
  it("投げを含むと +1 される", () => {
    // B(2) + 1(投げ) = 3 → C
    expect(calcTumblingDifficulty(["b_backsalto"], true)).toBe("C");
  });
  it("A難度技は難度算出から除外される（先頭でも無視）", () => {
    expect(calcTumblingDifficulty(["a_cartwheel", "b_backsalto"], false)).toBe("B");
  });
  it("非A技が無ければ null", () => {
    expect(calcTumblingDifficulty(["a_cartwheel", "a_roundoff"], false)).toBeNull();
  });
  it("E難度で頭打ち（上限超過しない）", () => {
    // E(5) + (B-1=1) = 6 → min(6,5)=5 → E
    expect(calcTumblingDifficulty(["e_doublelay", "b_backsalto"], false)).toBe("E");
  });
});

describe("calcHandDifficulty", () => {
  it("縦3動作は無条件で E", () => {
    expect(calcHandDifficulty(0, true)).toBe("E");
  });
  it("動作数を A 起点で加算する", () => {
    expect(calcHandDifficulty(0, false)).toBe("A");
    expect(calcHandDifficulty(3, false)).toBe("D");
    expect(calcHandDifficulty(4, false)).toBe("E");
  });
  it("上限 E で頭打ち", () => {
    expect(calcHandDifficulty(9, false)).toBe("E");
  });
});

describe("maxSaltoChain", () => {
  it("連続する宙返りの最大数を返す（非宙返りでリセット）", () => {
    expect(maxSaltoChain(["b_backsalto", "b_front", "a_cartwheel", "b_backsalto"])).toBe(2);
  });
  it("宙返りが無ければ 0", () => {
    expect(maxSaltoChain(["a_cartwheel", "a_roundoff"])).toBe(0);
  });
});

describe("hasConnect / hasConnectWithoutApparatus", () => {
  const skills = (...ids: string[]) => ids.map((skillId) => ({ skillId, hasApparatus: true, isThrow: false }));

  it("宙返り→A難度→宙返り の並びを検出する", () => {
    expect(hasConnect(skills("b_backsalto", "a_cartwheel", "b_front"))).toBe(true);
  });
  it("A難度が挟まれていなければ false", () => {
    expect(hasConnect(skills("b_backsalto", "b_front"))).toBe(false);
  });
  it("つなぎ技のA難度に手具操作が無いと検出する", () => {
    const s = [
      { skillId: "b_backsalto", hasApparatus: true, isThrow: false },
      { skillId: "a_cartwheel", hasApparatus: false, isThrow: false },
      { skillId: "b_front", hasApparatus: true, isThrow: false },
    ];
    expect(hasConnectWithoutApparatus(s)).toBe(true);
  });
});

describe("analyzeSeries", () => {
  it("投げなしの技列は tumbling ユニットになる", () => {
    const a = analyzeSeries(S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].type).toBe("tumbling");
    expect(a.units[0].finalDiff).toBe("B");
    expect(a.throwCount).toBe(0);
  });
  it("投げ+受けは throw ユニットになり throwCount が増える", () => {
    const a = analyzeSeries(S({ kind: "throw" }, { kind: "catch" }));
    expect(a.units).toHaveLength(1);
    expect(a.units[0].type).toBe("throw");
    expect(a.throwCount).toBe(1);
  });
  it("技を含む投げユニットは投げタン（isThrowTumbling）になる", () => {
    const a = analyzeSeries(
      S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" }),
    );
    expect(a.units[0].type).toBe("throw");
    expect(a.units[0].isThrowTumbling).toBe(true);
    expect(a.throwCount).toBe(1);
  });
  it("ロープ跳びは最高難度の独立ユニットを追加する", () => {
    const a = analyzeSeries(S({ kind: "ropeJump", jumpId: "3bc" }, { kind: "ropeJump", jumpId: "1f" }));
    // 3bc = D, 1f = A → 最高の D が採用
    expect(a.units).toHaveLength(1);
    expect(a.units[0].finalDiff).toBe("D");
  });
});

describe("seriesSignature", () => {
  it("投げタグの順序に依存しない（ソートで正規化）", () => {
    const s1 = S({ kind: "throw", throwTypes: ["noview", "nonhand"] }, { kind: "catch" });
    const s2 = S({ kind: "throw", throwTypes: ["nonhand", "noview"] }, { kind: "catch" });
    expect(seriesSignature(s1)).toBe(seriesSignature(s2));
  });
  it("構成が異なれば別シグネチャ", () => {
    const s1 = S({ kind: "skill", skillId: "b_backsalto" }, { kind: "catch" });
    const s2 = S({ kind: "skill", skillId: "b_front" }, { kind: "catch" });
    expect(seriesSignature(s1)).not.toBe(seriesSignature(s2));
  });
});
