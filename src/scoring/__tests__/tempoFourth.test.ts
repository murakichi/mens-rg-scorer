import { describe, it, expect } from "vitest";
import { autoTumblingSpecs, hasBackTempoBack } from "../autoTumblings";
import { canEndWith } from "../tumblingTransitions";
import { isTempoSalto } from "../tumblingChain";
import { isBackwardSalto } from "../constants";
import { seededRandom } from "../probe";

// 後方系→テンポ→後方系の三宙からは4本目を実施してよい／上級者は後方の伸身系で終わらない（オーナー 2026-11-20）
describe("後方系→テンポ→後方系の三宙と4本目", () => {
  it("hasBackTempoBack：後方系→テンポ→後方系の並びを見つける。つなぎをまたぐ並びは数えない", () => {
    expect(hasBackTempoBack(["c_back15", "b_tempo", "d_backlay2twist"])).toBe(true);
    expect(hasBackTempoBack(["b_backlayhalf", "b_tempo", "c_backlay1full"], 1)).toBe(false);
    expect(hasBackTempoBack(["b_front", "b_tempo", "c_backlay1full"])).toBe(false);
    expect(hasBackTempoBack(["c_back15", "d_backlay2twist", "b_front"])).toBe(false);
  });

  it("後方の伸身系の宙返りで終わるのは稀な終わり方の抽選に当たったときだけ", () => {
    ["b_backlayout", "b_backlayhalf", "c_backlay1full", "d_backlay25"].forEach((id) => {
      expect(canEndWith(id, { backwardEnd: true, rareEnd: false })).toBe(false);
    });
    // 前向きに降りる伸身の半ひねりは、稀な抽選に当たれば終われる
    expect(canEndWith("b_backlayhalf", { rareEnd: true })).toBe(true);
    // 抱え込みの宙返りは対象外
    expect(canEndWith("b_front", {})).toBe(true);
  });

  it("候補：宙返り4本の連続は、後方系→テンポ→後方系の三宙を含むときだけ。4本目は前方系・側方系が多い", () => {
    let four = 0;
    let forward = 0;
    for (let seed = 1; seed <= 60; seed++)
      autoTumblingSpecs({ random: seededRandom(seed), targetScore: 6 }).forEach((sp) => {
        const ids = sp.saltoIds.slice(0, sp.saltoCount);
        if (ids.length <= sp.pattern.saltos.max) return;
        four++;
        expect(ids.length).toBe(sp.pattern.saltos.max + 1);
        expect(hasBackTempoBack(ids, sp.pattern.connect ? (sp.connectAt ?? 1) : null)).toBe(true);
        const last = ids[ids.length - 1];
        if (!isBackwardSalto(last) || isTempoSalto(last)) forward++;
      });
    expect(four).toBeGreaterThan(0);
    expect(forward / four).toBeGreaterThan(0.7);
  }, 120_000);
});
