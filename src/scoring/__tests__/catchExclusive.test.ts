import { describe, it, expect } from "vitest";
import { USE_APPARATUS_TAG, catchOptionBlocked } from "../constants";
import { autoCatchStyles, autoThrowTemplates } from "../autoThrows";
import { autoTumblingTemplates } from "../autoTumblings";
import { seededRandom } from "../probe";
import type { ApparatusKey, Series } from "../types";

const APPARATUSES: ApparatusKey[] = ["stick", "clubs", "ring", "rope"];
const both = (types: string[] | undefined) =>
  (types ?? []).includes(USE_APPARATUS_TAG) && (types ?? []).includes("nonhand");
const noBoth = (s: Series) =>
  s.items.every((it) => !(it.kind === "catch" || (it.kind === "skill" && it.isCatch)) || !both(it.catchTypes));

describe("手具を使ったキャッチと手以外のキャッチは排他", () => {
  it("片方が付いていれば、もう片方は新しく付けられない（付いている側は外せる）", () => {
    expect(catchOptionBlocked("nonhand", [USE_APPARATUS_TAG])).toBe(true);
    expect(catchOptionBlocked(USE_APPARATUS_TAG, ["nonhand"])).toBe(true);
    // 付いている側は塞がない（旧データで両方付いていても直せる）
    expect(catchOptionBlocked("nonhand", [USE_APPARATUS_TAG, "nonhand"])).toBe(false);
    expect(catchOptionBlocked(USE_APPARATUS_TAG, [USE_APPARATUS_TAG, "nonhand"])).toBe(false);
  });

  it("関係ないタグ（視野外・その他）は塞がず、何も付いていなければ塞がない", () => {
    expect(catchOptionBlocked("noview", [USE_APPARATUS_TAG])).toBe(false);
    expect(catchOptionBlocked("other", ["nonhand"])).toBe(false);
    expect(catchOptionBlocked("nonhand", [])).toBe(false);
    expect(catchOptionBlocked(USE_APPARATUS_TAG, undefined)).toBe(false);
    // 視野外と組み合わせるのは従来どおり可能
    expect(catchOptionBlocked("nonhand", ["noview"])).toBe(false);
  });

  it("自動生成の受け方に、両方を同時に満たすものは無い", () => {
    APPARATUSES.forEach((app) =>
      autoCatchStyles(app).forEach((c) => expect(both(c.catchTypes)).toBe(false)),
    );
  });

  it("自動生成の候補（投げ・タンブリング）でも、1回の受けに両方は付かない", () => {
    APPARATUSES.forEach((app) => {
      for (let seed = 1; seed <= 6; seed++) {
        const rand = seededRandom(seed);
        autoThrowTemplates(app, { random: rand }).forEach((t) => expect(noBoth(t.series)).toBe(true));
        autoTumblingTemplates(app, { random: rand }).forEach((t) => expect(noBoth(t.series)).toBe(true));
      }
    });
  }, 120_000);
});
