import { describe, it, expect } from "vitest";
import { autoThrowTemplates } from "../autoThrows";
import { autoTumblingTemplates, nextSaltoOptions } from "../autoTumblings";
import { seededRandom } from "../probe";
import { describeText } from "../probe";

describe("後方系の宙返りからテンポ宙返り", () => {
  it("後ろ向きに降りる後方系のあとにテンポ宙返りを出す。ほかの後方系は続けない", () => {
    expect(nextSaltoOptions("d_back2twist")).toEqual(["b_tempo"]);
    expect(nextSaltoOptions("b_backsalto")).toEqual(["b_tempo"]);
    expect(nextSaltoOptions("b_backlayout")).toContain("b_tempo");
  });

  it("テンポ宙返りのあとにダイビング前宙が続けられる", () => {
    expect(nextSaltoOptions("b_tempo")).toContain("b_divefront");
  });

  it("後方宙返り2回ひねり→テンポ→ダイビング前宙の連鎖が生成に出る", () => {
    let n = 0;
    for (let seed = 1; seed <= 60 && n === 0; seed++)
      autoTumblingTemplates("stick", { random: seededRandom(seed), apparatus: "stick", targetScore: null }).forEach((t) => {
        if (describeText(t.series).includes("後方宙返り2回ひねり→テンポ宙返り→ダイビング前宙")) n++;
      });
    expect(n).toBeGreaterThan(0);
  });
});

describe("クラブ：背面の横投げ→0〜1動作→手具を使ったキャッチ", () => {
  it("生成される。受け方は手具を使ったキャッチだけで、徒手は0〜1動作", () => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++)
      autoThrowTemplates("clubs", { random: seededRandom(seed) }).forEach((t) => {
        const items = t.series.items;
        const i = items.findIndex((x) => x.kind === "throw" && (x.throwTypes ?? []).join() === "noview,side");
        if (i < 0) return;
        // この投げを受けるキャッチ
        const c = items.slice(i + 1).find((x) => x.kind === "catch");
        if (c?.kind !== "catch" || !(c.catchTypes ?? []).includes("useapp")) return;
        const between = items.slice(i + 1, items.indexOf(c));
        const motions = between.reduce((m, x) => m + (x.kind === "motion" ? (x.count ?? 1) : 0), 0);
        expect(motions).toBeLessThanOrEqual(1);
        n++;
      });
    expect(n).toBeGreaterThan(0);
  });
});

describe("クラブ：タンブリング中の手具を使った投げ", () => {
  it("出る。横投げとはセットではない（付く形も付かない形もある。タグの重複はしない）", () => {
    let withSide = 0;
    let withoutSide = 0;
    for (let seed = 1; seed <= 80; seed++)
      autoTumblingTemplates("clubs", { random: seededRandom(seed), apparatus: "clubs", targetScore: null }).forEach((t) =>
        t.series.items.forEach((x) => {
          if (x.kind === "skill" && x.isThrow && (x.throwTypes ?? []).includes("useapp")) {
            if ((x.throwTypes ?? []).includes("side")) withSide++;
            else withoutSide++;
            expect(new Set(x.throwTypes).size).toBe(x.throwTypes!.length);
          }
        }),
      );
    expect(withSide + withoutSide).toBeGreaterThan(0);
    expect(withoutSide).toBeGreaterThan(0);
  });
});
