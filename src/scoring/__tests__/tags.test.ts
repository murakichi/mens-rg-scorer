import { describe, it, expect } from "vitest";
import { SERIES_TAGS, seriesTags } from "../analysis";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });

describe("シリーズのタグ（自動判定）", () => {
  it("タグは 投げ・投げタン・三宙・つなぎ の4種類", () => {
    expect(SERIES_TAGS.map((t) => t.name)).toEqual(["投げ", "投げタン", "三宙", "つなぎ"]);
  });

  it("投げ受けがあれば「投げ」", () => {
    expect(seriesTags(S({ kind: "throw" }, { kind: "motion", motionId: "chene" }, { kind: "catch" }))).toEqual(["throw"]);
  });

  it("投げ受けの間に技があれば「投げタン」も付く", () => {
    expect(seriesTags(S({ kind: "throw" }, skill("b_front"), { kind: "catch" }))).toEqual(["throw", "throwTum"]);
  });

  it("宙返り3回連続で「三宙」", () => {
    const three = S(skill("b_backsalto"), skill("b_backsalto"), skill("b_backsalto"), { kind: "catch" });
    expect(seriesTags(three)).toContain("salto3");
    const two = S(skill("b_backsalto"), skill("b_backsalto"), { kind: "catch" });
    expect(seriesTags(two)).not.toContain("salto3");
  });

  it("宙返りの間にA難度を挟むと「つなぎ」", () => {
    const ser = S(skill("b_backsalto"), skill("a_flicflac"), skill("b_backsalto"), { kind: "catch" });
    expect(seriesTags(ser)).toContain("connect");
  });

  it("何もなければタグなし", () => {
    expect(seriesTags(S(skill("b_front"), { kind: "catch" }))).toEqual([]);
    expect(seriesTags(S())).toEqual([]);
  });

  it("ジュニア難度でも判定は変わらない（内容で決まる）", () => {
    const ser = S({ kind: "throw" }, skill("b_divefront"), { kind: "catch" });
    expect(seriesTags(ser, true)).toEqual(seriesTags(ser, false));
  });
});
