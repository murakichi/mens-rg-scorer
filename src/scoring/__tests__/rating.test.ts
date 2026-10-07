import { describe, it, expect } from "vitest";
import { buildTwistSkillId, DIFF_SCORE } from "../constants";
import {
  RATING_ADOPT_COUNT,
  RATING_BOOST_MAX,
  RATING_BOOST_STEP,
  capRepeatedSaltos,
  clampBoost,
  computeRating,
  normalizeRatingEntries,
  type RatingEntry,
} from "../rating";
import type { Item, Series } from "../types";

const sk = (skillId: string, extra: Partial<Item> = {}): Item =>
  ({ kind: "skill", skillId, hasApparatus: false, isThrow: false, ...extra }) as Item;
const back = (twist: number, posture: "tuck" | "pike" | "layout" = "layout") =>
  sk(buildTwistSkillId({ base: "back", twist, posture }));
const series = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const entry = (s: Series, over: Partial<RatingEntry> = {}): RatingEntry => ({ series: s, grade: "A", ...over });

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

describe("レーティング：確度・上乗せ・投げ", () => {
  const one = series(back(2.5));
  it("確度を掛ける（A=1 / B=0.6 / C=0.3 / D=0.1 / E=0）", () => {
    const v = (grade: RatingEntry["grade"]) => computeRating([entry(one, { grade })]).total;
    const a = v("A");
    expect(v("B")).toBeCloseTo(a * 0.6, 3);
    expect(v("C")).toBeCloseTo(a * 0.3, 3);
    expect(v("D")).toBeCloseTo(a * 0.1, 3);
    expect(v("E")).toBe(0);
  });
  it("上乗せは1段 0.2 点で、上限を超えない", () => {
    const base = computeRating([entry(one)]).total;
    expect(computeRating([entry(one, { boost: 1 })]).total).toBeCloseTo(base + RATING_BOOST_STEP, 3);
    expect(clampBoost(99)).toBe(RATING_BOOST_MAX);
    expect(clampBoost(-2)).toBe(0);
    expect(clampBoost("x")).toBe(0);
  });
  it("投げを含む塊は、技と投げのうち低いほうの確度になる", () => {
    const thrown = series({ kind: "throw" } as Item, sk("b_front"), { kind: "catch" } as Item);
    const plain = computeRating([entry(thrown, { grade: "A" })]).total;
    const weakThrow = computeRating([entry(thrown, { grade: "A", throwGrade: "C" })]).total;
    expect(weakThrow).toBeCloseTo(plain * 0.3, 3);
  });
  it("投げの度合いは投げを含まない塊には効かない", () => {
    const r = computeRating([entry(one, { grade: "A", throwGrade: "E" })]);
    expect(r.total).toBeGreaterThan(0);
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
    const out = normalizeRatingEntries([null, { series: {} }, { series: series(back(1)), grade: "Z", boost: 9 }]);
    expect(out).toHaveLength(1);
    expect(out[0].grade).toBe("A");
    expect(out[0].boost).toBe(RATING_BOOST_MAX);
    expect(normalizeRatingEntries("x")).toEqual([]);
  });
});
