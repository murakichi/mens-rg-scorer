import { describe, it, expect } from "vitest";
import { SUGGESTION_KIND_NAMES, suggestImprovements, type Suggestion } from "../suggest";
import { computeScore } from "../score";
import { ART_DEDUCTION_ITEMS, VIOLATION_OPTIONS, skillOptions, skillFlowAfter, ROUNDOFF_SKILL_ID } from "../constants";
import { needsRoundoffBefore, prevSkillId, roundoffItem } from "../analysis";
import type { Item } from "../types";
import type { ApparatusKey, Series } from "../types";

const skill = (skillId: string, extra: Record<string, unknown> = {}) =>
  ({ kind: "skill", skillId, hasApparatus: false, isThrow: false, ...extra }) as const;

/** 投げ→シェネ2→キャッチ／ロンダート→後方宙返り／投げ→前宙→キャッチ */
const routine = (): Series[] => [
  {
    executionDeduction: 0,
    items: [
      { kind: "throw", throwTypes: [], reqTypes: [] },
      { kind: "motion", motionId: "chene", count: 2 },
      { kind: "catch", catchTypes: [] },
    ],
  },
  { executionDeduction: 0, items: [skill(ROUNDOFF_SKILL_ID), skill("b_backsalto")] },
  {
    executionDeduction: 0,
    items: [
      { kind: "throw", throwTypes: [], reqTypes: [] },
      skill("b_front"),
      { kind: "catch", catchTypes: [] },
    ],
  },
];

const total = (list: Series[], apparatus: ApparatusKey = "stick", junior = false) => {
  const r = computeScore(list, apparatus, { junior });
  return r.dScore + r.aScore;
};

describe("改善提案の基本", () => {
  it("点数が上がる候補だけを、効果の大きい順に返す", () => {
    const list = suggestImprovements(routine(), "stick");
    expect(list.length).toBeGreaterThan(0);
    list.forEach((s) => expect(s.totalDelta).toBeGreaterThan(0));
    for (let i = 1; i < list.length; i++) expect(list[i - 1].totalDelta).toBeGreaterThanOrEqual(list[i].totalDelta);
  });

  it("示した点差が、その構成を実際に採点した差と一致する", () => {
    const base = routine();
    const baseTotal = total(base);
    suggestImprovements(base, "stick").forEach((s) => {
      const r = computeScore(s.series, "stick", { junior: false });
      expect(r.dScore + r.aScore - baseTotal).toBeCloseTo(s.totalDelta, 6);
      expect(r.dScore - computeScore(base, "stick", {}).dScore).toBeCloseTo(s.dDelta, 6);
      expect(r.aScore - computeScore(base, "stick", {}).aScore).toBeCloseTo(s.aDelta, 6);
    });
  });

  it("元の構成を書き換えない（純粋関数）", () => {
    const base = routine();
    const snapshot = JSON.stringify(base);
    suggestImprovements(base, "stick");
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("limit で件数を絞れる", () => {
    expect(suggestImprovements(routine(), "stick", { limit: 3 })).toHaveLength(3);
    expect(suggestImprovements(routine(), "stick", { limit: 0 })).toHaveLength(0);
  });

  it("同じ場所への候補は1件にまとまる（E難度が並ばない）", () => {
    const list = suggestImprovements(routine(), "stick", { limit: 50 });
    const targets = list.map((s) => s.id);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("空の構成では提案できるものが無い", () => {
    expect(suggestImprovements([{ executionDeduction: 0, items: [] }], "stick")).toEqual([]);
  });
});

describe("提案の中身", () => {
  it("手具操作が付いていない転回技には「手具操作を足す」が出る（−0.2/−0.3 が消える）", () => {
    const list = suggestImprovements(routine(), "stick", { limit: 50 });
    const op = list.find((s) => s.kind === "apparatusOp");
    expect(op).toBeDefined();
    // 手具操作なしのA減点が減る＝A残点が増える
    expect(op!.aDelta).toBeGreaterThan(0);
  });

  it("技術タグの無い投げ・キャッチには技術加点の提案が出る", () => {
    const list = suggestImprovements(routine(), "stick", { limit: 50 });
    expect(list.some((s) => s.kind === "throwType")).toBe(true);
    expect(list.some((s) => s.kind === "catchType")).toBe(true);
  });

  it("その手具で入力できないタグは提案しない（スティックに手具を使った投げは出ない）", () => {
    // 1箇所につき最良の1件しか出さないので、他のタグを埋めて「手具を使った」だけを残す
    const saturated = (): Series[] => [
      {
        executionDeduction: 0,
        items: [
          { kind: "throw", throwTypes: ["noview", "nonhand", "other"], reqTypes: [] },
          { kind: "motion", motionId: "chene", count: 2 },
          { kind: "catch", catchTypes: ["noview", "nonhand", "other"] },
        ],
      },
      ...routine().slice(1),
    ];
    // スティックには「手具を使った投げ・キャッチ」という入力が無いので出てこない
    expect(suggestImprovements(saturated(), "stick", { limit: 50 }).some((s) => s.label.includes("手具を使った"))).toBe(
      false,
    );
    // クラブなら出せる（もう一方の手具を使うので §3.5 の技術加点が付く）
    expect(suggestImprovements(saturated(), "clubs", { limit: 50 }).some((s) => s.label.includes("手具を使った"))).toBe(
      true,
    );
  });

  it("提案された構成は入力画面で選べる技だけを使う", () => {
    suggestImprovements(routine(), "stick", { limit: 50 }).forEach((s) => {
      s.series.forEach((ser) => {
        ser.items.forEach((item, iIdx) => {
          if (item.kind !== "skill" || !item.skillId) return;
          const allowed = skillOptions(false, skillFlowAfter(prevSkillId(ser.items, iIdx)));
          expect(allowed.map((x) => x.id)).toContain(item.skillId);
        });
      });
    });
  });

  it("ジュニアでは2回宙返りを提案しない（§10 変更規則1）", () => {
    suggestImprovements(routine(), "stick", { junior: true, limit: 50 }).forEach((s) => {
      s.series.forEach((ser) =>
        ser.items.forEach((item) => {
          if (item.kind === "skill") expect(item.skillId).not.toMatch(/double|2回宙/);
        }),
      );
    });
    // ジュニアで許可されない技が混ざっていないことを、選択肢そのもので確かめる
    const juniorIds = new Set(skillOptions(true).map((x) => x.id));
    suggestImprovements(routine(), "stick", { junior: true, limit: 50 }).forEach((s) =>
      s.series.forEach((ser) =>
        ser.items.forEach((item) => {
          if (item.kind === "skill" && item.skillId) expect(juniorIds.has(item.skillId)).toBe(true);
        }),
      ),
    );
  });

  it("ロンダートを別の技に替える案は「後に足す」として説明する（ロンダートは戻るので実質1本追加）", () => {
    const list = suggestImprovements(routine(), "stick", { limit: 50 });
    const add = list.find((s) => s.kind === "addSkill" && s.label.includes("ロンダートの後に"));
    expect(add).toBeDefined();
    // 説明どおり、ロンダートは残って技が1つ増えている
    const before = routine()[1].items.length;
    expect(add!.series[1].items.length).toBe(before + 1);
    expect((add!.series[1].items[0] as { skillId: string }).skillId).toBe(ROUNDOFF_SKILL_ID);
  });

  it("点にならず減点だけ増やすシリーズには「削る」が出る（ジュニアの投げ上限超過）", () => {
    // ジュニアは投げ上げ5回まで（§10 変更規則1）。6回目からは何の点にもならず1回 −0.3。
    const thr = (n: number): Series => ({
      executionDeduction: 0,
      items: [
        { kind: "throw", throwTypes: [], reqTypes: [] },
        { kind: "motion", motionId: "chene", count: n },
        { kind: "catch", catchTypes: [] },
      ],
    });
    // routine() の投げ2本 + 5本 = 7本（内容はすべて別＝重複にならない）
    const many: Series[] = [...routine(), thr(1), thr(3), thr(4), thr(5), thr(6)];
    expect(computeScore(many, "stick", { junior: true }).overThrowCount).toBe(2);
    const list = suggestImprovements(many, "stick", { junior: true, limit: 50 });
    expect(list.some((s) => s.kind === "removeSeries")).toBe(true);
  });

  it("重複しただけのシリーズは「削る」に出ない（点差が0なので）", () => {
    // 重複シリーズはDにも本数にも入らないが、減点も増えない＝削っても点は変わらない
    const dup: Series[] = [...routine(), { executionDeduction: 0, items: [skill(ROUNDOFF_SKILL_ID), skill("b_backsalto")] }];
    const list = suggestImprovements(dup, "stick", { limit: 50 });
    expect(list.some((s) => s.kind === "removeSeries")).toBe(false);
  });

  it("すべての種類に表示名がある", () => {
    const list = suggestImprovements(routine(), "stick", { limit: 50 });
    list.forEach((s: Suggestion) => expect(SUGGESTION_KIND_NAMES[s.kind]).toBeTruthy());
  });
});

describe("編集画面と同じ結果になること", () => {
  /** `SeriesListEditor.updateItem` をそのまま写した手順 */
  const editorReplace = (items: Item[], iIdx: number, skillId: string): Item[] => {
    const next = structuredClone(items);
    next[iIdx] = { ...next[iIdx], skillId } as Item;
    if (needsRoundoffBefore(next, iIdx)) next.splice(iIdx, 0, roundoffItem());
    return next;
  };

  it("技の差し替えが、編集画面で同じ操作をしたときと同一の構成になる", () => {
    // 提案どおりに入力したら提案どおりの点になる、という一番大事な性質。
    // suggest.ts が editor と別の手順に分岐したらここで落ちる。
    const cases: Series[] = [
      { executionDeduction: 0, items: [{ kind: "throw", throwTypes: [], reqTypes: [] }, skill(ROUNDOFF_SKILL_ID), skill("b_backsalto"), { kind: "catch", catchTypes: [] }] },
      { executionDeduction: 0, items: [skill(ROUNDOFF_SKILL_ID), skill("a_flicflac"), skill("b_backsalto"), skill("b_front")] },
      { executionDeduction: 0, items: [skill("b_front"), skill("b_backsalto")] },
    ];
    let compared = 0;
    cases.forEach((ser) => {
      ser.items.forEach((item, iIdx) => {
        if (item.kind !== "skill") return;
        skillOptions(false, skillFlowAfter(prevSkillId(ser.items, iIdx))).forEach((opt) => {
          compared++;
          const viaEditor = editorReplace(ser.items, iIdx, opt.id);
          const viaSuggest = (() => {
            const next = ser.items.map((x, k) => (k === iIdx ? { ...x, skillId: opt.id } : x)) as Item[];
            if (needsRoundoffBefore(next, iIdx)) next.splice(iIdx, 0, roundoffItem());
            return next;
          })();
          expect(viaSuggest).toEqual(viaEditor);
        });
      });
    });
    expect(compared).toBeGreaterThan(100);
  });
});

describe("審判が入れたA減点を踏まえる", () => {
  it("A減点が10点に達していると、A側だけの改善は提案しない（残点は増えないので）", () => {
    // 違反・欠如をすべてチェックして A残点 を0に張り付かせる
    const violations = VIOLATION_OPTIONS.map((v) => v.id);
    const artDeductions: Record<string, number> = {};
    ART_DEDUCTION_ITEMS.forEach((i) => (artDeductions[i.id] = i.max));
    // 必須要素をほとんど満たさない最小構成にして、A減点を10点に張り付かせる
    const bare: Series[] = [{ executionDeduction: 0, items: [skill(ROUNDOFF_SKILL_ID), skill("b_backsalto")] }];
    const opts = { violations, artDeductions };
    const r = computeScore(bare, "stick", opts);
    expect(r.aScore).toBe(0);

    const list = suggestImprovements(bare, "stick", { ...opts, limit: 50 });
    list.forEach((s) => {
      const after = computeScore(s.series, "stick", opts);
      // 増えると言った分は、その入力のもとで本当に増える
      expect(after.dScore + after.aScore - (r.dScore + r.aScore)).toBeCloseTo(s.totalDelta, 6);
      // A残点は0で頭打ちなので、A側だけを直す案は「上がる」と言わない
      expect(s.dDelta).toBeGreaterThan(0);
    });

    // 審判入力を渡さないと基準がずれる（この引数を落としてはいけない、という回帰）
    const ignored = suggestImprovements(bare, "stick", { limit: 50 });
    expect(ignored.some((s) => s.dDelta === 0 && s.aDelta > 0)).toBe(true);
  });
});
