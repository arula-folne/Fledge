# Fledge 0.5 — Tauri 開発メモ（ローカル）

Ver.0.5.0 からシェルは **Tauri 2 + Rust** です。UI（React）は 0.4.x と同じ見た目を維持し、IPC だけ差し替えています。  
**Electron は非推奨**です（`dev` / `build` / 配布の正経路は Tauri）。`electron/` ソースは参照用に残していますが、`dev:electron` 等は無効化しています。

## 前提

- Rust stable（`rustc` / `cargo`）
- Node 20+ / pnpm
- Windows 11 + WebView2（通常は OS に同梱）

## よく使うコマンド

リポジトリルート:

```powershell
pnpm install
pnpm version:sync
pnpm --filter @fledge/desktop dev          # Tauri + Vite 開発
pnpm --filter @fledge/desktop tauri:build  # NSIS インストーラ
```

成果物（ワークスペース `target/`）:

- 実行ファイル: `target/release/fledge-desktop.exe`
- インストーラ: `target/release/bundle/nsis/Fledge_0.5.0_x64-setup.exe`

## データパス（開発）

- settingsRoot: `apps/desktop/.fledge-root/`
- configRoot: `apps/desktop/.fledge-root/data/`

環境変数 `FLEDGE_ROOT` / `FLEDGE_SETTINGS_ROOT` で上書き可。

## 更新（updater）

0.4 と同様、**GitHub Releases**（`arula-folne/Fledge`）から NSIS インストーラを取得して適用します（署名付き `tauri-plugin-updater` は未使用）。

- `updater:check` … `stable` / `prerelease`。世代ロック（0.4.x → 0.5+ 不可）は shared / Rust 双方で維持
- `updater:apply` … ダウンロード → `%LOCALAPPDATA%\fledge\updater` へ退避 → 終了後に `/S --updated /D=<installDir>` で適用（Data / Instances は消さない）
- 任意: 設定 `updateFeedUrl` または環境変数 `FLEDGE_UPDATE_FEED_URL` でフィード URL を上書き可
- 開発ビルドでは `updater:apply` は `updater.noop`

## アンインストール

- 製品版: インストール先の `uninstall.exe`（または `Uninstall Fledge.exe`）があれば終了後にサイレント実行
- 見つからない場合: Windows の「アプリと機能」を開く
- 開発ビルドでは `settings.uninstallDevOnly`

## 実装範囲（0.5.0）

動くもの:

- 窓・タイトルバー・設定の読み書き
- パス解決 / アプリデータフォルダ変更（再起動後に反映）
- **インスタンス CRUD**（作成・更新・複製・削除・フォルダを開く・アイコン）
- 完全リセット（factory reset）
- **Microsoft 認証**（MSA OAuth WebView、TokenVault/DPAPI、アカウント切替、`event:auth-status`）
- SessionJoinProxy（1.20.2+ の session host 差し替え）
- **Java 管理**（Adoptium Temurin、`java:*`）
- **バージョン一覧**（Mojang / Fabric / Quilt / Forge / NeoForge、`versions:*`）
- **起動**（vanilla / Fabric / Quilt / Forge / NeoForge の導入・起動、`launch:*`、初期設定 options ガード、進捗イベント）
- **Modrinth コンテンツ**（検索・詳細・導入・依存解決・mrpack 入出力、`content:*`、`event:progress`）
- **スキン**（ローカル一覧・アップロード・選択・MSA プロフィール適用、`skins:*`）
- **設定のインポート／エクスポート**（`option.flg`、`settings:export-options` / `settings:import-options`）
- **お知らせ**（GitHub JSON + `layout.news` キャッシュ、`news:list`、`event:news-updated`）
- **アプリ更新**（`updater:check` / `updater:apply`）と **アンインストール**（`app:uninstall`）

既知の制限:

- デフォルトスキン PNG は `resources/skins` を NSIS に同梱し、UI 側にも Vite アセットとして埋め込む（プレビューは製品版でも表示可能）
- ローカル ship 時点では GitHub Release に 0.5 NSIS が無いと「更新あり」にはならない（手元ビルドの検証は `FLEDGE_UPDATE_FEED_URL` や `FLEDGE_DEV_APP_VERSION` で可）
- 0.4 からの移行時は認証の再ログインが必要（DPAPI と旧 safeStorage は非互換）
- バージョン方針: `0.x.x` = ベータ、`1.0.0+` = 正式版。接尾辞なし

## 軽量化の目安（ローカル比較）

| 配布物 | おおよそ |
|--------|----------|
| Electron `Fledge-Setup.exe` (0.4.x) | ~97 MB |
| Tauri `Fledge_0.5.0_x64-setup.exe` | ~10 MB |
