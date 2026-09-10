import { describe, it, expect } from "vitest";
import {
  addRoutineTemplate,
  describeSeries,
  addSeriesTemplate,
  emptyTemplateStore,
  normalizeTemplateStore,
  removeTemplate,
  renameTemplate,
  splitByApparatus,
} from "../templates";
import type { Series } from "../types";

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
