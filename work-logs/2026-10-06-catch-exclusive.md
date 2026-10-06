# 作業ログ 2026-10-06: 手具を使ったキャッチと手以外のキャッチを排他にする

- 日付: 2026-10-06
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## 調べたこと

- 二つ投げと手具を使った投げの排他は `SeriesCard` の入力側（`.is-disabled`）で実装されていて、採点は塞がない。同じ形にした。
- 生成は1回の受けに両方を付ける形を持たない（`autoCatchStyles` の複合は 視野外＋手以外 と 視野外＋手具を使った だけ）。テストで固定。

## やったこと

- `constants.ts`: `NON_HAND_CATCH_TAG` / `CATCH_EXCLUSIVE_TAGS` / `catchOptionBlocked`。付いている側は塞がず、旧データで両方付いていても外せる。
- `components/SeriesCard.tsx`: キャッチアイテムと「この技の最中に受け」の受け方チェックで、排他の相手が付いている間は `.is-disabled`＋`disabled`。
- `__tests__/catchExclusive.test.ts`（4本）、`CLAUDE.md`。

## 確認

- `npm test` 838本 green（29ファイル）、`npm run build` green。画面の確認はしていない（E2E 未実施）。

## 結果

- PR: あり
- issue: なし

## 気づき・申し送り

- 採点側（`apparatusBlockers` / `stripForApparatus`）では両方付いた旧データも塞がず、そのまま採点する（二つ投げと手具を使った投げと同じ扱い）。採点でも落とすなら別途判断が要る。
