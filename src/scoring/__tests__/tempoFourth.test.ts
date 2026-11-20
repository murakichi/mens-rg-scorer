import { describe, it, expect } from "vitest";
import { AUTO_TUMBLING_PATTERNS, autoTumblingSpecs, chainEndsOk, endsWithBackTempoBack, hasBackTempoBack } from "../autoTumblings";
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

  it("三宙の最後が伸身でない宙返りなら、後ろ向きに降りてもそのまま終わってよい（2026-11-20）", () => {
    const chain = AUTO_TUMBLING_PATTERNS.find((p) => p.id === "chain")!;
    const draws = { backwardEnd: false, rareEnd: false, layoutAfterConnect: true, backToForwardThrow: false };
    // 後方宙返り2回ひねり（抱え込み・後ろ向きに降りる）で終わる三宙
    const ids = ["b_backlayout", "b_tempo", "d_back2twist"];
    expect(endsWithBackTempoBack(ids, 3)).toBe(true);
    expect(chainEndsOk(chain, ids, 3, 1, draws)).toBe(true);
    // 三宙でなければ、後ろ向きに降りる宙返りで終わるのは今までどおり抽選しだい
    expect(chainEndsOk(chain, ["d_back2twist"], 1, 1, draws)).toBe(false);
    // 最後が伸身なら稀な終わり方のまま
    expect(chainEndsOk(chain, ["b_backlayout", "b_tempo", "d_backlay2twist"], 3, 1, draws)).toBe(false);
  });
});

describe("上級者の三宙：後方伸身1回半ひねり→前宙→側宙がいちばん多い（2026-11-20）", () => {
  it("前宙のあとの側宙を、後方伸身1回半ひねり→前宙のときだけ選ばれやすくする（上限4.4未満には効かせない）", async () => {
    const { favoredTripleWeight } = await import("../tumblingWeights");
    expect(favoredTripleWeight("c_backlay15", "b_front", "b_sidesalto")).toBeGreaterThan(1);
    expect(favoredTripleWeight("c_backlay1full", "b_front", "b_sidesalto")).toBe(1);
    expect(favoredTripleWeight("c_backlay15", "b_front", "b_kirimomi")).toBe(1);
    expect(favoredTripleWeight("c_backlay15", "b_front", "b_sidesalto", 3.0)).toBe(1);
    expect(favoredTripleWeight("c_backlay15", "b_front", "b_sidesalto", 4.5)).toBeGreaterThan(1);
  });
});
