import { describe, expect, it } from "vitest";
import { autoInputSuggestions, averageDifficulty } from "../autoInput";
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
    // 前転で終わる場合は第一候補が単独のキャッチで、キャッチ→投げ→キャッチは別案
    const g = autoInputSuggestions([s], 0)[1];
    expect(g.label).toBe("キャッチ→投げ→キャッチ");
    expect(g.items[1]).toMatchObject({ kind: "throw", throwTypes: ["noview"] });
    expect(g.items[2]).toMatchObject({ kind: "catch", catchTypes: ["noview"] });
    expect(ids([ser(th, mo("chene", 2))])).not.toContain("throwHand-catchThrowBack");
    expect(ids([ser(th, mo("chene", 3))])).toContain("throwHand-catchThrowBack");
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
    expect(autoInputSuggestions([four, ...more, ser(th, mo("chene"))], 4, false, "clubs").map((s) => s.id)).not.toContain("pressCatch");
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
    expect(autoInputSuggestions([chene], 0, false, "rope").map((s) => s.id)).not.toContain("ropeNonHandCatch");
    expect(autoInputSuggestions([...tumbling, chene], 4, false, "stick").map((s) => s.id)).not.toContain("ropeNonHandCatch");
  });

  it("投げのシリーズのあとに投げを足す：投げタン未達成なら平均難度に応じて勧める", () => {
    // 平均 B(0.2) → 前宙→前転→キャッチ
    const prev = ser(th, mo("chene"), ct);
    const tumB = ser(sk("a_roundoff"), sk("b_backsalto"));
    expect(labels([prev, tumB, ser(th)], 2)).toEqual(["前宙→前転→キャッチ", "側宙→キャッチ"]);
    // 平均 0.3超〜0.5→ 前宙→側宙→キャッチ
    const mid = ser(sk("a_roundoff"), sk("c_back1full"), sk("b_sidesalto"));
    expect(labels([prev, mid, mid, ser(th)], 3)).toEqual(["前宙→側宙→キャッチ"]);
    // 平均 0.7 以上 → 伸身前宙1回ひねり→前転／前方1回ひねり→側宙
    const hard = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"), sk("b_sidesalto"));
    expect(labels([hard, ser(th, mo("mv3"), ct), ser(th)], 2)).toEqual([
      "伸身前宙1回ひねり→前転→キャッチ",
      "前方宙返り1回ひねり→側宙→キャッチ",
    ]);
    // 0.5超〜0.7未満 → 前方1回ひねり→前転→キャッチ
    const hard2 = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"));
    expect(labels([hard, hard2, ser(th, mo("chene", 2), ct), ser(th)], 3)).toEqual([
      "前方宙返り1回ひねり→前転→キャッチ",
    ]);
  });

  it("投げタン達成済み・最初の投げ・シリーズの途中の投げでは勧めない", () => {
    const tum = ser(th, sk("b_front"), ct);
    expect(ids([tum, ser(th)], 1).some((i) => i.startsWith("throwTumbling"))).toBe(false);
    expect(ids([ser(th)], 0)).toEqual([]);
    // 投げ未実施（タンブリングだけ）／タンブリング未実施（投げだけ）でも勧めない
    const tumB = ser(sk("a_roundoff"), sk("b_backsalto"));
    expect(ids([tumB, ser(th)], 1)).toEqual([]);
    expect(ids([ser(th, mo("chene"), ct), ser(th)], 1)).toEqual([]);
    expect(ids([ser(sk("a_roundoff")), ser(th)], 1)).toEqual([]);
  });

  it("平均難度0.7以上で 投げ→前宙 → きりもみ転回→キャッチ", () => {
    const hard = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"), sk("b_sidesalto"));
    expect(labels([hard, ser(th, sk("b_front"))], 1)).toEqual(["きりもみ転回→キャッチ"]);
    // 平均が低ければ出ない
    const prev = ser(th, mo("chene"), ct);
    expect(labels([prev, ser(th, sk("b_front"))], 1)).toEqual([]);
  });

  it("クラブ・リングの横投げ → 手具を使ったキャッチ", () => {
    const side: Item = { kind: "throw", throwTypes: ["side"], reqTypes: [] };
    for (const app of ["clubs", "ring"] as const) {
      const [g] = autoInputSuggestions([ser(side)], 0, false, app);
      expect(g.items[0]).toMatchObject({ kind: "catch", catchTypes: ["useapp"] });
    }
    expect(autoInputSuggestions([ser(side)], 0, false, "stick")).toEqual([]);
    expect(autoInputSuggestions([ser(th)], 0, false, "clubs")).toEqual([]);
  });

  it("クラブ・リングの横投げでキャッチが候補に挙がるとき、そのキャッチは手具を使ったキャッチ", () => {
    const side: Item = { kind: "throw", throwTypes: ["side"], reqTypes: [] };
    // 徒手3動作以上 → キャッチ→投げ→キャッチ の最初のキャッチ
    const [g] = autoInputSuggestions([ser(side, mo("chene", 3))], 0, false, "clubs");
    expect(g.items[0]).toMatchObject({ kind: "catch", catchTypes: ["useapp"] });
    // 技の最中の横投げ → 前転→手具を使ったキャッチ
    const inSkill = sk("b_front", { isThrow: true, throwTypes: ["side"] });
    const [h] = autoInputSuggestions([ser(inSkill)], 0, false, "ring");
    expect(h.items[1]).toMatchObject({ kind: "catch", catchTypes: ["useapp"] });
    // 横投げでなければ通常のキャッチ／スティックは対象外
    const [n] = autoInputSuggestions([ser(th, mo("chene", 3))], 0, false, "clubs");
    expect(n.items[0]).toMatchObject({ kind: "catch", catchTypes: [] });
    const [st] = autoInputSuggestions([ser(side, mo("chene", 3))], 0, false, "stick");
    expect(st.items[0]).toMatchObject({ kind: "catch", catchTypes: [] });
  });

  it("投げている間に前転：第一候補はキャッチ。3動作以上かつ平均0.5以上なら 転がり→キャッチ", () => {
    // 2動作（シェネ→前転）：キャッチだけ
    expect(labels([ser(th, mo("chene"), mo("fwd_roll"))], 0)).toEqual(["キャッチ"]);
    // 3動作でも平均が低い（構成が空）→ キャッチ が先、続けて従来の キャッチ→投げ→キャッチ
    expect(labels([ser(th, mo("chene", 2), mo("fwd_roll"))], 0)).toEqual(["キャッチ", "キャッチ→投げ→キャッチ"]);
    // 平均0.5以上（D難度のタンブリング）→ 転がり→キャッチ が第一候補
    const mid = ser(sk("a_roundoff"), sk("c_back1full"), sk("b_sidesalto"));
    const s = ser(th, mo("chene", 2), mo("fwd_roll"));
    expect(labels([mid, s], 1)).toEqual(["転がり→キャッチ", "キャッチ", "キャッチ→投げ→キャッチ"]);
    // 動作が足りなければ平均が高くても 転がり は出ない
    expect(labels([mid, ser(th, mo("fwd_roll"))], 1)).toEqual(["キャッチ"]);
  });

  it("平均難度は有効なユニットだけ：重複・上位3つ外・連続投げの2回目は数えない", () => {
    const cur = ser(th);
    const hard = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"), sk("b_sidesalto"));
    const hard2 = ser(sk("a_roundoff"), sk("d_frontlay1"), sk("b_front"));
    const mid = ser(sk("a_roundoff"), sk("c_back1full"), sk("b_sidesalto"));
    const low = ser(sk("a_roundoff"), sk("b_backsalto"));
    const avg = (l: Series[]) => averageDifficulty(l, l.length - 1, false, "clubs");
    // 重複シリーズは数えない
    expect(avg([hard, hard, cur])).toBeCloseTo(0.7);
    // 難度の高い上位3つの平均（0.2 の低難度は外れる）。低難度の投げを足しても下がらない
    expect(avg([hard, hard2, mid, ser(th, mo("chene"), ct), cur])).toBeCloseTo((0.7 + 0.7 + 0.5) / 3);
    expect(avg([hard, hard2, mid, low, cur])).toBeCloseTo((0.7 + 0.7 + 0.5) / 3);
    // 同じシリーズの2つ目の投げは数えない（1つ目 縦3動作E 0.7 だけ）
    expect(avg([ser(th, mo("mv3"), ct, th, mo("chene"), ct), cur])).toBeCloseTo(0.7);
  });

  it("投げ→シェネ（3回以下）：キャッチ／前転→キャッチ", () => {
    expect(labels([ser(th, mo("chene"))], 0)).toEqual(["キャッチ", "前転→キャッチ"]);
    expect(labels([ser(th, mo("chene", 2))], 0)).toEqual(["キャッチ", "前転→キャッチ"]);
    // 3回は3動作なので、従来の キャッチ→投げ→キャッチ も別案に残る
    expect(labels([ser(th, mo("chene", 3))], 0)).toEqual(["キャッチ", "前転→キャッチ", "キャッチ→投げ→キャッチ"]);
    // 4回以上は出さない（従来の候補のみ）
    expect(labels([ser(th, mo("chene", 4))], 0)).toEqual(["キャッチ→投げ→キャッチ"]);
    // 投げが無い／キャッチ済みなら出ない
    expect(labels([ser(mo("chene"))], 0)).toEqual([]);
    expect(labels([ser(th, ct, mo("chene"))], 0)).toEqual([]);
  });

  it("投げ→前転を入力した時点でキャッチが候補に出る", () => {
    expect(labels([ser(th, mo("fwd_roll"))], 0)).toEqual(["キャッチ"]);
  });

  it("キャッチ→視野外投げ→視野外キャッチは、ほかのシリーズに連続投げが無いときだけ", () => {
    const cur = ser(th, mo("chene", 3));
    const consecutive = ser(th, ct, th, ct);
    expect(ids([cur], 0)).toContain("throwHand-catchThrowBack");
    expect(ids([ser(th, ct), cur], 1)).toContain("throwHand-catchThrowBack");
    expect(ids([consecutive, cur], 1)).not.toContain("throwHand-catchThrowBack");
    // 入力中のシリーズ自身は対象外（連続投げの途中で出す）
    expect(ids([cur, ser(th, ct)], 0)).toContain("throwHand-catchThrowBack");
  });
});
