# 作業ログ 2026-10-13: 2つ投げてから跳ぶ投げタン

- 日付: 2026-10-13
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## 調べたこと

- 加点は既に付く：D難度（宙返りC＋投げタン+1）で seriesBonus 0.1、手具を使ったキャッチ等で技術加点 0.1（採点の変更なし）。
- 専用の遷移表は作らず、`throwRoll` の候補から派生（catchInSkill と同じ流儀）。

## やったこと

- `tumblingPatterns.ts` / `tumblingWeights.ts` / `autoTumblings.ts`: `airPairSide` の形、ゲート（上限4.0以上）、リングの最後の受け（手以外／視野外）。
- `__tests__/airPairTumbling.test.ts`: 並び・ゲート・手具・補正無しC以上・加点0.2。
- `CLAUDE.md` / `docs/generator-notes.md`: 追記。

## 確認

- `npm test` / `npm run build`: テスト 911 件通過（4 件は既存のスキップ）、ビルド成功。

## 結果

- PR: なし（マージ依頼待ち）

## 気づき・申し送り

- 「Dスコア4.0以上」は他の上級者向けの形に合わせて要求する上限（maxScore）で判定した。下限（minScore）で判定したい場合は `airPairTumChance` の引数を `demandScore` に変える。
