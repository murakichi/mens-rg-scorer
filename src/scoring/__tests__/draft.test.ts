import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DRAFT_KEY_INDIVIDUAL,
  DRAFT_KEY_MODE,
  DRAFT_KEY_TEAM,
  clearDraft,
  isBlankIndividualDraft,
  isBlankTeamState,
  loadDraftMode,
  loadIndividualDraft,
  loadTeamDraft,
  normalizeArtDeductions,
  normalizeIndividualDraft,
  saveDraftMode,
  saveIndividualDraft,
  saveTeamDraft,
  type IndividualDraft,
} from "../draft";
import { emptySeries as emptyTeamSeries, initialTeamState, type TeamState } from "../team";
import type { Series } from "../types";

// ---- localStorage のスタブ（テストは node 環境なので自前で用意する）----
class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const g = globalThis as { localStorage?: unknown };
let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  g.localStorage = store;
});
afterEach(() => {
  delete g.localStorage;
});

/** 入力済みのシリーズ（前宙1本） */
const filledSeries = (): Series => ({
  executionDeduction: 0,
  items: [{ kind: "skill", skillId: "b_front", hasApparatus: false, isThrow: false }],
});
/** 画面を開いた直後の空シリーズ（技が未選択） */
const blankSeries = (): Series => ({
  executionDeduction: 0,
  items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }],
});

const draft = (over: Partial<IndividualDraft> = {}): IndividualDraft => ({
  version: 1,
  apparatus: "stick",
  junior: false,
  series: [blankSeries()],
  executionDeduction: 0,
  apparatusElements: [],
  violations: [],
  artDeductions: {},
  ...over,
});

describe("ドラフトの正規化", () => {
  it("オブジェクトでなければ null（未保存・壊れたデータ）", () => {
    expect(normalizeIndividualDraft(null)).toBeNull();
    expect(normalizeIndividualDraft("abc")).toBeNull();
    expect(normalizeIndividualDraft(undefined)).toBeNull();
  });

  it("欠けたフィールドは既定値で埋まる（手具は棒）", () => {
    const d = normalizeIndividualDraft({})!;
    expect(d.apparatus).toBe("stick");
    expect(d.series).toEqual([]);
    expect(d.junior).toBe(false);
    expect(d.executionDeduction).toBe(0);
    expect(d.apparatusElements).toEqual([]);
    expect(d.violations).toEqual([]);
    expect(d.artDeductions).toEqual({});
  });

  it("知らない手具・壊れたシリーズ・文字列でない要素は落とす", () => {
    const d = normalizeIndividualDraft({
      apparatus: "sword",
      series: [filledSeries(), { items: "no" }, 42],
      apparatusElements: ["a", 1, null],
      violations: "x",
    })!;
    expect(d.apparatus).toBe("stick");
    expect(d.series).toHaveLength(1);
    expect(d.apparatusElements).toEqual(["a"]);
    expect(d.violations).toEqual([]);
  });

  it("壊れたアイテムが混ざっていても落ちない（起動が止まらない）", () => {
    // 復元は state の初期化中に走るので、ここで throw すると画面が真っ白のまま戻せない
    expect(() => normalizeIndividualDraft({ series: [{ items: [null] }] })).not.toThrow();
    const d = normalizeIndividualDraft({
      series: [{ items: [null, "x", 3, { kind: "nope" }, filledSeries().items[0]] }],
    })!;
    // 読めるアイテムだけが残る
    expect(d.series[0].items).toHaveLength(1);
    expect((d.series[0].items[0] as { skillId: string }).skillId).toBe("b_front");
  });

  it("items が配列でないシリーズは丸ごと捨てる", () => {
    const d = normalizeIndividualDraft({ series: [{ items: "no" }, null, filledSeries()] })!;
    expect(d.series).toHaveLength(1);
  });

  it("シリーズの他のフラグは残す（notDuplicate）", () => {
    const d = normalizeIndividualDraft({
      series: [{ ...filledSeries(), notDuplicate: true }],
    })!;
    expect(d.series[0].notDuplicate).toBe(true);
  });

  it("芸術の欠点は項目ごとに 0〜上限 に丸め、未知のidは捨てる", () => {
    const d = normalizeIndividualDraft({
      artDeductions: { tumVariety: 9, handVariety: 0.3, rhythm: -1, unknownItem: 0.2 },
    })!;
    // tumVariety の上限は 0.5、handVariety はそのまま、負値と未知idは入らない
    expect(d.artDeductions).toEqual({ tumVariety: 0.5, handVariety: 0.3 });
    expect(normalizeArtDeductions({ tumVariety: 9 })).toEqual({ tumVariety: 0.5 });
  });

  it("その手具で入力できない内容は落とす（棒にロープ跳び・二つ投げが残らない）", () => {
    const d = normalizeIndividualDraft({
      apparatus: "stick",
      series: [
        {
          executionDeduction: 0,
          items: [
            { kind: "throw", throwTypes: ["useapp"], reqTypes: ["twothrow"] },
            { kind: "ropeJump", jumpId: "2fc", isMoving6m: false },
            { kind: "catch", catchTypes: ["useapp"], catchTwo: true },
          ],
        },
      ],
    })!;
    const items = d.series[0].items;
    expect(items.some((i) => i.kind === "ropeJump")).toBe(false);
    const thr = items.find((i) => i.kind === "throw") as { throwTypes: string[]; reqTypes: string[] };
    expect(thr.reqTypes).toEqual([]);
    expect(thr.throwTypes).toEqual([]);
    const cat = items.find((i) => i.kind === "catch") as { catchTypes: string[]; catchTwo: boolean };
    expect(cat.catchTypes).toEqual([]);
    expect(cat.catchTwo).toBe(false);
  });

  it("その手具で入力できる内容はそのまま残る（クラブの二つ投げ）", () => {
    const d = normalizeIndividualDraft({
      apparatus: "clubs",
      series: [
        {
          executionDeduction: 0,
          items: [
            { kind: "throw", throwTypes: ["useapp"], reqTypes: ["twothrow"] },
            { kind: "catch", catchTypes: [], catchTwo: true },
          ],
        },
      ],
    })!;
    const thr = d.series[0].items[0] as { throwTypes: string[]; reqTypes: string[] };
    expect(thr.reqTypes).toEqual(["twothrow"]);
    expect(thr.throwTypes).toEqual(["useapp"]);
    expect((d.series[0].items[1] as { catchTwo: boolean }).catchTwo).toBe(true);
  });
});

describe("復元する価値があるか（個人）", () => {
  it("開いただけの状態は空とみなす", () => {
    expect(isBlankIndividualDraft(draft())).toBe(true);
    expect(isBlankIndividualDraft(draft({ series: [] }))).toBe(true);
    // 手具を選んだだけでは「入力した」とみなさない
    expect(isBlankIndividualDraft(draft({ apparatus: "rope" }))).toBe(true);
  });

  it("シリーズやアイテムを増やしただけでも空ではない（技を選ぶ前の組み立てを守る）", () => {
    expect(isBlankIndividualDraft(draft({ series: [blankSeries(), blankSeries()] }))).toBe(false);
    expect(
      isBlankIndividualDraft(
        draft({ series: [{ executionDeduction: 0, items: [...blankSeries().items, ...blankSeries().items] }] }),
      ),
    ).toBe(false);
  });

  it("技を選んだ・投げを置いた時点で空ではない", () => {
    expect(isBlankIndividualDraft(draft({ series: [filledSeries()] }))).toBe(false);
    expect(
      isBlankIndividualDraft(draft({ series: [{ executionDeduction: 0, items: [{ kind: "throw" }] }] })),
    ).toBe(false);
  });

  it("採点側だけの入力（実施減点・ジュニア・チェック）でも空ではない", () => {
    expect(isBlankIndividualDraft(draft({ executionDeduction: 0.3 }))).toBe(false);
    expect(isBlankIndividualDraft(draft({ junior: true }))).toBe(false);
    expect(isBlankIndividualDraft(draft({ violations: ["v"] }))).toBe(false);
    expect(isBlankIndividualDraft(draft({ apparatusElements: ["e"] }))).toBe(false);
    expect(isBlankIndividualDraft(draft({ artDeductions: { rhythm: 0.1 } }))).toBe(false);
    expect(
      isBlankIndividualDraft(draft({ series: [{ ...blankSeries(), executionDeduction: 0.5 }] })),
    ).toBe(false);
  });
});

describe("復元する価値があるか（団体）", () => {
  it("初期状態は空", () => {
    expect(isBlankTeamState(initialTeamState())).toBe(true);
  });

  it("技を置いた・減点を入れた時点で空ではない", () => {
    const withSkill: TeamState = { series: [emptyTeamSeries(3)] };
    withSkill.series[0].lanes[0][0] = { type: "skill", skillId: "b_front" };
    expect(isBlankTeamState(withSkill)).toBe(false);
    expect(isBlankTeamState({ series: [emptyTeamSeries(3)], junior: true })).toBe(false);
    expect(isBlankTeamState({ series: [emptyTeamSeries(3)], executionDeduction: 0.2 })).toBe(false);
  });

  it("グリッドを組み替えただけでも空ではない（スロット数・シリーズ数・徒手への切り替え）", () => {
    const more = initialTeamState();
    more.series.push(emptyTeamSeries(3));
    expect(isBlankTeamState(more)).toBe(false);

    const wider = initialTeamState();
    wider.series[0] = emptyTeamSeries(5);
    expect(isBlankTeamState(wider)).toBe(false);

    const together = initialTeamState();
    together.series[0].mode = "allTogether";
    expect(isBlankTeamState(together)).toBe(false);
  });

  it("徒手セルは、選ばれていなければセルとしては空扱い（形が初期状態なら全体も空）", () => {
    const base = initialTeamState();
    base.series[0].lanes[0][0] = { type: "motion", motionId: "" };
    expect(isBlankTeamState(base)).toBe(true);
    base.series[0].lanes[0][0] = { type: "motion", motionId: "jump_a" };
    expect(isBlankTeamState(base)).toBe(false);
  });
});

describe("localStorage への保存と復元", () => {
  it("保存した内容がそのまま復元される（個人）", () => {
    const d = draft({ apparatus: "rope", junior: true, series: [filledSeries()], executionDeduction: 0.4 });
    expect(saveIndividualDraft(d)).toBe(true);
    const back = loadIndividualDraft()!;
    expect(back.apparatus).toBe("rope");
    expect(back.junior).toBe(true);
    expect(back.executionDeduction).toBe(0.4);
    expect((back.series[0].items[0] as { skillId: string }).skillId).toBe("b_front");
  });

  it("空の入力は保存せず、保存済みのものも消す（次回に復元の通知を出さない）", () => {
    saveIndividualDraft(draft({ series: [filledSeries()] }));
    expect(store.getItem(DRAFT_KEY_INDIVIDUAL)).not.toBeNull();
    saveIndividualDraft(draft());
    expect(store.getItem(DRAFT_KEY_INDIVIDUAL)).toBeNull();
    expect(loadIndividualDraft()).toBeNull();
  });

  it("壊れたデータ・空データは復元しない", () => {
    expect(loadIndividualDraft()).toBeNull(); // 未保存
    store.setItem(DRAFT_KEY_INDIVIDUAL, "{壊れたJSON");
    expect(loadIndividualDraft()).toBeNull();
    store.setItem(DRAFT_KEY_INDIVIDUAL, JSON.stringify({ series: [blankSeries()] }));
    expect(loadIndividualDraft()).toBeNull();
  });

  it("localStorage が使えなくても例外にならない（プライベートモード等）", () => {
    g.localStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    };
    expect(loadIndividualDraft()).toBeNull();
    expect(saveIndividualDraft(draft({ series: [filledSeries()] }))).toBe(false);
    expect(() => clearDraft(DRAFT_KEY_INDIVIDUAL)).not.toThrow();
    expect(loadTeamDraft()).toBeNull();
    expect(loadDraftMode()).toBeNull();
    expect(() => saveDraftMode("team")).not.toThrow();
  });

  it("団体も同じように往復する（旧形式の素の TeamState も読める）", () => {
    const t: TeamState = { series: [emptyTeamSeries(3)], junior: true };
    t.series[0].lanes[0][0] = { type: "skill", skillId: "b_front" };
    expect(saveTeamDraft(t)).toBe(true);
    const back = loadTeamDraft()!;
    expect(back.junior).toBe(true);
    expect(back.series[0].lanes[0][0].skillId).toBe("b_front");
    // team で包まずに保存されていた場合も normalizeTeamState が拾う
    store.setItem(DRAFT_KEY_TEAM, JSON.stringify(t));
    expect(loadTeamDraft()!.series[0].lanes[0][0].skillId).toBe("b_front");
  });

  it("団体も空なら保存しない", () => {
    saveTeamDraft(initialTeamState());
    expect(store.getItem(DRAFT_KEY_TEAM)).toBeNull();
    expect(loadTeamDraft()).toBeNull();
  });

  it("最後に使ったモードを覚える（知らない値は無視）", () => {
    expect(loadDraftMode()).toBeNull();
    saveDraftMode("team");
    expect(loadDraftMode()).toBe("team");
    store.setItem(DRAFT_KEY_MODE, JSON.stringify("solo"));
    expect(loadDraftMode()).toBeNull();
  });
});
