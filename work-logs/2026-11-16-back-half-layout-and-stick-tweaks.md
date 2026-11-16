# 2026-11-16 後方宙返り半ひねりは伸身を優先／首と肩に挟むは視野外／スティックの連続投げ2回目の左手投げは横投げ

## 依頼
1. 手以外のキャッチで「首と肩に挟む」を選んだら、視野外のキャッチにチェックを入れて変えられなくする。
2. 後方宙返り半ひねりは実戦ではほぼ使われないので、生成は伸身を優先する。
3. スティックの連続投げの2回目が左手投げで高難度なら横投げにし、背面投げにはしない。

## 変更
- `NO_VIEW_NON_HAND_KINDS`／`nonHandKindForcesNoView`（constants）。`CatchChecks` は受け方を選んだときに視野外を付け、チェックを変えられなくする。生成の `withNonHandKinds` も視野外を付ける。
- `preferLayoutBackHalf`（autoTumblings）。前後とつながるときは `LAYOUT_BACK_HALF_CHANCE` 0.9 で伸身に置き換える。同じシリーズに伸身の半ひねりがすでにあれば置き換えない。
- `LEAD_PAIR_LEFT_HAND_SIDE_APPARATUS`＝stick。`leadPair` の本体の左手投げは `withSideThrow`、左手の視野外投げは候補から外す。

## 追加（オーナー回答）
- 伸身の半ひねり→側宙・転宙・前方1回ひねりは実施できる → `AFTER_BACK_LAYOUT_HALF_SALTOS` を連鎖則に追加。抱え込みは 13本→2本程度（上限なし）。
- 旧データの「首と肩に挟む」も視野外として採点 → `withForcedNoViewCatches`（computeScore）。
- 股下で投げたあとの受けは、生成では手以外のキャッチだけ除外 → `maybeSideThrow`。エディタ・採点には制限なし。

## 残り
- 後方伸身のひねり→抱え込みの半ひねり（`AFTER_BACK_LAYOUT_BACKWARD_SALTOS`）は伸身にしていない。伸身の半ひねりでも実施されるかは未確認。
