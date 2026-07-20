---
name: scoring-test
description: 男子新体操採点アプリのルール準拠テストを1周分実施する。ルール（mens-rg-rules.md）と実装（src/scoring/）を照合し、過去レポート（test-reports/）でまだ検証していない観点を選んでユニットテスト（vitest）を追加、必要ならブラウザE2Eを実施する。バグやルール未規定の挙動を見つけたらGitHub issueを作成し、最後にレポートを1本書く。loop（/loop）で繰り返し実行される想定。
---

# scoring-test — 採点ロジックのルール準拠テスト（1イテレーション）

このスキルは **1周分** のテスト作業を実施する。`/loop scoring-test` で繰り返し呼ばれ、
毎回「まだ検証していない観点」を1つ以上選んで潰していく。

## ゴール

1. ルール（`mens-rg-rules.md`）と実装（`src/scoring/`）の突き合わせ
2. 未検証の観点を選んで **ユニットテスト（vitest）を追加**（純粋関数が主戦場）。UIの動作確認が必要なら **E2E** を実施
3. バグ・ルール未規定の挙動を見つけたら **GitHub issue を作成**
4. 実施内容を **`test-reports/` にレポート1本** として残す

## 前提

- テストランナー：**vitest**。`npm test`（= `vitest run`）で実行。テストは `src/**/*.test.ts`。
- テスト対象の中心は純粋関数：`src/scoring/analysis.ts`, `score.ts`, `team.ts`, `constants.ts`, `share.ts`。
- 採点値の正解は **`mens-rg-rules.md`（公式規則）が唯一の根拠**。`app-scoring-spec.md` は実装対応表。
- レポートとテストは **リポジトリ内に格納**（コミット対象）。

---

## 手順

### 1. 過去レポートを読む（重複回避）

`test-reports/*.md` を **すべて** 読み、既にカバー済みの観点を把握する。各レポート冒頭の
「検証観点」表を見れば足りる。**同じ観点を再検証しない** こと（回帰は既存テストが担保する）。

### 2. 観点を1つ以上選ぶ

下の「観点バックログ」から、過去レポートで未実施のものを選ぶ。上から順でよいが、
バグの匂いがする箇所を優先してよい。1周で1〜3観点が目安。

### 3. ルールと実装を照合する

選んだ観点について：
- `mens-rg-rules.md` の該当セクションを読み、**期待される採点値・条件** を確定する
- `src/scoring/` の該当コードを読み、実装が規則どおりか確認する
- 食い違い、または規則に書かれていない挙動（マジックナンバー、暗黙の切り上げ/切り捨て、
  境界条件の未定義など）があれば **手順6でissue化**

### 4. テストを追加する（ユニットが主）

`src/scoring/__tests__/<対象>.test.ts` に `describe`/`it` を追記。
- **期待値はルールから手計算** して literal で書く（実装の出力をそのまま貼らない＝実装追認を避ける）
- 境界値（難度上限E、cap到達、0/空、重複シリーズ）を優先的に突く
- ヘルパー `S(...items)` / `skills(...ids)` は既存テスト参照

実行して緑を確認：
```
npm test
```
既存テストを壊していないことも確認する。**テスト自体が誤り**（ルール誤読）だった場合は
テストを直す。**実装が誤り** と確信できる場合はテストを `.fails` させず、
`it.todo` か skip でマークしたうえで手順6でissueを立て、レポートに明記する
（勝手に採点ロジックを書き換えない — バグ報告に徹する）。

### 5. （任意）E2E

ユニットで届かないUI挙動（入力→表示、import/export往復、URL共有、モード切替）を確認したいときのみ：
- `npm run dev` でローカル起動（別プロセス）、または本番 `https://murakichi.github.io/mens-rg-scorer/`
- `claude-in-chrome` ツール（`tabs_context_mcp` → `tabs_create_mcp` → `navigate` → `computer`/`read_page`）で操作
- 手順はGIF（`gif_creator`）に残すとレポートに添付しやすい
- ダイアログ（alert/confirm）を誘発しないこと

### 6. バグ・未規定挙動を issue 化

食い違いを見つけたら `gh issue create` で登録する。1件1issue。
```
gh issue create --title "<簡潔な要約>" --label bug \
  --body "$(cat <<'EOF'
## 観点
<どのルール/関数か>

## 期待（ルール §x.y）
<mens-rg-rules.md の該当箇所を引用>

## 実際（実装）
<src/scoring/... の挙動。ファイル:行 を添える>

## 再現
<最小の Series/入力。可能なら失敗するテストコード>

## 分類
[ ] 実装バグ  [ ] ルール未規定  [ ] 仕様確認が必要
EOF
)"
```
- `label` が無ければ `--label` を外す（存在しないラベルは作成に失敗する）。
- 判断がつかない（ルールが曖昧）ものは `--label question` 相当で、本文に「要確認」と明記。
- **既存の同一issueが無いか `gh issue list` で先に確認** し、重複を作らない。

### 7. レポートを書く

`test-reports/NNN-<slug>.md`（連番3桁ゼロ埋め、既存の最大+1）を新規作成。テンプレは
`test-reports/_TEMPLATE.md` を使う。必須項目：

- **検証観点**（表：観点 / ルール参照 / 結果）— 過去レポートがこれを読んで重複回避する
- 追加したテスト（ファイルと件数）
- 発見（issue番号にリンク）
- 次に検証すべき観点の申し送り

日付は今日の日付を使う（環境の currentDate を参照）。

### 8. 仕上げ

- `npm test` と `npm run build` が両方緑であること
- 変更をコミット（ワークツリー運用時は指示に従う）

---

## 観点バックログ（未実施を選ぶ）

過去レポートで消化済みのものは飛ばす。seed（001）は analysis の基本 + score の骨格を
カバー済み。

### D（難度）
- [ ] 投げユニットの `max(handDiff, tumblingDiff)` 採用と `diffFromHand`（analysis `finalizeUnit`）
- [ ] 投げタンのタンブリング枠計上（`isTumblingUnit`）と徒手枠からの除外
- [ ] E難度ボーナス `E_BONUS`（E難度タンブリング×`skillThrow`）
- [ ] シリーズ加点 `SERIES_BONUS`（投げ2回以上 & `hasDPlus` ユニットあり）
- [ ] 技術加点（`throwTypes`/`catchTypes`/投げタンの `throwTypes` 個数 × `TECHNIQUE_BONUS`）
- [ ] 手具操作加点 `APPARATUS_OP_BONUS`（`hasApparatus` 技2つ以上 & 最高難度E）
- [ ] 二つ投げ4動作加点 `TWOTHROW_MOTION_BONUS`（`twothrow`〜`catch` 区間の動作合計≥4）
- [ ] ロープ跳びユニットの難度採用と要求要素（`ropeTriple`/`ropeMoving`/`ropeFront`/`ropeBack`）
- [ ] `hasDPlus` の条件（finalDiff≥D かつ 動作3+/縦3/技あり）

### A（減点）
- [ ] 連続宙返り減点（`maxChainAll`：3+で0、2で0.1、それ未満0.2）
- [ ] つなぎ技手具操作なし減点 `CONNECT_NO_APP_DEDUCTION`（`hasConnectWithoutApparatus`）
- [ ] 無手具操作減点（宙返り系のみ0.1 / 全体0.2）と上限 `NO_APP_CAP=0.4`
- [ ] 投げ方・受け方の多様性（`throwKinds`/`catchKinds`、必要3種、上限0.5、`other` の別カウント）
- [ ] 左手投げが投げ方・受け方の両方をカウントする挙動（score.ts の lefthand 分岐）
- [ ] A/Eスコアの0床（`Math.max(0, ...)`）

### 重複シリーズ
- [ ] `dupFlags` により重複が加点・カウントから除外されること
- [ ] ただし難度は top-3 採用の競合に残ること
- [ ] `other`（その他）投げ/受けは重複でもカウントされる例外（`throwOtherCount`/`catchOtherCount`）

### 必須要素
- [ ] `dir`/`throwTum`/`triple`/`connect`/`count3`/`tumCount`/`appThrow` の各判定
- [ ] 手具別必須投げ（stick=左手投げ / clubs・ring=二つ投げ / rope=なし）

### 手具フロー（警告のみ・採点非影響）
- [ ] `checkApparatusFlow`（手元/空中の手具数シミュレーション、二つ投げ=2消費、不足警告）

### 団体モード（team.ts）
- [ ] `computeTeamScore` の塊（chunk）難度算出（横連続の非空セル、投げ+1なし）
- [ ] 各種チーム加点（rotation/landing/cross/samediff）
- [ ] 暫定A減点 `missing.length * 0.3`（※実装が暫定なので「ルール未規定」issue候補）

### share / import-export
- [ ] `share.ts` のエンコード/デコード往復（lz-string）
- [ ] `SaveData`（version/apparatus/series）の round-trip

### E2E（任意）
- [ ] 入力UI→スコア表示の一致、import/export、URL共有、個人/団体モード切替

---

## 注意

- **採点ロジック（`src/scoring/`）を勝手に修正しない。** このスキルはテストとバグ報告に徹する。
  修正が必要な場合は issue を立て、レポートに残すだけ。
- テストの期待値は **ルール由来** で書く。実装の出力を写すと回帰テストにはなるが準拠検証にならない。
- 1周は小さく。観点1〜3個 → テスト → （あれば）issue → レポート で確実に閉じる。
