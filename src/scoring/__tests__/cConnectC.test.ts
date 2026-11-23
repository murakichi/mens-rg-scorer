import { describe, it, expect } from "vitest";
import { calcTumblingDifficulty, isCConnectC } from "../analysis";
import { computeScore } from "../score";

// C難度→つなぎ技→C難度 は例外的にD難度（オーナー 2026-11-21。この並びだけ）
describe("C→つなぎ→C はD難度", () => {
  it("C→ロンダート→C はD（計算式ではEになるところ）", () => {
    expect(calcTumblingDifficulty(["a_roundoff", "c_backlay15", "a_roundoff", "c_back15"], false)).toBe("D");
    expect(calcTumblingDifficulty(["c_front1full", "a_roundoff", "c_backlay1full"], false)).toBe("D");
    expect(isCConnectC(["a_roundoff", "c_backlay15", "a_roundoff", "c_back15"])).toBe(true);
  });

  it("この並び以外は計算式どおり", () => {
    // つなぎなしの C→C は E
    expect(calcTumblingDifficulty(["a_roundoff", "c_backlay1full", "c_back15"], false)).toBe("E");
    // D→つなぎ→C は E（規則の検算例）
    expect(calcTumblingDifficulty(["a_roundoff", "d_backlay25", "a_roundoff", "c_back15"], false)).toBe("E");
    // C→つなぎ→C→B は C・C の2つだけではないので計算式どおり（E）
    expect(calcTumblingDifficulty(["a_roundoff", "c_backlay15", "a_roundoff", "c_back15", "b_front"], false)).toBe("E");
    expect(isCConnectC(["a_roundoff", "c_backlay1full", "c_back15"])).toBe(false);
  });

  it("投げを含む（投げタン）なら D に +1 で E", () => {
    expect(calcTumblingDifficulty(["c_front1full", "a_roundoff", "c_backlay1full"], true)).toBe("E");
  });

  it("採点：タンブリング難度点は D の 0.5", () => {
    const sk = (skillId: string) => ({ kind: "skill" as const, skillId });
    const r = computeScore([{ items: [sk("a_roundoff"), sk("c_backlay15"), sk("a_roundoff"), sk("c_back15")] }], "stick");
    expect(r.tumblingScore).toBeCloseTo(0.5, 5);
  });
});

describe("団体も C→つなぎ→C はD難度（2026-11-21）", () => {
  it("塊の難度が D（5人同時同技の格上げはその上に別に掛かる）", async () => {
    const { computeTeamScore, emptySeries } = await import("../team");
    const chunkDiff = (ids: string[]) => {
      const ser = emptySeries(ids.length);
      ser.mode = "allTogether";
      ser.lanes = [ids.map((id) => ({ type: "skill" as const, skillId: id }))];
      return computeTeamScore({ series: [ser] } as never).analysis[0].lanes[0][0].diff;
    };
    expect(chunkDiff(["a_roundoff", "c_backlay15", "a_roundoff", "c_back15"])).toBe("D");
    // つなぎなしの C→C は E のまま
    expect(chunkDiff(["a_roundoff", "c_backlay1full", "c_back15"])).toBe("E");
  });
});
