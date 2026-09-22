**Fledge Ver.0.5.3**（第3世代・Tauri シェル / Latest）

アップデート適用・アンインストール・初回起動まわりの安定化リリースです。

> **Ver.0.4.6 からの自動更新はありません**（第2世代の世代ロック）。
>
> **Ver.0.5.0 をご利用の方へ**: 0.5.0 には更新チェック不具合があるため、先に [Ver.0.5.1](https://github.com/arula-folne/Fledge/releases/tag/v0.5.1) 以降を手動インストールしてください。

## 修正

- **更新時の黒い cmd ウィンドウ**: 待機スクリプトを非表示起動に変更（PowerShell/wscript 経由を廃止）
- **アプリ内更新のフラグ**: Tauri NSIS 向けに `/UPDATE` を使用（ユーザーデータを消さない）
- **アンインストール時のデータ削除**: Microsoft ログイン・設定・WebView2 プロファイルなど Fledge 関連を削除（`%APPDATA%\fledge` 等）
- **初回起動の白画面固まり**: WebView2 初期化前の zoom / DevTools 呼び出しを遅延
- **更新ファイルの退避先**: インストール先と衝突しない `%LOCALAPPDATA%\fledge-updater` へ変更

## 配布

- タグ: `v0.5.3`
- インストーラ: **`Fledge_0.5.3_x64-setup.exe`**
- 表示: `Ver.0.5.3`

不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
