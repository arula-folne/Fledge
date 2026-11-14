**Fledge Ver.0.7.0**

コンテンツ導入を Modrinth に近い挙動へ寄せ、動作設定と終了時の前面表示などを整えました。あわせてインストールまわりの負荷制御や、使われなくなった Electron 時代の残骸を整理しています。

## 改善

- **コンテンツ導入**: 安定版を優先しつつ、無ければ beta / alpha を自動選択。required 依存の解決を強化し、mrpack でも不足依存を補完
- **動作設定**: Minecraft 起動時の最小化、終了時に Fledge を最前面へ表示（既定オフ）。メモリ既定を 4GB に変更
- **進捗・同時実行**: インストール／転送まわりの負荷を抑え、操作しやすさを改善
- **整理**: 未使用設定文言・旧 Quick setup / Electron 系パッケージ残骸の削除

## 配布

- タグ: `v0.7.0`
- インストーラ: **`Fledge_0.7.0_x64-setup.exe`**
- 表示: `Ver.0.7.0`

不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
