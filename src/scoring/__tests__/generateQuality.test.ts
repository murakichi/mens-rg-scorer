import { describe, it, expect } from "vitest";
import baseline from "./quality-baseline.json";
import {
  QUALITY_SCENARIOS,
  qualityRegressions,
  scenarioMetrics,
  type QualityBaseline,
  type QualityMetrics,
} from "../quality";

// 自動生成の質の基準値（`npm run quality -- --update` で作る）と比べる。
// 生成は乱数に敏感なので、1つの形を足しただけで点数の取り方が崩れることがある（docs/generator-notes.md 2026-11-18）。
const base = baseline as QualityBaseline;

describe("生成の質の物差し", () => {
  const metrics = (over: Partial<QualityMetrics>): QualityMetrics => ({
    n: 25, inRange: 1, avgD: 4.5, avgA: 8.7, fullElements: 1, allE: 0.7, eShort: 0.3, dupTech: 0, ...over,
  });
  const s = { id: "x", apparatus: "stick" as const, minScore: 4.2 };

  it("許容幅の中の揺れは悪化としない。超えたら向きに合わせて悪化とする", () => {
    expect(qualityRegressions(s, metrics({ allE: 0.6 }), metrics({}))).toEqual([]);
    expect(qualityRegressions(s, metrics({ allE: 0.4 }), metrics({})).map((r) => r.key)).toEqual(["allE"]);
    // 加点重複は少ないほど良い
    expect(qualityRegressions(s, metrics({ dupTech: 0.5 }), metrics({})).map((r) => r.key)).toEqual(["dupTech"]);
    // 良くなったのは悪化ではない
    expect(qualityRegressions(s, metrics({ avgD: 5.5, dupTech: 0 }), metrics({ dupTech: 0.3 }))).toEqual([]);
  });

  it("全部Eは下限4.2の場面だけで見る", () => {
    expect(scenarioMetrics({ id: "a", apparatus: "ring", maxScore: 3 })).not.toContain("allE");
    expect(scenarioMetrics(s)).toContain("allE");
    expect(scenarioMetrics(s)).toContain("eShort");
    // E不足は少ないほど良い
    expect(qualityRegressions(s, metrics({ eShort: 0.5 }), metrics({})).map((r) => r.key)).toEqual(["eShort"]);
  });

  it("基準値はすべての場面にある", () => {
    QUALITY_SCENARIOS.forEach((sc) => expect(base.scenarios[sc.id]).toBeDefined());
  });
});

