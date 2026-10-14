import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TEAM_TEMPLATE_STORAGE_KEY,
  addTeamTemplate,
  describeTeam,
  emptyTeamTemplateStore,
  loadTeamTemplates,
  normalizeTeamTemplateStore,
  defaultTeamTemplateName,
  mergeTeamTemplates,
  removeTeamTemplate,
  renameTeamTemplate,
  saveTeamTemplates,
  stripTeamExec,
} from "../teamTemplates";
import { emptySeries, initialTeamState, motionSeries, type TeamState } from "../team";

// localStorage のスタブ（テストは node 環境なので自前で用意する）
class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const g = globalThis as { localStorage?: unknown };
let store: MemoryStorage;
beforeEach(() => { store = new MemoryStorage(); g.localStorage = store; });
afterEach(() => { delete g.localStorage; });

/** 技を1つ置いた構成 */
const filled = (): TeamState => {
  const t = initialTeamState();
  t.series[0].lanes[0][0] = { type: "skill", skillId: "b_front" };
  return t;
};

describe("団体テンプレートの保存と編集", () => {
  it("追加できる（中身はコピー）", () => {
    const src = filled();
    const s = addTeamTemplate(emptyTeamTemplateStore(), "大会構成", src);
    expect(s.routines).toHaveLength(1);
    expect(s.routines[0].name).toBe("大会構成");
    src.series[0].lanes[0][0] = { type: "empty" };
    expect(s.routines[0].team.series[0].lanes[0][0].skillId).toBe("b_front");
  });

  it("同じ名前で保存すると上書きになる（増えない・idは保つ）", () => {
    let s = addTeamTemplate(emptyTeamTemplateStore(), "同名", filled());
    const id = s.routines[0].id;
    s = addTeamTemplate(s, "同名", initialTeamState());
    expect(s.routines).toHaveLength(1);
    expect(s.routines[0].id).toBe(id);
  });

  it("名前の前後の空白は落とす", () => {
    const s = addTeamTemplate(emptyTeamTemplateStore(), "  余白  ", filled());
    expect(s.routines[0].name).toBe("余白");
  });

  it("実施減点は保存しない（構成だけを持つ）", () => {
    const t = filled();
    t.executionDeduction = 0.5;
    t.series[0].executionDeduction = 0.3;
    const s = addTeamTemplate(emptyTeamTemplateStore(), "x", t);
    expect(s.routines[0].team.executionDeduction).toBe(0);
    expect(s.routines[0].team.series.every((x) => !x.executionDeduction)).toBe(true);
    // 元は変えない
    expect(t.executionDeduction).toBe(0.5);
  });

  it("stripTeamExec は元を書き換えない", () => {
    const t = filled();
    t.executionDeduction = 0.5;
    const out = stripTeamExec(t);
    expect(out.executionDeduction).toBe(0);
    expect(t.executionDeduction).toBe(0.5);
  });

  it("名前の変更・削除ができる（空の名前は無視）", () => {
    let s = addTeamTemplate(emptyTeamTemplateStore(), "A", filled());
    const id = s.routines[0].id;
    s = renameTeamTemplate(s, id, "B");
    expect(s.routines[0].name).toBe("B");
    expect(renameTeamTemplate(s, id, "   ")).toBe(s);
    s = removeTeamTemplate(s, id);
    expect(s.routines).toHaveLength(0);
  });

  it("新しいものが先頭に来る", () => {
    let s = addTeamTemplate(emptyTeamTemplateStore(), "古い", filled());
    s.routines[0].updatedAt = 1;
    s = addTeamTemplate(s, "新しい", filled());
    expect(s.routines[0].name).toBe("新しい");
  });
});

describe("保存データの正規化", () => {
  it("読めない項目は捨てる", () => {
    const good = addTeamTemplate(emptyTeamTemplateStore(), "良", filled()).routines[0];
    const s = normalizeTeamTemplateStore({
      routines: [good, null, 42, { name: "構成なし" }, { name: "壊れた", team: { series: "no" } }],
    });
    expect(s.routines).toHaveLength(1);
    expect(s.routines[0].name).toBe("良");
  });

  it("名前やidが欠けていても拾う", () => {
    const s = normalizeTeamTemplateStore({ routines: [{ team: initialTeamState() }] });
    expect(s.routines).toHaveLength(1);
    expect(s.routines[0].name).toBe("構成1");
    expect(s.routines[0].id).toBeTruthy();
  });

  it("配列でない・空なら空のストア", () => {
    expect(normalizeTeamTemplateStore(null).routines).toEqual([]);
    expect(normalizeTeamTemplateStore({ routines: "x" }).routines).toEqual([]);
  });
});

describe("localStorage への保存と復元", () => {
  it("往復する", () => {
    const s = addTeamTemplate(emptyTeamTemplateStore(), "大会", filled());
    expect(saveTeamTemplates(s)).toBe(true);
    const back = loadTeamTemplates();
    expect(back.routines).toHaveLength(1);
    expect(back.routines[0].team.series[0].lanes[0][0].skillId).toBe("b_front");
  });

  it("個人のテンプレートとはキーが別", () => {
    saveTeamTemplates(addTeamTemplate(emptyTeamTemplateStore(), "x", filled()));
    expect(store.getItem(TEAM_TEMPLATE_STORAGE_KEY)).not.toBeNull();
    expect(store.getItem("mens-rg-scorer:templates:v1")).toBeNull();
  });

  it("未保存・壊れたデータなら空（起動が止まらない）", () => {
    expect(loadTeamTemplates().routines).toEqual([]);
    store.setItem(TEAM_TEMPLATE_STORAGE_KEY, "{壊れたJSON");
    expect(loadTeamTemplates().routines).toEqual([]);
  });

  it("localStorage が使えなくても例外にならない", () => {
    g.localStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    expect(loadTeamTemplates().routines).toEqual([]);
    expect(saveTeamTemplates(emptyTeamTemplateStore())).toBe(false);
  });
});

describe("カードの説明", () => {
  it("シリーズ数と入力数を出す", () => {
    expect(describeTeam(initialTeamState())).toContain("3シリーズ");
    expect(describeTeam(filled())).toContain("入力1");
  });

  it("徒手シリーズとジュニアを添える", () => {
    const t: TeamState = { series: [emptySeries(3), motionSeries()], junior: true };
    const d = describeTeam(t);
    expect(d).toContain("徒手1");
    expect(d).toContain("ジュニア");
  });
});

describe("取り込みと既定名（セルフレビュー指摘の回帰）", () => {
  it("取り込んだテンプレートは id を振り直す（書き出し→取り込みで id が被らない）", () => {
    const original = addTeamTemplate(emptyTeamTemplateStore(), "A", filled());
    // 書き出したものをそのまま取り込み直す
    const merged = mergeTeamTemplates(original, normalizeTeamTemplateStore(JSON.parse(JSON.stringify(original))));
    const ids = merged.routines.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("同じ名前は取り込んだほうで上書きする（増えない）", () => {
    const store = addTeamTemplate(emptyTeamTemplateStore(), "A", filled());
    const incoming = addTeamTemplate(emptyTeamTemplateStore(), "A", initialTeamState());
    const merged = mergeTeamTemplates(store, incoming);
    expect(merged.routines).toHaveLength(1);
    // 取り込んだほう（技が無い初期状態）が残る
    expect(merged.routines[0].team.series[0].lanes[0][0].type).toBe("empty");
  });

  it("違う名前は両方残る", () => {
    const store = addTeamTemplate(emptyTeamTemplateStore(), "A", filled());
    const incoming = addTeamTemplate(emptyTeamTemplateStore(), "B", initialTeamState());
    expect(mergeTeamTemplates(store, incoming).routines.map((t) => t.name).sort()).toEqual(["A", "B"]);
  });

  it("既定の保存名は既にある名前を避ける", () => {
    let s = emptyTeamTemplateStore();
    expect(defaultTeamTemplateName(s)).toBe("団体の構成1");
    s = addTeamTemplate(s, "団体の構成1", filled());
    s = addTeamTemplate(s, "団体の構成2", filled());
    // 1つ消しても、残っている名前とはぶつからない
    s = removeTeamTemplate(s, s.routines.find((t) => t.name === "団体の構成1")!.id);
    const name = defaultTeamTemplateName(s);
    expect(s.routines.some((t) => t.name === name)).toBe(false);
  });
});

describe("テンプレートに入れる／入れないもの", () => {
  it("十年後モードは保存しない（規則の切り替えであって構成ではない）", () => {
    const t = filled();
    t.future = "F";
    const s = addTeamTemplate(emptyTeamTemplateStore(), "x", t);
    expect(s.routines[0].team.future).toBeUndefined();
    expect(t.future).toBe("F"); // 元は変えない
  });

  it("ジュニア適用規則は保存する（その構成がどの規則で組まれたかは構成の一部）", () => {
    const t = filled();
    t.junior = true;
    expect(addTeamTemplate(emptyTeamTemplateStore(), "x", t).routines[0].team.junior).toBe(true);
  });

  it("着ピタは保存する（計画する要素で、実施の結果ではない）", () => {
    const t = filled();
    t.series[0].lanes[0][0] = { type: "skill", skillId: "b_front", stuck: true };
    expect(addTeamTemplate(emptyTeamTemplateStore(), "x", t).routines[0].team.series[0].lanes[0][0].stuck).toBe(true);
  });
});
