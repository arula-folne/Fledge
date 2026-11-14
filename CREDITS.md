# クレジット（Credits）

最終更新: 2026-11-10

## 制作について

Fledge は [Cursor](https://cursor.com) を使って制作しています。

## 利用している主要ライブラリ・データ

| 名称 | 用途 | ライセンス / 出典 |
|------|------|-------------------|
| [Tauri](https://tauri.app/) | デスクトップシェル | MIT / Apache-2.0 |
| [skinview3d](https://github.com/bs-community/skinview3d) | スキンプレビュー | MIT |
| [@tabler/icons-react](https://github.com/tabler/tabler-icons) | UI アイコン | MIT |
| [Modrinth API](https://docs.modrinth.com/) | コンテンツ検索・インストール | Modrinth 利用規約 |
| Modrinth Crowdin 翻訳 (`packages/i18n/src/modrinth/tag-categories.json`) | カテゴリタグの多言語表示名 | Modrinth / Crowdin 由来データ |

## 他ランチャーとの関係

Fledge のソースコードは MultiMC、Prism Launcher、GDLauncher 等からのコピーではありません。Minecraft の導入・起動は `crates/fledge-core`（Rust）で実装しています。
