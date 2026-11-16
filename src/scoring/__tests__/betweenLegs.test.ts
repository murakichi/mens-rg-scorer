import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { noViewDirectionOf, withNoViewDirection, techOptionKind, BETWEEN_LEGS_TAG } from "../constants";
import type { Series, Item } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const chene = (count: number): Item => ({ kind: "motion", motionId: "chene", count });

// 視野外の投げの方向に「股下」を追加（2026-11-16）。横と同じく技術加点は付けず、投げ方の種類としては別に数える
describe("視野外の投げ：股下", () => {
  it("技術加点は視野外の0.1だけ（股下は加点にならない）", () => {
    expect(techOptionKind(BETWEEN_LEGS_TAG)).toBe("kind");
    const r = computeScore([S({ kind: "throw", throwTypes: ["noview", BETWEEN_LEGS_TAG] }, { kind: "catch" })], "stick");
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("真後ろ・横・股下はそれぞれ別の投げ方（種類にも、技術加点の重複判定にも）", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview", "side"] }, chene(1), { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview", BETWEEN_LEGS_TAG] }, chene(2), { kind: "catch" }),
      ],
      "stick",
    );
    expect(r.throwKindCount).toBe(3);
    expect(r.techniqueBonus).toBeCloseTo(0.3, 5);
  });

  it("方向のプルダウン：読み取りと付け替え（ほかのタグは残す）", () => {
    expect(noViewDirectionOf(["noview"])).toBe("back");
    expect(noViewDirectionOf(["noview", "side"])).toBe("side");
    expect(noViewDirectionOf(["noview", BETWEEN_LEGS_TAG])).toBe("legs");
    expect(withNoViewDirection(["noview", "side", "norotate"], "legs")).toEqual(["noview", "norotate", BETWEEN_LEGS_TAG]);
    expect(withNoViewDirection(["noview", BETWEEN_LEGS_TAG], "back")).toEqual(["noview"]);
  });
});

describe("股下の入力の後始末と生成", () => {
  it("視野外でない投げに残った股下は落とす（採点・読み込み）", async () => {
    const { stripForApparatus, apparatusBlockers, APPARATUS_INPUT_NAMES } = await import("../analysis");
    const list = [S({ kind: "throw", throwTypes: [BETWEEN_LEGS_TAG] }, { kind: "catch" })];
    expect(apparatusBlockers(list, "stick")).toContain(APPARATUS_INPUT_NAMES.legsWithoutNoView);
    expect((stripForApparatus(list, "stick")[0].items[0] as { throwTypes?: string[] }).throwTypes).toEqual([]);
    // 視野外の股下は残す
    const ok = [S({ kind: "throw", throwTypes: ["noview", BETWEEN_LEGS_TAG] }, { kind: "catch" })];
    expect(apparatusBlockers(ok, "rope")).toEqual([]);
  });

  it("股下は横投げのないロープでも選べる", () => {
    const r = computeScore([S({ kind: "throw", throwTypes: ["noview", BETWEEN_LEGS_TAG] }, { kind: "catch" })], "rope");
    expect(r.techniqueBonus).toBeCloseTo(0.1, 5);
  });

  it("自動生成の候補にも股下の視野外の投げが出る（全手具）", async () => {
    const { autoThrowTemplates } = await import("../autoThrows");
    const { seededRandom } = await import("../probe");
    (["stick", "clubs", "ring", "rope"] as const).forEach((ap) => {
      let hit = false;
      for (let seed = 1; seed <= 30 && !hit; seed++)
        hit = autoThrowTemplates(ap, { random: seededRandom(seed) }).some((t) =>
          t.series.items.some((i) => i.kind === "throw" && (i.throwTypes ?? []).includes(BETWEEN_LEGS_TAG)),
        );
      expect(hit).toBe(true);
    });
  });
});
