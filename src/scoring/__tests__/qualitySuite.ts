import { expect } from "vitest";
import baseline from "./quality-baseline.json";
import { QUALITY_SCENARIOS, measureQuality, qualityRegressions, type QualityBaseline } from "../quality";
import { slowIt } from "./slow";
import type { ApparatusKey } from "../types";

/**
 * 手具ごとに、生成の質が基準値（`quality-baseline.json`）から許容幅を超えて下がっていないかを測る（重い）。
 * 1手具で4場面×25構成、1〜2分かかるので、手具ごとにファイルを分けて並列に走らせる。
 */
export function qualitySuite(apparatus: ApparatusKey): void {
  const base = baseline as QualityBaseline;
  QUALITY_SCENARIOS.filter((sc) => sc.apparatus === apparatus).forEach((sc) => {
    slowIt(
      `生成の質：${sc.id}`,
      () => {
        const now = measureQuality(sc, base.runs);
        const regs = qualityRegressions(sc, now, base.scenarios[sc.id]);
        // 落ちたときに何がどれだけ下がったかを出す
        expect(regs.map((r) => `${r.key}: ${r.base.toFixed(2)} → ${r.now.toFixed(2)}`)).toEqual([]);
      },
      180_000,
    );
  });
}
