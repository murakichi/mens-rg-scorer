# 作業ログ 2026-11-23: スティックの手以外の投げ「肩に引っ掛けて投げ」

- 日付: 2026-11-23
- 実施者: 手動（オーナーとの会話）
- 対象issue: なし

## 調べたこと

- 手以外の投げは `nonhand` タグだけで、投げ方を選ぶ入力は無かった（受けには `nonHandKind` のプルダウンがある）。同じ作りで投げにも足した。
- 生成で手以外の投げを外す判定が投げ方id（`t.id !== NON_HAND_TAG`）だったので、id の違う新しい投げ方が連続投げの2回目・overlap の1つ目などにすり抜ける。タグで見る `isNonHandThrowStyle` に揃えた（`tumblingPatterns.ts` の `secondThrowStyles` も）。
- オーナー：生成は低難度の投げ、横投げにはならない、通常キャッチ＞背面キャッチ。背面投げより確率は低め。低難度を優先するが、背面投げなどをすでに使っていてDの要求に要るなら高難度でもよい。

## やったこと

- `types.ts`：`ThrowItem.nonHandThrowKind`。`constants.ts`：`NON_HAND_THROW_KINDS`（stick: shoulderHook）・`nonHandThrowKindOf`。
- `analysis.ts`：`apparatusBlockers`/`stripForApparatus` で他の手具の投げ方を落とす。`templates.ts`：`commonBlockers`。
- `score.ts`：`throwTechKey` と投げ方の種類に投げ方を含める（受け方と同じ扱い）。技術加点は0.1のまま。
- `SeriesCard.tsx`：`NonHandThrowKindSelect`（手以外の投げのすぐ下。投げアイテムだけ。外すと投げ方も消す）。
- `autoThrows.ts`：投げ方 `SHOULDER_HOOK_STYLE_ID`。候補に入れる確率 低難度の形 0.5／ほかの形 0.15、受けは通常1：背面0.5（前転のあとの背面はしない）、先に置く投げには使わない。
- テスト：`shoulderHook.test.ts`（6件）。

## 確認

- 生成（stick、20構成×上限 2.0／3.0／4.5／なし）：肩に引っ掛けて投げ 2／0／1／1 本、背面投げ 14／14／18／24 本。高難度の形で採用されたのは0本（候補には入る）。
- `npm test`・`npm run build`・`npm run quality`・`npm run test:slow`：下に追記。

## 結果

- PR: なし（ブランチ `claude/quirky-curie-vw59qg` に push）

## 気づき・申し送り

- 技の最中の投げ（`SkillItem`）には投げ方の入力を付けていない（技の最中の投げの選択肢に手以外の投げが無いため）。
- 共有URL・ファイル保存はアイテムをそのまま保存するので、追加の対応は要らない。
