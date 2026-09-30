import { describe, expect, it } from "vitest";
import { autoInputSuggestions } from "../autoInput";
import type { Item, Series } from "../types";

const sk = (skillId: string, extra: Partial<Item> = {}): Item =>
  ({ kind: "skill", skillId, hasApparatus: false, isThrow: false, ...extra }) as Item;
const th: Item = { kind: "throw", throwTypes: [], reqTypes: [] };
const ct: Item = { kind: "catch", catchTypes: [], catchTwo: false };
const mo = (motionId: string, count?: number): Item => ({ kind: "motion", motionId, count });
const ser = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const ids = (list: Series[], i = 0) => autoInputSuggestions(list, i).map((s) => s.id);
const labels = (list: Series[], i = 0) => autoInputSuggestions(list, i).map((s) => s.label);

describe("自動入力", () => {
  it("投げ→伸身前方宙返り1回ひねり → 前転→キャッチ", () => {
    expect(labels([ser(th, sk("d_frontlay1"))])).toEqual(["前転→キャッチ"]);
    // 投げが前に無ければ出ない
    expect(ids([ser(sk("d_frontlay1"))])).toEqual([]);
  });

  it("宙返り中に投げを選ぶと 前転→キャッチ", () => {
    expect(labels([ser(sk("b_front", { isThrow: true }))])).toEqual(["前転→キャッチ"]);
  });

  it("投げ→徒手3動作以上 → キャッチ→背面投げ→背面キャッチ（シェネ×2→前転でも）", () => {
    const s = ser(th, mo("chene", 2), mo("fwd_roll"));
    const [g] = autoInputSuggestions([s], 0);
    expect(g.label).toBe("キャッチ→投げ→キャッチ");
    expect(g.items[1]).toMatchObject({ kind: "throw", throwTypes: ["noview"] });
    expect(g.items[2]).toMatchObject({ kind: "catch", catchTypes: ["noview"] });
    expect(ids([ser(th, mo("chene", 2))])).toEqual([]);
    expect(ids([ser(th, mo("chene", 3))])).toEqual(["throwHand-catchThrowBack"]);
  });

  it("二つ投げの徒手3動作は2つ同時キャッチで受ける", () => {
    const two: Item = { kind: "throw", throwTypes: [], reqTypes: ["twothrow"] };
    const [g] = autoInputSuggestions([ser(two, mo("chene", 3))], 0);
    expect(g.items[0]).toMatchObject({ kind: "catch", catchTwo: true });
  });

  it("ロンダート→前向きに降りる宙返り：つなぎ未達成ならロンダート、三宙未達成なら 前宙→側宙／前方1回ひねり→側宙", () => {
    const s = ser(sk("a_roundoff"), sk("b_backhalf"));
    expect(labels([s])).toEqual(["ロンダート", "前宙→側宙", "前方宙返り1回ひねり→側宙"]);
  });

  it("後ろ向きに降りる宙返りでは出ない", () => {
    expect(ids([ser(sk("a_roundoff"), sk("b_backsalto"))])).toEqual([]);
  });

  it("つなぎ達成済みならロンダートは出さない", () => {
    const done = ser(sk("a_roundoff"), sk("b_backhalf"), sk("a_roundoff"), sk("b_backhalf"));
    const s = ser(sk("a_roundoff"), sk("b_backhalf"));
    expect(ids([done, s], 1)).toEqual(["front-side", "front1twist-side"]);
  });

  it("ロンダート→宙返り→前宙：ロンダート／側宙", () => {
    const s = ser(sk("a_roundoff"), sk("b_backhalf"), sk("b_front"));
    expect(labels([s])).toEqual(["ロンダート", "側宙"]);
  });

  it("ロンダート→宙返り→前宙：E以上のシリーズにはロンダートを出さない", () => {
    const s = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"));
    expect(labels([s])).toEqual(["側宙"]);
  });

  it("クラブ・リングの5本目以降の投げが前転／転がりで終わる → 手具を使ったキャッチ（タンブリング入力済みのとき）", () => {
    const four = ser(
      th, ct, th, ct, th, ct, th, ct,
      sk("a_roundoff"), sk("b_backhalf"), sk("a_roundoff"), sk("b_backhalf"),
    );
    const more = [
      ser(sk("a_roundoff"), sk("b_backhalf"), sk("b_front"), sk("b_sidesalto")),
      ser(sk("a_roundoff"), sk("b_backhalf")),
      ser(th, sk("b_front"), ct),
    ];
    const fifth = ser(th, mo("fwd_roll"));
    const [g] = autoInputSuggestions([four, ...more, fifth], 4, false, "clubs");
    expect(g.items[0]).toMatchObject({ kind: "catch", catchTypes: ["useapp"] });
    expect(autoInputSuggestions([four, ...more, ser(th, mo("roll"))], 4, false, "ring")[0].id).toBe("pressCatch");
    // 4本目まで／スティック／他の動作では出ない
    expect(autoInputSuggestions([ser(th, ct, th, ct, th, ct), ...more, fifth], 4, false, "clubs").map((s) => s.id)).not.toContain("pressCatch");
    expect(autoInputSuggestions([four, ...more, fifth], 4, false, "stick").map((s) => s.id)).not.toContain("pressCatch");
    expect(autoInputSuggestions([four, ...more, ser(th, mo("chene"))], 4, false, "clubs")).toEqual([]);
    // タンブリングが揃っていなければ出ない
    expect(autoInputSuggestions([four, fifth], 1, false, "clubs").map((s) => s.id)).not.toContain("pressCatch");
  });

  it("ロープ：タンブリングの必須要素が揃った状態でシェネ → 手以外のキャッチ", () => {
    const tumbling = [
      ser(sk("a_roundoff"), sk("b_backhalf"), sk("a_roundoff"), sk("b_backhalf")),
      ser(sk("a_roundoff"), sk("b_backhalf"), sk("b_front"), sk("b_sidesalto")),
      ser(sk("a_roundoff"), sk("b_backhalf")),
      ser(th, sk("b_front"), ct),
    ];
    const chene = ser(th, mo("chene"));
    const [g] = autoInputSuggestions([...tumbling, chene], 4, false, "rope");
    expect(g.items[0]).toMatchObject({ kind: "catch", catchTypes: ["nonhand"] });
    // 必須要素が足りなければ出ない／他の手具でも出ない
    expect(autoInputSuggestions([chene], 0, false, "rope")).toEqual([]);
    expect(autoInputSuggestions([...tumbling, chene], 4, false, "stick").map((s) => s.id)).not.toContain("ropeNonHandCatch");
  });

  it("投げのシリーズのあとに投げを足す：投げタン未達成なら平均難度に応じて勧める", () => {
    // 平均 B(0.2) → 前宙→前転→キャッチ
    const prev = ser(th, mo("chene"), ct);
    expect(labels([prev, ser(th)], 1)).toEqual(["前宙→前転→キャッチ", "側宙→キャッチ"]);
    // C の側宙終わりの塊（平均 0.4 台）→ 前宙→側宙→キャッチ
    const mid = ser(sk("a_roundoff"), sk("c_back1full"), sk("b_sidesalto"));
    expect(labels([prev, mid, mid, ser(th)], 3)).toEqual(["前宙→側宙→キャッチ"]);
    // 平均 0.7 以上 → 伸身前宙→前転→キャッチ
    const hard = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"), sk("b_sidesalto"));
    expect(labels([hard, ser(th, mo("mv3"), ct), ser(th)], 2)).toEqual([
      "伸身前宙→前転→キャッチ",
      "伸身前宙1回ひねり→前転→キャッチ",
      "前方宙返り1回ひねり→側宙→キャッチ",
    ]);
    // 0.4超〜0.7未満 → 前方1回ひねり→側宙→キャッチ
    expect(labels([mid, mid, mid, mid, prev, ser(th)], 5)).toEqual(["前方宙返り1回ひねり→側宙→キャッチ"]);
  });

  it("投げタン達成済み・最初の投げ・シリーズの途中の投げでは勧めない", () => {
    const tum = ser(th, sk("b_front"), ct);
    expect(ids([tum, ser(th)], 1).some((i) => i.startsWith("throwTumbling"))).toBe(false);
    expect(ids([ser(th)], 0)).toEqual([]);
    expect(ids([ser(sk("a_roundoff")), ser(th)], 1)).toEqual([]);
  });
});
