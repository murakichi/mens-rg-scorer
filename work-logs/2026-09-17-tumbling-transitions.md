# 作業ログ 2026-09-17: 自動生成のタンブリングを分割し、遷移表を導出する形にした

- 日付: 2026-09-17
- 実施者: 手動（オーナーからの設計相談 →「一気にやって」）
- 対象issue: なし（リファクタ。挙動は変えない前提）

## 調べたこと

- 相談は「ランダム生成に遷移パターンのグラフみたいなデータを先に持たせた方がすっきりするか」。
  規模を測ると `autoTumblings.ts` 1301行 / `generate.ts` 1164行 / `autoThrows.ts` 600行、
  調整用の定数は3ファイルで約78個。連鎖に使う技は `skillOptions`→`SKILL_LIST` の有限集合。
- **手書きの遷移グラフは反対**という結論にした：40×40の表を保守することになるうえ、
  入力画面の制約（`skillOptions` / `needsRoundoffBefore`）と二重管理になる。
- **ルールから導出した遷移表は賛成**：「なぜXが生成されないか」が表を1つ引けば分かり、
  `rollAfterChance(id, prev)` のような後付けのルールが辺の属性に素直に収まり、
  テストがシードではなく表を見られる。

## やったこと

- `src/scoring/pick.ts`（新規）: `shuffled` / `cycler` / `pickWeighted` / `pickDifferent`。
  `autoThrows.ts` / `autoTumblings.ts` / `generate.ts` に同じ実装が3つあったのを1本にした。
- `src/scoring/tumblingPatterns.ts`（新規）: 組む形。`AUTO_TUMBLING_PATTERNS` / `saltoCountRange` /
  `canTwoThrowTumbling` / `secondThrowStyles` / `DEFAULT_CONNECT_AT` /
  `basicLevelPattern`（`basicLevel` のときの形の詰めを関数に切り出した）。
- `src/scoring/tumblingChain.ts`（新規）: 連鎖のルール（できる／できないだけ）。
  `nextSaltoOptions` / `connectOptionsAfter` / `saltoOptionsAfterConnect` / `canEndChain` /
  `endsFacingBackward` / `noRollAfter` / `TUMBLING_ENTRIES` / `tumblingFlowErrors` ほか。
  `SIDE_SALTO_ID` を足して、`"b_sidesalto"` の直書き3か所をまとめた。
- `src/scoring/tumblingWeights.ts`（新規）: 選ばれやすさと抽選の確率（どれくらいの頻度か）。
  `SKILL_PICK_WEIGHT` / `SALTO_DIFFICULTY_WEIGHT` / `saltoWeights` / `rollAfterChance` /
  `backwardEndChance` / `roundoffEntryWeight` / 各 `*_CHANCE` ほか。
- `src/scoring/tumblingShape.ts`（新規）: `TUMBLING_SHAPE_ORDER` と組み方の順位。
- `src/scoring/tumblingTransitions.ts`（新規）: 上の2つから**導出**する遷移表。
  `buildTransitions(ctx)` が `first` / `next(prev)` / `connects(prev)` /
  `afterConnect(connect, before)` を返し、辺（`SaltoEdge`）は `id` / `weight` に加えて
  `endNever`・`endNeedsBackwardDraw`・`endNeedsRareDraw`・`rollChance`・`throwRule` を持つ。
  `usableSkills(ctx)`（使ってよい技の絞り込み）もここに寄せて、候補づくりと共有した。
- `src/scoring/autoTumblings.ts`: 1301行 → 527行。**候補の組み立てだけ**にして、
  連鎖の判断は遷移表を歩く形に置き換えた。上の4ファイルを再エクスポートするので、
  `generate.ts` / `suggest.ts` / 既存テストの import は変えていない。
- spec に散っていた抽選値8つ（`allowBackwardEnd` / `allowRareEnd` / `allowLayoutAfterConnect` /
  `rollDraw` / `allowBackToForwardThrow` / `pressCatch` / `twoThrow` / `secondThrow`）を
  `AutoTumblingSpec.draws`（`TumblingDraws`）にまとめた。終われる本数の判定も
  `chainEndsOk` 1か所にして、`autoTumblingSpecs` と `withSaltoCount` で共有した。
- `src/scoring/__tests__/transitions.test.ts`（新規・13件）: **表を直接読むテスト**。
  後方伸身の後は前宙・きりもみ・きりもみ転回だけ、連続の難度は下がる（テンポは例外）、
  ロンダート入りの重みは目標Dスコアで減衰する、側宙で投げる辺は重みが下がる、
  終われるか／投げてよいか／前転の確率が辺に載っている、など。
- `CLAUDE.md` / `app-scoring-spec.md`: ファイル分割と遷移表の説明を追加。

## 確認

- **挙動が変わっていないことを実測で確認した**（これが今回の主な検証手段）。
  リファクタ前に、4手具 × 6条件 × 6シードで `autoTumblingTemplates` の候補（384件）と
  `generateRoutine` の生成結果（144件）を書き出しておき、リファクタ後に同じものを取り直した。
  → **`spec` の形（`draws` への集約）以外は1件も差分なし**。乱数の消費順を変えていないので、
  同じシードで同じ構成が出る。
  - 消費順で気をつけた点：`allowRareEnd` / `allowLayoutAfterConnect` は `basicLevel` のとき
    短絡して乱数を引かない、`connectAt` の抽選も条件が揃ったときだけ引く、
    終われる本数の探索で `continue` した候補は `secondThrow` 以降を引かない、
    オブジェクトリテラル内の `pressCatch: rand()` は `twoThrow` の後に評価される。
- `npm test`: 528 passed（515 → 遷移表のテスト13件を追加）。
- `npm run build`: 成功。
- 既存テストの修正は `autoTumblings.test.ts` の10件のみで、いずれも spec リテラルに
  `draws` を渡す・`sp.twoThrow` を `sp.draws.twoThrow` にする、という形だけの変更。

## 結果

- PR: 本ログと同じPR。
- issue: なし。

## 気づき・申し送り

- **`generate.ts`（1164行）はまだ分割していない**。評価式（`Evaluation`）と、重みごとの
  ペナルティ関数（`throwCountPenalty` / `hardThrowCount` / `otherStyleCount` …）と、
  探索（`greedyAttempt` / `swapIn` / `tuneAutoSeries` / `upgradeTumblings`）が1ファイルにある。
  同じやり方で「評価」「重み」「探索」に割れるはずで、次に手を入れるならここ。
- `autoThrows.ts` も投げ側の遷移（`catchStylesForPattern` / `throwStylesForPattern`）を
  同じ「表」の形にできるが、投げは連鎖がタンブリングほど深くないので優先度は低いと判断した。
- ロープ跳びが自動生成されない件（ロープはA −1.2 を必ず負う）は今回も手つかず。
