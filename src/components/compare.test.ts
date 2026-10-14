import { describe, it, expect } from "vitest";
import { compareScores, requiredDiffs } from "./compare";
import { computeScore } from "../scoring/score";
import { parseRoutineText } from "../scoring/draft";
import { encodeShare } from "../scoring/share";
import type { Item, Series } from "../scoring/types";

const skill = (skillId: string): Item => ({ kind: "skill", skillId, hasApparatus: false, isThrow: false });
const throwSeries = (count: number): Series => ({
  executionDeduction: 0,
  items: [
    { kind: "throw", throwTypes: [], reqTypes: [] },
    { kind: "motion", motionId: "chene", count },
    { kind: "catch", catchTypes: [] },
  ],
});
const tumbling = (): Series => ({
  executionDeduction: 0,
  items: [skill("a_roundoff"), skill("c_back15"), skill("b_front")],
});

const score = (s: Series[]) => computeScore(s, "stick", {});

describe("2構成の突き合わせ", () => {
  it("同じ構成なら差はすべて0", () => {
    const r = score([throwSeries(2), tumbling()]);
    const c = compareScores(r, r);
    c.totals.forEach((row) => expect(row.delta).toBe(0));
    c.d.forEach((row) => expect(row.delta).toBe(0));
    c.a.forEach((row) => expect(row.delta).toBe(0));
    expect(c.required).toEqual([]);
  });

  it("差は right - left（右が良くなったら正）", () => {
    const left = score([throwSeries(2)]);
    const right = score([throwSeries(2), tumbling()]);
    const c = compareScores(left, right);
    const total = c.totals.find((r) => r.label === "合計")!;
    expect(total.left).toBeCloseTo(left.grandTotal, 6);
    expect(total.right).toBeCloseTo(right.grandTotal, 6);
    expect(total.delta).toBeCloseTo(Math.round((right.grandTotal - left.grandTotal) * 10) / 10, 6);
    // タンブリングを足したぶんDが増える
    expect(c.totals.find((r) => r.label === "D（難度）")!.delta).toBeGreaterThan(0);
  });

  it("D内訳の差を足すとDの差になる", () => {
    const left = score([throwSeries(2)]);
    const right = score([throwSeries(3), tumbling()]);
    const c = compareScores(left, right);
    const sum = c.d.reduce((n, r) => n + r.delta, 0);
    expect(Math.round(sum * 10) / 10).toBeCloseTo(
      Math.round((right.dScore - left.dScore) * 10) / 10,
      6,
    );
  });

  it("A内訳の差を足すとA減点の差になる", () => {
    const left = score([throwSeries(2)]);
    const right = score([throwSeries(2), tumbling()]);
    const c = compareScores(left, right);
    const sum = c.a.reduce((n, r) => n + r.delta, 0);
    expect(Math.round(sum * 10) / 10).toBeCloseTo(
      Math.round((right.aDeduction - left.aDeduction) * 10) / 10,
      6,
    );
  });

  it("両方0の分類は出さない（見ても仕方がないので）", () => {
    const r = score([throwSeries(2)]);
    const c = compareScores(r, r);
    expect(c.d.every((row) => row.left !== 0 || row.right !== 0)).toBe(true);
    expect(c.a.every((row) => row.left !== 0 || row.right !== 0)).toBe(true);
  });

  it("【回帰】片方にしか無い項目も拾い、名前はその側のものを使う", () => {
    // ジュニアだけに出る項目（投げ上限）があるので、左右で項目の集合が違う
    const series = [throwSeries(2), tumbling()];
    const normal = computeScore(series, "stick", {});
    const junior = computeScore(series, "stick", { junior: true });
    const keysOf = (r: typeof normal) => new Set(r.required.map((c) => c.key));
    const onlyJunior = [...keysOf(junior)].filter((k) => !keysOf(normal).has(k));
    expect(onlyJunior.length).toBeGreaterThan(0); // 前提：集合が違う

    const diffs = requiredDiffs(normal, junior);
    // 右にしか無い項目も結果に出てくる
    onlyJunior.forEach((k) => expect(diffs.some((d) => d.key === k)).toBe(true));
    // 必要回数が規則で違う項目は、両方の名前を併記する（左の名前を右に当てない）
    const count3 = diffs.find((d) => d.key === "count3");
    if (count3) {
      const l = normal.required.find((c) => c.key === "count3")!;
      const r = junior.required.find((c) => c.key === "count3")!;
      if (l.label !== r.label) expect(count3.label).toContain(r.label);
    }
  });

  it("片方だけ満たしている必須要素を拾う", () => {
    const left = score([throwSeries(2)]);
    const right = score([throwSeries(2), tumbling(), throwSeries(3), throwSeries(4)]);
    const diffs = requiredDiffs(left, right);
    expect(diffs.length).toBeGreaterThan(0);
    // 拾った項目は本当に左右で違う
    diffs.forEach((d) => {
      const l = left.required.find((c) => c.key === d.key)!;
      const rr = right.required.find((c) => c.key === d.key)!;
      expect(l.passed).not.toBe(rr.passed);
    });
    // 同じ項目は拾わない
    expect(requiredDiffs(left, left)).toEqual([]);
  });
});

describe("比べる相手の読み取り", () => {
  const data = {
    version: 1,
    apparatus: "rope",
    series: [throwSeries(2)],
  };

  it("エクスポートしたJSONを読める", () => {
    const d = parseRoutineText(JSON.stringify(data));
    expect(d?.apparatus).toBe("rope");
    expect(d?.series).toHaveLength(1);
  });

  it("共有URLを読める（URL全体でも、圧縮部分だけでも）", () => {
    const token = encodeShare(data);
    expect(parseRoutineText(`https://example.com/mens-rg-scorer/#d=${token}`)?.apparatus).toBe("rope");
    expect(parseRoutineText(`#d=${token}`)?.apparatus).toBe("rope");
    expect(parseRoutineText(token)?.apparatus).toBe("rope");
  });

  it("前後の空白は無視する", () => {
    expect(parseRoutineText(`  ${JSON.stringify(data)}  `)?.apparatus).toBe("rope");
  });

  it("読めないものは null（空・ごみ・シリーズなし）", () => {
    expect(parseRoutineText("")).toBeNull();
    expect(parseRoutineText("   ")).toBeNull();
    expect(parseRoutineText("これはURLでもJSONでもない")).toBeNull();
    expect(parseRoutineText("{}")).toBeNull();
    expect(parseRoutineText(JSON.stringify({ version: 1, apparatus: "stick", series: [] }))).toBeNull();
  });

  it("壊れたデータでも落ちない", () => {
    expect(() => parseRoutineText('{"series":[{"items":[null]}]}')).not.toThrow();
    expect(() => parseRoutineText("#d=not-really-compressed")).not.toThrow();
  });
});
