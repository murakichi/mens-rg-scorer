# 2026-11-21 C→つなぎ→C は D 難度

## 依頼
- C→つなぎ→C は D だった。修正する（オーナーに確認：この並びだけの例外）。

## 変更
- `isCConnectC`（analysis.ts）：A難度を除くと C が2つだけで、その間につなぎ技（`isConnectA`）が入る並び。`calcTumblingDifficulty` はこのとき基本値を D にする（投げを含めば +1 で E）。
- `mens-rg-rules.md` §4 の検算例と注記、`app-scoring-spec.md`、`docs/competition-reality.md`、CLAUDE.md に例外を書いた。
- テスト `cConnectC.test.ts`：C→ロンダート→C は D、つなぎなしの C→C・D→つなぎ→C・C→つなぎ→C→B は計算式どおり E、投げを含めば E、採点のタンブリング難度点 0.5。

## 結果
- `npm run quality`：許容幅の内（ほぼ変化なし）。生成は C→つなぎ→C の評価が下がるだけで、ほかの組み方を選ぶ。

## 残り
- 「なぜこの並びだけ D なのか」の根拠（Q&A・審判の申し合わせなど）は聞いていない。

## 追記：団体も例外
- オーナー：団体も例外。`calcChunkDifficulty`（team.ts）にも `isCConnectC` を入れた（塊の難度が D。5人同時同技の格上げはその上に別に掛かるので、全員同時なら E になる）。テストを `cConnectC.test.ts` に追加。
