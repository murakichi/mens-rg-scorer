# テストレポート 002: D加点クラスタ（§3.5.5.5）

- 日付: 2026-07-20
- 実施者: scoring-test skill（loop 1周目）
- 対象: `src/scoring/score.ts`（E_BONUS / SERIES_BONUS / TECHNIQUE_BONUS / APPARATUS_OP_BONUS / TWOTHROW_MOTION_BONUS）

シード（001）でカバーしていない **D加点** をルール §3.5.5.5 と突き合わせて検証。

## 検証観点

| 観点 | ルール参照 | 結果 |
|------|-----------|------|
| E難度ボーナス E_BONUS（E投げタンに+0.1、投げなしE難度には乗らない） | §3.5.5.5(3) | ✅準拠 |
| シリーズ加点 SERIES_BONUS（投げ2回以上 & D以上ユニット） | §3.5.5.5(1) | ✅準拠 |
| 技術加点 TECHNIQUE_BONUS（視野外/手以外/手具使用 各+0.1） | §3.5.5.5(2)①〜⑥ | ✅準拠 |
| 技術加点が「その他(other)」も加点している | §3.5.5.5(2) / spec §4 | ❌バグ #2 |
| 手具操作加点 APPARATUS_OP_BONUS（操作2つ以上 & 最高難度E） | §3.5.5.5(3) | ✅準拠 |
| 二つ投げ4動作加点 TWOTHROW_MOTION_BONUS（4動作で+0.1、3動作で0） | §3.5.5.5(2)⑦ | ✅準拠 |
| E難度転回系加点の 0.10 上限（E_BONUS+APPARATUS_OP が0.20になりうる） | §3.5.5.5(3) | ⚠️要確認 #3 |

## 追加したテスト

- `src/scoring/__tests__/score.bonus.test.ts`: +11件（うち2件は発見を記録する `it.skip`）
- スイート全体：33 passed / 2 skipped。`npm run build` も緑。

## 発見

- **#2（バグ）** [技術加点が「その他の投げ/受け」も加点対象にしている](https://github.com/murakichi/mens-rg-scorer/issues/2)
  実測 `techniqueBonus = 0.1`（期待0）。`throwTypes`/`catchTypes` の個数をそのまま数えており、
  規則・spec が対象外とする `other` を含めてしまう。
- **#3（要確認）** [E難度転回系加点が0.10上限を超えうる](https://github.com/murakichi/mens-rg-scorer/issues/3)
  E投げタン＋手具操作2つで `tumblingScore` の E_BONUS 0.1 と `apparatusOpBonus` 0.1 が
  独立に加算され合計0.2。§3.5.5.5(3) は単一の最大0.10点。spec §4 は別加点として記載しており設計意図の確認が必要。

いずれも採点ロジックは変更していない（テストとバグ報告のみ）。

## 申し送り（次に検証すべき観点）

- **A減点**：連続宙返り減点の各段（3+で0/2で0.1/未満0.2）、無手具操作減点と上限0.4、
  つなぎ技手具操作なし減点、多様性不足（other の別カウント含む）
- **重複シリーズ**：dupFlags による除外と、other が重複でもカウントされる例外
- **必須要素**：throwTum/triple/connect/tumCount と手具別必須投げ（clubs/ring=二つ投げ）
- **団体モード（team.ts）**：未着手。暫定A減点 `missing.length*0.3` は #3 同様「ルール未規定」issue候補
- **share.ts**：round-trip
