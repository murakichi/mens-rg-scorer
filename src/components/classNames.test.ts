import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 意味の違うUIが同じクラス名を使っていないことの確認（#91）。
 *
 * ヘッダーの「個人／団体／レーティング」切替と、技ブロックの「手動入力／一覧入力」切替が
 * どちらも `.mode-btn` だったため、
 * - CSS は後勝ちで、**ヘッダーの非選択ボタンまで技ブロック用の小さい見た目**になっていた
 * - E2E で `button.mode-btn` を指すと意図しないほうに当たり、団体モードへ遷移していた
 *
 * スタイルそのものは測れないので、**名前が分かれていること**だけを固定する。
 */
const read = (p: string) => readFileSync(p, "utf8");

/** `@media` の外（トップレベル）にある `.foo {` の数 */
function topLevelRuleCount(css: string, className: string): number {
  let depth = 0;
  let mediaDepth = -1;
  let count = 0;
  for (const line of css.split("\n")) {
    const atTopLevel = depth === 0 && mediaDepth === -1;
    if (atTopLevel && new RegExp(`^\\.${className}\\s*\\{`).test(line.trim())) count++;
    if (/^@media/.test(line.trim())) mediaDepth = depth;
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === mediaDepth) mediaDepth = -1;
      }
    }
  }
  return count;
}

describe("クラス名が意味ごとに分かれている", () => {
  const css = read("src/index.css");
  const app = read("src/App.tsx");
  const card = read("src/components/SeriesCard.tsx");

  it("ヘッダーのモード切替は mode-btn を使う", () => {
    expect(app).toContain('"mode-btn"');
  });

  it("技ブロックのひねり入力切替は mode-btn を使わない（twist-mode-btn）", () => {
    expect(card).toContain('"twist-mode-btn"');
    // 同じ名前に戻すと、CSSの後勝ちでヘッダーの見た目が変わり、E2Eのセレクタも曖昧になる
    expect(card).not.toMatch(/className="mode-btn"/);
  });

  it("どちらのクラスも、まとめ書き以外の定義はCSSに1つだけ", () => {
    expect(topLevelRuleCount(css, "mode-btn")).toBe(1);
    expect(topLevelRuleCount(css, "twist-mode-btn")).toBe(1);
  });

  it("使っているクラスはCSSに定義がある", () => {
    ["mode-btn", "mode-active", "twist-mode-btn"].forEach((c) =>
      expect(topLevelRuleCount(css, c)).toBeGreaterThan(0),
    );
  });
});
