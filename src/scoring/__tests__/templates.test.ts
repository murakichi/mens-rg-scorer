import { describe, it, expect } from "vitest";
import {
  addRoutineTemplate,
  apparatusName,
  commonBlockers,
  describeSeries,
  scoringApparatus,
  addSeriesTemplate,
  emptyTemplateStore,
  normalizeTemplateStore,
  removeTemplate,
  renameTemplate,
  splitByApparatus,
  templateMetrics,
} from "../templates";
import type { Item, Series } from "../types";

const ser = (skillId: string): Series => ({
  executionDeduction: 0,
  items: [{ kind: "skill", skillId, hasApparatus: false, isThrow: false }],
});

describe("テンプレートの保存と編集", () => {
  it("シリーズテンプレートを追加できる（中身はコピー）", () => {
    const src = ser("b_front");
    const store = addSeriesTemplate(emptyTemplateStore(), "投げ1本", "stick", src);
    expect(store.series).toHaveLength(1);
    expect(store.series[0].name).toBe("投げ1本");
    expect(store.series[0].apparatus).toBe("stick");
    // 参照ではなくコピー：元を書き換えてもテンプレートは変わらない
    src.items[0] = { kind: "skill", skillId: "b_backsalto", hasApparatus: false, isThrow: false };
    expect((store.series[0].series.items[0] as { skillId: string }).skillId).toBe("b_front");
  });

  it("同じ名前で保存すると上書きになる（増えない）", () => {
    let store = addSeriesTemplate(emptyTemplateStore(), "同名", "stick", ser("b_front"));
    const id = store.series[0].id;
    store = addSeriesTemplate(store, "同名", "rope", ser("b_backsalto"));
    expect(store.series).toHaveLength(1);
    expect(store.series[0].id).toBe(id);
    expect(store.series[0].apparatus).toBe("rope");
  });

  it("構成テンプレートは複数シリーズを持てる", () => {
    const store = addRoutineTemplate(emptyTemplateStore(), "本番構成", "clubs", [ser("b_front"), ser("b_backsalto")]);
    expect(store.routines[0].series).toHaveLength(2);
  });

  it("名前変更と削除", () => {
    let store = addSeriesTemplate(emptyTemplateStore(), "旧名", "stick", ser("b_front"));
    const id = store.series[0].id;
    store = renameTemplate(store, "series", id, "新名");
    expect(store.series[0].name).toBe("新名");
    store = removeTemplate(store, "series", id);
    expect(store.series).toHaveLength(0);
  });

  it("手具ごとに「この手具」と「他の手具」に分けられる", () => {
    let store = addSeriesTemplate(emptyTemplateStore(), "A", "stick", ser("b_front"));
    store = addSeriesTemplate(store, "B", "rope", ser("b_front"));
    const { same, other } = splitByApparatus(store.series, "stick");
    expect(same.map((t) => t.name)).toEqual(["A"]);
    expect(other.map((t) => t.name)).toEqual(["B"]);
  });
});

describe("保存データの正規化", () => {
  it("壊れた項目は捨て、欠けた項目は補う", () => {
    const store = normalizeTemplateStore({
      series: [
        { name: "ok", apparatus: "rope", series: ser("b_front") },
        { name: "シリーズ無し" },
        null,
      ],
      routines: [{ name: "ok2", apparatus: "bogus", series: [ser("b_front")] }, { name: "空", series: [] }],
    });
    expect(store.series.map((t) => t.name)).toEqual(["ok"]);
    expect(store.series[0].id).toBeTruthy();
    expect(store.routines.map((t) => t.name)).toEqual(["ok2"]);
    expect(store.routines[0].apparatus).toBe("stick"); // 不明な手具は既定に落とす
  });

  it("何もないデータは空のテンプレート集合になる", () => {
    expect(normalizeTemplateStore(null)).toEqual({ version: 1, series: [], routines: [] });
    expect(normalizeTemplateStore({ series: "x" })).toEqual({ version: 1, series: [], routines: [] });
  });
});

describe("カード表示用のシリーズ要約", () => {
  it("アイテムを矢印でつなぐ", () => {
    const s: Series = {
      executionDeduction: 0,
      items: [
        { kind: "throw", throwTypes: [], reqTypes: [] },
        { kind: "skill", skillId: "b_front", hasApparatus: false, isThrow: false },
        { kind: "catch", catchTypes: [], catchTwo: false },
      ],
    };
    expect(describeSeries(s)).toBe("投げ→前宙→キャッチ");
  });

  it("徒手動作は回数付き、ロープ跳びは跳びの名前", () => {
    const s: Series = {
      executionDeduction: 0,
      items: [
        { kind: "motion", motionId: "chene", count: 3 },
        { kind: "ropeJump", jumpId: "2f", isMoving6m: false },
      ],
    };
    expect(describeSeries(s)).toBe("シェネ×3→2重跳び（前）");
  });

  it("長いシリーズは途中で省略し、空なら（空）", () => {
    const many: Series = {
      executionDeduction: 0,
      items: Array.from({ length: 8 }, () => ({ kind: "throw" as const, throwTypes: [], reqTypes: [] })),
    };
    expect(describeSeries(many)).toBe("投げ→投げ→投げ→投げ→投げ→投げ→…");
    expect(describeSeries({ executionDeduction: 0, items: [] })).toBe("（空）");
  });
});

describe("テンプレートの難度・点数（範囲検索用）", () => {
  const throwFront = (): Series => ({
    executionDeduction: 0,
    items: [
      { kind: "throw", throwTypes: [], reqTypes: [] },
      { kind: "skill", skillId: "b_front", hasApparatus: false, isThrow: false },
      { kind: "catch", catchTypes: [], catchTwo: false },
    ],
  });
  const salto3 = (): Series => ({
    executionDeduction: 0,
    items: ["b_backsalto", "b_backsalto", "b_backsalto"].map((skillId) => ({
      kind: "skill" as const,
      skillId,
      hasApparatus: false,
      isThrow: false,
    })),
  });

  it("含まれるユニットの最高難度とDスコアを返す", () => {
    const a = templateMetrics([throwFront()], "stick");
    expect(a.diff).toBe("C"); // 投げ+前宙 = 投げタンC
    expect(a.dScore).toBeCloseTo(0.3, 5);
    const b = templateMetrics([salto3()], "stick");
    expect(b.diff).toBe("D"); // B+1+1 = D
    expect(b.dScore).toBeCloseTo(0.5, 5);
  });

  it("複数シリーズの構成は全体のDになる", () => {
    const both = templateMetrics([throwFront(), salto3()], "stick");
    expect(both.dScore).toBeCloseTo(0.8, 5);
    expect(both.diff).toBe("D");
  });

  it("空のシリーズは難度なし・0点", () => {
    const m = templateMetrics([{ executionDeduction: 0, items: [] }], "stick");
    expect(m.diff).toBeNull();
    expect(m.diffValue).toBe(0);
    expect(m.dScore).toBe(0);
  });

  it("ジュニアの難度認定が反映される（ダイビング前宙 B→C）", () => {
    const ser: Series = {
      executionDeduction: 0,
      items: [{ kind: "skill", skillId: "b_divefront", hasApparatus: false, isThrow: false }],
    };
    expect(templateMetrics([ser], "stick").diff).toBe("B");
    expect(templateMetrics([ser], "stick", true).diff).toBe("C");
  });
});

describe("共通テンプレート", () => {
  const item = (i: Item): Series => ({ executionDeduction: 0, items: [i] });

  it("手具固有の要素があると共通にできない", () => {
    expect(commonBlockers([item({ kind: "throw", reqTypes: ["lefthand"] })])).toEqual(["左手投げ"]);
    expect(commonBlockers([item({ kind: "throw", reqTypes: ["twothrow"] })])).toEqual(["二つ投げ"]);
    expect(commonBlockers([item({ kind: "throw", throwTypes: ["useapp"] })])).toEqual(["手具を使った投げ"]);
    expect(commonBlockers([item({ kind: "catch", catchTypes: ["useapp"] })])).toEqual(["手具を使ったキャッチ"]);
    expect(commonBlockers([item({ kind: "catch", catchTwo: true })])).toEqual(["2つ同時キャッチ"]);
    expect(commonBlockers([item({ kind: "ropeJump", jumpId: "2f" })])).toEqual(["ロープ跳び"]);
  });

  it("手具に依らない内容なら共通にできる", () => {
    const ser: Series = {
      executionDeduction: 0,
      items: [
        { kind: "throw", throwTypes: ["noview"] },
        { kind: "skill", skillId: "b_front", hasApparatus: true, isThrow: false },
        { kind: "catch", catchTypes: ["nonhand"] },
      ],
    };
    expect(commonBlockers([ser])).toEqual([]);
  });

  it("共通・この手具・他の手具に分かれる", () => {
    let store = addSeriesTemplate(emptyTemplateStore(), "共通の", "common", ser("b_front"));
    store = addSeriesTemplate(store, "スティックの", "stick", ser("b_front"));
    store = addSeriesTemplate(store, "ロープの", "rope", ser("b_front"));
    const { common, same, other } = splitByApparatus(store.series, "stick");
    expect(common.map((t) => t.name)).toEqual(["共通の"]);
    expect(same.map((t) => t.name)).toEqual(["スティックの"]);
    expect(other.map((t) => t.name)).toEqual(["ロープの"]);
  });

  it("共通は手具名として「共通」を返し、採点にはスティックを使う", () => {
    expect(apparatusName("common")).toBe("共通");
    expect(scoringApparatus("common")).toBe("stick");
    expect(scoringApparatus("rope")).toBe("rope");
  });

  it("保存データの共通も復元できる", () => {
    const store = normalizeTemplateStore({
      series: [{ name: "c", apparatus: "common", series: ser("b_front") }],
      routines: [],
    });
    expect(store.series[0].apparatus).toBe("common");
  });
});
