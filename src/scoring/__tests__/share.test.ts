// =====================================================================
// 構成のURL共有（share.ts）の往復。個人モードの SaveData を主対象にする。
// location / history は node 環境に無いのでスタブする。
// =====================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeShare, decodeShare, buildShareUrl, consumeShareHash } from "../share";
import type { Series } from "../types";

const series: Series[] = [
  {
    executionDeduction: 0.3,
    items: [
      { kind: "throw", throwTypes: ["noview"], reqTypes: ["lefthand"] },
      { kind: "motion", motionId: "chene", count: 3, hands: true, handsType: "one" },
      { kind: "skill", skillId: "b_backsalto", hasApparatus: true, isThrow: true, throwTypes: ["nonhand"] },
      { kind: "catch", catchTypes: ["useapp"], catchTwo: true },
      { kind: "ropeJump", jumpId: "3f", isMoving6m: true },
    ],
  },
  { executionDeduction: 0, notDuplicate: true, items: [] },
];
const saveData = { version: 1, apparatus: "stick", series };

const stubLocation = (over: Partial<Location> = {}) => {
  const replaceState = vi.fn();
  vi.stubGlobal("location", {
    origin: "https://example.com",
    pathname: "/mens-rg-scorer/",
    search: "?x=1",
    hash: "",
    ...over,
  });
  vi.stubGlobal("history", { replaceState });
  return replaceState;
};

afterEach(() => vi.unstubAllGlobals());

describe("encodeShare / decodeShare の往復", () => {
  it("個人の保存データがそのまま復元される", () => {
    expect(decodeShare(encodeShare(saveData))).toEqual(saveData);
  });

  it("空の構成でも往復する", () => {
    const empty = { version: 1, apparatus: "rope", series: [] };
    expect(decodeShare(encodeShare(empty))).toEqual(empty);
  });

  it("団体の保存データも往復する", () => {
    const team = { kind: "team", team: { junior: true, series: [] } };
    expect(decodeShare(encodeShare(team))).toEqual(team);
  });

  it("エンコード結果はURLハッシュに直接置ける文字だけになる", () => {
    // lz-string の URL セーフな文字種（英数字と + - $）。% / = & # ? を含まない。
    const enc = encodeShare(saveData);
    expect(enc).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  it("圧縮されるので元のJSONより短くなる", () => {
    expect(encodeShare(saveData).length).toBeLessThan(JSON.stringify(saveData).length);
  });

  it("壊れた文字列は null を返す（例外を投げない）", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("!!!not-compressed!!!")).toBeNull();
    expect(decodeShare("ABCDEFG")).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("現在のURLに #d= を足した共有URLを作る", () => {
    stubLocation();
    const url = buildShareUrl(saveData);
    expect(url.startsWith("https://example.com/mens-rg-scorer/?x=1#d=")).toBe(true);
    expect(decodeShare(url.split("#d=")[1])).toEqual(saveData);
  });

  it("クエリが無いページでも組み立てられる", () => {
    stubLocation({ search: "" });
    expect(buildShareUrl(saveData).startsWith("https://example.com/mens-rg-scorer/#d=")).toBe(true);
  });

  it("URLとして解釈し直しても構成が壊れない", () => {
    stubLocation();
    const parsed = new URL(buildShareUrl(saveData));
    expect(decodeShare(parsed.hash.slice("#d=".length))).toEqual(saveData);
  });
});

describe("consumeShareHash", () => {
  it("ハッシュが無ければ null", () => {
    stubLocation({ hash: "" });
    expect(consumeShareHash()).toBeNull();
  });

  it("#d= 以外のハッシュは無視する", () => {
    stubLocation({ hash: "#something" });
    expect(consumeShareHash()).toBeNull();
  });

  it("個人の構成を読み取る", () => {
    stubLocation({ hash: `#d=${encodeShare(saveData)}` });
    const got = consumeShareHash();
    expect(got?.mode).toBe("individual");
    expect(got?.data).toEqual(saveData);
  });

  it("読み取ったらアドレスバーのハッシュを消す（再マウント時の二重適用を防ぐ）", () => {
    const replaceState = stubLocation({ hash: `#d=${encodeShare(saveData)}` });
    consumeShareHash();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/mens-rg-scorer/?x=1");
  });

  it("kind:\"team\" は団体として読む", () => {
    stubLocation({ hash: `#d=${encodeShare({ kind: "team", series: [] })}` });
    expect(consumeShareHash()?.mode).toBe("team");
  });

  it("team フィールドを持つ保存データも団体として読む", () => {
    stubLocation({ hash: `#d=${encodeShare({ version: 1, team: { series: [] } })}` });
    expect(consumeShareHash()?.mode).toBe("team");
  });

  it("壊れたハッシュは null（ハッシュも消さない）", () => {
    const replaceState = stubLocation({ hash: "#d=!!!broken!!!" });
    expect(consumeShareHash()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("オブジェクトでない値は null", () => {
    stubLocation({ hash: `#d=${encodeShare(42)}` });
    expect(consumeShareHash()).toBeNull();
  });
});
