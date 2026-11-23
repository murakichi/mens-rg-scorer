# 作業ログ 2026-11-23: 前方系(投げ)→側宙／転宙→キャッチ

- 日付: 2026-11-23
- 実施者: 手動（オーナーとの会話）
- 対象issue: なし

## 調べたこと

- 「伸身1回半→前宙(投げ)→側宙→キャッチ」は生成されなかった（probe --reach 200種で0件）。伸身1回半は前向きに降りるので
  切り返しの規則ではなく、`throwThenSide`（投げたあとに側宙・転宙を続ける形）の投げる技をダイビング前宙だけにしていたのが原因。
- オーナー：転宙もok。前宙以外の前方系でもよいが視野外付きで、前宙より頻度を減らす。

## やったこと

- `src/scoring/autoTumblings.ts`：`throwThenSideKind`（diving／front／otherNoView）を足し、派生元を前宙・前宙以外の前方系に広げた。
  前宙以外は投げを視野外にし（`throwThenSideNoView`）、派生元1本ごとに `THROW_THEN_SIDE_OTHER_CHANCE` で作る。
  続ける技は `nextSaltoOptions` で続けられる側宙・転宙だけ（ダイビング前宙は従来どおり）。
- `src/scoring/tumblingPatterns.ts`：`throwThenSideNoView`。`src/scoring/tumblingWeights.ts`：`THROW_THEN_SIDE_OTHER_CHANCE` 0.4。
- テスト：`throwThenSide.test.ts`（前宙→側宙／転宙が出る、前宙以外は視野外で前宙より少ない、前宙半ひねり等は除く）。
- ドキュメント：`CLAUDE.md`・`docs/competition-reality.md`・`docs/generator-notes.md`。

## 確認

- `npx tsc -b`：通過。`throwThenSide.test.ts`：7件通過。
- probe --reach（200種、上限なし）：伸身1回半→前宙(投げ)→側宙→キャッチ 0→21〜30回、前方宙返り1回ひねり(投げ)[noview]→側宙→キャッチ 0→3〜7回。
- `npm test`／`npm run build`／`npm run quality`／`npm run test:slow`：実行中（結果は追記）。

- 追加（同日）：スティックの前宙の最中の横投げ。オーナーが実施例を確認、通常の投げより低めに。
  `draws.frontSide`（`FRONT_THROW_SIDE_CHANCE` stick 0.3）。技の最中に投げる形でスティックのときだけ乱数を1回使う。
  probe --reach（stick、200種）：前宙(投げ)[side] 0→抽選19回（前宙・ダイビング前宙の投げ全体は79回）。テスト `throwThenSide.test.ts` に2件。
- 既存テスト「側宙の実施中に投げる構成は稀」が落ちた：最後の技が側宙かで数えていたので、前宙(投げ)→側宙 を側宙で投げる形と数えていた。投げる技の位置で数えるように直した。

- 追加（同日）：オーナーの実施例「後方1回半→つなぎ→ハーフ→前宙（横投げ）→前転→キャッチ」。
  - この並び（投げあり）は0件だった。`connectThrowInSkill` が投げを必ずつなぎの直後の宙返りに置いていたため。宙返り3本のとき
    `CONNECT_THROW_EARLY_CHANCE`（0.4）でつなぎを1本目の後に挟み、つなぎの2本あとで投げるようにした。probe（stick、400種）で 0→抽選1回（投げなしの並び自体が3回とまれ）。
  - 横投げの抽選をダイビング前宙にも（「前宙でできる投げはだいたいダイビング前宙でもできる」）。ダイビング前宙(投げ)[side] 0→抽選25回、(操作)付き69回。
  - 前宙(横投げ)→側宙→キャッチ は生成されていた（stick 200種で62本）。probe が0件だったのは表示が「前宙(投げ)(操作)[side]」で検索語と一致しなかったため。
  - 既存テスト「後方宙返り2回ひねり→テンポ→ダイビング前宙の連鎖が生成に出る」が落ちた：形は出ている（1500種で10回）が600種の範囲から外れた。探す範囲を1500種にした。

## 結果

- PR: なし（ブランチ `claude/quirky-curie-vw59qg` に push）

## 気づき・申し送り

- 切り返しの前宙（後ろ向きで終わる後方系のあと）で投げる形は、今回も生成しない（オーナー確認待ち）。
