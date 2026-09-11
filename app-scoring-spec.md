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
| 徒手動作の選択肢（動作数 + 徒手扱いの転回技） | `MOTION_OPTIONS` / `MOTION_SKILLS` | `constants.ts` |
| ロープ跳びの難度表 | `ROPE_JUMPS` | `constants.ts` |
| 徒手系難度表（§3.6.1 跳躍・バランス・倒立・柔軟） | `HAND_ELEMENTS` / `HAND_ELEMENT_GROUPS` | `constants.ts` |

### タンブリング技の入力パターン

技は**一覧から選ぶ**ほかに、**ひねり回数と姿勢で組み立てる**こともできる（シリーズカードの技ブロックの
「ひねり／一覧」ボタンで切り替え。選んだパターンは `localStorage` に覚える）。

- 選択肢：`TWIST_BASES`（後方宙返り／前宙）× `POSTURE_OPTIONS`（抱え込み・屈伸・伸身）×
  `TWIST_OPTIONS`（なし〜3回半ひねり、0.5刻み）
- 難度は §3.6.2 の表どおり `twistDifficulty()` で決める
  - **後方系は姿勢によらずひねり回数だけ**：0・半＝B／1回・1回半＝C／2回・2回半＝D／3回以上＝E（#7・#12〜#17）
  - **前方系は伸身が1段階上**：かかえ込み・屈身は後方系と同じ表、伸身は 0＝C／1回・1回半＝D／2回以上＝E（#8・#11〜#14）
- idは `buildTwistSkillId()` が組み立てる。**`SKILL_LIST` に同じ内容の技があればそのidを返す**ので、
  一覧から選んでもひねり指定で選んでも同じidになり、重複判定（§3.4.4）が食い違わない。
  一覧に無い組み合わせ（前方伸身宙返り、後方屈伸宙返り半ひねりなど）だけ `tw:<base>:<twist>:<posture>` の
  合成idになり、`skillDef()` が `twistName()` / `twistDifficulty()` から技として解決する
- 既存idからは `parseTwistSkillId()` でひねり・姿勢に戻せる（`Skill.twist`）。組み立てで表せない技
  （側宙・テンポ・きりもみ・2回宙返り系など）は `null`
- ジュニアの難度認定は合成idにも効く（後方宙返り半ひねりは姿勢を問わずC）

UIのプルダウンは見出し（`optgroup`）で分類する。タンブリング技は**前方系・側方系・後方系**
（`skillOptionGroups(junior)`、系統の順は `SKILL_CATEGORY_ORDER`）、徒手動作は
**縦回転・横回転**（`motionOptionGroupsFor(prevMotionId)`、`MOTION_AXIS_GROUPS`）。徒手扱いの
転回技はすべて縦の一回転なので縦回転側に入る（`motionDef()` の扱いと同じ）。群の中の並び順は
それぞれ `SKILL_LIST` / `motionOptionsFor()` の優先順を保つ。

タッチダウンライズは**縦回転の徒手としてのみ**判定するため、`SKILL_LIST`（タンブリング技）には入れず
`HAND_MOTIONS` に1動作の項目（`td_rise`）として持つ。方向系の網羅判定にも影響しない。

`ROPE_JUMPS` は §3.5.5.3 の跳び難度表と1対1。1重跳びは全パターンA固定のためクロスの区別を持たない。
3重跳び連続3回以上（D）・4重跳び（D）・4重跳び連続2回以上（E）は**難度判定で前後を区別しない**ため、
前後で同じ難度のエントリを両方持つ（`3x3f`/`3x3b`、`4f`/`4b`、`4x2f`/`4x2b`）。
`direction` は §3.2(3) の前回し／後ろ回し跳び2回以上連続の要求要素判定にのみ使う。

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
| 投げ回数不足 | `THROW_COUNT_DEDUCTION` | 0.3 | 投げが `THROW_COUNT_REQUIRED`（一般3／ジュニア2）未満 |
| 投げ回数超過 | `THROW_COUNT_OVER_DEDUCTION` | 0.3 | ジュニアのみ。`JUNIOR_THROW_COUNT_MAX`（5回）を超えた1回につき |
| つなぎ技手具操作なし | `CONNECT_NO_APP_DEDUCTION` | 0.2 | つなぎ技のA難度で手具操作なし（投げなしタンブリング塊のみ・Q&A Q10） |
| 宙返り2連続止まり | `SALTO_CHAIN_2_DEDUCTION` | 0.1 | 最大連続宙返りが2 |
| 宙返り連続なし | `SALTO_CHAIN_LOW_DEDUCTION` | 0.2 | 連続宙返りなし |

**きりもみ系の宙返り判定（Q&A Q7 / 規則集 P51 3.6.2.4 注釈）**：きりもみ・きりもみ転回
（`Skill.saltoOnlyInChain`）は**宙返りの連続に含まれる場合のみ**宙返りとして数える。
判定は `saltoFlags(skillIds)` に集約し、`maxSaltoChain` / `hasConnect` /
`hasConnectWithoutApparatus` / 無手具操作減点の宙返り判定がこれを使う。
- 隣（つなぎ技のA難度技は読み飛ばす）に本物の宙返りがあれば宙返り扱い
- きりもみ同士が並んだだけでは連続とみなさない（本物の宙返りが必要）
- 難度そのもの（きりもみB／きりもみ転回C）は変わらない

**宙返りに数えない技は徒手系の動作として数える（Q&A Q7 の回答）**
- `tumblingFlags(skillIds)` が転回系として扱う技（宙返り＋宙返り間に挟んだつなぎ技のA難度技）を返し、
  それ以外の技は `handMotionsOfSkill()` の動作数として徒手系難度に合算する
  - A難度技（側転・ロンダート・バク転・ハンドスプリング・とび前転）＝縦の一回転の徒手で **1動作**
  - きりもみ（B）＝1動作、きりもみ転回（C）＝2動作（難度をそのまま徒手系難度に読み替え：`max(1, 難度値 − 1)`）
- 徒手動作（`motion` アイテム）と技由来の動作数は**合算**する。
  例：投げ→2動作→バク転→キャッチ ＝ 3動作 → D難度
- 転回系の技が1つも無い塊は `isThrowTumbling = false` の徒手系ユニットになる。
  投げを含まない場合も徒手系ユニットとして難度を数える（`Unit.isThrow = false`／型は `"throw"`）
- 例：投げ→バク転→キャッチ ＝ 徒手系B、投げ→きりもみ転回→キャッチ ＝ 徒手系C、側転単体 ＝ 徒手系B
- これらの技は**徒手動作アイテムの選択肢にも出す**（`MOTION_OPTIONS`＝`HAND_MOTIONS` + `MOTION_SKILLS`）。
  タンブリング技として入れても徒手動作として入れても動作数は同じ（`motionDef()` が両方を解決する）
- 徒手動作の選択肢は**回転系の徒手のみ**（`MOTION_OPTIONS`）。投げ受けの間に数えるのは
  §3.5.5.3 の注釈どおり縦軸・横軸の360度回転だけなので、汎用の「n動作」（`m1`〜`m4`・`mv3`）は
  `legacy: true` にして選択肢から外した。保存済みデータは `legacyMotionDef()` で解決し、
  読み込んだ構成では「3動作（旧）」のように選択値として表示・計算する
- 選択肢の並びは `motionOptionsFor(prevMotionId)`：既定は `MOTION_PRIORITY_DEFAULT`
  （シェネ→前転→側転→とび前転→ハンドスプリング）、直前に選んだ動作があれば
  `MOTION_PRIORITY_AFTER`（シェネの次＝前転・転がり・側転／前転の次＝転がり）を先頭に足す。
  並べ替えるだけで選択肢の顔ぶれは変わらない
- 徒手動作アイテムは**連続回数**（`MotionItem.count`、既定1）を持ち、動作数は回数分だけ加算される。
  「1動作×2回」と「2動作」は内容キーまで含めて同じ扱い。
  回数は**0まで下げられる**（入力欄を消した状態＝0）。`motionTimes()` は未指定を1回、0以下を0回とし、
  **0回の動作は難度にも技の構成（内容キー）にも数えない**。UIでは0を空欄で表示するので、
  消してそのまま入力し直せる
- 縦の一回転の徒手：タッチダウンライズ・前転・後転・ギャンビ（各1動作、`vertical`）。
  これらと徒手扱いの転回技（側転・バク転・きりもみ系など）が3動作分そろうと縦3動作＝E
- シェネは**横の一回転**（1動作・縦回転には数えない）。転がりも同じ。
  シェネは `hasHandsOption` を持ち、`MotionItem.hands` で手ありを区別する。
  手ありのときは種類（`MotionItem.handsType` ＝ `HANDS_TYPES`：片手上げ／両手上げ／回旋／その他、
  既定は片手上げ）も選ぶ
  - 手あり／手なしで**別の技**として扱う（Q&A Q28）。手ありは種類ごとに別の技
  - 種類「その他」を含むユニットは `Unit.neverDuplicate` が立ち、いくつあっても重複と見なさない
    （「その他の投げ／受け」と同じ扱い）
  - 手ありと手なしが混在した塊は、手なし・手ありのどちらの内容とも同じ技として扱うため
    内容キーを複数持つ（`Unit.signatures`、Q&A Q21）。手ありのキーは `:h:<種類>` を付ける。
    採用は難度点の高い順に走査し、どちらかのキーが埋まっていれば不採用
- **縦回転の徒手が3動作分そろうと縦3動作＝E難度**として扱う（`HandMotion.vertical` /
  徒手扱いの転回技はすべて縦回転）。例：投げ→側転→バク転→タッチダウンライズ→キャッチ ＝ E。
  一般の動作数（1〜4動作）は縦回転として数えないので、2動作＋バク転は3動作のD止まり
| 投げなしタンブリング（宙返り系のみ） | `NO_APP_SALTO_DEDUCTION` | 0.1 | 宙返り系すべてに手具操作なし |
| 投げなしタンブリング（全体） | `NO_APP_ALL_DEDUCTION` | 0.2 | シリーズ全体に手具操作なし |
| 無手具操作の上限 | `NO_APP_CAP` | 0.4 | 演技全体での合算上限 |
| 投げ方/受け方の多様性不足 | `VARIETY_DEDUCTION_PER` | 0.1 | 1種類不足につき |
| 多様性不足の上限 | `VARIETY_CAP` | 0.5 | 投げ方+受け方の合算上限 |
| 必要種類数 | `VARIETY_REQUIRED` | 3 | 投げ方・受け方それぞれ |
| 手具別必須要素の欠如 | `REQUIRED_ELEMENT_DEDUCTION` | 0.3 | §3.2 手具操作要求要素の未実施1つにつき（§3.5.6.3） |
| 必須要素の欠如 | `MISSING_ELEMENT_DEDUCTION` | 0.3 | 投げタン・つなぎ技・タンブリング本数の不足（各） |
| 違反・欠如 | `VIOLATION_DEDUCTION` | 0.3 | 開始/終了/音楽違反・徒手系基礎要素群欠如の各該当（§3.5.6.3） |
| 芸術と多様性の欠点 | `ART_DEDUCTION_ITEMS` | 0〜各項目の上限 | §3.5.6.4 の欠点テーブル（審判の主観評価・手入力） |

`ART_DEDUCTION_ITEMS` は §3.5.6.4 の欠点テーブルと1対1（`id` / `group` / `name` / `max` / `note`）。
値は `clampArtDeduction(id, v)` で 0〜`max`（0.1刻み）に丸め、合計を `ScoreResult.artDeduction`、
全項目の内訳を `artRows` として返す。UIは「芸術と多様性の欠点（§3.5.6.4）」カードで項目ごとに
プルダウン選択し、`SaveData.artDeductions`（項目id → 減点）としてファイル/テキスト/共有URLに往復する。
表のうち**「投げ受けの操作」（上限0.50）だけはシリーズ入力から自動判定**する（投げ方・受け方の種類不足）ため
手入力の対象から外している。

`REQUIRED_ELEMENT_DEDUCTION` の対象要素は `APPARATUS_REQUIRED_ELEMENTS`（手具別）。
左手投げ/二つ投げ・3回以上の投げ上げは既存判定（必須投げ・投げ回数）と重複するため対象外。
要素に `auto` が付いているものはシリーズ入力から自動判定し、手動チェック欄には出さない（手動チェックでは上書きできない）。

| 要素 | `auto` | 判定 |
|------|--------|------|
| スティック `stick_right`（右投げ右受け1回以上） | `rightThrow` | 左手投げ（`reqTypes: lefthand`）でも手以外の投げ（`throwTypes: nonhand`）でもない投げが1回以上あるか。技の最中の投げ（投げタン）も対象 |
| 各手具 `*_rotthrow`（転回系の投げ受け） | `throwTumbling` | 投げタン（`Unit.isThrowTumbling`）が1本以上あるか。必須要素チェックの `throwTum` と同じ判定 |
| スティック `stick_left` / リング・クラブ `*_twothrow` | `leftThrow` / `twoThrow` | 投げアイテムの必須投げ（`reqTypes`）に左手投げ／二つ投げがあるか |
| ロープ `rope_triple` / `rope_moving` / `rope_front` / `rope_back` | 同名の auto | ロープ跳びの入力から判定（3重跳び／6m以上移動の3回以上連続跳び／その場前回し・後ろ回し2回以上） |

`VIOLATION_DEDUCTION` の対象は `VIOLATION_OPTIONS`（審判判断による手動チェック）。

つなぎ技の手具操作なし減点（Q&A Q10）：後方一回半ひねり(操作なし)〜ロンダート(操作なし)〜ダイビング前宙(操作あり)
＝ A審判 −0.20（E審判の −0.10 は実施減点なのでユーザー入力）。操作は回しに限らず持ち替え・足やわきに挟むなども
含み、1つでもあれば減点しない（`hasApparatus` のチェック1つで表現）。対象は投げを含まないタンブリング塊のみ。
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

- `seriesSignature` でシリーズの構成を文字列化し、既出と一致するものを検出（`dupSignatureFlags`）
- `Series.notDuplicate` が true のシリーズは重複扱いを解除（`dupFlags = dupSignatureFlags && !notDuplicate`）
  - シェネの腕の使い方・動作の内訳（4シェネ／3シェネ＋前転 など）といった入力項目に現れない差異を
    ユーザーが宣言するためのフラグ。`SeriesCard` は `dupSignatureFlags` が立っている間だけ
    チェックボックスを出す（チェック後も消えないよう、表示条件は解除前の生の判定を使う）
- 重複シリーズ（`dupFlags`）はカウント・ボーナスに加えて **D にも一切算入しない**
  （難度点・連続投げ加点・技術加点・手具操作加点・二つ投げ4動作加点すべて0。
  §3.5.5「全く同じ技は難度として数えない」）。難度点の採用候補（top-3）からも除外する
- A側の判定（方向系・連続宙返り・つなぎ技・必須要素チェック）は重複シリーズのユニットも見る
- `throwOtherCount` / `catchOtherCount`（「その他」の投げ/受け）は重複でもカウント

### 6.3.1 シリーズ内訳の表示

- `SeriesBreakdown.tumRows` / `handRows` はユニット1つ分の行（`label` / `diff` / `score` / `adopted` / `inTop`）。
  タンブリング塊ごと・投げごとに1行出す。`adopted && inTop` の行だけが `tumDiff` / `handDiff` に合計される
- 採用されなかった行は `SeriesCard` が斜線＋「難度不採用」（同じ内容を既に採用）／
  「上位3つ外」（候補には入ったが上位3つに届かなかった）バッジで表示する
- `tumDiff` / `handDiff` は**上位3つに入ったユニットのみ**の合計なので、
  Σ各シリーズの `tumDiff` = `tumblingScore`、Σ`handDiff` = `handScore` になる（`dPart` も実際のDと一致）

### 6.4 採用数

- タンブリング難度：上位**3つ**を採用（`ADOPT_COUNT = 3`）
- 徒手難度：上位**3つ**を採用（採用候補は `adoptedHandUnits()` in `score.ts`）
  - 連続投げの2回目以降も難度点の候補に入る。難度が低ければ上位3つから漏れるだけで、
    採用対象から外すわけではない
- **同じ内容の難度は演技全体で1回しか数えない**（§3.4.4「全く同じ技は難度として数えない」）
  - 各ユニットは `Unit.signature` で内容を表す
    - 技を含むユニット（タンブリング塊・投げタン）＝転回系：**難度に効く非A難度技の並び**。
      手具を持っての前宙と投げての前宙は「同じ前宙」なので、投げの有無やA難度技は含めない（Q&A Q22）
    - 技を含まない投げ受け＝徒手系：投げとキャッチの間の**内訳**（動作の種類 → 実施回数）。
      順序は問わないが、内訳が違えば別の技（4シェネ と 3シェネ＋前転 は別）。
      徒手として数える技（側転・バク転など）はタンブリング技として入れても徒手動作として
      入れても同じキーになる。旧データの汎用動作（1〜4動作）は種類を区別できないため
      まとめて `m:<動作数>` として数える
    - ロープ跳び：跳びのid
    - 技術タグ（視野外・手以外・背面投げ等）はいずれも含めない
  - 同じ `signature` が複数あるときは**難度点の高いものだけを採用**する（同点なら先に実施した方）。
    例：前宙(B) → 投げ前宙(C) なら後者が採用（Q22）
    **不採用でも「実施しなかった」扱いにはしない**：技術加点・連続投げ加点・投げ回数・タンブリング本数・
    A側の判定（方向系・連続宙返り・つなぎ技・必須要素）には従来どおり算入する
  - `notDuplicate` を立てたシリーズのユニットは内容キーをシリーズ単位に閉じ、他シリーズと重複しない
  - 採用可否は `ScoreResult.unitAdopted[series][unit]` で返し、`SeriesCard` が「難度不採用」バッジを出す
  - 上位3つに入ったかは `ScoreResult.unitInTop[series][unit]`
  - 例（Q20）：3動作の投げ受け → 同じ3動作から背面投げで連続投げ
    ＝ 徒手難度点は D 1つ分（0.5）、背面投げの技術加点 0.1 と連続投げ加点 0.1 は付く
- A/E の満点：各**10点**（`AE_FULL = 10`）

---

## 7. 個人モードの必須要素チェック

`computeScore` が返す `required[]` の各項目：

| key | ラベル | 判定ロジック |
|-----|--------|-------------|
| `dir` | 前方系・側方系・後方系をすべて含む | タンブリングユニットの技の `category` 集合 |
| `throwTum` | 1本以上が投げタン | `isThrowTumbling` なユニットの存在 |
| `triple` | 1本以上が宙返り3回以上連続 | `maxSaltoChain >= 3`（`saltoFlags` 経由） |
| `connect` | 1本以上がつなぎ技 | `hasConnect()` で宙返り→A難度→宙返り パターン検出 |
| `count3` | 投げをN回以上実施 | `totalThrowCount >= requiredThrowCount`（一般3／ジュニア2。ラベルもNに追従） |
| （手具別必須投げは §3.2 手具別必須要素に統合） | — | `appThrow` は廃止し、`stick_left` / `*_twothrow` の自動判定で扱う |
| `countMax` | 投げはN回以内（ジュニアのみ） | `performedThrowCount <= maxThrowCount`（5） |
| `tumCount` | タンブリング3本以上 | `nonDupTumblingCount >= 3` |
| `appThrow` | 手具別必須投げ | `REQUIRED_THROW_OPTIONS` の全IDが実施済みか |

各行は `deduction`（不足時のA減点）を持ち、`SeriesCard`／`ScoreSummary` が金額を表示する。
うち **投げタン・つなぎ技・タンブリング本数**の不足は `missingElementDeduction`（各 −0.30）として
A減点に加算する。方向系・連続宙返り・投げ回数は従来どおり固有の減点項目で計上するので二重計上しない。

`required[]` とは別に、`computeScore` は §3.2/§3.5.6.3 用の表示リストも返す：
- `apparatusElementChecks[]`：`APPARATUS_REQUIRED_ELEMENTS[apparatus]` の手動チェック状況（未実施は `apparatusElementDeduction` に −0.3）。
- `violationChecks[]`：`VIOLATION_OPTIONS` の該当状況（passed=違反なし。該当は `violationDeduction` に −0.3）。

---

### 7.5 団体の徒手（個人とは別物）

団体には手具が無いので、個人の「投げ受けの間の動作数（1〜4動作）」は使わない。団体の徒手は
**§3.6.1 徒手系難度表**（跳躍12・バランス8・倒立9・柔軟7＝計36項目、`HAND_ELEMENTS`）から選び、
難度は表の**団体（5名実施）列**（`teamHandDifficulty()`）を採用する。

- 徒手セルは**連続しない**：前後のセルと塊を作らず単独の塊になる（技どうしも徒手を挟むと繋がらない）
- 徒手は**全員実施が前提**。シリーズは `TeamSeries.content`（`"skill"`＝転回 / `"motion"`＝徒手）で
  どちらの内容かを持ち、UIでは**同時実施シリーズの「転回／徒手」切替**で選ぶ。
  徒手シリーズは `mode: "allTogether"` 固定・1レーン・1スロットで、徒手要素を1つだけ選ぶ
  （`motionSeries()`）。グリッド・交差・組運動は表示しない
- 旧データ（`content` 無し）で徒手セルを含むシリーズは、`normalizeTeamState` が最初の徒手要素を拾って
  徒手シリーズに正規化する。採点ロジック側はセル位置を問わず計算できるままなので、
  途中スロットに徒手がある構成もそのまま採点できる
- 団体列がすでに5名実施の値なので、5人同時の**格上げ（+1）は行わない**
- 交差グループの段の値も表の難度値を使う（従来は一律1）

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
  - **複雑な同調性タンブリング**は「同一スロットで**2〜4人**が同時に**転回系**を実施」を1回と数える
    （演技全体で 0回 −0.2 / 1回 −0.1 / 2回以上 0）。宙返りに限らず**A難度の転回**
    （ハンドスプリング・ロンダート等）も数える。5人そろったスロットは
    「全員同時のタンブリング」の対象なのでここでは数えない
- E実施減点は未実装

---

## 8.5 ジュニア適用規則（個人モード）

`§10 変更規則1`。個人モードのトグルスイッチ（`IndividualScorer` の「適用規則」カード）で ON/OFF する。
ON にすると `computeScore(series, apparatus, { junior: true })` が呼ばれ、以下が変わる。

| 項目 | 一般 | ジュニア | 実装 |
|------|------|---------|------|
| ダイビング前宙（`b_divefront`）の難度 | B | C | `JUNIOR_SKILL_DIFFICULTY` |
| 後方宙返り半ひねり（`b_backhalf`）の難度 | B | C | `JUNIOR_SKILL_DIFFICULTY` |
| 後方伸身宙返り半ひねり（`b_backlayhalf`）の難度 | B | C | `JUNIOR_SKILL_DIFFICULTY` |
| 投げ上げの最低回数 | 3（`THROW_COUNT_REQUIRED`） | 2（`JUNIOR_THROW_COUNT_REQUIRED`） | `throwCountRequired(junior)` |
| 投げ上げの上限回数 | なし | 5（`JUNIOR_THROW_COUNT_MAX`） | `throwCountMax(junior)` |
| 2回宙返り系 | 実施可 | 禁止（選択肢に出さない） | `Skill.isDoubleSalto` / `skillAllowed()` / `skillOptions(junior)` |
| バク転→後方伸身宙返りの連続（団体） | 連続加算どおり（B） | まとめてC | `JUNIOR_SKILL_COMBOS` / `juniorComboAt()` |
| 1シリーズの実施減点(E)（**団体のみ**） | 上限なし | 最大1.0（`JUNIOR_SERIES_EXECUTION_MAX`） | `clampSeriesExecution(v, junior)` |

2回宙返り系（後方2回宙返り・後方伸身2回宙返り・ダイビングダブル・ムーンサルト・ルドルフ）は
ジュニアでは選択肢から外す。すでに選ばれている構成を読み込んだ場合は、値を失わないよう
「（D・ジュニア禁止）」と印を付けて選択値として残す（採点自体は従来どおり行う）。

上限を超えた6回目以降の投げは**要素・難度ともにカウントしない**（難度点の採用候補から外し、
投げ回数・投げ方/受け方の多様性・必須投げ・技術加点にも算入しない）。そのうえで
**超過1回につき −0.30**（`THROW_COUNT_OVER_DEDUCTION`）。`ScoreResult` は実施回数を
`performedThrowCount`、要素として数えた回数を `totalThrowCount`、超過数を `overThrowCount` で返す。

- 難度参照は `skillDifficulty(id, junior)` に集約。`junior` は `computeScore` → `analyzeSeries` →
  `calcTumblingDifficulty` へ引き渡す（既定 `false` なので既存の呼び出しは無変更）。
  `skillDef()` を直接見ている `isSalto` / `category` / `isConnectA` は適用規則で変わらないため据え置き。
- `SaveData.junior`（任意・既定 false）としてファイル/テキスト/共有URLに往復する。
- **団体モードにもジュニアがある**：フラグは `TeamState.junior` に持ち（保存データに往復）、
  `computeTeamScore` が `analyzeTeamSeries` / `calcChunkDifficulty` / 加点へ引き渡す。
  技ごとの難度認定（`skillDifficulty(id, junior)`）と2回宙返り系の非表示は個人と同じ。
  加えて**連続技の認定**（`JUNIOR_SKILL_COMBOS` / `juniorComboAt()`）があり、バク転→後方伸身宙返りは
  まとめて1つのC難度として扱う。塊の中の**どこにあっても**認定するので、実際の実施どおり
  ロンダート→バク転→後方伸身宙返り（助走のA難度が前に付く形）でもCになる。まとめない場合の
  連続難度と**高い方**を採る（5人同時の格上げ後の値とも `max` を取るので、格上げが上回る構成では
  格上げ値が残る）。認定後のCは通常どおり連続加算の対象で、繰り返せば
  ロンダート→バク転→後方伸身→バク転→後方伸身 ＝ C+(C−1) ＝ E。
- **1シリーズの実施減点(E)の上限（1.0点）は団体のジュニアのみ**（`JUNIOR_SERIES_EXECUTION_MAX`）。
  `computeTeamScore` が `clampSeriesExecution()` を通して合算し、UIは `max` 属性と入力時の丸めの
  両方で上限を反映する。**個人は一般・ジュニアとも上限なし**、団体の演技全体の実施減点も上限なし。
- **未対応**：変更規則1-1〜1-2（手具1つのみ）。

### 8.6 テンプレートからのランダム生成（`generate.ts`）

`generateRoutine(templates, opts)` は登録済みのシリーズテンプレートから演技構成を組み立てる。

- 使えるのは**指定した手具のテンプレート＋共通**（`usableTemplates()`）。手具を指定しない場合は
  `generateForApparatus()` が全手具で組んでいちばん良かったものを返す
- 評価関数は `-(Dスコアの範囲外分) * 100 + Dスコア + A残点`。必須要素の不足もジュニアの投げ超過も
  A減点として効くので、この1つの値を最大化すれば「必須要素を満たしつつ難度を上げ、範囲に収める」になる
- **投げタンは1本まで**（`DEFAULT_MAX_THROW_TUMBLING`、`maxThrowTumbling` で変更可）。必須要素は1本で
  満たせるので、超えた分は範囲外と同じ強さのペナルティにして選ばれないようにする
- **同じ宙返りの繰り返しは避ける**：演技全体で同じ宙返りを2回以上実施するごとに
  `SALTO_VARIETY_WEIGHT`（0.02）だけ評価を下げる（`saltoRepeatCount()`）。前宙（`REPEATABLE_SALTOS`）は
  何度実施しても数えない。難度点の最小単位0.1より小さい重みなので、**点数が上がるなら繰り返しも許す**
  （同点のときに多様な宙返りの構成が選ばれる程度の効き方）
- 手順は**ランダムな貪欲法＋刈り込み**を試行回数ぶん繰り返す：
  1. テンプレートをランダムな順に見て、評価が上がるものだけ足す
  2. 抜いても評価が下がらないシリーズを取り除く（＝**評価されない要素を入れない**。
     4本目のタンブリング、ジュニアの6回目以降の投げ、重複するシリーズなどが自然に落ちる）
- 結果は `series`／使ったテンプレート／`dScore`・`aScore`／満たせなかった必須要素のラベルを返す。
  UIは `GenerateModal`（手具・Dスコアの範囲を指定 → 生成 → 内容を確認して採点画面に反映）

---

## 9. UI構成

| コンポーネント | 役割 |
|---------------|------|
| `App.tsx` | モード切替（個人/団体）のシェル |
| `IndividualScorer` | 個人モードの全UI・state管理 |
| `SeriesListEditor` | 個人モードのシリーズ一覧の編集UI（採点画面とテンプレート管理画面で共用） |
| `SeriesCard` | 1シリーズ分の入力・内訳表示 |
| `TeamScorer` | 団体モードの全UI・state管理 |
| `JsonModal` | インポート/エクスポート（個人のみ） |
| `TemplateModal` | テンプレート管理画面（左に一覧、右に `SeriesListEditor` の編集欄） |

### 9.1 テンプレート（個人モード）

よく使うシリーズ／演技構成を保存して呼び出す機能。保存先はブラウザの **localStorage**
（キー `mens-rg-scorer:templates:v1`、`src/scoring/templates.ts`）。

| 種類 | 中身 | 保存する場所 | 呼び出す場所 |
|------|------|-------------|-------------|
| シリーズ | 手具 + `Series` 1つ | 各シリーズの「テンプレートに保存」／管理画面の「新規」 | 実施減点の横のプルダウン（そのシリーズを置き換え）／管理画面の「採点画面に追加」 |
| 演技構成 | 手具 + `Series[]` | ツールバー・操作バーの「構成を保存」／管理画面の「現在の構成を保存」「新規」 | 管理画面の「採点画面に読み込む」（手具ごと差し替え・確認あり） |

どちらの種類も管理画面の「新規」から空のテンプレートを作って、その場で組み立てられる。

- テンプレートが持つのは**構成だけ**。`executionDeduction` は保存時に0にし、読み込んでも
  そのシリーズの実施減点は現在の値を残す（採点のたびに入れるものなので）
- 同じ名前で保存すると上書き（`upsert`）。一覧は更新日時の新しい順
- プルダウンは登録時の手具で「この手具」「他の手具」に分ける（`splitByApparatus`）。
  他の手具のテンプレートも読み込めるが、手具固有の入力はそのまま残る
- 管理画面はテンプレートを**カード**で並べる（名前・手具・シリーズ数・更新日と、
  `describeSeries()` による中身の要約「投げ→前宙→キャッチ」）。カードを選ぶと
  名前・手具・シリーズ内容を**採点画面と同じ `SeriesListEditor`／`SeriesCard`** で編集でき、
  変更はそのまま保存される（実施減点の行は出さない）
- レイアウトは画面幅で切り替える（`useNarrow()` ＝ `matchMedia("(max-width: 900px)")`）。
  広い画面は左カード・右編集欄の2ペイン、狭い画面はカードのみを出し、選んだら
  編集シート（`.tpl-sheet`）を重ねて「← 一覧」で戻る
- 壊れた保存データは `normalizeTemplateStore()` が項目単位で捨てる（読み込みで落ちない）。
  端末をまたぐ場合は管理画面の書き出し／読み込み（JSON）を使う
- **シリーズのタグ**（`SERIES_TAGS` / `seriesTags()` in `analysis.ts`）はシリーズの入力から自動判定する：
  投げ（投げ上げあり）／投げタン（`Unit.isThrowTumbling`）／三宙（`maxSaltoChain >= SALTO_CHAIN_TAG_MIN`＝3）／
  つなぎ（`hasConnect`）。採点画面の各シリーズの見出しと、テンプレートのカードに表示する
- **手具「共通」**（`COMMON_APPARATUS`）：どの手具でも使える内容だけを持つテンプレート。
  手具固有の要素（二つ投げ・左手投げ・手具を使った投げ／キャッチ・2つ同時キャッチ・ロープ跳び）が
  入っていると共通にできない（`commonBlockers()` が理由を返す）。編集時はそれらの入力欄を出さず
  （`SeriesCard` の `common` プロパティ）、採点は `scoringApparatus()`（＝スティック）で行う。
  シリーズのプルダウンでは共通を先頭に出し、構成テンプレートを読み込むときは手具を変えない
- **テンプレートの検索**（管理画面）：フリーワード（名前・手具・`describeSeries` の中身、空白区切りのAND）、
  タグ（選んだタグをすべて含む）、**難度と点数(D)の範囲**で絞り込む。難度・点数は
  `templateMetrics(series[], apparatus, junior)`（最高難度と、そのテンプレート単体で採点したときのD）で求め、
  カードにも「難度 C・D 0.3」として出す。絞り込みは構成テンプレートにも同じ条件で効く
  （構成はどれかのシリーズがタグを持てば一致、難度・点数は構成全体の値）
- 「構成をテンプレートに保存」は管理画面を開かずに実行できる。上部のツールバーと、
  画面下に貼り付く**操作バー**（`.action-bar`：合計点＋構成を保存＋テンプレート）の両方に置く。
  操作バーは `position: sticky; bottom` で、入力の途中でも上に戻らず保存・スコア確認ができる
  （狭い画面では内訳を隠して1行に収める）

手具に無関係な加点行は表示しない：二つ投げ4動作加点は `hasTwoThrow(apparatus)`（＝リング・クラブ）のとき、
様々な跳び加点は `apparatus === "rope"` のときだけ表示する（`ScoreSummary` の集計と `SeriesCard` の内訳の両方）。
値の計算自体は手具に関係なく行われるため、非表示でも 0 のまま `dScore` に含まれる。

トグルスイッチは `.switch` / `.switch-knob` / `.switch-row` / `.switch-label`（`src/index.css`）。
`role="switch"` + `aria-checked` を持つ `button` で実装する。

シリーズ入力（`.skill-row` / `.skill-block`）は広い画面では横並び、**720px以下では縦積み**にする
（`@media (max-width: 720px)`：ブロックを幅いっぱいにし、間の矢印 `.arrow` を下向きに回す）。
横幅の狭い端末で採点画面・テンプレート編集シートが横スクロールしないようにするため。

- スタイリングは **glassmorphism デザインシステム**（`src/index.css`）
- State 更新は `structuredClone` でイミュータブル
- `SaveData` 型（`{ version: 1, apparatus, junior, series, ... }`）でファイル/JSON保存

---

## 10. 未実装・要確認事項

- [ ] §3.8 個人選手モード（団体内個人、A=3.00満点の別採点方式）
- [x] 団体のE実施減点（各シリーズ／演技全体の手入力・合算）
- [x] 手具ごとの要求要素チェック（§3.2、`APPARATUS_REQUIRED_ELEMENTS` の手動チェック＋§3.5.6.3 減点）
- [x] §3.5.5.5(4)① 様々な跳び加点（ロープ）
- [x] §3.5.6.3 違反・欠如のA減点（開始/終了/音楽/徒手系群）
- [ ] §3.5.5.5(4)②③ 様々な跳び加点（跳びの形の多様性 / その場回転跳び2回転）— 跳びに形フラグの入力追加が必要
- [x] 手具別必須要素の自動判定化：スティックの右投げ右受け（`auto: "rightThrow"`）
- [ ] 手具別必須要素の自動判定化（ころがし・プロペラ回旋・まわし・転回系の投げ受けは現状手動チェック）
- [x] §3.5.6.4 芸術と多様性の欠点テーブル（主観評価の手入力・`ART_DEDUCTION_ITEMS`）
- [x] ジュニア適用規則（§10 変更規則1）の難度認定と投げ回数（→ §8.5）
- [ ] ジュニア適用規則 1-1〜1-2（使用手具を1つに限定するUI制約）
- [ ] 団体のA減点ロジックの精緻化（暫定 `missing.length * 0.3`）
