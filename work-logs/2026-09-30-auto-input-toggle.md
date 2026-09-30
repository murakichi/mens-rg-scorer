# 作業ログ 2026-09-30: 自動入力のON/OFFトグル

- 日付: 2026-09-30
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## やったこと

- `useAutoInputSetting.ts`（新規）: おすすめ表示のON/OFFを localStorage（`mens-rg-scorer:auto-input:v1`）に端末ごとに保存。既定はON。
- `IndividualScorer`: 「適用規則」カードにスイッチを追加。
- `SeriesListEditor`: `autoInputEnabled` を受け、OFFなら候補を計算せず渡さない（表示中の候補も消える）。

## 判断

- 下書き・共有URL・保存データには含めない（採点内容でなく画面の好みなので）。
- OFF→ONにすると、その時点の末尾が条件に合えば候補がすぐ出る。

## 確認

- `npm run typecheck` / `npm run build`: OK。画面の目視は未実施。
