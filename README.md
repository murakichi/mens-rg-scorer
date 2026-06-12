# 男子新体操 採点計算（mens-rg-scorer）

男子新体操の演技構成を入力し、D（難度）・A（芸術と多様性）・E（実施）の3カテゴリで採点を計算する Web アプリです。**個人モード**と**団体モード（5人）**を切り替えられます（団体の A/E 採点は暫定実装）。淡色ガラス調（グラスモーフィズム）の UI。

公開ページ: https://murakichi.github.io/mens-rg-scorer/

## 使い方

1. 手具（スティック／クラブ／リング／ロープ）を選択。
2. シリーズ単位で「投げ → … → キャッチ」やタンブリング技・徒手動作を並べて入力。
   - 「投げ」〜「キャッチ」が1つの投げ、投げを挟まない連続タンブリング技が1本のタンブリングとして自動分類されます。
3. 必須要素チェックと点数集計（D + A残点 + E残点）が自動計算されます。
4. エクスポート／インポート、またはテキスト出力／読込（JSON）で構成を保存・復元できます。

採点ルールの詳細は [`mens-rg-rules.md`](./mens-rg-rules.md) を参照。

## 開発

```bash
npm install
npm run dev        # 開発サーバ
npm run build      # 型チェック + 本番ビルド（dist/）
npm run preview    # 本番ビルドのローカル確認
```

技術スタック: Vite + React 18 + TypeScript。採点ロジックは `src/scoring/`（純粋関数）、UI は `src/App.tsx` と `src/components/` に分離しています。

## デプロイ

`main` への push で GitHub Actions（`.github/workflows/deploy.yml`）が `dist/` をビルドし GitHub Pages へ公開します。リポジトリ設定で Pages のソースを **GitHub Actions** にしてください。
