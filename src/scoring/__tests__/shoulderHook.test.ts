import { describe, it, expect } from "vitest";
import { autoThrowTemplates, SHOULDER_HOOK_KIND } from "../autoThrows";
import { apparatusBlockers, stripForApparatus } from "../analysis";
import { commonBlockers } from "../templates";
import { computeScore } from "../score";
import { NON_HAND_THROW_KINDS } from "../constants";
import { seededRandom } from "../probe";
import type { Item, Series } from "../types";

// スティックの手以外の投げ「肩に引っ掛けて投げ」（オーナー 2026-11-23）
const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const hook: Item = { kind: "throw", throwTypes: ["nonhand"], nonHandThrowKind: "shoulderHook" };

describe("肩に引っ掛けて投げ：入力と採点", () => {
  it("スティックの手以外の投げの投げ方にだけある", () => {
    expect(NON_HAND_THROW_KINDS.stick.map((k) => k.id)).toEqual([SHOULDER_HOOK_KIND]);
    expect(NON_HAND_THROW_KINDS.clubs).toEqual([]);
    expect(NON_HAND_THROW_KINDS.ring).toEqual([]);
    expect(NON_HAND_THROW_KINDS.rope).toEqual([]);
  });

  it("ほかの手具では入力できないので落とす（スティックではそのまま）", () => {
    const ser = [S(hook, { kind: "catch" })];
    expect(apparatusBlockers(ser, "stick")).toEqual([]);
    expect(apparatusBlockers(ser, "clubs")).toContain("手以外の投げの投げ方");
    const stripped = stripForApparatus(ser, "clubs")[0].items[0] as Extract<Item, { kind: "throw" }>;
    expect(stripped.nonHandThrowKind).toBeUndefined();
    expect(stripped.throwTypes).toEqual(["nonhand"]);
    expect(commonBlockers(ser)).toContain("手以外の投げの投げ方");
  });

  it("技術加点は手以外の投げの0.1のまま。投げ方が違えば別の投げとして加点・種類に数える", () => {
    const plain = computeScore([S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" })], "stick");
    const one = computeScore([S(hook, { kind: "catch" })], "stick");
    expect(one.techniqueBonus).toBeCloseTo(plain.techniqueBonus);
    // 中身が同じシリーズは重複シリーズになるので、2本目は徒手を入れて別のシリーズにする
    const chene: Item = { kind: "motion", motionId: "chene", count: 1, hands: false };
    const both = computeScore(
      [S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }), S(hook, chene, { kind: "catch" })],
      "stick",
    );
    const same = computeScore(
      [S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch" }), S({ kind: "throw", throwTypes: ["nonhand"] }, chene, { kind: "catch" })],
      "stick",
    );
    // 投げ方の種類：手以外の投げ（未選択）と肩に引っ掛けて投げは別の種類
    expect(both.throwKindCount).toBe(same.throwKindCount + 1);
    expect(both.techniqueBonus).toBeCloseTo(plain.techniqueBonus * 2);
    // 同じ投げ方の2回目は加点しない
    const twice = computeScore([S(hook, { kind: "catch" }), S(hook, chene, { kind: "catch" })], "stick");
    expect(twice.techniqueBonus).toBeCloseTo(plain.techniqueBonus);
  });
});

describe("肩に引っ掛けて投げ：生成", () => {
  const found = () => {
    const out: Series[] = [];
    for (let seed = 1; seed <= 60; seed++)
      autoThrowTemplates("stick", { random: seededRandom(seed) }).forEach((t) => {
        if (t.series.items.some((i) => i.kind === "throw" && i.nonHandThrowKind === SHOULDER_HOOK_KIND)) out.push(t.series);
      });
    return out;
  };

  it("スティックで生成され、横投げなし・受けは通常か背面。低難度（0〜1動作）の形が多い", () => {
    const list = found();
    expect(list.length).toBeGreaterThan(0);
    const catches = { normal: 0, noview: 0 };
    let low = 0;
    list.forEach((ser) => {
      const items = ser.items;
      const t = items.findIndex((i) => i.kind === "throw" && i.nonHandThrowKind === SHOULDER_HOOK_KIND);
      const throwItem = items[t] as Extract<Item, { kind: "throw" }>;
      expect(throwItem.throwTypes).toEqual(["nonhand"]);
      const c = items.findIndex((i, k) => k > t && i.kind === "catch");
      const motions = items.slice(t + 1, c).reduce((n, i) => n + (i.kind === "motion" ? (i.count ?? 0) : 1), 0);
      if (motions <= 1) low++;
      const types = (items[c] as Extract<Item, { kind: "catch" }>).catchTypes ?? [];
      expect(types.length === 0 || (types.length === 1 && types[0] === "noview")).toBe(true);
      if (types.length === 0) catches.normal++;
      else catches.noview++;
    });
    // 通常のキャッチ＞背面キャッチ
    expect(catches.normal).toBeGreaterThan(catches.noview);
    // 低難度の形を優先（高難度の形もあるが少ない）
    expect(low).toBeGreaterThan(list.length - low);
  });

  it("背面投げ（視野外の投げ）より候補に入りにくい", () => {
    let hook = 0;
    let noView = 0;
    for (let seed = 1; seed <= 60; seed++)
      autoThrowTemplates("stick", { random: seededRandom(seed) }).forEach((t) => {
        const main = t.series.items.find((i) => i.kind === "throw") as Extract<Item, { kind: "throw" }> | undefined;
        if (!main) return;
        if (main.nonHandThrowKind === SHOULDER_HOOK_KIND) hook++;
        else if ((main.throwTypes ?? []).join() === "noview") noView++;
      });
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(noView);
  });

  it("ほかの手具では生成しない", () => {
    for (let seed = 1; seed <= 20; seed++)
      (["clubs", "ring", "rope"] as const).forEach((app) =>
        autoThrowTemplates(app, { random: seededRandom(seed) }).forEach((t) =>
          t.series.items.forEach((i) => expect(i.kind === "throw" && i.nonHandThrowKind).toBeFalsy()),
        ),
      );
  });
});
