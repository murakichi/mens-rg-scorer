# 作業ログ 2026-09-17: generate.ts を「上限・重み／評価／探索」に分割した

- 日付: 2026-09-17
- 実施者: 手動（オーナー指示「generate.ts も同じように分割して」）
- 対象issue: なし（リファクタ。挙動は変えない前提）

## 調べたこと

- 前回（#92）で `autoTumblings.ts` を分割したときの申し送りどおり、`generate.ts`（1156行）には
  **入力の型・重み・評価式・探索**が同居していた。境界は素直に引ける：
  - 重み（`*_WEIGHT` / `DEFAULT_MAX_*` / `A_PRIORITY`）は純粋な数と、オプションから直に決まる小関数だけ
  - 評価は「構成から数を取り出す関数」＋「それを足し引きする `evaluate`」
  - 探索は `evaluate` の値が上がるかどうかしか見ていない（＝評価の中身を知らなくてよい）
- 重みの尺度が3段階（タイブレーク 0.005〜0.05 ／ 実在の好み 0.1〜0.9 ／ 要求10・範囲外×100）
  という決め方は、これまで各定数のコメントに散っていた。分割を機に重みファイルの冒頭にまとめた。

## やったこと

- `src/scoring/generateOptions.ts`（新規71行）: `GenerateOptions` / `GenerateResult`。
  他の3つが参照するので型だけ切り出した（循環importを避けるため）。
- `src/scoring/generateWeights.ts`（新規）: 上限・目標値・重み。
  `DEFAULT_MAX_*` / `A_PRIORITY` / `REQUIRED_ELEMENT_WEIGHT` / 各 `*_WEIGHT` /
  `preferredThrowCount` / `throwCountPenalty` / `requiresAllElements` / `suppressHardThrow` /
  `autoSeriesMax` / `autoLimitOf` / `REBUILD_ATTEMPTS` などの探索の回数も。
- `src/scoring/generateEvaluate.ts`（新規）: 構成の評価。
  数を取り出す関数（`limitedSkillCounts` / `highDifficultyCount` / `shapeRankTotal` /
  `hardThrowCount` / `otherStyleCount` / `verticalThreeThrowCount` / `extraThrowOperation` /
  `reversedThrowOrderCount` / `saltoRepeatCount` / `missesFinishCatch`）と、
  それを足し引きする `evaluate` / `shortfallPenalty` / `rangePenalty`。
- `src/scoring/generateSearch.ts`（新規）: 探索。
  `greedyAttempt` / `swapIn` / `upgradeTumblings` / `tuneAutoSeries` / `orderSeries` /
  `finishCatchLast` / `satisfying` / `autoPool` / `usableTemplates`。
- `src/scoring/generate.ts`: 1156行 → 151行。`generateRoutine` / `generateForApparatus` と
  再エクスポートだけ。`suggest.ts` / `GenerateModal` / 既存テストの import は変えていない。

## 確認

- **挙動が変わっていないことを実測で確認した**。分割前に 4手具 × 21条件 × 5シード（420件）＋
  `generateForApparatus` 8件 の生成結果を書き出しておき、分割後に同じものを取り直した。
  → **428件すべて完全一致（差分0）**。今回は spec の形も変えていないので、前回と違って
  丸ごとバイト一致になる。
  - 条件に入れたもの: 上限/下限/範囲指定、ジュニア、`autoRatio` 0〜0.5、`autoThrows`/`autoTumblings` オフ、
    `requireAllElements` の明示、`maxSeries` / `maxThrowTumbling` / `maxTumblings` / `attempts` の変更。
- `npm test`: main 取り込み後も全件パス（テストの変更なし。#93 が追加した `future.test.ts` も含む）。
- `npm run build`: 成功。

## main（#93 十年後モード）の取り込み

分割中に main に #93（十年後モード F・G難度）が入り、それが `generate.ts` に `future` を
通していたため、そのぶんを分割先に入れ直した。main 側の `future` 21箇所を
`generateOptions.ts`（`GenerateOptions.future`）／`generateEvaluate.ts`（`highDifficultyCount` /
`shapeRankTotal` / `hardThrowCount` / `verticalThreeThrowCount` / `evaluate`）／
`generateSearch.ts`（`autoPool` / `isTumblingSeries` / `orderSeries` / `upgradeTumblings`）に振り分けた。

取り込みの検算は2通りで行った。

1. **宣言の突き合わせ**：main の `generate.ts` のトップレベル宣言79個すべてが分割先に存在し、
   本文が違うのは2個だけ（`verticalThreeThrowCount` / `isTumblingSeries` の**シグネチャの改行位置**のみ。
   引数も本文も同じ）。
2. **実行結果の突き合わせ**：main を worktree に出し、同じプローブを両方で走らせた。
   4手具 × 16条件（十年後 F・G、`future` × ジュニア、`future` × スコア範囲を含む）× 4シード＋
   `generateForApparatus` 8件 = **264件すべて完全一致**。

## 結果

- PR: 本ログと同じPR。
- issue: なし。

## 気づき・申し送り

- 今回はテストを1件も直さずに済んだ。`generate.ts` が全部を再エクスポートしているので、
  `generate.test.ts`（48か所の import）は無変更のまま通る。
- 分割してみて、`generateEvaluate.ts` の「数を取り出す関数」は11個あり、どれも
  `Series[]` か `ScoreResult` を歩いて数を返すだけの同じ形をしている。将来もし増えるなら、
  `{ 名前, 数える関数, 重み }` の表にして `evaluate` がそれを畳む形にもできる。
  今回はそこまでやると挙動一致の確認が難しくなるので見送った。
- 探索側（`greedyAttempt` / `swapIn` / `tuneAutoSeries`）はどれも
  「候補を1つ差し替えて `evaluateUsed` を呼び、良ければ採る」という同じ骨格なので、
  共通の `improveBy(list, ev, 候補を作る関数)` に畳める余地がある。これも今回は見送り。
- ロープ跳びが自動生成されない件（ロープはA −1.2 を必ず負う）は今回も手つかず。
