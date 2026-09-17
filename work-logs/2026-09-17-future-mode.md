# 作業ログ 2026-09-17: 十年後モード（F・G難度）

- 日付: 2026-09-17
- 実施者: 手動（オーナー依頼）
- 対象issue: なし（依頼：「十年後モードを実装したい。F難度・G難度相当の難度計算に対応、価値点はFで0.9・Gで1.1。
  ジュニアモードと同様のトグルで、既定は非表示。ジュニアモードを10回切り替えると表示。
  モードONならランダム生成のタンブリングもそれ前提で。上限をFまで／Gまでプルダウンで選択」）

## 調べたこと

- 難度は `Difficulty = "A"|…|"E"` の共用体で、上限は `MAX_DIFF = 5` を使った
  `Math.min(v, MAX_DIFF)` が `analysis.ts`（タンブリング・徒手・ロープ跳び）と `team.ts`
  （連続加算・5人格上げ・交差）に散っていた。**E止めはすべて上限**なので、上限だけを
  可変にすればF・Gは自然に出る、と判断した。
- ジュニアは `junior` を `computeScore` → `analyzeSeries` → `calcTumblingDifficulty` と
  末尾の任意引数で引き回している。同じ形（末尾に `future`、既定 `null`）で足せば、
  既存の呼び出しもテストも無変更で済む。
- ひねりの難度表（`twistDifficulty`）は半ひねり1段・1難度2段の刻みで、3.5回ひねりで
  頭打ちにしていた。刻みをそのまま伸ばすと 4回・4回半＝F／5回＝G になり、規則の考え方から
  外れない（前方伸身の+1もそのまま効く）。
- 生成器は `usedSkillIds(テンプレート)` を語彙にしている（`autoTumblings.ts`）。F・G難度は
  まだ誰も実施していない技なので、この制限のままだとモードONでも新しい技が一切出てこない。

## やったこと

- `src/scoring/types.ts`: `Difficulty` に `F`・`G`、`FutureLevel`（`"F"|"G"|null`）、`Skill.future` を追加。
- `src/scoring/constants.ts`: `DIFF_SCORE` に F 0.9 / G 1.1、`DIFF_VALUE`/`VALUE_DIFF` を7まで拡張。
  `maxDiff(future)` / `clampDifficulty(value, future)` / `FUTURE_LEVELS` / `DEFAULT_FUTURE_LEVEL`（F）/
  `normalizeFutureLevel()` / `futureSkillIds()` を追加。`twistDifficulty` を
  丸め前の `twistDiffValue()` と上限での丸めに分け（丸めた値で選択肢を絞ると上限超えが
  上限ちょうどに見えてしまう）、`twistOptions(future, {base, posture})` を追加。
  `SKILL_LIST` に `future: true` の技を8つ（後方伸身4回・4回半・5回ひねり、伸身前宙3回・4回ひねり、
  ルドルフハーフ、後方伸身2回宙返り1回ひねり、リジョンソン）。`skillAllowed` / `skillOptions` /
  `skillOptionGroups` / `skillDifficulty` に `future` を追加。
  **オーナーの指定で技の一覧を差し替えた**（初稿はこちらの推測で「トリプルフル(F)・後方3回宙返り(G)」を
  置いていた）：既存のルドルフを十年後はF認定（`FUTURE_SKILL_DIFFICULTY`。ジュニアの上書きと同じ仕組み）、
  ルドルフハーフ・後方伸身2回宙返り1回ひねりをF、リジョンソン（後方2回宙返り3回ひねり）をG、
  後方3回宙返りは削除。**十年後モードで増える2回宙返り系は団体のみ**（`Skill.teamOnly`）なので、
  `skillAllowed` / `skillOptions` / `futureSkillIds` に `team` を足し、団体の画面だけ `true` を渡す。
  選択肢に出ない理由の但し書きは `skillBlockedReason()` に集約した。
- `src/scoring/analysis.ts` / `score.ts` / `team.ts`: `future` を引き回し、E止めを `clampDifficulty` /
  `maxDiff` に置き換え。手具操作加点の条件を `maxD === E` → `>= E` に（現行規則では同値）。
- `src/scoring/autoTumblings.ts` / `generate.ts` / `suggest.ts`: 候補作成・重み・連続の難度上限に `future`。
  `SALTO_DIFFICULTY_WEIGHT` に F 0.15 / G 0.08。F・G難度の技だけは「テンプレートに出てくる技」の
  例外として語彙に足す（2回宙返り系は除く）。
- `src/scoring/draft.ts`: `IndividualDraft.future`、解放状態（`FUTURE_UNLOCK_KEY` /
  `FUTURE_UNLOCK_TOGGLES = 10` / `loadFutureUnlock` / `saveFutureUnlock`）。
- `src/components/useFutureUnlock.ts`（新規）: ジュニアの切り替え回数を数えて解放する hook。個人・団体で共有。
- `src/components/IndividualScorer.tsx` / `TeamScorer.tsx`: 「適用規則」カードに十年後モードの
  トグル＋上限プルダウン（解放後のみ表示）。`SeriesListEditor` / `SeriesCard` / `TemplateModal` /
  `GenerateModal` / `SuggestModal` に `future` を伝播。
- `src/index.css`: `.switch-row` を折り返し可に、`.switch-label` を nowrap、`.switch-select` を追加
  （狭い画面でラベルが「十年後モ／ード」と割れるのを直した）。
- `src/scoring/__tests__/future.test.ts`（新規、23件）。`junior.test.ts` / `twist.test.ts` は
  前提が変わった2件を更新（`skillOptions()` の件数は十年後専用を除いた数、`skillDef` は丸めない定義を返す）。
- `app-scoring-spec.md` に §8.4、`CLAUDE.md` にアーキテクチャの1項目を追記。

## 確認

- `npm test`: 537件すべてパス（新規23件を含む）。
- `npm run build`: 成功（tsc -b + vite build）。
- ブラウザ（Playwright + Chromium）で実機確認：
  - ジュニアモード9回切り替えでは十年後モードが出ず、10回目で出る。リロード後も出たまま。
  - 上限Gで「後方宙返り5回ひねり（G）」が組め、D 1.1。上限Fに落とすと同じ技がF・D 0.9。
  - ひねりのプルダウンは上限Gで5回ひねりまで、上限Fで4回半まで。
  - 一覧入力にも十年後モード専用の技が上限ぶんだけ出る。個人の一覧には2回宙返り系の
    ルドルフハーフ・リジョンソン等が出ず、団体の一覧には出る（ルドルフは個人でもF表示）。
  - 幅390pxでも「適用規則」カードが崩れない。
- 生成の実測（スティック・各5本、テンプレート2本）：Dスコアの平均が
  OFF 4.9 → 上限F 5.5 → 上限G 6.0。上限Gの例
  「ロンダート→後方伸身宙返り5回ひねり→前宙→前転」など、連続が難度を下げていく形は保たれている。

## 結果

- PR: なし（ブランチ `claude/clever-cori-rrkcgx` に push）
- issue: なし

## 気づき・申し送り

- F・G難度の技の中身はオーナー指定（ルドルフ＝F／ルドルフハーフ＝F／後方伸身2回宙返り1回ひねり＝F／
  リジョンソン＝G、2回宙返り系は団体のみ）。ひねり系は §3.6.2 の刻みを伸ばした値と一致するので、
  一覧からでも手動入力からでも同じ難度・同じidになる。増やす・変えるときは `SKILL_LIST` の
  `future: true` の行と `FUTURE_SKILL_DIFFICULTY` だけで済む。
- 徒手系難度も上限まで伸ばした（5動作＝F／6動作＝G）。自動生成の投げシリーズはシェネ4回までなので
  生成では出てこない。手入力でだけ届く。
- `.mode-btn` が App のモード切替（個人/団体）と `SeriesCard` のひねり入力切替で重複している
  （`src/index.css` にも同名の定義が2つ）。今回の作業では触らず #91 に起票した。
