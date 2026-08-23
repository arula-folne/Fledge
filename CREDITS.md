# クレジット（Credits）

最終更新: 2026-08-23

## 制作について

Fledge は [Cursor](https://cursor.com) を使って制作しています。

## 利用している主要ライブラリ・データ

| 名称 | 用途 | ライセンス / 出典 |
|------|------|-------------------|
| [@xmcl/core](https://github.com/Voxelum/x-minecraft-launcher-core) / [@xmcl/installer](https://github.com/Voxelum/x-minecraft-launcher-core) | Minecraft バージョン・ローダーのインストール | MIT |
| [msmc](https://github.com/Hanro50/MSMC) | Microsoft アカウント認証 | MIT |
| [skinview3d](https://github.com/bs-community/skinview3d) | スキンプレビュー | MIT |
| [@tabler/icons-react](https://github.com/tabler/tabler-icons) | UI アイコン | MIT |
| [@xhayper/discord-rpc](https://github.com/xhayper/discord-rpc) | Discord Rich Presence | MIT |
| [Modrinth API](https://docs.modrinth.com/) | コンテンツ検索・インストール | Modrinth 利用規約 |
| Modrinth Crowdin 翻訳 (`packages/i18n/src/modrinth/tag-categories.json`) | カテゴリタグの多言語表示名 | Modrinth / Crowdin 由来データ |

## 他ランチャーとの関係

Fledge のソースコードは MultiMC、Prism Launcher、GDLauncher 等からのコピーではありません。Minecraft 起動は上記 `@xmcl` パッケージ（公開 npm ライブラリ）を利用しています。
