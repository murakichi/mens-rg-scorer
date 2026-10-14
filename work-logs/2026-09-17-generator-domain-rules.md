# 作業ログ 2026-09-17: ランダム生成のドメインルール追加（締め方・E難度・連続投げ・前転）

- 日付: 2026-09-17
- 実施者: 手動（オーナーからの口頭ルールを順に反映）
- 対象issue: なし（オーナーの指摘をその場で実装）

## 調べたこと

- 指摘のたびに `src/scoring/__tests__/zz-probe.test.ts`（使い捨て）で現状を測り、
  重みで足りるのか「形（パターン）」が足りないのかを切り分けた。
- 連続投げの難度の置き場所は重みでは動かなかった（`THROW_ORDER_WEIGHT` 0.005→0.1 で 66%→71% どまり）。
  形が `leadPair`（安い投げ受けを先に置く）しか無かったのが原因で、裏返しの形が必要だった。
- タンブリングのE難度化も重みだけでは動かず（67%→67%）、貪欲法が枠を埋めた後に
  高難度候補を見られないことが原因だった。

## やったこと

- `src/scoring/generate.ts`:
  - `FINISH_CATCH_TAG` / `finishCatchLast` / `FINISH_CATCH_WEIGHT`（クラブ＝押さえてキャッチ、
    ロープ＝足に絡めたキャッチで演技を締める）
  - `TUMBLING_PREFERENCE_WEIGHT` と `upgradeTumblings`（上級者のタンブリングはほぼE難度）
  - `hardThrowCount` / `suppressHardThrow` / `HARD_THROW_WEIGHT`（手以外・手具を使った投げの後は
    徒手0〜1動作。要求値5.0超までは稀に）
  - `autoRatio` / `autoSeriesMax`（自動生成の割合をユーザー指定）、`DEFAULT_MAX_AUTO_THROWS` 3→5
- `src/scoring/autoThrows.ts`: `trailPair`（連続投げの1回目で難度を採る形）、
  `NO_THROW_AFTER_CATCH_TAGS` / `canThrowAfterCatch`（押さえた・足で受けた状態からは投げない）、
  シェネの手の重み（手なし最優先）
- `src/scoring/autoTumblings.ts`: 投げタンの二つ投げ（`twoThrow`）、
  `layoutOnlyAfterConnect`（つなぎ後の伸身1本終わりは稀）、
  `rollAfterChance`（前方系の後の前転。前向きで終わる後方宙返りは半々、切り返しの後は少ない）、
  ハンドスプリングの出現率を下げる（`SKILL_PICK_WEIGHT` ＋ 入りの抽選から除外）
- `src/components/SeriesCard.tsx` / `src/scoring/analysis.ts`: 2つ同時キャッチは2つとも空中のときだけ、
  二つ投げと手具を使った投げは排他（`catchTwoFlags`）
- `vitest.config.ts`: `testTimeout` を60秒に（生成テストが既定5秒に近く、候補の形が増えるたびに
  個別 timeout を足すのが追いつかないため）

## 確認

- `npm test`: 511件パス（各ルールの判定・確率表・生成結果の実測値をテストに落とした）
- `npm run build`: 成功
- 実測値は各PR本文と `app-scoring-spec.md` に記録（例：タンブリングのE率 67%→100%、
  連続投げの1回目が高難度 66%→83%、押さえ受け→投げ 160件→0件）

## 結果

- PR: #80 #81 #82 #83 #84 #85 #86 #87（すべてマージ済み）＋本PR
- issue: なし

## 気づき・申し送り

- ロープ跳びは自動生成されないままで、ロープはA減点 −1.2 を必ず負う（既知の未対応）。
- 投げタンの二つ投げは候補の2割あるが、必須投げは安い投げ受け1本でも満たせるので
  生成結果には0〜6本しか出ない。もっと出したいなら評価の上乗せが必要。
- 乱数の並びが変わるとシード固定のテストが落ちやすい。今回も2件を
  「固定値ではなくルールで判定する」形に書き換えた。
