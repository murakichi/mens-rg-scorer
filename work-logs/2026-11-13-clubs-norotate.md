# 作業ログ 2026-11-13: クラブでも無回転投げ→手以外のキャッチを生成する

- 日付: 2026-11-13
- 実施者: 手動（オーナー回答「無回転投げ→0〜1動作→手以外のキャッチが増えてきている。クラブも含む」）
- 対象issue: なし

## やったこと

- `autoThrows.ts`：無回転の横投げ（`norotate`＋`side`）をスティックだけでなくクラブでも作る（`canUseNoRotation`）。背面の無回転横投げはスティックだけのまま。
- `tumblingPatterns.ts`：投げタンのあとに足す投げ（`secondThrowStyles`）から無回転を外した。無回転の投げが通常のキャッチで受けられていた不具合（スティックにも潜在）。
- テスト：`nonHandKind.test.ts`（クラブにも無回転が出る・クラブの無回転は0〜1動作で手以外のキャッチ・`secondThrowStyles` に無回転なし）。
- ドキュメント：CLAUDE.md・docs/generator-notes.md（実測）・docs/competition-reality.md（食い違い2を解消）。

## 確認

- `npm test`（1078件）・`npm run test:slow`（1088件）・`npm run build` 緑。
- 実測は docs/generator-notes.md の末尾。

## 気づき・申し送り

- 横向きの背面投げ（視野外の投げを横に投げる形）は実戦例がないとの回答。生成は視野外の投げの4割を横にしており多すぎる。
  クラブ・スティックの「実施例あり」の背面横投げ2形との関係をオーナーに確認中で、生成は未変更。
