import { describe, it, expect } from "vitest";
import { buildTwistSkillId, DIFF_SCORE } from "../constants";
import { computeScore } from "../score";
import {
  PERFORM_GRADES,
  RATING_ADOPT_COUNT,
  RATING_BOOST_MAX,
  RATING_BOOST_STEP,
  capRepeatedSaltos,
  clampBoost,
  computeRating,
  entryBonus,
  seriesForApparatus,
  stripForCommon,
  normalizeRatingEntries,
  type RatingEntry,
} from "../rating";
import type { Item, Series } from "../types";

const sk = (skillId: string, extra: Partial<Item> = {}): Item =>
  ({ kind: "skill", skillId, hasApparatus: false, isThrow: false, ...extra }) as Item;
const back = (twist: number, posture: "tuck" | "pike" | "layout" = "layout") =>
  sk(buildTwistSkillId({ base: "back", twist, posture }));
const series = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const entry = (s: Series, over: Partial<RatingEntry> = {}): RatingEntry => ({ apparatus: "stick", series: s, grade: "A", ...over });

describe("レーティング：難度の土台と E 超え", () => {
  it("後方2回半ひねり→つなぎ→後方1回半ひねりは F として評価する（ルールでは E 止め）", () => {
    const r = computeRating([entry(series(back(2.5), sk("a_roundoff"), back(1.5)))]);
    const c = r.candidates[0];
    expect(c.ruleDiff).toBe("E");
    expect(c.ratedDiff).toBe("F");
    expect(c.raise).toBe("chain");
    expect(r.total).toBeCloseTo(DIFF_SCORE.F, 5);
    expect(r.ruleTotal).toBeCloseTo(DIFF_SCORE.E, 5);
  });

  it("低難度（C）を並べただけでは E を超えない", () => {
    const r = computeRating([entry(series(back(1.5), sk("a_roundoff"), back(1.5, "pike"), sk("a_roundoff"), back(1.5, "tuck")))]);
    expect(r.candidates[0].ratedDiff).toBe("E");
    expect(r.candidates[0].raise).toBeNull();
  });

  it("B が混ざった連続は『質の高い連続』にならない", () => {
    const r = computeRating([entry(series(back(2.5), back(0.5, "tuck"), back(1.5)))]);
    expect(r.candidates[0].ratedDiff).toBe("E");
  });

  it("上位2技の換算が 8 以上（E＋D）なら G", () => {
    const r = computeRating([entry(series(back(3), sk("a_roundoff"), back(2.5)))]);
    expect(r.candidates[0].ratedDiff).toBe("G");
  });

  it("3つ目以降の技は換算に足さない（D＋C に C を足しても F のまま）", () => {
    const r = computeRating([entry(series(back(2.5), back(1.5, "pike"), back(1.5, "tuck")))]);
    expect(r.candidates[0].ratedDiff).toBe("F");
  });

  it("技そのものが F の技（十年後の技）はそのまま F", () => {
    const r = computeRating([entry(series(sk("f_rudolphhalf")))]);
    expect(r.candidates[0].ruleDiff).toBe("E");
    expect(r.candidates[0].ratedDiff).toBe("F");
    expect(r.candidates[0].raise).toBe("skill");
  });
});

describe("レーティング：同じ宙返りの連続は3つまで", () => {
  it("4つ目以降は取り除く", () => {
    const s = series(back(1), back(1), back(1), back(1), back(1));
    const { series: out, trimmed } = capRepeatedSaltos(s);
    expect(trimmed).toBe(2);
    expect(out.items).toHaveLength(3);
  });
  it("間に別の技が入れば別の連続", () => {
    const s = series(back(1), back(1), back(1), sk("a_roundoff"), back(1), back(1), back(1));
    expect(capRepeatedSaltos(s).trimmed).toBe(0);
  });
  it("取り除いた分は難度に効かない（5本でも3本と同じ）", () => {
    const five = computeRating([entry(series(back(1.5), back(1.5), back(1.5), back(1.5), back(1.5)))]);
    const three = computeRating([entry(series(back(1.5), back(1.5), back(1.5)))]);
    expect(five.candidates[0].ratedDiff).toBe(three.candidates[0].ratedDiff);
    expect(five.candidates[0].trimmed).toBe(2);
  });
});

describe("レーティング：確度・投げ", () => {
  const one = series(back(2.5));
  it("確度を掛ける（A=1 / B=0.6 / C=0.3 / D=0.1 / E=0）", () => {
    const v = (grade: RatingEntry["grade"]) => computeRating([entry(one, { grade })]).total;
    const a = v("A");
    expect(v("B")).toBeCloseTo(a * 0.6, 3);
    expect(v("C")).toBeCloseTo(a * 0.3, 3);
    expect(v("D")).toBeCloseTo(a * 0.1, 3);
    expect(v("E")).toBe(0);
  });
  it("人が点を足す入力は無い（旧データの boost は無視して読む）", () => {
    const base = computeRating([entry(one)]).total;
    const out = normalizeRatingEntries([{ series: one, grade: "A", boost: 3 }]);
    expect("boost" in out[0]).toBe(false);
    expect(computeRating(out).total).toBeCloseTo(base, 3);
    expect(base).toBeCloseTo(DIFF_SCORE.D, 3);
  });
  it("確度は入力のランク1つ。投げを含む塊にも同じランクが掛かる", () => {
    const thrown = series({ kind: "throw" } as Item, sk("b_front"), { kind: "catch" } as Item);
    const plain = computeRating([entry(thrown, { grade: "A" })]).total;
    expect(computeRating([entry(thrown, { grade: "C" })]).total).toBeCloseTo(plain * 0.3, 3);
  });
});

describe("レーティング：上位10個と重複", () => {
  it("同じ内容は1回だけ数える（高いほうが残る）", () => {
    const r = computeRating([entry(series(back(2.5)), { grade: "C" }), entry(series(back(2.5)), { grade: "A" })]);
    expect(r.candidates.filter((c) => c.adopted)).toHaveLength(1);
    expect(r.candidates[1].adopted).toBe(true);
    expect(r.candidates[0].skipped).toBe("duplicate");
  });
  it("長い連続に含まれるだけの短い連続は採用しない", () => {
    const r = computeRating([entry(series(back(2.5), sk("a_roundoff"), back(1.5))), entry(series(back(2.5)))]);
    const short = r.candidates.find((c) => c.entryIndex === 1)!;
    expect(short.skipped).toBe("contained");
    expect(r.total).toBeCloseTo(DIFF_SCORE.F, 5);
  });
  it("採用は上位10個まで", () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry(series(back(i % 8 === 0 ? 0 : 0.5 * (i + 1), "tuck"), sk("a_roundoff"), back(0.5 + i * 0.5, "pike"))));
    const r = computeRating(entries);
    expect(r.candidates.filter((c) => c.adopted).length).toBeLessThanOrEqual(RATING_ADOPT_COUNT);
  });
  it("「試合で実施できる」だけの合計は A 以外を数えない", () => {
    const r = computeRating([entry(series(back(2.5)), { grade: "A" }), entry(series(back(1.5)), { grade: "C" })]);
    expect(r.matchTotal).toBeCloseTo(DIFF_SCORE.D, 5);
    expect(r.total).toBeGreaterThan(r.matchTotal);
  });
});

describe("レーティング：入力の取り込み", () => {
  it("壊れた入力は落とし、不正な度合いは既定に戻す", () => {
    const out = normalizeRatingEntries([null, { series: {} }, { series: series(back(1)), grade: "Z" }]);
    expect(out).toHaveLength(1);
    expect(out[0].grade).toBe("A");
    expect(normalizeRatingEntries("x")).toEqual([]);
  });
});

describe("レーティング：ルールの加点", () => {
  // 視野外の投げ・手以外のキャッチ（技術加点）を含む投げタン
  const withTech = (): Series =>
    series(
      { kind: "throw", throwTypes: ["noview"] } as Item,
      sk("b_front"),
      { kind: "catch", catchTypes: ["nonhand"] } as Item,
    );
  const plain = (): Series => series({ kind: "throw" } as Item, sk("b_front"), { kind: "catch" } as Item);

  it("加点は computeScore の技術・手具操作・二つ投げの徒手動作加点と一致する", () => {
    const b = computeScore([withTech()], "stick").seriesBreakdowns[0];
    expect(b.tech).toBeGreaterThan(0);
    expect(entryBonus(withTech(), "stick")).toBeCloseTo(b.tech + b.appOp + b.twoMot, 5);
    expect(entryBonus(plain(), "stick")).toBe(0);
  });

  it("加点が付く形は評価値が高く、確度を掛けて足される", () => {
    const base = computeRating([entry(plain())]).total;
    const tech = computeRating([entry(withTech())]);
    expect(tech.candidates[0].bonus).toBeGreaterThan(0);
    expect(tech.total).toBeCloseTo(base + entryBonus(withTech(), "stick"), 3);
    const c = computeRating([entry(withTech(), { grade: "C" })]).total;
    expect(c).toBeCloseTo(tech.total * 0.3, 3);
  });

  it("加点も入力のランクの確度で割り引く", () => {
    const full = computeRating([entry(withTech())]).total;
    expect(computeRating([entry(withTech(), { grade: "C" })]).total).toBeCloseTo(full * 0.3, 3);
  });

  it("加点は入力ごとに1回だけ（塊が複数でも二重に載らない）", () => {
    const two = series(
      { kind: "throw", throwTypes: ["noview"] } as Item,
      sk("b_front"),
      { kind: "catch", catchTypes: ["nonhand"] } as Item,
      { kind: "throw", throwTypes: ["noview"] } as Item,
      sk("b_back"),
      { kind: "catch", catchTypes: ["nonhand"] } as Item,
    );
    const r = computeRating([entry(two)]);
    const total = r.candidates.reduce((n, c) => n + c.bonus, 0);
    expect(total).toBeCloseTo(entryBonus(two, "stick"), 5);
    expect(r.candidates.filter((c) => c.bonus > 0)).toHaveLength(1);
  });

  it("「Aのみ」の合計にも加点が入り、A以外には入らない", () => {
    const a = computeRating([entry(withTech(), { grade: "A" })]);
    const c = computeRating([entry(withTech(), { grade: "C" })]);
    expect(a.matchTotal).toBeCloseTo(a.total, 3);
    expect(c.matchTotal).toBe(0);
  });
});

describe("レーティング：投げタンは投げとタンブリングの両方を採用する", () => {
  const chene = (n: number): Item => ({ kind: "motion", motionId: "chene", count: n }) as Item;
  const throwTum = (n = 3): Series =>
    series({ kind: "throw" } as Item, chene(n), sk("b_front"), { kind: "catch" } as Item);

  it("投げタンは投げ（徒手）とタンブリングの2候補に分かれる", () => {
    const r = computeRating([entry(throwTum())]);
    const parts = r.candidates.map((c) => c.part).sort();
    expect(parts).toEqual(["throw", "tumbling"]);
    const t = r.candidates.find((c) => c.part === "throw")!;
    const u = r.candidates.find((c) => c.part === "tumbling")!;
    // 投げ側は徒手の動作数（シェネ3＝D）、タンブリング側は技の難度（前宙＋投げ）
    expect(t.ruleDiff).toBe("D");
    expect(u.ruleDiff).not.toBe("D");
    expect(r.candidates.every((c) => c.adopted)).toBe(true);
    expect(r.total).toBeCloseTo(t.value + u.value, 3);
  });

  it("両方を足すので、ルールの高いほうだけを数えるより大きい", () => {
    const r = computeRating([entry(throwTum())]);
    expect(r.total).toBeGreaterThan(Math.max(...r.candidates.map((c) => c.value)));
  });

  it("ランクは投げ側にもタンブリング側にも同じ確度で掛かる", () => {
    const base = computeRating([entry(throwTum())]);
    const weak = computeRating([entry(throwTum(), { grade: "C" })]);
    const get = (r: typeof base, part: string) => r.candidates.find((c) => c.part === part)!;
    expect(get(weak, "throw").value).toBeCloseTo(get(base, "throw").value * 0.3, 3);
    expect(get(weak, "tumbling").value).toBeCloseTo(get(base, "tumbling").value * 0.3, 3);
  });

  it("徒手の動作がない投げタンは投げ側を出さない", () => {
    const r = computeRating([entry(series({ kind: "throw" } as Item, sk("b_front"), { kind: "catch" } as Item))]);
    expect(r.candidates.map((c) => c.part)).toEqual(["tumbling"]);
  });

  it("同じ内訳の投げ側は重複として畳む", () => {
    const r = computeRating([entry(throwTum()), entry(series({ kind: "throw" } as Item, chene(3), sk("b_backsalto"), { kind: "catch" } as Item))]);
    const throws = r.candidates.filter((c) => c.part === "throw");
    expect(throws).toHaveLength(2);
    expect(throws.filter((c) => c.adopted)).toHaveLength(1);
  });
});

describe("レーティング：入力ごとの手具（手具無し・共通・4種）", () => {
  const throwTum = (extra: Partial<Item> = {}): Series =>
    series({ kind: "throw", throwTypes: ["noview"], ...extra } as Item, sk("b_front"), { kind: "catch", catchTypes: ["nonhand"] } as Item);

  it("手具無しは投げ・キャッチ・手具操作を外し、タンブリングだけを評価する", () => {
    const stripped = seriesForApparatus(throwTum(), "none");
    expect(stripped.items.every((i) => i.kind === "skill")).toBe(true);
    const r = computeRating([entry(throwTum(), { apparatus: "none" })]);
    expect(r.candidates.map((c) => c.part)).toEqual([null]);
    expect(r.candidates[0].isThrow).toBe(false);
    expect(r.candidates[0].bonus).toBe(0);
  });

  it("手具無しでは、技の最中の投げ・受け・手具操作も落ちる", () => {
    const s = series(sk("b_front", { hasApparatus: true, isThrow: true, throwTypes: ["noview"] } as Partial<Item>));
    const out = seriesForApparatus(s, "none").items[0] as Extract<Item, { kind: "skill" }>;
    expect(out.isThrow).toBe(false);
    expect(out.hasApparatus).toBe(false);
    expect(out.throwTypes).toBeUndefined();
  });

  it("共通は手具固有の入力（二つ投げ・横投げ・手具を使った投げ／キャッチ・2つ同時キャッチ）だけを外す", () => {
    const s = series(
      { kind: "throw", throwTypes: ["noview", "side", "useapp"], reqTypes: ["twothrow"] } as Item,
      sk("b_front"),
      { kind: "catch", catchTypes: ["nonhand", "useapp"], catchTwo: true } as Item,
    );
    const out = stripForCommon(s);
    expect(out.items[0]).toMatchObject({ throwTypes: ["noview"], reqTypes: [] });
    expect(out.items[2]).toMatchObject({ catchTypes: ["nonhand"], catchTwo: false });
    // 投げ・キャッチ自体は残る（共通でも投げタンとして評価される）
    expect(computeRating([entry(s, { apparatus: "common" })]).candidates[0].isThrow).toBe(true);
  });

  it("その手具で入力できない内容（スティックの手具を使った投げ）は評価に入らない", () => {
    const withUse = series({ kind: "throw", throwTypes: ["useapp"] } as Item, sk("b_front"), { kind: "catch" } as Item);
    const stick = computeRating([entry(withUse, { apparatus: "stick" })]);
    expect(stick.candidates[0].bonus).toBe(entryBonus(seriesForApparatus(withUse, "stick"), "stick"));
  });

  it("重複は手具ごとに判定する（スティックとクラブの同じ技は別の実施）", () => {
    const a = computeRating([entry(series(back(2.5)), { apparatus: "stick" }), entry(series(back(2.5)), { apparatus: "clubs" })]);
    expect(a.candidates.filter((c) => c.adopted)).toHaveLength(2);
    const b = computeRating([entry(series(back(2.5)), { apparatus: "stick" }), entry(series(back(2.5)), { apparatus: "stick" })]);
    expect(b.candidates.filter((c) => c.adopted)).toHaveLength(1);
  });

  it("手具の指定が無い・不正な入力はスティック扱いで取り込む", () => {
    const out = normalizeRatingEntries([{ series: series(back(1)) }, { series: series(back(1)), apparatus: "zzz" }, { series: series(back(1)), apparatus: "none" }]);
    expect(out.map((e) => e.apparatus)).toEqual(["stick", "stick", "none"]);
  });
});

describe("レーティング：ランクは技と投げで意味を読み替える", () => {
  it("各ランクに技の意味・投げの意味・確度がある（投げは練習場所ではなく正確性）", () => {
    expect(PERFORM_GRADES.map((g) => g.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(PERFORM_GRADES.map((g) => g.confidence)).toEqual([1, 0.6, 0.3, 0.1, 0]);
    PERFORM_GRADES.forEach((g) => {
      expect(g.note.length).toBeGreaterThan(0);
      expect(g.throwNote.length).toBeGreaterThan(0);
    });
    expect(PERFORM_GRADES.some((g) => /トランポリン|エアマット|フロア/.test(g.throwNote))).toBe(false);
  });
  it("旧データの throwGrade は無視して読む", () => {
    const out = normalizeRatingEntries([{ series: series(back(1)), grade: "B", throwGrade: "E" }]);
    expect(out).toHaveLength(1);
    expect("throwGrade" in out[0]).toBe(false);
  });
});
