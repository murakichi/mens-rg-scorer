import { describe, it, expect } from "vitest";
import { autoTumblingTemplates } from "../autoTumblings";
import { nextSaltoOptions } from "../tumblingChain";
import { seededRandom } from "../probe";
import { slowIt } from "./slow";

// 後方宙返り半ひねり（抱え込み）は実戦ではほぼ使われないので、伸身に置き換える（オーナー 2026-11-16）
const TUCK = "b_backhalf";
const LAYOUT = "b_backlayhalf";
const isSalto = (id: string) => !["b_roundoff", "b_backhand", "a_cartwheel"].includes(id);

describe("後方宙返り半ひねりは伸身を優先する", () => {
  it("伸身の半ひねりのあとに続けられない技（側宙・転宙など）があるので、その位置は抱え込みのまま", () => {
    const tuckNext = nextSaltoOptions(TUCK);
    const layoutNext = nextSaltoOptions(LAYOUT);
    expect(layoutNext.every((id) => tuckNext.includes(id))).toBe(true);
    expect(tuckNext.filter(isSalto).length).toBeGreaterThan(layoutNext.length);
  });
});

slowIt("（傾向）全手具で抱え込みの半ひねりは伸身より十分少ない", () => {
  for (const apparatus of ["stick", "clubs", "ring", "rope"] as const) {
    let tuck = 0;
    let layout = 0;
    for (let seed = 1; seed <= 60; seed++)
      autoTumblingTemplates(apparatus, { random: seededRandom(seed) }).forEach((t) =>
        t.series.items.forEach((it) => {
          if (it.kind !== "skill") return;
          if (it.skillId === TUCK) tuck++;
          if (it.skillId === LAYOUT) layout++;
        }),
      );
    expect(layout).toBeGreaterThan(tuck * 2);
  }
}, 240_000);
