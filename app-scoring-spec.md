# 採点計算アプリ 実装仕様書

`mens-rg-rules.md`（公式規則）とアプリ内の実装（`src/scoring/`）を対応付けるドキュメント。
規則の変更は `mens-rg-rules.md` に、アプリ固有の仕様は本書に記載する。

---

## 1. 実装状況

| モード | 規則セクション | 状態 | 備考 |
|--------|---------------|------|------|
| 個人（個人競技） | §3.5 | 実装済み | D/A/E すべて |
| 団体（自由演技） | §3.4 | D・A・E実装済み | E実施減点は各シリーズ／演技全体で手入力。A減点は暫定精度 |
| 個人選手 | §3.8 | 未実装 | 団体内個人の別採点方式（A=3.00満点） |

---

## 2. 採点カテゴリとアプリの計算

**合計 = D + A残点 + E残点**（A・Eの残点は0で止まる）

- **D**：タンブリング難度点、徒手難度点、連続投げ加点、技術加点、手具操作加点、二つ投げ4動作加点、E難度ボーナス。
- **A**：方向系不足減点、投げ回数不足減点、連続宙返り減点、つなぎ技手具操作なし減点、無手具操作減点、投げ/受け種類不足減点。
- **E**：各シリーズに自由入力する実施減点 + 演技全体の実施減点の合計（出来栄え判定はユーザー入力）。

アプリの single source of truth：`computeScore()` in `score.ts`

---

## 3. 定義テーブル対応表

| 規則の項目 | 定義名 | ファイル |
|-----------|--------|---------|
| 技リスト・系統・難度 | `SKILL_LIST` | `constants.ts` |
| 難度点（A=0.1〜E=0.7） | `DIFF_SCORE` | `constants.ts` |
| 難度の数値対応（A=1〜E=5） | `DIFF_VALUE` / `VALUE_DIFF` | `constants.ts` |
| 難度上限 | `MAX_DIFF = 5` | `constants.ts` |
| 系統タグ（前方/側方/後方/その他） | `CATEGORY` | `constants.ts` |
| 手具定義 | `APPARATUS` | `constants.ts` |
| 手具ごとの必須投げ | `REQUIRED_THROW_OPTIONS` | `constants.ts` |
| 投げオプション | `THROW_OPTIONS_COMMON` / `THROW_OPTIONS_APPARATUS` | `constants.ts` |
| 受けオプション | `CATCH_OPTIONS_COMMON` / `CATCH_OPTIONS_APPARATUS` | `constants.ts` |
| 手具が二つあるか | `APPARATUS_USE` / `APPARATUS_COUNT` | `constants.ts` |
| 徒手動作（1〜4動作 + 縦3動作） | `HAND_MOTIONS` | `constants.ts` |

---

## 4. 個人モードの加点定数

| 規則の加点項目 | 定数名 | 値 | 条件 |
|--------------|--------|-----|------|
| E難度ボーナス | `E_BONUS` | 0.1 | E難度タンブリングに投げを含む |
| シリーズ加点 | `SERIES_BONUS` | 0.1 | 投げ2回以上 & D以上のユニットあり |
| 技術加点（投げ/受け1つにつき） | `TECHNIQUE_BONUS` | 0.1 | 視野外/手以外/手具使用の投げ・受け |
| 手具操作加点 | `APPARATUS_OP_BONUS` | 0.1 | 手具操作2回以上 & 最高難度E |
| 二つ投げ4動作加点 | `TWOTHROW_MOTION_BONUS` | 0.1 | 二つ投げ中に徒手4動作以上 |
| 様々な跳び加点 | `JUMP_VARIETY_BONUS` | 0.1 | ロープ：6m移動連続跳びに2重跳び3回以上（§3.5.5.5(4)①）。②③は入力未対応 |

---

## 5. 個人モードのA減点定数

| 規則の減点項目 | 定数名 | 値 | 条件 |
|--------------|--------|-----|------|
| 方向系不足 | `DIRECTION_DEDUCTION` | 0.3 | 前方/側方/後方の不足1方向につき |
| 投げ回数不足 | `THROW_COUNT_DEDUCTION` | 0.3 | 投げ3回未満 |
| つなぎ技手具操作なし | `CONNECT_NO_APP_DEDUCTION` | 0.1 | つなぎ技のA難度で手具操作なし |
| 宙返り2連続止まり | `SALTO_CHAIN_2_DEDUCTION` | 0.1 | 最大連続宙返りが2 |
| 宙返り連続なし | `SALTO_CHAIN_LOW_DEDUCTION` | 0.2 | 連続宙返りなし |
| 投げなしタンブリング（宙返り系のみ） | `NO_APP_SALTO_DEDUCTION` | 0.1 | 宙返り系すべてに手具操作なし |
| 投げなしタンブリング（全体） | `NO_APP_ALL_DEDUCTION` | 0.2 | シリーズ全体に手具操作なし |
| 無手具操作の上限 | `NO_APP_CAP` | 0.4 | 演技全体での合算上限 |
| 投げ方/受け方の多様性不足 | `VARIETY_DEDUCTION_PER` | 0.1 | 1種類不足につき |
| 多様性不足の上限 | `VARIETY_CAP` | 0.5 | 投げ方+受け方の合算上限 |
| 必要種類数 | `VARIETY_REQUIRED` | 3 | 投げ方・受け方それぞれ |
| 手具別必須要素の欠如 | `REQUIRED_ELEMENT_DEDUCTION` | 0.3 | §3.2 手具操作要求要素の未実施1つにつき（§3.5.6.3） |
| 違反・欠如 | `VIOLATION_DEDUCTION` | 0.3 | 開始/終了/音楽違反・徒手系基礎要素群欠如の各該当（§3.5.6.3） |

`REQUIRED_ELEMENT_DEDUCTION` の対象要素は `APPARATUS_REQUIRED_ELEMENTS`（手具別、手動チェック）。
左手投げ/二つ投げ・3回以上の投げ上げは既存判定（必須投げ・投げ回数）と重複するため対象外。
`VIOLATION_DEDUCTION` の対象は `VIOLATION_OPTIONS`（審判判断による手動チェック）。
どちらも個人モードの routine レベル state（`apparatusElements` / `violations`）で保持し、`SaveData`・共有URLに含める。

---

## 6. 個人モードの採点パイプライン

```
series[] → analyzeSeries() → analysis[] → computeScore() → ScoreResult
```

### 6.1 `analyzeSeries(series)` in `analysis.ts`

items を左→右に走査し、`catch` が来たら buffer を flush して**ユニット**に変換する。

- 投げなし → `tumbling` ユニット（`calcTumblingDifficulty` で格上げ算出）
- 投げあり → `throw` ユニット（`max(handDiff, tumblingDiff)` を採用）
  - skill も含む場合は `isThrowTumbling`（投げタン）→ タンブリング枠に計上

### 6.2 `computeScore(series, apparatus)` in `score.ts`

1. 重複シリーズ判定（`seriesSignature` + `dupFlags`）
2. 各シリーズ内訳（`seriesBreakdowns`）を先に算出
3. グローバル値はシリーズ内訳を合算（二重実装防止）
4. 必須要素チェック → `required[]` / `missing[]`
5. `ScoreResult` を返す

### 6.3 重複シリーズの扱い

- `seriesSignature` でシリーズの構成を文字列化し、重複を検出
- 重複シリーズは大半のカウント・ボーナスから**除外**
- ただし難度は top-3 採用の競合対象に含まれる
- `throwOtherCount` / `catchOtherCount`（「その他」の投げ/受け）は重複でもカウント

### 6.4 採用数

- タンブリング難度：上位**3つ**を採用（`ADOPT_COUNT = 3`）
- 徒手難度：上位**3つ**を採用
- A/E の満点：各**10点**（`AE_FULL = 10`）

---

## 7. 個人モードの必須要素チェック

`computeScore` が返す `required[]` の各項目：

| key | ラベル | 判定ロジック |
|-----|--------|-------------|
| `dir` | 前方系・側方系・後方系をすべて含む | タンブリングユニットの技の `category` 集合 |
| `throwTum` | 1本以上が投げタン | `isThrowTumbling` なユニットの存在 |
| `triple` | 1本以上が宙返り3回以上連続 | `maxSaltoChain >= 3` |
| `connect` | 1本以上がつなぎ技 | `hasConnect()` で宙返り→A難度→宙返り パターン検出 |
| `count3` | 投げを3回以上実施 | `totalThrowCount >= 3` |
| `tumCount` | タンブリング3本以上 | `nonDupTumblingCount >= 3` |
| `appThrow` | 手具別必須投げ | `REQUIRED_THROW_OPTIONS` の全IDが実施済みか |

`required[]` とは別に、`computeScore` は §3.2/§3.5.6.3 用の表示リストも返す：
- `apparatusElementChecks[]`：`APPARATUS_REQUIRED_ELEMENTS[apparatus]` の手動チェック状況（未実施は `apparatusElementDeduction` に −0.3）。
- `violationChecks[]`：`VIOLATION_OPTIONS` の該当状況（passed=違反なし。該当は `violationDeduction` に −0.3）。

---

## 8. 団体モードの定数

| 規則の項目 | 定数名 | 値 |
|-----------|--------|-----|
| 組運動の最大難度 | `UNION_MAX_VALUE` | `DIFF_VALUE.C` (= 3) |
| 加点対象の連続転回数 | `ROT_CHAIN_REQUIRED` | 4 |
| 同じ転回技加点 | `TEAM_ROTATION_BONUS` | `{ all5: 0.1, sim: 0.2, simD: 0.3 }` |
| 着地加点 | `TEAM_LANDING_BONUS` | `{ all5: 0.1, sim: 0.2 }` |
| 交差加点 | `TEAM_CROSS_BONUS` | `{ base: 0.1, oneD: 0.2, twoD: 0.3 }` |
| 同一難度加点 | `TEAM_SAMEDIFF_BONUS` | `{ d: 0.1, e: 0.2 }` |

### 団体の採点ロジック

`computeTeamScore(team)` in `team.ts`

- グリッド構造：`Series[]` × player `lanes[]` × `slots[]` の `Cell`
- 横方向に連続する非空セルが1つの**塊**（個人のタンブリング1本に相当、ただし投げ加点+1は無い）
- A減点は `aDeductions` で算出（`missing.length * 0.3` は暫定）
- E実施減点は未実装

---

## 9. UI構成

| コンポーネント | 役割 |
|---------------|------|
| `App.tsx` | モード切替（個人/団体）のシェル |
| `IndividualScorer` | 個人モードの全UI・state管理 |
| `TeamScorer` | 団体モードの全UI・state管理 |
| `JsonModal` | インポート/エクスポート（個人のみ） |

- スタイリングは **glassmorphism デザインシステム**（`src/index.css`）
- State 更新は `structuredClone` でイミュータブル
- `SaveData` 型（`{ version: 1, apparatus, series }`）でファイル/JSON保存

---

## 10. 未実装・要確認事項

- [ ] §3.8 個人選手モード（団体内個人、A=3.00満点の別採点方式）
- [x] 団体のE実施減点（各シリーズ／演技全体の手入力・合算）
- [x] 手具ごとの要求要素チェック（§3.2、`APPARATUS_REQUIRED_ELEMENTS` の手動チェック＋§3.5.6.3 減点）
- [x] §3.5.5.5(4)① 様々な跳び加点（ロープ）
- [x] §3.5.6.3 違反・欠如のA減点（開始/終了/音楽/徒手系群）
- [ ] §3.5.5.5(4)②③ 様々な跳び加点（跳びの形の多様性 / その場回転跳び2回転）— 跳びに形フラグの入力追加が必要
- [ ] 手具別必須要素の自動判定化（ころがし・プロペラ回旋・まわし等は現状手動チェック）
- [ ] A減点の芸術性スコアリング（主観評価部分）の実装検討
- [ ] ジュニア適用規則への対応
- [ ] 団体のA減点ロジックの精緻化（暫定 `missing.length * 0.3`）
