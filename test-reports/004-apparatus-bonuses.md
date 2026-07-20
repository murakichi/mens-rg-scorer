# テストレポート 004: D加点 — 手具操作系ボーナス（E_BONUS / APPARATUS_OP / TWOTHROW_MOTION）

- 日付: 2026-07-20
- 実施者: scoring-test skill（loop 第4周）
- 対象: `src/scoring/score.ts`（E_BONUS / APPARATUS_OP_BONUS / TWOTHROW_MOTION_BONUS）

003 で技術加点・シリーズ加点を消化。本周は D 加点の残り、**手具操作系ボーナス**を §3.5.5.5(3)・(2)⑦ と照合。
開始時に `git fetch && git merge origin/main` を実施（Already up to date, 基点 26cbc54）。

## 検証観点

| 観点 | ルール参照 | 結果 |
|------|-----------|------|
| E難度ボーナス：E難度転回系＋技中の投げ → +0.10 | §3.5.5.5(3)〔投げ〕 | ✅準拠 |
| E難度ボーナス：投げが無ければ加点なし | §3.5.5.5(3) | ✅準拠 |
| 難度算出：D難度＋投げ+1でEに格上げされ E_BONUS が乗る境界 | §3.5.5.3 難度算出 | ✅準拠 |
| 手具操作加点：E難度ユニットに操作2回 → +0.10 | §3.5.5.5(3)〔操作〕 | ✅準拠 |
| 手具操作加点：操作1回／最高難度E未満は加点なし | §3.5.5.5(3) | ✅準拠 |
| 二つ投げ4動作加点：二つ投げ区間に4動作 → +0.10 | §3.5.5.5(2)⑦ | ✅準拠 |
| 二つ投げ4動作加点：3動作／非二つ投げは加点なし | §3.5.5.5(2)⑦ | ✅準拠 |
| §3.5.5.5(3) 上限0.10：投げ＋操作の二重加算で0.20になりうる | §3.5.5.5(3)「最大0.10」 | ❌不一致 (#3、skip) |
| §3.5.5.5(3) 局所性：操作がE転回系"に"含まれる必要 | §3.5.5.5(3) | ❌不一致 (#6、skip) |

## 追加したテスト

- `src/scoring/__tests__/bonus-apparatus.test.ts`: +11件（E_BONUS3 / APPARATUS_OP3 / TWOTHROW3 / skip2）
- 全体：56 passed | 4 skipped、`npm run build`（strict tsc）緑。

## 発見

- **新規 [#6](https://github.com/murakichi/mens-rg-scorer/issues/6)**: 手具操作加点が「E難度転回系の外」の操作でも成立する（§3.5.5.5(3)の局所性違反）。
  実装は `ops`（`hasApparatus` 技）を**シリーズ全体**で数え、E判定も**いずれかのユニット**が最高難度Eなら可。
  → E転回系に操作が無くても、別ユニットに操作2回あれば +0.10 されてしまう。app-scoring-spec は
  現行の緩い実装を追認しているため「実装バグ＋要仕様確認」で登録。`it.skip` に rule 期待値（0）を待機。
- **既報 [#3](https://github.com/murakichi/mens-rg-scorer/issues/3)** を再現確認：E＋投げ＋操作2回で
  `tumblingScore`(0.80, E_BONUS込) ＋ `apparatusOpBonus`(0.10) = 0.90。§(3)は最大0.10のはず。`it.skip` で待機。
- **[#2](https://github.com/murakichi/mens-rg-scorer/issues/2) は CLOSED だが現行 main で再現**：技術加点は
  依然 `throwTypes.length` で `other` を含む（`score.ts:161-166`）。修正コミット未pushの可能性を issue に
  コメント済み（[comment](https://github.com/murakichi/mens-rg-scorer/issues/2#issuecomment-5019452130)）。
  `bonus.test.ts` の skip は据え置き。

## 申し送り（次に検証すべき観点）

- **A減点系が丸ごと未検証**：連続宙返り減点（`maxChainAll`：3+で0/2で0.1/未満0.2）、つなぎ技手具なし
  減点 `CONNECT_NO_APP_DEDUCTION`、無手具操作減点と上限 `NO_APP_CAP=0.4`、方向系不足 `DIRECTION_DEDUCTION`、
  投げ回数不足 `THROW_COUNT_DEDUCTION`、A/Eスコアの0床。次周の第一候補。
- 必須要素チェック（`dir`/`throwTum`/`triple`/`connect`/`count3`/`tumCount`/`appThrow`、手具別必須投げ）未検証。
- 手具別必須要素/違反A減点（`apparatusElementDeduction`/`violationDeduction`、main で追加済み）未検証。
- 団体モード（team.ts、main で team.test.ts あり）は chunk難度・各種チーム加点・暫定A減点が要拡充。
- ロープ跳び加点/要求要素、share.ts round-trip、E2E 未着手。
- **運用メモ**：loop 開始時は必ず `git fetch && git merge origin/main`。closed issue の再現も毎回確認する
  （#2 のように fix 未push があり得る）。
