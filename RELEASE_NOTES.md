**Fledge Ver.0.3.0up** を公開しました（アップデートチェック／プレリリース）。

## 目的

**Ver.0.3.0ut** からアプリ内更新し、データ残存を確認する版です。

## 確認手順

1. **最新の Ver.0.3.0ut** を入れ直す  
   https://github.com/arula-folne/Fledge/releases/tag/v0.3.0ut  
   （既に `D:\Games\Minecraft\Clients\Fledge` がある場合も、上書きインストールで可）
2. ヘッダーの更新から **0.3.0up** へ
3. instances / 設定が残っているか確認

## 修正（「古いアプリケーション…: 2」）

インストール先が **D:**、一時領域が **C:** のとき、更新処理が `data` を別ドライブへ `Rename` しようとして失敗していました（エラー 2 = Abort）。

- 更新時は **runtime / ルート exe だけ差し替え**、`data\instances` 等はその場に残す
- `uninstallerIcon.ico` をルートに残す
- NSIS 失敗時はアプリを起動しない

ログ: `%LOCALAPPDATA%\\fledge\\updater\\update-log.txt`

> stable Latest は Ver.0.2.6b のままです。
