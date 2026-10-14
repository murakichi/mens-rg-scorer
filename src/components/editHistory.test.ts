import { describe, it, expect } from "vitest";
import {
  COALESCE_MS,
  emptyHistory,
  recordEdit,
  redoStep,
  shapeOf,
  shouldCoalesce,
  undoStep,
} from "./editHistory";

/** 読みやすさ用：past/future を配列で比べる */
const stacks = <T>(past: T[], future: T[]) => ({ past, future });

describe("形の署名（数値だけ潰す）", () => {
  it("数値を変えただけなら署名は変わらない", () => {
    expect(shapeOf({ exec: 0.1 })).toBe(shapeOf({ exec: 0.9 }));
    expect(shapeOf({ items: [{ count: 1 }] })).toBe(shapeOf({ items: [{ count: 7 }] }));
  });

  it("構造や文字列が変わると署名も変わる", () => {
    expect(shapeOf({ items: [{ skillId: "a" }] })).not.toBe(shapeOf({ items: [{ skillId: "b" }] }));
    // 技を1つ足した
    expect(shapeOf({ items: [1] })).not.toBe(shapeOf({ items: [1, 1] }));
    // 真偽値は潰さない（手具操作のチェックなど）
    expect(shapeOf({ hasApparatus: false })).not.toBe(shapeOf({ hasApparatus: true }));
  });
});

describe("連続した編集をまとめるか", () => {
  const A = shapeOf({ exec: 1 });
  const B = shapeOf({ exec: 1, extra: true });

  it("形が同じで間が空いていなければまとめる（1文字＝1履歴にしない）", () => {
    expect(shouldCoalesce(A, A, 100, 1)).toBe(true);
  });

  it("間が空いたら別の操作として積む", () => {
    expect(shouldCoalesce(A, A, COALESCE_MS, 1)).toBe(false);
    expect(shouldCoalesce(A, A, COALESCE_MS + 1, 1)).toBe(false);
  });

  it("形が変わったら（技の追加・選び直し）必ず積む", () => {
    expect(shouldCoalesce(A, B, 0, 1)).toBe(false);
  });

  it("最初の1件はまとめない（でないと最初の編集が記録されない）", () => {
    expect(shouldCoalesce(A, A, 0, 0)).toBe(false);
  });
});

describe("スタックの操作", () => {
  it("編集を積むと、やり直しの先は消える", () => {
    const h = { past: ["v0"], future: ["vFuture"] };
    expect(recordEdit(h, "v1", false)).toEqual(stacks(["v0", "v1"], []));
  });

  it("まとめるときは積まないが、やり直しの先は消える", () => {
    const h = { past: ["v0"], future: ["vFuture"] };
    expect(recordEdit(h, "v1", true)).toEqual(stacks(["v0"], []));
  });

  it("上限を超えたら古いものから捨てる", () => {
    const h = { past: ["a", "b", "c"], future: [] };
    expect(recordEdit(h, "d", false, 3)).toEqual(stacks(["b", "c", "d"], []));
  });

  it("戻すと、今の値がやり直し側に移る", () => {
    const r = undoStep({ past: ["v0", "v1"], future: [] }, "now")!;
    expect(r.value).toBe("v1");
    expect(r.history).toEqual(stacks(["v0"], ["now"]));
  });

  it("やり直すと、今の値が戻す側に移る", () => {
    const r = redoStep({ past: ["v0"], future: ["v2", "v3"] }, "now")!;
    expect(r.value).toBe("v2");
    expect(r.history).toEqual(stacks(["v0", "now"], ["v3"]));
  });

  it("空なら戻せない・やり直せない", () => {
    expect(undoStep(emptyHistory<string>(), "now")).toBeNull();
    expect(redoStep(emptyHistory<string>(), "now")).toBeNull();
  });

  it("戻す→やり直すで元の値に帰る", () => {
    let h = emptyHistory<string>();
    h = recordEdit(h, "v0", false); // v0 → v1 に編集した
    const back = undoStep(h, "v1")!;
    expect(back.value).toBe("v0");
    const fwd = redoStep(back.history, back.value)!;
    expect(fwd.value).toBe("v1");
    expect(fwd.history).toEqual(stacks(["v0"], []));
  });

  it("何度も戻して何度もやり直せる", () => {
    let h = emptyHistory<string>();
    h = recordEdit(h, "v0", false);
    h = recordEdit(h, "v1", false);
    h = recordEdit(h, "v2", false);
    // 今は v3。3回戻す
    let value = "v3";
    for (const expected of ["v2", "v1", "v0"]) {
      const r = undoStep(h, value)!;
      h = r.history;
      value = r.value;
      expect(value).toBe(expected);
    }
    expect(undoStep(h, value)).toBeNull();
    // 3回やり直す
    for (const expected of ["v1", "v2", "v3"]) {
      const r = redoStep(h, value)!;
      h = r.history;
      value = r.value;
      expect(value).toBe(expected);
    }
    expect(redoStep(h, value)).toBeNull();
  });

  it("戻したあとに編集すると、やり直しの先は捨てられる", () => {
    let h = emptyHistory<string>();
    h = recordEdit(h, "v0", false);
    h = recordEdit(h, "v1", false);
    const back = undoStep(h, "v2")!; // v1 に戻る（future に v2）
    expect(back.history.future).toEqual(["v2"]);
    const after = recordEdit(back.history, back.value, false); // v1 から別の編集
    expect(after.future).toEqual([]);
    expect(after.past).toEqual(["v0", "v1"]);
  });
});
