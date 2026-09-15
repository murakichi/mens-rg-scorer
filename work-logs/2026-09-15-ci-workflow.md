# 作業ログ 2026-09-15: PRでCIを回すようにし、生成器テストのフレークを止めた

- 日付: 2026-09-15
- 実施者: 手動（オーナー依頼「ワークフローも改善して」）
- 対象issue: なし（依頼ベース。派生した気づきは #76 に起票）

## 調べたこと

- ワークフローは `.github/workflows/deploy.yml` の1本だけで、`push: main` のときに
  `npm ci` → `npm run build` するのみ。**PR では何も走らず、テストはどこでも走っていなかった**。
- `npm test` を main（`ddd1eaf`）で5回まわしたところ **2回失敗**。内容はアサーション失敗ではなく
  `Test timed out in 5000ms` で、`src/scoring/__tests__/autoThrows.test.ts` の
  「Dスコアの上限を指定すると、シェネの回数を減らして収める」が 5,118ms。
  5シード×2回の `generateRoutine` を1テストで回しており、vitest 既定の5秒に対して所要が境界上にある。
- スイート全体は wall 約40秒（テスト時間の合計は約72秒）。生成器のテストが支配的。

## やったこと

- `.github/workflows/ci.yml`（新規）: `pull_request` と `workflow_dispatch` で
  `npm ci` → `npm run build`（= `tsc -b` + `vite build`）→ `npm test`。
  `permissions: contents: read`、`concurrency` は同一refで `cancel-in-progress: true`。
  main への push は deploy 側で同じチェックを通すので CI の対象から外した（二重実行を避ける）。
- `.github/workflows/deploy.yml`: `npm run build` の後に `npm test` を追加。
  テストが赤いものを Pages に公開しない。
- `vitest.config.ts`: `testTimeout: 30000`。生成器のランダムテストは1件で数秒かかるため、
  既定の5秒では境界で落ちる。遅さ自体の改善は別issue（#76）。
- `.claude/skills/resolve-issue/SKILL.md`: 「PRにCIは無い」という記述が嘘になったので、
  手順6を「push したら PR の CI も確認」「自己マージ条件に CI 緑を追加」に更新。
- `CLAUDE.md`: `## CI` セクションを追記（5行）。

## 確認

- `npm test`: 変更前は5回中2回 timeout で赤 → 変更後は **3回連続で 453 passed (11 files)**
- `npm run build`: 緑（`tsc -b` + `vite build`、dist 生成を確認）
- ワークフロー自体の実行は、この変更を含む PR で初めて走る（GitHub 上で確認する）

## 結果

- PR: この作業ログを含む PR（`claude/happy-fermat-195s7e`）
- issue: #76 を新規起票（生成器テストの遅さ）

## 気づき・申し送り

- `testTimeout` はフレークを止めただけで、遅さは残っている（テスト時間の合計72秒）。
  seed 数を減らす・生成回数を減らす・生成器テストだけ別プロジェクトに切るなどは #76 で。
- CI が入ったので、`resolve-issue` の自己マージは「ローカル緑」だけでなく CI 緑が根拠になった。
- lint は未導入（`package.json` に lint スクリプトなし）。CI に足すなら ESLint の導入が先。
