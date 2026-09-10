// =====================================================================
// A（芸術と多様性）の減点 §3.5.6 と E（実施）の床の検証。
// 期待値はすべて mens-rg-rules.md から手計算した literal。
// =====================================================================
import { describe, it, expect } from "vitest";
import { computeScore } from "../score";
import type { Item, Series } from "../types";

const S = (...items: Item[]): Series => ({ executionDeduction: 0, items });
const sk = (skillId: string, hasApparatus = false): Item => ({ kind: "skill", skillId, hasApparatus });

describe("連続宙返り減点（必須要素：宙返り3回以上連続）", () => {
  const chain = (n: number) =>
    computeScore([S(...Array.from({ length: n }, () => sk("b_backsalto")), { kind: "catch" })], "stick");

  it("3連続以上なら減点なし", () => {
    const r = chain(3);
    expect(r.maxChainAll).toBe(3);
    expect(r.saltoChainDeduction).toBe(0);
    expect(r.required.find((c) => c.key === "triple")?.passed).toBe(true);
  });

  it("2連続は −0.10", () => {
    const r = chain(2);
    expect(r.maxChainAll).toBe(2);
    expect(r.saltoChainDeduction).toBeCloseTo(0.1, 5);
    expect(r.required.find((c) => c.key === "triple")?.passed).toBe(false);
  });

  it("1回だけなら −0.20", () => {
    const r = chain(1);
    expect(r.maxChainAll).toBe(1);
    expect(r.saltoChainDeduction).toBeCloseTo(0.2, 5);
  });

  it("宙返りが無ければ −0.20", () => {
    const r = computeScore([S(sk("a_roundoff"), { kind: "catch" })], "stick");
    expect(r.maxChainAll).toBe(0);
    expect(r.saltoChainDeduction).toBeCloseTo(0.2, 5);
  });

  it("A難度技を挟むと連鎖が切れる（ロンダート→宙返り→前宙は最大2連続）", () => {
    const r = computeScore(
      [S(sk("a_roundoff"), sk("b_backsalto"), sk("b_front"), { kind: "catch" })],
      "stick",
    );
    expect(r.maxChainAll).toBe(2);
    expect(r.saltoChainDeduction).toBeCloseTo(0.1, 5);
  });

  it("宙返りの連続に含まれないきりもみは連鎖に数えない（Q&A Q7）", () => {
    const r = computeScore([S(sk("b_kirimomi"), sk("c_kirimomiten"), { kind: "catch" })], "stick");
    expect(r.maxChainAll).toBe(0);
    expect(r.saltoChainDeduction).toBeCloseTo(0.2, 5);
  });

  it("演技全体で最も長い連続を見る（1本でも3連続あれば減点なし）", () => {
    const r = computeScore(
      [S(sk("b_front"), { kind: "catch" }), S(sk("b_backsalto"), sk("b_backtuck"), sk("b_backlayout"), { kind: "catch" })],
      "stick",
    );
    expect(r.maxChainAll).toBe(3);
    expect(r.saltoChainDeduction).toBe(0);
  });
});

describe("無手具操作減点（§3.5 投げなしタンブリング）", () => {
  it("シリーズ全体に手具操作が無ければ −0.20", () => {
    const r = computeScore([S(sk("b_backsalto"), { kind: "catch" })], "stick");
    expect(r.noApparatusDeduction).toBeCloseTo(0.2, 5);
  });

  it("宙返り系すべてに手具操作が無い（他の技にはある）場合は −0.10", () => {
    // ロンダート（手具操作あり・徒手扱い）→ 後方宙返り（操作なし）
    const r = computeScore([S(sk("a_roundoff", true), sk("b_backsalto"), { kind: "catch" })], "stick");
    expect(r.noApparatusDeduction).toBeCloseTo(0.1, 5);
  });

  it("宙返りに手具操作があれば減点なし", () => {
    const r = computeScore([S(sk("a_roundoff", true), sk("b_backsalto", true), { kind: "catch" })], "stick");
    expect(r.noApparatusDeduction).toBe(0);
  });

  it("投げを含むシリーズは対象外", () => {
    const r = computeScore([S({ kind: "throw" }, sk("b_backsalto"), { kind: "catch" })], "stick");
    expect(r.noApparatusDeduction).toBe(0);
  });
});

describe("投げ方・受け方の多様性（§3.5.6.4 必要3種・上限0.50）", () => {
  const normal = S({ kind: "throw" }, { kind: "catch" });
  const noview = S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] });
  const nonhand = S({ kind: "throw", throwTypes: ["nonhand"] }, { kind: "catch", catchTypes: ["nonhand"] });

  it("投げ方・受け方が3種類ずつあれば減点なし", () => {
    const r = computeScore([normal, noview, nonhand], "stick");
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(3);
    expect(r.varietyDeduction).toBe(0);
  });

  it("2種類ずつなら1種類不足で投げ・受けそれぞれ −0.10", () => {
    const r = computeScore([normal, noview], "stick");
    expect(r.throwKindCount).toBe(2);
    expect(r.catchKindCount).toBe(2);
    expect(r.varietyDeduction).toBeCloseTo(0.2, 5);
  });

  it("左手投げは投げ方・受け方の両方を1種類として数える", () => {
    const left = S({ kind: "throw", reqTypes: ["lefthand"] }, { kind: "catch" });
    const r = computeScore([normal, noview, left], "stick");
    // 投げ方: 通常・視野外・左手投げ / 受け方: 通常・視野外・左手受け
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(3);
    expect(r.varietyDeduction).toBe(0);
  });

  it("技中の投げ（投げタン）は投げ方の1種類として数える", () => {
    const tum = S({ kind: "skill", skillId: "b_backsalto", isThrow: true }, { kind: "catch" });
    const r = computeScore([normal, noview, tum], "stick");
    // 投げ方は3種類そろうが、受け方は通常・視野外の2種類のまま
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(2);
    expect(r.varietyDeduction).toBeCloseTo(0.1, 5);
  });

  it("「その他」は実施のたびに1種類として数える", () => {
    const r = computeScore(
      [
        S(
          { kind: "throw", throwTypes: ["other"] },
          { kind: "catch", catchTypes: ["other"] },
          { kind: "throw", throwTypes: ["other"] },
          { kind: "catch", catchTypes: ["other"] },
          { kind: "throw", throwTypes: ["other"] },
          { kind: "catch", catchTypes: ["other"] },
        ),
      ],
      "stick",
    );
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(3);
    expect(r.varietyDeduction).toBe(0);
  });

  it("「その他」は重複シリーズでもカウントされる", () => {
    const other = (): Series =>
      S({ kind: "throw", throwTypes: ["other"] }, { kind: "catch", catchTypes: ["other"] });
    const one = computeScore([other()], "stick");
    const two = computeScore([other(), other()], "stick");
    expect(two.dupFlags[1]).toBe(true);
    expect(one.throwKindCount).toBe(1);
    expect(two.throwKindCount).toBe(2); // 重複シリーズ分も加算される
    expect(one.varietyDeduction).toBeCloseTo(0.4, 5);
    expect(two.varietyDeduction).toBeCloseTo(0.2, 5);
  });

  it("重複シリーズの「その他以外」は種類に数えない", () => {
    const dup = (): Series => S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] });
    const r = computeScore([dup(), dup()], "stick");
    expect(r.dupFlags[1]).toBe(true);
    expect(r.throwKindCount).toBe(1);
    expect(r.catchKindCount).toBe(1);
  });

  it("不足が大きくても上限0.50", () => {
    const r = computeScore([], "stick");
    // 投げ方3種不足 + 受け方3種不足 = 0.6 → 上限0.5
    expect(r.varietyDeduction).toBeCloseTo(0.5, 5);
  });
});

describe("§3.5.6.3 審判判断による違反・欠如（各 −0.30）", () => {
  it("該当なしなら減点0・すべて passed", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick");
    expect(r.violationDeduction).toBe(0);
    expect(r.violationChecks.every((c) => c.passed)).toBe(true);
  });

  it("該当した項目1つにつき −0.30", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick", {
      violations: ["start", "end"],
    });
    expect(r.violationDeduction).toBeCloseTo(0.6, 5);
    expect(r.violationChecks.find((c) => c.key === "viol_start")?.passed).toBe(false);
    expect(r.violationChecks.find((c) => c.key === "viol_music")?.passed).toBe(true);
  });

  it("4項目すべてで −1.20", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick", {
      violations: ["handBasic", "start", "end", "music"],
    });
    expect(r.violationDeduction).toBeCloseTo(1.2, 5);
  });

  it("未知のidは無視する", () => {
    const r = computeScore([S({ kind: "throw" }, { kind: "catch" })], "stick", {
      violations: ["unknown"],
    });
    expect(r.violationDeduction).toBe(0);
  });
});

describe("E（実施）の減点と0床", () => {
  const one = (exec: number): Series => ({ executionDeduction: exec, items: [{ kind: "throw" }, { kind: "catch" }] });

  it("シリーズごとの実施減点を合算する", () => {
    const r = computeScore([one(0.5), { executionDeduction: 1.2, items: [{ kind: "skill", skillId: "b_front" }] }], "stick");
    expect(r.seriesExecutionDeduction).toBeCloseTo(1.7, 5);
    expect(r.eScore).toBeCloseTo(8.3, 5);
  });

  it("演技全体の実施減点も合算する", () => {
    const r = computeScore([one(0.5)], "stick", { overallExecutionDeduction: 0.3 });
    expect(r.executionDeduction).toBeCloseTo(0.8, 5);
    expect(r.eScore).toBeCloseTo(9.2, 5);
  });

  it("10点を超える減点でもEは0で止まる", () => {
    const r = computeScore([one(4)], "stick", { overallExecutionDeduction: 8 });
    expect(r.executionDeduction).toBeCloseTo(12, 5);
    expect(r.eScore).toBe(0);
    expect(r.grandTotal).toBeCloseTo(r.dScore + r.aScore, 5);
  });

  it("個人は1シリーズあたりの実施減点に上限を設けない", () => {
    const r = computeScore([one(3)], "stick");
    expect(r.seriesExecutionDeduction).toBeCloseTo(3, 5);
  });
});

describe("投げ方・受け方の種類：手具を使った投げ受け・技中の投げのタグ", () => {
  it("手具を使った投げ／受けもそれぞれ1種類として数える", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch" }),
        S({ kind: "throw", throwTypes: ["noview"] }, { kind: "catch", catchTypes: ["noview"] }),
        S({ kind: "throw", throwTypes: ["useapp"] }, { kind: "catch", catchTypes: ["useapp"] }),
      ],
      "clubs",
    );
    expect(r.throwKindCount).toBe(3);
    expect(r.catchKindCount).toBe(3);
    expect(r.varietyDeduction).toBe(0);
  });

  it("技中の投げに付けた技術タグも投げ方の種類に数える", () => {
    const r = computeScore(
      [
        S({ kind: "throw" }, { kind: "catch" }),
        S(
          { kind: "skill", skillId: "b_backsalto", isThrow: true, throwTypes: ["noview", "nonhand"] },
          { kind: "catch" },
        ),
      ],
      "clubs",
    );
    // 通常・投げタン・視野外・手以外 の4種類
    expect(r.throwKindCount).toBe(4);
  });

  it("手具を使った技中の投げも種類に数える", () => {
    const r = computeScore(
      [S({ kind: "skill", skillId: "b_backsalto", isThrow: true, throwTypes: ["useapp"] }, { kind: "catch" })],
      "clubs",
    );
    expect(r.throwKindCount).toBe(2); // 投げタン・手具を使った投げ
  });
});
