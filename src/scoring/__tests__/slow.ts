import { it } from "vitest";

/**
 * 重いテスト（生成器の「傾向」を測るもの）の出し分け。
 *
 * `generateRoutine` は1構成あたり 0.2〜0.4 秒かかる。種類の傾向を確かめるテストは
 * 1件で何十構成も回すので、一部のテストがテスト時間の大半を占めていた（#76）。
 * 普段の `npm test` では飛ばし、`npm run test:slow` でまとめて走らせる。
 *
 * **採点が正しいかを確かめるテストはここに入れない。** 入れてよいのは
 * 「○%が5投げになる」「ほとんど出ない」のような**分布・傾向の測定**だけ
 * （落ちても採点は壊れていないが、生成の味付けが変わったことは分かる、という種類）。
 *
 * 飛ばしたぶんは "skipped" として出力に残るので、隠れたりはしない。
 * **生成器（`generate.ts` / `autoThrows.ts` / `autoTumblings.ts`）を触ったら
 * `npm run test:slow` も走らせること。**
 */
const flag = process.env.SLOW_TESTS;
/** `SLOW_TESTS=0` / `false` は「走らせない」。`!!"0"` が true になる罠を避ける。 */
export const RUN_SLOW = !!flag && flag !== "0" && flag.toLowerCase() !== "false";

/** 傾向を測る重いテスト。既定では skip。`npm run test:slow` で実行される。 */
export const slowIt = RUN_SLOW ? it : it.skip;
