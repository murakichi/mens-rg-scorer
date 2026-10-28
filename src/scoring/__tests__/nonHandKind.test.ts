import { describe, it, expect } from "vitest";
import { autoThrowTemplates } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { computeScore } from "../score";
import { apparatusBlockers, stripForApparatus } from "../analysis";
import { commonBlockers } from "../templates";
import { NON_HAND_CATCH_KINDS, nonHandKindOf } from "../constants";
import { seededRandom } from "../probe";
import type { ApparatusKey, Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const APPS: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];

describe("手以外のキャッチの受け方（プルダウン）", () => {
  it("手具ごとの選択肢（リングは横投げ前提のものがある）", () => {
    expect(NON_HAND_CATCH_KINDS.stick.map((k) => k.name)).toEqual(["首と肩に挟む", "足で押さえつけ", "足で挟む", "胴で挟む"]);
    expect(NON_HAND_CATCH_KINDS.clubs.map((k) => k.name)).toEqual(["足で押さえつけ", "足で挟む"]);
    expect(NON_HAND_CATCH_KINDS.rope.map((k) => k.name)).toEqual(["肩", "足に巻き付け"]);
    expect(NON_HAND_CATCH_KINDS.ring.filter((k) => k.needsSide)).toHaveLength(3);
    expect(NON_HAND_CATCH_KINDS.ring.filter((k) => !k.needsSide).map((k) => k.name)).toEqual(["両足で挟む"]);
  });

  it("採点には影響しない（技術加点は手以外のキャッチの0.1のまま）", () => {
    const base = computeScore([S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"] })], "stick");
    const withKind = computeScore(
      [S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "footClamp" })],
      "stick",
    );
    expect(withKind.techniqueBonus).toBe(base.techniqueBonus);
    expect(withKind.dScore).toBe(base.dScore);
  });

  it("その手具に無い受け方は入力できない（確認・落とす）。共通テンプレには保存できない", () => {
    const list = [S({ kind: "throw" }, { kind: "catch", catchTypes: ["nonhand"], nonHandKind: "bothFeetClamp" })];
    expect(apparatusBlockers(list, "ring")).toEqual([]);
    expect(apparatusBlockers(list, "stick")).toContain("手以外のキャッチの受け方");
    const stripped = stripForApparatus(list, "stick")[0].items[1];
    expect(stripped.kind === "catch" && stripped.nonHandKind).toBeUndefined();
    expect(commonBlockers(list)).toContain("手以外のキャッチの受け方");
  });

  it.each(APPS)("%s：自動生成の手以外のキャッチには、その手具の受け方が付き、リングの横投げ前提は横投げのときだけ", (app) => {
    const all: Series[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      all.push(...autoThrowTemplates(app, { random: seededRandom(seed) }).map((t) => t.series));
      all.push(...autoTumblingTemplates(app, { random: seededRandom(seed), apparatus: app, targetScore: null }).map((t) => t.series));
    }
    let nonHand = 0;
    all.forEach((ser) => {
      let side = false;
      ser.items.forEach((it) => {
        if (it.kind === "throw" || (it.kind === "skill" && it.isThrow)) side = (it.throwTypes ?? []).includes("side");
        if ((it.kind === "catch" || (it.kind === "skill" && it.isCatch)) && (it.catchTypes ?? []).includes("nonhand")) {
          nonHand++;
          const kind = nonHandKindOf(app, it.nonHandKind);
          if (NON_HAND_CATCH_KINDS[app].length > 0 && app !== "ring") expect(kind).toBeDefined();
          if (kind?.needsSide) expect(side).toBe(true);
        }
      });
    });
    expect(nonHand).toBeGreaterThan(0);
  });
});

describe("スティックの無回転", () => {
  it("技術加点は付けない（横投げと同じ。投げ方の種類として数える）", () => {
    const plain = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    const norot = computeScore([S({ kind: "throw", throwTypes: ["norotate"] }, { kind: "catch" })], "stick");
    expect(norot.techniqueBonus).toBe(plain.techniqueBonus);
  });

  it("スティック以外では入力できない", () => {
    const list = [S({ kind: "throw", throwTypes: ["norotate"] }, { kind: "catch" })];
    expect(apparatusBlockers(list, "stick")).toEqual([]);
    expect(apparatusBlockers(list, "clubs")).toContain("無回転");
    expect(commonBlockers(list)).toContain("無回転");
  });

  it("自動生成：スティックの手以外のキャッチは無回転で投げたときだけ", () => {
    let nonHand = 0;
    for (let seed = 1; seed <= 30; seed++) {
      autoThrowTemplates("stick", { random: seededRandom(seed) }).forEach((t) => {
        let norot = false;
        t.series.items.forEach((it) => {
          if (it.kind === "throw") norot = (it.throwTypes ?? []).includes("norotate");
          if (it.kind === "catch" && (it.catchTypes ?? []).includes("nonhand")) {
            nonHand++;
            expect(norot).toBe(true);
          }
        });
      });
    }
    expect(nonHand).toBeGreaterThan(0);
  });

  it("スティックの自動生成に無回転の投げが出る。他の手具には出ない", () => {
    const has = (app: ApparatusKey) => {
      for (let seed = 1; seed <= 10; seed++)
        if (autoThrowTemplates(app, { random: seededRandom(seed) }).some((t) =>
          t.series.items.some((i) => i.kind === "throw" && (i.throwTypes ?? []).includes("norotate")))) return true;
      return false;
    };
    expect(has("stick")).toBe(true);
    expect(has("clubs")).toBe(false);
  });
});
