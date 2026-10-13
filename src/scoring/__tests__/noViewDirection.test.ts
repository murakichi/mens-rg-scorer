import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const thr = (throwTypes: string[]): Series => S({ kind: "throw", throwTypes }, { kind: "catch" });

// 視野外の投げの方向（真後ろ／横）は、既存の横投げタグ（side）で表す。
describe("視野外の投げ — 真後ろ／横", () => {
  it("横を選んでも技術加点は変わらない（side は技術加点に数えない）", () => {
    const back = computeScore([thr(["noview"])], "stick");
    const side = computeScore([thr(["noview", "side"])], "stick");
    expect(side.techniqueBonus).toBe(back.techniqueBonus);
    expect(back.techniqueBonus).toBeGreaterThan(0);
  });

  it("真後ろと横は別の投げ方として数える", () => {
    const r = computeScore([thr(["noview"]), thr(["noview", "side"])], "stick");
    expect(r.totalThrowCount).toBe(2);
  });

  it("ロープでは横を持ち込んでも採点されない（視野外だけが残る）", () => {
    const rope = computeScore([thr(["noview", "side"])], "rope");
    const plain = computeScore([thr(["noview"])], "rope");
    expect(rope.techniqueBonus).toBe(plain.techniqueBonus);
  });
});

import { autoThrowTemplates } from "../autoThrows";
import { seededRandom } from "../probe";

describe("視野外の投げ — 自動生成は真後ろも横も作る", () => {
  const noViewThrows = (app: "stick" | "clubs" | "ring" | "rope") => {
    let back = 0;
    let side = 0;
    for (let seed = 1; seed <= 20; seed++)
      autoThrowTemplates(app, { random: seededRandom(seed) }).forEach((t) =>
        t.series.items.forEach((it) => {
          const types = it.kind === "throw" ? it.throwTypes ?? [] : [];
          if (!types.includes("noview")) return;
          if (types.includes("side")) side++;
          else back++;
        }),
      );
    return { back, side };
  };

  it.each(["stick", "clubs", "ring"] as const)("%s：両方出て、真後ろのほうが多い", (app) => {
    const { back, side } = noViewThrows(app);
    expect(side).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(side);
  });

  it("ロープは横投げをしないので真後ろだけ", () => {
    const { back, side } = noViewThrows("rope");
    expect(back).toBeGreaterThan(0);
    expect(side).toBe(0);
  });
});
