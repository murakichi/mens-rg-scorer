import { describe, expect } from "vitest";
import { slowIt } from "./slow";
import { autoTumblingTemplates, LAYOUT_BEFORE_BACKWARD_CHANCE } from "../autoTumblings";
import { isBackwardSalto, skillDef } from "../constants";
import { seededRandom } from "../probe";

describe("後方系→後方系は先に実施するほうを伸身にする", () => {
  slowIt("後方→後方の先のほうは、ひねりのある技なら大半が伸身", () => {
    expect(LAYOUT_BEFORE_BACKWARD_CHANCE).toBeGreaterThan(0.5);
    let pairs = 0;
    let layout = 0;
    for (let seed = 1; seed <= 80; seed++)
      autoTumblingTemplates("stick", { random: seededRandom(seed), apparatus: "stick", targetScore: null }).forEach((t) => {
        const ids = t.series.items.flatMap((x) => (x.kind === "skill" ? [x.skillId] : []));
        for (let i = 0; i < ids.length - 1; i++) {
          // つなぎ技（A難度）を挟んだ境目は別の連続なので、隣り合うものだけを見る
          if (!isBackwardSalto(ids[i]) || !isBackwardSalto(ids[i + 1])) continue;
          const tw = skillDef(ids[i])?.twist;
          if (!tw) continue;
          pairs++;
          if (tw.posture === "layout") layout++;
        }
      });
    expect(pairs).toBeGreaterThan(20);
    expect(layout / pairs).toBeGreaterThan(0.65);
  }, 120_000);
});
