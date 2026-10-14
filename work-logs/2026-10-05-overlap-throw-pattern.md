# 作業ログ 2026-10-05: 2つを別々に投げる形（投げ→徒手→投げ→キャッチ→徒手→キャッチ）

- 日付: 2026-10-05
- 実施者: 手動（オーナー依頼）
- 対象issue: なし

## 調べたこと

- `npm run probe` で、この並びはどの手具でも候補0件（既存の形は投げ受けを1単位として前後に並べるだけ、`splitCatch` は二つ投げという1つの投げ）。
- 採点側は問題なし：キャッチで区切られて2つの徒手ユニットになり、`checkApparatusFlow` も通る（シェネ3→D、1→B。前転3は縦3動作でE）。

## やったこと

- `src/scoring/autoThrows.ts`: 形 `overlapFirstHigh` / `overlapSecondHigh`（`pattern.overlap`）、`OVERLAP_PATTERN_CHANCE`（0.3）、`OVERLAP_LOW_HALF_WEIGHTS`（plain 2 / noViewSet 1 / sideRoll 1）、`OVERLAP_LOW_MOTIONS`（シェネ・前転）。`AutoThrowSpec` に `firstThrowStyle` / `overlapLow` / `lowMotionId`。
  - 前半か後半のどちらかだけ3〜4動作。もう一方は1動作。
  - 後半が低難度のとき：背面投げ＋背面キャッチ（リングは背面＋手具を使ったキャッチも）／横投げ＋転がり＋手具を使ったキャッチ／ふつうの受け。後半の徒手はシェネか前転（横投げの型は転がり）。
  - 2つ目の投げに二つ投げ・手以外の投げは使わない。1つ目は手以外の投げにしない。
- `__tests__/autoThrows.test.ts`: 手具の限定、並びと高難度が片方だけ、低難度の3型とリングの背面＋手具を使ったキャッチ、採点で2ユニットになることを検証。
- `CLAUDE.md`: 生成の項に1段落。

## 確認

- `npm test` / `npm run build`: 776件通過 / ビルド成功

## 結果

- PR: なし（このブランチで続けて出す）
- issue: なし

## 気づき・申し送り

- `OVERLAP_PATTERN_CHANCE` と型の重みは私が置いた値で、`docs/generator-notes.md` の形式での実測はしていない。probe では候補には出るが、構成に採用されるのは少なかった（クラブ40構成で0〜、リング40構成で1）。
- `secondHigh` の1つ目・2つ目の投げの組み合わせは自由に引いており、背面＋背面のような現実的でない組が出ることがある。
