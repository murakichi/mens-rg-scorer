# 作業ログ 2026-11-23: 欠点テーブルの細目を2026年度研修資料に合わせる／B難度だけの連続はD止まり

- 日付: 2026-11-23
- 実施者: 手動（オーナー依頼）
- 対象issue: なし（オーナーが研修資料の画像2枚を提示し「この資料を正解として修正」）

## 調べたこと

- 研修資料（§3.5.6.4 欠点テーブルの細目、赤字が追記）と `ART_DEDUCTION_ITEMS`・自動判定を照合した。大枠10項目と上限は一致していたが、細目で7か所ずれていた：
  つなぎ技なし −0.3（資料 −0.1）、転回系の多様性の枠外で引く宙返りの連続・つなぎ、転回中の手具操作なしと手入力の二重計上、
  手離し 0.1/回（資料 0.05）、転回系の種類の自動計算の上限 0.5（資料の細目は 0.2）、2部位の操作がロープにも出る・実施の有無だけ、
  上肢以外での操作／2種類以上の転回中の手具操作が無い。
- つなぎ技なし −0.3 は 2026-11-12 のオーナー確認（`docs/competition-reality.md`）だったが、今年の研修資料が新しいのでそちらを採った。
- 途中でオーナーから：転回中の操作は二重に引かず**統合**する／**B難度のみの連続は4回以上でもD**（§3.6.3 No.7「宙返り3回以上の連続＝D」と一致）／全く同じ形の投げタンは難度に1回だけか（確認のみ）。

## やったこと

- `constants.ts`：`CONNECT_NO_APP_DEDUCTION` 0.2→0.1（その都度）、`CONNECT_MISSING_DEDUCTION` 0.1、`TUM_OP_KINDS_*`、`TUM_VARIETY_SUBITEM_MAX` 0.2、`APP_IN_TUM_SUBITEM_MAX` 0.4、`OFF_BODY_DEDUCTION_STEP` 0.05、`B_ONLY_CHAIN_MAX`。`HAND_OP_CHECKS` を回数式（`required`/`except`/`item`、`handOpCheckDeduction`・`normalizeHandOpCounts`）にし、上肢以外での操作・転回中の手具操作の種類を追加、2部位はロープ以外に。柔軟にバランスでの足上げ・中立ち・ローリングを追加。欠点テーブルの `tip` を細目の説明に。
- `analysis.ts`：`countConnectWithoutApparatus`、`tumblingVariety` の上限を 0.2、`calcTumblingDifficulty` で B だけの連続を D で頭打ち（投げの+1はそのあと）。
- `score.ts`：つなぎ技なしを `missingElementDeduction` から外して `connectMissingDeduction` に、`artItemTotals` に転回系の多様性（＋宙返りの連続・つなぎ）と転回中の操作（手具操作なしと手入力の**大きいほう**を0.40まで＋2種類未満0.1、0.50まで）を追加。`handOpCounts` を受け取り、旧 `handOps` は減点なしの回数として読む。
- 保存形式：`SaveData.handOpCounts`（`draft.ts`・`types.ts`・`IndividualScorer`・`CompareModal`）。旧データの `handOps` は読み込みで変換。
- UI：手具操作の多様性カードを回数入力に、減点の内訳行（`ScoreSummary`・`scoreRows`）、欠点テーブルの注記。
- 生成：`generateEvaluate.ts` の `tumVariety` を項目の枠の残りまでに抑えた。
- ドキュメント：`mens-rg-rules.md`（細目の表・連続の頭打ち・つなぎの扱い）、`app-scoring-spec.md`、`docs/competition-reality.md`、`docs/generator-notes.md`、`CLAUDE.md`。

## 確認

- `npm test`：全件成功（既存テストの期待値を研修資料の値に更新。`suggest.test.ts` の「A減点10点張り付き」は減点が減って10点に届かなくなったので、方向系を全部欠かせる構成に変えた）。
- 追加：`bOnlyChain.test.ts`（B だけの連続・同じ形の投げタンの重複）、`artCap.test.ts`（転回系の多様性・転回中の操作の枠）、`aside.test.ts`（回数式・ロープ以外・旧データ）。
- `npm run build`：成功。
- `npm run quality`：A平均が一律に下がった（一律に乗る細目のため）、下限4.2の全部Eはクラブ 78→70%。基準値を書き換えた（`docs/generator-notes.md`）。

## 結果

- PR: なし（ブランチ `claude/busy-fermat-rpgpxo` に push）

## 気づき・申し送り

- 団体（`team.ts` の `chainValue`）には B だけの連続の頭打ちを入れていない。
- 深い運動・柔軟は「無ければ −0.1」のまま（資料の「明確に欠ける −0.2」をどこで線引きするかは決めていない）。
- 転回系の種類の自動計算は「同じ宙返りの繰り返し」で数えており、資料の「前方系・側方系・ひねり・姿勢の偏り」とは物差しが違う。
- 生成は手具操作の多様性の回数を入れないので、生成した構成のA平均は細目ぶん低く出る。

## 追加（同日、オーナー回答を受けて）

- 深い運動・柔軟：まったく無ければ −0.2（`DEEP_MOTION_DEDUCTION`・`FLEX_ELEMENT_DEDUCTION`）。「欠ける −0.1」は手入力のまま。
- 生成：B難度だけの4連続（投げなし）にC難度を1つ混ぜる（`mixCIntoBOnlyChain`）。候補で 14→0。投げタンは E のままなので対象外。
- 試して駄目だったこと：投げタン（ダイビング前宙(投げ)→側宙 など）も含めて B×4 を数えるテストにしたら残った。D＋投げの+1でEなので難度は失っておらず、形を変える理由が無いので対象から外した。
- 転回系の種類の物差し（偏りの軸）は案を出してオーナー判断待ち。
- 確認：`npm test`・`npm run test:slow`・`npm run build`、`npm run quality`（A平均 −0.3 の一律低下のため基準値を更新）。
