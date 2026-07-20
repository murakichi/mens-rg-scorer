# テストレポート 001: seed — analysis 基本 + score 骨格

- 日付: 2026-07-20
- 実施者: scoring-test skill（セットアップ時のシード）
- 対象: `src/scoring/analysis.ts`, `src/scoring/score.ts`

vitest 導入と最初の回帰アンカーを兼ねたシード。以降の loop はここでカバー済みの観点を再検証しない。

## 検証観点

| 観点 | ルール参照 | 結果 |
|------|-----------|------|
| calcTumblingDifficulty：単一非A技/格上げ(+1)/投げ+1/A技除外/null/E上限 | §3.5 難度 | ✅準拠 |
| calcHandDifficulty：縦3動作=E / 動作数加算 / E上限 | §3.5 徒手 | ✅準拠 |
| maxSaltoChain：連続宙返り最大数・非宙返りでリセット | §3.5 | ✅準拠 |
| hasConnect / hasConnectWithoutApparatus：宙返り→A→宙返り検出 | §3.5 つなぎ技 | ✅準拠 |
| analyzeSeries：tumbling/throw ユニット分類・投げタン・ロープ跳びユニット | §3.5 | ✅準拠 |
| seriesSignature：タグ順序非依存・構成差の判別 | 実装仕様 §6.3 | ✅準拠 |
| computeScore：空演技の回帰アンカー（aDeduction=1.9, grandTotal=18.1） | §3.5 | ✅準拠 |
| computeScore：タンブリング難度 上位3採用（ADOPT_COUNT） | 実装仕様 §6.4 | ✅準拠 |
| computeScore：スティック必須投げ（左手投げ）appThrow判定 | §3.2 | ✅準拠 |

## 追加したテスト

- `src/scoring/__tests__/analysis.test.ts`: +18件
- `src/scoring/__tests__/score.test.ts`: +6件
- 計 24件 全緑。`npm run build` も緑。

## 発見

- なし（シードのため既知挙動の固定のみ）。

## 申し送り（次に検証すべき観点）

`.claude/skills/scoring-test/SKILL.md` の「観点バックログ」参照。特に未着手：
- D: E難度ボーナス / シリーズ加点 / 技術加点 / 手具操作加点 / 二つ投げ4動作加点
- A: 連続宙返り減点の各段 / 無手具操作減点と上限 / 多様性不足（other別カウント含む）
- 重複シリーズの除外と例外（other は重複でもカウント）
- 団体モード（team.ts）は丸ごと未検証。暫定A減点 `missing.length*0.3` は「ルール未規定」issue候補
- share.ts の round-trip
