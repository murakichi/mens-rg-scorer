import { describe, it, expect } from "vitest";
import { autoThrowTemplates } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { useAppThrowBlockedFlags } from "../analysis";
import { seededRandom } from "../probe";
import type { Item } from "../types";

// クラブ・リングで次々に投げるとき、1つ目をキャッチする前の2つ目は手具を使った投げにできない（オーナー 2026-11-26）
describe("1つ目が空中にあるうちの2つ目の投げ", () => {
  const chene: Item = { kind: "motion", motionId: "chene", count: 1 };
  it("クラブ・リングで、もう1つが空中にある投げの位置だけ true", () => {
    const items: Item[] = [{ kind: "throw" }, chene, { kind: "throw" }, { kind: "catch" }, chene, { kind: "catch" }, { kind: "throw" }, { kind: "catch" }];
    expect(useAppThrowBlockedFlags(items, "clubs")).toEqual([false, false, true, false, false, false, false, false]);
    expect(useAppThrowBlockedFlags(items, "ring")[2]).toBe(true);
    // スティック・ロープは手具が1つなので関係ない
    expect(useAppThrowBlockedFlags(items, "stick").some(Boolean)).toBe(false);
    // 技の最中の投げも同じ
    const inSkill: Item[] = [{ kind: "throw" }, { kind: "skill", skillId: "b_front", isThrow: true }, { kind: "catch" }, { kind: "catch" }];
    expect(useAppThrowBlockedFlags(inSkill, "clubs")).toEqual([false, true, false, false]);
    // 二つ投げを2つ同時キャッチで受けたあとの投げは、両方とも手元に戻っているので false
    const two: Item[] = [{ kind: "throw", reqTypes: ["twothrow"] }, { kind: "catch", catchTwo: true }, { kind: "throw" }];
    expect(useAppThrowBlockedFlags(two, "clubs")).toEqual([false, false, false]);
  });

  it("生成の候補に、もう1つが空中にある手具を使った投げは出ない", () => {
    let throwsChecked = 0;
    for (let seed = 1; seed <= 60; seed++)
      for (const app of ["clubs", "ring"] as const) {
        const all = [
          ...autoThrowTemplates(app, { random: seededRandom(seed) }).map((t) => t.series),
          ...autoTumblingTemplates(app, { random: seededRandom(seed), targetScore: 5 }).map((t) => t.series),
        ];
        all.forEach((ser) => {
          const blocked = useAppThrowBlockedFlags(ser.items, app);
          ser.items.forEach((it, i) => {
            if (!blocked[i]) return;
            throwsChecked += 1;
            const types = it.kind === "throw" || it.kind === "skill" ? it.throwTypes ?? [] : [];
            expect(types).not.toContain("useapp");
          });
        });
      }
    expect(throwsChecked).toBeGreaterThan(0);
  });
});
