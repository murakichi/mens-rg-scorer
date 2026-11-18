import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import { noViewDirectionOf, withNoViewDirection, techOptionKind, BETWEEN_LEGS_TAG } from "../constants";
import type { Series, Item } from "../types";
import { maybeSideThrow, autoThrowTemplates } from "../autoThrows";
import { seededRandom } from "../probe";

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

// スティックの視野外の投げ方「両手持ち無回転」（2026-11-16）：無回転タグで表し、視野外の投げ方として入れ替える
describe("視野外の投げ方：両手持ち無回転（スティック）", () => {
  it("スティックでは無回転の視野外の投げを両手持ち無回転として読む（旧データの無回転＋横＋背面も）", () => {
    expect(noViewDirectionOf(["noview", "norotate"], true)).toBe("twohand");
    expect(noViewDirectionOf(["noview", "norotate", "side"], true)).toBe("twohand");
    // クラブ（両手持ち無回転なし）では無回転は投げ方ではない
    expect(noViewDirectionOf(["noview", "norotate", "side"], false)).toBe("side");
  });

  it("投げ方の付け替えで無回転・横・股下を入れ替える（スティック）。クラブでは無回転を残す", () => {
    expect(withNoViewDirection(["noview", "norotate", "side"], "back", true)).toEqual(["noview"]);
    expect(withNoViewDirection(["noview"], "twohand", true)).toEqual(["noview", "norotate"]);
    expect(withNoViewDirection(["noview", "norotate"], "legs", false)).toEqual(["noview", "norotate", BETWEEN_LEGS_TAG]);
  });

  it("採点：視野外の0.1だけ加点し、ほかの視野外の投げ方とは別の種類", () => {
    const r = computeScore(
      [
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview", "norotate"] }, chene(1), { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footPress" }),
      ],
      "stick",
    );
    expect(r.throwKindCount).toBe(2);
    expect(r.techniqueBonus).toBeCloseTo(0.1 + 0.1 + 0.1, 5);
  });
});

describe("生成：股下で投げたあとは手以外のキャッチで受けない（2026-11-16）", () => {
  it("手以外のキャッチで受ける視野外の投げは、乱数が股下に当たっても股下にしない", () => {
    const nv = { id: "noview", name: "視野外の投げ", throwTypes: ["noview"] };
    const nonHand = { id: "nonhand", name: "手以外のキャッチ", catchTypes: ["nonhand"] };
    const plain = { id: "normal", name: "通常のキャッチ" };
    (["stick", "clubs", "ring", "rope"] as const).forEach((app) => {
      expect(maybeSideThrow(app, nv, nonHand, 0, () => 0).throwTypes).not.toContain(BETWEEN_LEGS_TAG);
      expect(maybeSideThrow(app, nv, plain, 0, () => 0).throwTypes).toContain(BETWEEN_LEGS_TAG);
    });
  });
});

describe("生成：股下からの視野外投げは低難度か連続投げの2回目だけ（2026-11-18）", () => {
  const nv = { id: "noview", name: "視野外の投げ", throwTypes: ["noview"] };
  const plain = { id: "normal", name: "通常のキャッチ" };
  it("3動作以上の投げは、連続投げの2回目でなければ股下にしない", () => {
    expect(maybeSideThrow("stick", nv, plain, 3, () => 0).throwTypes).not.toContain(BETWEEN_LEGS_TAG);
    expect(maybeSideThrow("stick", nv, plain, 3, () => 0, (p) => p, true).throwTypes).toContain(BETWEEN_LEGS_TAG);
    expect(maybeSideThrow("stick", nv, plain, 1, () => 0).throwTypes).toContain(BETWEEN_LEGS_TAG);
  });

  it("候補の股下の投げは、受けまで0〜1動作か、同じシリーズの2つ目以降の投げ", () => {
    let n = 0;
    (["stick", "clubs", "ring", "rope"] as const).forEach((app) => {
      for (let seed = 1; seed <= 40; seed++)
        autoThrowTemplates(app, { random: seededRandom(seed) }).forEach((t) => {
          const items = t.series.items;
          items.forEach((it, i) => {
            if (it.kind !== "throw" || !(it.throwTypes ?? []).includes(BETWEEN_LEGS_TAG)) return;
            n++;
            const second = items.slice(0, i).some((x) => x.kind === "throw");
            let motions = 0;
            for (let k = i + 1; k < items.length; k++) {
              const x = items[k];
              if (x.kind === "catch" || x.kind === "throw") break;
              motions += x.kind === "motion" ? (x.count ?? 0) : 1;
            }
            expect(second || motions <= 1).toBe(true);
          });
        });
    });
    expect(n).toBeGreaterThan(0);
  }, 120_000);
});
