# 作業ログ 2026-11-16: 視野外の投げに股下を追加・横向きの背面投げを減らす

- 日付: 2026-11-16
- 実施者: 手動（オーナー指示）
- 対象issue: なし

## 調べたこと

- オーナー：クラブの横向きの背面投げは背面投げの1割程度。スティックの無回転＋横＋背面投げ（→足で押さえつけ）は実在。
  視野外の投げのパターンに股下を追加し、ラジオではなくプルダウンにする。股下も実戦での投入例はまだないので、生成は1割程度。
- 変更前の生成：視野外の投げのうち横はスティック39%・クラブ29%・リング22%（`NO_VIEW_SIDE_CHANCE` 0.4）。

## やったこと

- `constants.ts`：`BETWEEN_LEGS_TAG`、`NO_VIEW_DIRECTIONS`／`noViewDirectionOf`／`withNoViewDirection`。`techOptionKind` で股下は加点なし（種類としては数える）。
- `score.ts`：技術加点の対象を `techOptionKind` で決める（横・無回転・股下は加点なし）。
- `analysis.ts`：視野外でない投げに残った股下を `apparatusBlockers`/`stripForApparatus` で落とす。
- `SeriesCard.tsx`：視野外の投げ方をプルダウンに（真後ろ／横／股下。横はロープ・共通では出さない）。視野外を外すと股下も外す。
- `autoThrows.ts`：`maybeSideThrow` の視野外の分岐を股下→横→真後ろの1回の抽選に。ロープでも引く。二つ投げは対象外。
  `noViewPair` の足す背面投げにも股下（`noViewPairLegs`）。確率は手具ごとに実測で合わせた（docs/generator-notes.md）。
- テスト：`betweenLegs.test.ts`。ドキュメント：CLAUDE.md・docs/generator-notes.md・docs/competition-reality.md（食い違い1を解消）。

## 確認

- `npm test`（1084件）・`npm run test:slow`（1094件）・`npm run build` 緑。プレビューでロープの投げに「真後ろ／股下」のプルダウンが出ることを確認。
- 生成の実測は docs/generator-notes.md の末尾（股下 8〜14%、横 クラブ10%・リング15%・スティック20%＝すべて実在の形）。

## 気づき・申し送り

- 生成は股下を受けた直後の受け方に特別な制約を付けていない（背面キャッチなど従来どおり）。股下からの投げに向かない受け方があれば教えてもらう。
