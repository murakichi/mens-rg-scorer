# テストレポート 002: 個人モードの加点・減点・共有URL

- 日付: 2026-09-10
- 実施者: scoring-test skill（カバレッジ計測起点）
- 対象: `src/scoring/score.ts`, `src/scoring/analysis.ts`, `src/scoring/share.ts`, `src/scoring/constants.ts`

001（シード）以降、テストは199件まで増えていたがレポートが残っていなかったため、まず
v8 カバレッジを計測して穴を特定し、**個人モード**に絞って埋めた。

計測前：Stmts 86.2% / Branch 79.1%（`share.ts` は 0%、`checkApparatusFlow` は未到達、
加点系は `E_BONUS` 以外ほぼ未検証）
計測後：Stmts 90.7% / Branch 84.5%（個人側だけなら `analysis.ts` 99.1% / `score.ts` 98.9% /
`share.ts` 100%）

## 検証観点

| 観点 | ルール参照 | 結果 |
|------|-----------|------|
| E難度ボーナス `E_BONUS`（E難度転回系＋技中の投げ） | §3.5.5.5(3) | ✅準拠 |
| シリーズ加点 `SERIES_BONUS`（投げ2回以上 & D以上）と演技全体で1回 | §3.5.5.5(1) | ✅準拠 |
| 技術加点（視野外／手以外／手具使用の投げ・受け、投げタンのタグ、その都度加算） | §3.5.5.5(2) | ✅準拠 |
| 技術加点：「その他の投げ／受け」も加点対象 | issue #2 のオーナー裁定 | ✅仕様として固定 |
| 手具操作加点 `APPARATUS_OP_BONUS`（操作2回以上 & 最高難度E） | §3.5.5.5(3) | ⚠️上限・局所性に既知issue（#3 / #6） |
| 二つ投げ4動作加点（4動作の境界、二つ投げ以外は対象外、別内容は各加算） | §3.5.5.5(2)⑦ | ⚠️同一内容の重複（#23） |
| 様々な跳びに対する加点 `JUMP_VARIETY_BONUS`（6m移動＋2重跳び3回） | §3.5.5.5(4)① | ✅準拠 |
| 連続宙返り減点の各段（3連続0 / 2連続0.1 / それ未満0.2、A難度でリセット、きりもみ除外） | §3.5.6 必須要素 | ✅準拠 |
| 無手具操作減点の「宙返り系のみ −0.10」段（全体 −0.20 との差） | §3.5 無手具操作減点 | ✅準拠 |
| 投げ方・受け方の多様性（3種必要／左手投げの両側カウント／投げタン／手具使用／上限0.5） | §3.5.6.4 | ✅準拠 |
| 「その他」は実施のたびに1種類、重複シリーズでもカウント | §3.5.6.4 + 実装仕様 | ✅準拠 |
| 審判判断による違反・欠如（各 −0.30、未知idは無視） | §3.5.6.3 | ✅準拠 |
| E減点の合算（シリーズ＋演技全体）と0床、個人は1シリーズ上限なし | §3.5.7 / §10 変更規則7 | ✅準拠 |
| 投げユニットの `max(handDiff, tumblingDiff)` と `diffFromHand`（同値は徒手系） | §3.5.5.4 | ✅準拠 |
| `hasDPlus` の成立条件 | 実装仕様 | ✅準拠 |
| `checkApparatusFlow`（手元/空中の手具数、二つ投げ=2消費、技中の投げ、警告文言） | 警告のみ・採点非影響 | ✅準拠 |
| `share.ts` のエンコード/デコード往復、`buildShareUrl`、`consumeShareHash` | 実装仕様 | ✅準拠 |
| 不正入力（技未選択・未知の徒手動作id・未知の跳びid・連続回数0/負/NaN） | 実装仕様 | ✅準拠 |
| `hasTwoThrow`（リング・クラブのみ） | §3.2 | ✅準拠 |

## 追加したテスト

- `src/scoring/__tests__/bonus.test.ts`（新規）: +25件 — D加点 §3.5.5.5 の(1)〜(4)を網羅
- `src/scoring/__tests__/deduction.test.ts`（新規）: +30件 — A減点とE減点の0床
- `src/scoring/__tests__/unit.test.ts`（新規）: +25件 — ユニット確定と `checkApparatusFlow`
- `src/scoring/__tests__/share.test.ts`（新規）: +17件 — URL共有の往復（location/history はスタブ）
- `src/scoring/__tests__/options.test.ts`: +2件 — `hasTwoThrow`
- 計 +99件（199 → 298 passed / 4 skipped）。`npm test`・`npm run build` ともに緑。

skip している4件は下記issueの修正待ち。ルール由来の期待値を書いてあるので、修正が入ったら
`it.skip` を外すだけで回帰テストになる。

## 発見

- **[#23](https://github.com/murakichi/mens-rg-scorer/issues/23)（新規）** 二つ投げ4動作加点が「同じ技」を重複して数えている。
  §3.5.5.5(2)⑦ は「ただし同じ技は重複して数えない」と明記しているが、実装は二つ投げ区間ごとに
  無条件で 0.10 を加算する（同一内容2回で 0.20）。粒度（内訳一致で同じ技とみなすか）の確認込みで起票。
- **[#3](https://github.com/murakichi/mens-rg-scorer/issues/3)（既存・未解決）** §3.5.5.5(3) は「最大0.10点」だが、
  `E_BONUS` と `APPARATUS_OP_BONUS` が独立に加算される。今回あらためて実測し、
  さらに **複数シリーズ・複数ユニットでも累積する**（E難度投げタン3本で `E_BONUS` だけで 0.30、
  該当シリーズ2本で `apparatusOpBonus` 0.20）ことを確認した。
  同じ「最大0.10」である(1) `SERIES_BONUS` と(4) `JUMP_VARIETY_BONUS` は演技全体で1回に制限されており、
  (3) だけ扱いが異なる。
- **[#6](https://github.com/murakichi/mens-rg-scorer/issues/6)（既存・未解決）** 手具操作加点の局所性。skip テストで期待値を待機。
- **[#2](https://github.com/murakichi/mens-rg-scorer/issues/2)（クローズ済み・仕様）** 「その他の投げ／受け」の技術加点は
  オーナー裁定で仕様と確定しているため、**加点される側**を通常テストとして固定した
  （過去の loop が再オープンを促すコメントを残しているが、裁定が優先）。
- **[#4](https://github.com/murakichi/mens-rg-scorer/issues/4)（既存）** は現行 `main` で解消済みであることを確認し、
  その旨をコメントした。クローズ可。

## その他の整備

- `.github/workflows/test.yml` を追加。これまで CI は `npm run build` しか回しておらず、
  298件のテストは push/PR で一度も実行されていなかった。push(main) と PR で `npm test` + `npm run build` を回す。

## 申し送り（次に検証すべき観点）

- **団体モード（`team.ts`）が最大の穴**：Stmts 77.7% / Branch 64.1%。特に
  `crossBonusForCross`（交差加点）・`landingBonusForSeries`（着地加点）・`sameDiffBonusForSeries`（同一難度加点）は
  テストから一度も呼ばれていない。交差／組グループの難度算出（`cellValue`）も未到達。
  暫定A減点 `missing.length * 0.3` の「ルール未規定」issue化も未着手。
- **テストファイルが型チェックされていない**：`tsconfig.app.json` が `src/**/__tests__/**` を除外しており、
  `tsc -b` はテストを見ない。vitest も型は見ないので、テストの型崩れは誰も検出できない。
  テスト用 tsconfig を足すか、`include` を見直すか要検討。
- **UI（`src/components/`）は0件**。採点mathは入っていないので優先度は低いが、
  import/export と `normalizeTeamState` の往復は E2E かユニットで押さえたい。
- 残った未到達分岐は防御的フォールバック（`u.skills || []`、未知kindの `{ k: "?" }` など）で、
  入力から到達できないもの。無理に埋めない。
