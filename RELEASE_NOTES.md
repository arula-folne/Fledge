**Fledge Ver.0.3.0b** を公開しました（第2世代ベータ / Latest）。

## 主な変更

### データ配置（第2世代）
- **二層配置**: 設定・アカウント・ログ → `%APPDATA%\\fledge` ／ Chromium キャッシュ → `%LOCALAPPDATA%\\fledge`
- **インストール先ルート**: `Fledge.exe`（起動）・`Uninstall Fledge.exe`・`data/` のみ
- Electron 本体は `data\\meta\\runtime\\`（exe と dll の同居が必要なため）
- ゲームデータ（instances 等）は設定で変更可。アプリ更新でも消えません

### アプリ内更新
- 更新はダウンロード進捗表示のあと、準備完了時だけ終了してインストール
- **D: など別ドライブのインストール先**でも更新できるよう修正（TEMP への Rename 失敗を解消）
- 更新待ちプロセスが Electron 終了で消えないよう修正
- 更新後は runtime を直接起動し、待ち時間を短縮

### その他
- ルート起動 exe にアイコンを埋め込み
- 更新用ファイルは `%LOCALAPPDATA%\\fledge\\updater` に集約

> ベータ版です。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
