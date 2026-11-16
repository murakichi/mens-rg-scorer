import { describe, it, expect } from "vitest";
import { autoTumblingTemplates } from "../autoTumblings";
import { nextSaltoOptions } from "../tumblingChain";
import { seededRandom } from "../probe";
import { slowIt } from "./slow";

// 後方宙返り半ひねり（抱え込み）は実戦ではほぼ使われないので、伸身に置き換える（オーナー 2026-11-16）
const TUCK = "b_backhalf";
const LAYOUT = "b_backlayhalf";

describe("後方宙返り半ひねりは伸身を優先する", () => {
  it("伸身の半ひねりのあとにも、抱え込みと同じく側宙・転宙・前方1回ひねりを続けられる（オーナー 2026-11-16）", () => {
    const layoutNext = nextSaltoOptions(LAYOUT);
    ["b_sidesalto", "b_tenchu", "c_front1full", "b_front"].forEach((id) => expect(layoutNext).toContain(id));
    // 前向きに降りるので後方系は続けない
    expect(layoutNext).not.toContain("c_back15");
  });

  it("連鎖として抱え込みでも伸身でも組める並びは、候補ではほぼ伸身になる", () => {
    let tuck = 0;
    let layout = 0;
    for (let seed = 1; seed <= 30; seed++)
      autoTumblingTemplates("stick", { random: seededRandom(seed) }).forEach((t) =>
        t.series.items.forEach((it, i, all) => {
          if (it.kind !== "skill") return;
          const next = all[i + 1];
          // 側宙・転宙が続く位置（以前は抱え込みのままだった位置）
          if (!(next?.kind === "skill" && ["b_sidesalto", "b_tenchu"].includes(next.skillId))) return;
          if (it.skillId === TUCK) tuck++;
          if (it.skillId === LAYOUT) layout++;
        }),
      );
    expect(layout + tuck).toBeGreaterThan(0);
    expect(layout).toBeGreaterThan(tuck);
  }, 60_000);
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
