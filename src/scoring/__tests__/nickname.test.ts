import { describe, expect, it } from "vitest";
import { seriesNickname } from "../nickname";
import type { Item, Series } from "../types";

const sk = (skillId: string, extra: Partial<Item> = {}): Item => ({ kind: "skill", skillId, ...extra }) as Item;
const ser = (...items: Item[]): Series => ({ items }) as unknown as Series;

describe("seriesNickname", () => {
  it("ロンダート→バク転 = ロンダーバック", () => {
    expect(seriesNickname(ser(sk("a_roundoff"), sk("a_flicflac")))).toBe("ロンダーバック");
  });
  it("ロンダート→後方宙返り = ロン宙", () => {
    expect(seriesNickname(ser(sk("a_roundoff"), sk("b_backsalto")))).toBe("ロン宙");
  });
  it("ロンダート→1回半→前宙（投げ）= 1回半前宙投げ", () => {
    expect(seriesNickname(ser(sk("a_roundoff"), sk("c_back15"), sk("b_front", { isThrow: true })))).toBe("1回半前宙投げ");
  });
  it("ロンダート→1回半→ロンダート→ダイビング前宙 = 1回半つなぎダイビング前宙", () => {
    expect(seriesNickname(ser(sk("a_roundoff"), sk("c_back15"), sk("a_roundoff"), sk("b_divefront")))).toBe("1回半つなぎダイビング前宙");
  });
  it("後方伸身1回ひねり→前宙 = 伸身1回ひねり切り返し", () => {
    expect(seriesNickname(ser(sk("c_backlay1full"), sk("b_front")))).toBe("伸身1回ひねり切り返し");
  });
  it("切り返しの後に前宙以外が来る／前宙の後に技が続く", () => {
    expect(seriesNickname(ser(sk("c_backlay1full"), sk("b_fronthalf")))).toBe("伸身1回ひねり切り返し半");
    expect(seriesNickname(ser(sk("c_backlay1full"), sk("b_tenchu")))).toBe("伸身1回ひねり切り返し転宙");
    expect(seriesNickname(ser(sk("c_backlay1full"), sk("b_front"), sk("b_kirimomi")))).toBe("伸身1回ひねり切り返しきりもみ");
    expect(seriesNickname(ser(sk("c_backlay1full"), sk("b_front"), sk("b_front")))).toBe("伸身1回ひねり切り返し前宙");
  });
  it("ひねり無し・ハーフからの切り返し", () => {
    expect(seriesNickname(ser(sk("b_backlayout"), sk("b_front")))).toBe("スワン切り返し");
    expect(seriesNickname(ser(sk("b_backlayhalf"), sk("b_front")))).toBe("ハーフ切り返し");
    expect(seriesNickname(ser(sk("c_back15"), sk("b_front")))).toBe("1回半ひねり切り返し");
  });
  it("伸身系の略し方とひねり", () => {
    expect(seriesNickname(ser(sk("b_backlayout")))).toBe("スワン");
    expect(seriesNickname(ser(sk("b_backlayhalf")))).toBe("ハーフ");
    expect(seriesNickname(ser(sk("d_backlay2twist")))).toBe("伸身2回");
    expect(seriesNickname(ser(sk("c_back1full")))).toBe("1回");
    expect(seriesNickname(ser(sk("c_front1full")))).toBe("1回");
  });
  it("投げ・キャッチ", () => {
    const m = { kind: "motion", motionId: "chene", count: 3 } as Item;
    const fr = { kind: "motion", motionId: "a_frontroll" } as Item;
    expect(seriesNickname(ser({ kind: "throw" }, m, fr, { kind: "catch" }))).toBe("投げ3シェネとび前転");
    expect(seriesNickname(ser({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview", "useapp"] }))).toBe("背面投げ背面手具キャッチ");
    expect(seriesNickname(ser({ kind: "throw", throwTypes: ["useapp"] }, sk("b_tempo"), { kind: "catch" }))).toBe("手具投げテンポ");
  });
});
