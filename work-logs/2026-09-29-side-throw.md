# 作業ログ 2026-09-29: 横投げ（投げ方の一種類）の追加

- 日付: 2026-09-29
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## 調べたこと

- 投げ方の種類は `score.ts` の `throwKinds`（tag ごと）で数える。技術加点は `throwTypes` の個数×0.1 なので、タグを足すだけだと加点まで付いてしまう。
- 「投げ方の一種類として数えてよい」＝種類数の話なので、横投げは種類数のみ・加点なしにした（要確認: 加点も欲しいなら `techCount` の除外を外すだけ）。

## やったこと

- `constants.ts`: `SIDE_THROW_TAG` / `THROW_OPTIONS_SIDE` / `canUseSideThrow`（ロープ以外）。
- `score.ts`: 種類数に `side` を追加、技術加点からは除外。
- `analysis.ts` / `templates.ts`: ロープ・共通テンプレートでは入力不可（blockers / strip）。
- `SeriesCard.tsx`: 投げ・技の最中の投げに「横投げ」チェック。`suggest.ts` の候補にも追加。
- `autoThrows.ts` / `autoTumblings.ts`: 押さえつけキャッチの投げは高確率で横投げ（クラブ 0.9 / リング 0.6）、スティックの低難度の左手投げは 0.8。
- `__tests__/sideThrow.test.ts` を追加。

## 確認

- `npm test` / `npm run build`: 通過。

## 結果

- PR: なし（ブランチにpush）

## 気づき・申し送り

- 確率値は仮置き。実施実態に合わせて `SIDE_THROW_PRESS_CHANCE` を調整してほしい。
