# 作業ログ 2026-10-05: クラブの技の最中の投げに手具を使った投げを低確率で付ける

- 日付: 2026-10-05
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## 調べたこと

- 技の最中に投げる形は `connectThrowInSkill` / `chainThrowInSkill`（`autoTumblings.ts` の `buildAutoTumblingSeries`）。投げの技術タグは視野外（きりもみ）だけだった。
- クラブの押さえつけキャッチは横投げが前提（`SIDE_THROW_PRESS_CHANCE` clubs 1）で、視野外の投げでは受けない（`sideOk`）。手具を使った投げとの組み合わせを止める処理は無く、受けの抽選はそのまま効く。

## やったこと

- `tumblingWeights.ts`: `THROW_IN_SKILL_USE_APPARATUS_CHANCE`（クラブ 0.1）。
- `autoTumblings.ts`: `draws.useAppThrow` を引き、視野外でない技の最中の投げに手具を使った投げを付ける。確率0の手具では乱数を消費しない。
- `__tests__/autoTumblings.test.ts`: クラブだけ・低確率・視野外に付かない・手具を使った投げ＋横投げが押さえつけキャッチで受けられ手具の流れが破綻しないテスト。
- `CLAUDE.md`: 生成の項に1行。

## 確認

- `npm test` / `npm run build`: 772件通過 / ビルド成功

## 結果

- PR: なし
- issue: なし

## 気づき・申し送り

- 確率0.1は私の置いた値（実測はしていない）。`docs/generator-notes.md` の形式での実測は未実施。
