# Fledge 技術仕様

最終更新: 2026-08-24

GitHub リポジトリ向けの実装仕様です。アプリ紹介・機能のアピールは [README](../README.md) を先に読んでください。  
開発手順は [development.md](./development.md) です。

関連: [PRIVACY.md](../PRIVACY.md) / [TERMS.md](../TERMS.md) / [data-handling.md](./data-handling.md)

---

## 1. 位置づけ

Fledge は Minecraft Java Edition 用の非公式デスクトップランチャーです。  
バージョン **Ver.0.1.7a**。製品 ID は `net.folne.fledge`。  
**対応環境は Windows 11 のみ**です。

方針:

- **現時点では** 広告・利用解析・クラッシュ報告 SDK は入れない
- **現時点では** 認証トークンは端末内に留め、Fledge 独自のアカウントサーバーは持たない
- 既定の UI 言語は日本語（`locale` のデフォルトは `ja`）
- Discord Rich Presence は任意（設定の既定はオフ）

将来的には、運用中の **web** と連携した着せ替え機能のために、Fledge 独自アカウントや利用率解析を導入する可能性があります。解析の想定範囲は、利用率、継続利用状況、障害調査に必要な最小限の利用状況です。その場合でも、個人情報・認証情報・秘密情報をソースコードや公開リポジトリへ含めないことを前提にします。実装時は `PRIVACY.md` と README を更新してください。

## 2. リポジトリ構成

pnpm ワークスペース（`apps/*` と `packages/*`）。

| パス | パッケージ | 役割 |
|------|------------|------|
| `apps/desktop/` | `@fledge/desktop` | Electron メイン／プリロード、React UI、パッケージング |
| `packages/core/` | `@fledge/core` | UI 非依存のランチャー中核 |
| `packages/shared/` | `@fledge/shared` | Zod モデル、IPC チャネル名、ブランド定数 |
| `packages/i18n/` | `@fledge/i18n` | 文言リソース（現状 `ja`） |
| `scripts/patch-xmcl.js` | — | `@xmcl/*` の npm `main` を dist に向ける postinstall |
| `docs/` | — | 本仕様および開発ガイド |

`@fledge/core` は Electron を import しません。Microsoft 認証・トークン保管・ウィンドウはデスクトップ側のアダプタです。

## 3. 技術スタック

| 層 | 技術 |
|----|------|
| デスクトップ | Electron 35、electron-vite、electron-builder（Windows NSIS） |
| UI | React 19、React Router 7、Tailwind CSS 4、Zustand、TanStack Query、i18next |
| アイコン | `@tabler/icons-react` |
| スキンプレビュー | `skinview3d` |
| 契約・検証 | TypeScript 5.8、Zod |
| Minecraft | `@xmcl/core` 2.16.0、`@xmcl/installer` 6.3.1 |
| 認証 | `msmc`（メインプロセスの `MicrosoftAuthProvider` 経由のみ） |
| Discord | `@xhayper/discord-rpc`（設定オン時のみ） |

## 4. プロセス構成

```
Renderer (React)
    │  window.fledge / IPC
Preload
    │  ipcMain.handle / ipcMain.on
Main (Electron)
    │  AuthProvider / TokenVault / DiscordPresence
    ▼
@fledge/core  LauncherApp
    SettingsStore / InstanceStore / JavaManager / MinecraftService
    VersionService / ContentService / LaunchOrchestrator
    SkinStore / SkinApplier / BackupService / SessionJoinProxy
```

- **メイン**: ファイルシステム、子プロセス（ゲーム）、ダウンロード、認証、Discord
- **プリロード**: `IPC` / `IPC_EVENTS` で公開する API のみ。レンダラーから Node は直接触らない
- **レンダラー**: 画面と状態。起動・インストールは IPC

チャネル名とペイロードは `packages/shared/src/constants.ts` および `models.ts` が契約です。

## 5. ランタイムデータ

本番のルートは `Fledge.exe` と同じフォルダ。開発時は `apps/desktop/.fledge-root/`。

```
<root>/
  Data/
    Accounts/          アカウント一覧 + secrets/（暗号化トークン）
    Cache/
    java-version/      java8 / java17 / java21 / java25（各配下に bin/ と jdk-*.md）
    Logs/
    Minecraft/         共有 libraries / assets / versions / natives
    News/
    Settings/          settings.json
    Skins/             アップロードスキン + uploaded.json
    Temp/
  Instances/           インスタンスごと（mods / saves / config / options.txt / screenshots 等）
```

`packages/core/src/app/paths.ts` の `resolvePathLayout` がこの配置を組み立てます。  
Minecraft 本体・ライブラリ・アセットは `Data/Minecraft` で共有します。  
ワールド、Mod、ゲーム内設定（`options.txt`）、Mod 設定（`config/`）などは `Instances/<id>/` です。  
Fledge のテーマ・アカウント・スキンは `Data/` 側でランチャー全体共通です。

インスタンス配下で開いてよいサブフォルダ（`INSTANCE_SUBFOLDERS`）:

`mods` / `resourcepacks` / `shaderpacks` / `saves` / `logs` / `screenshots` / `plugins`

コンテンツの導入記録は各インスタンスの `.fledge/content-index.json` です。

## 6. 認証

- フローは Microsoft / Xbox / Minecraft の公式認証（`msmc`）
- 表示情報: `Data/Accounts/index.json`（MCID、UUID、任意で XUID・アバター URL）
- トークン: `Data/Accounts/secrets/<accountId>.dat` を Electron `safeStorage` で暗号化
- 複数アカウント。アクティブ ID と一覧を index で管理。旧 `active.json` + `secrets.dat` は初回読み込みで移行
- パスワードは保存しない。サインイン UI は Microsoft 側

ゲーム側の session join は、1.20.2 以降で `-Dminecraft.api.session.host` が効くとき `SessionJoinProxy`（`127.0.0.1` のローカル HTTP）が Mojang へ転送します。  
ランチャーでトークンを更新したあと、ゲームを落とさず再接続できるための仕組みです。

## 7. 起動フロー

`LaunchOrchestrator` がセッション単位で進めます。複数インスタンスを同時に起動できます。

おおよその位相:

1. `auth` — 資格情報の確認。選択中スキン適用は起動と並行（ログイン時）
2. `java` / `install` — Java 確認とクライアント準備を並行。導入済みならネット確認を省略
3. ネイティブは `Data/Minecraft/natives/<versionId>/` に残し、次回は再展開しない
4. 新規インスタンスなら `pendingMinecraftOptions` を `options.txt` にマージ（初回のみ）
5. `spawn` — ゲームプロセス起動
6. `running`

起動直前のライブラリ SHA1 全件検査は行わず、準備済みマーカーとバージョン JSON の存在で再利用します。  
`prepare` はゲームを出さず Java・クライアント等だけ整えます（インスタンス作成直後のライブラリ画面用）。  
Fledge 起動後は、最後に遊んだインスタンスを裏で warmup します。

Java メジャー推定の目安（`requiredJavaMajor`）:

| Minecraft | Java |
|-----------|------|
| 1.16 以前 | 8 |
| 1.17〜1.20.4 | 17 |
| 1.20.5 以降（および新しい本流） | 21 |

管理対象ランタイムは 8 / 17 / 21 / 25。配布元は Eclipse Adoptium（Temurin）。

ローダー実装: Vanilla、Fabric、Forge、NeoForge、Quilt（`VersionService` + `@xmcl/installer`）。

## 8. Minecraft 初期設定

設定の `minecraftInitialSettings` は **新規インスタンスの初回起動専用** です。  
`null`（UI の「Minecraftデフォルト」）の項目はゲーム側デフォルトのまま（`options.txt` に書かない）。  
変更した項目がある場合は初回起動前に `options.txt` へ書き込み、あわせて `onboardAccessibility:false` でゲーム側の初回画面を抑止します。

対象例: 言語、字幕、オートジャンプ、FOV、音量、最大 FPS、垂直同期、GUI スケール、明るさ、描画／演算距離、マウス感度。

バージョンによって存在しないキー（例: `simulationDistance` は 1.18+）は書き込みをスキップします。  
適用後は `minecraftInitialSettingsApplied` が立ち、以降の起動では上書きしません。

## 9. コンテンツ

現状のプロバイダは **Modrinth のみ**（CurseForge 連携は無効化済み）。

カテゴリと配置:

| カテゴリ | フォルダ |
|----------|----------|
| mod | `mods/` |
| resourcepack | `resourcepacks/` |
| shader | `shaderpacks/` |
| plugin | `plugins/` |
| datapack | `world/datapacks/` |

検索はインスタンスの MC バージョンとローダーでフィルタします。導入・有効／無効・削除・更新確認があります。

## 10. スキン

- 同梱デフォルト: Steve、Alex、Ari、Efe、Kai、Makena、Noor、Sunny、Zuri
- ユーザーアップロードは最大 5 件（`MAX_UPLOADED_SKINS`）
- モデルは wide / slim。プレビューはレンダラーの `skinview3d`
- 適用は Mojang のスキン API（`SkinApplier`）。プロフィールは即時更新されるが、クライアントは自分の見た目をセッション中キャッシュするため、確実な反映にはゲーム再起動が必要な場合がある（UI で案内）

## 11. バックアップ

`BackupService` は **設定・スキン・インスタンス** を対象にします。Minecraft 本体、Java、キャッシュは含めません。

| 種類 | 内容 |
|------|------|
| スナップショット | `fledge-backup-<timestamp>/` への一回書き出し |
| 同期ミラー | `fledge-sync/`。設定の「使用中に自動同期」（既定オフ）。デバウンス約 8 秒。ゲーム実行中は避ける |

マニフェストは `fledge-backup.json`（`app: Fledge`、kind、createdAt）。復元は現在の設定とインスタンスを置き換えます。

## 12. 設定・見た目

`Data/Settings/settings.json`。主な項目:

- 既定メモリ（新しいインスタンスの初期値。24GB 超は UI で GC 警告）
- ゲームのフルスクリーン／ウィンドウサイズ、ランチャー窓サイズ、UI スケール
- テーマ: light / dark / oled / color / system。カスタム時はテーマカラー
- ハードウェアアクセラレーション、OS ウィンドウ枠の使用（変更は再起動）
- 起動時ページ（ホーム / ライブラリ）、起動時にランチャーを最小化
- 同時ダウンロード数・書き込み並列数
- Discord Rich Presence のオン／オフ

## 13. ニュース・更新

- お知らせの正本は GitHub の `news/news.ja.json`。アプリ起動時に取得し `Data/News/` にキャッシュ（約 1 時間）。取得失敗時はキャッシュ → 同梱 JSON → 最小フォールバック
- 同梱フォールバック: `apps/desktop/resources/news.ja.json`
- 更新手順: [`news/README.md`](../news/README.md)
- 更新: 製品版は `GithubReleaseUpdater` が GitHub Releases の latest を確認。適用時は現行インストール先へ NSIS サイレント上書きし、アプリを終了してインストーラーに再起動を任せる（開発版は `NoopUpdater`）

## 14. 外部通信（実装観点）

機能利用時のみ。Fledge 独自の収集エンドポイントはない。

| 相手 | 用途 |
|------|------|
| Microsoft / Xbox / Minecraft | ログイン、トークン更新、起動 |
| Mojang メタデータ / CDN | ゲームファイル |
| Fabric / Forge / NeoForge / Quilt | ローダー |
| Eclipse Adoptium | Java |
| Modrinth API | 検索・導入 |
| GitHub（`news/news.ja.json`） | お知らせ取得（キャッシュあり） |
| mc-heads.net | アバターのフォールバック（Microsoft 側 URL があれば優先） |
| ローカル Discord | RPC がオンのときだけ IPC |

トークン・UUID・メールを Discord へは送らない。

## 15. パッケージング（Windows）

`electron-builder`、NSIS。ワンクリックインストーラではない（インストール先変更可、デスクトップショートカット作成）。

`extraResources`: `icon.png` / `icon.ico`、同梱スキン。

アンインストール時は `Data/` と `Instances/` も含めインストールフォルダごと削除する（`build/installer.nsh`）。  
設定 → リソース管理からアプリ内アンインストールも可能（終了後に NSIS アンインストーラー／フォルダ削除を実行）。

## 16. 既知のギャップ（Beta）

README の製品説明と実装の差です。

- CurseForge なし（Modrinth のみ）
- インスタンスのエクスポートは未実装
- 作成後の Minecraft バージョン変更は未対応（UI 上リードオンリー）
- 対応 OS は **Windows 11 のみ**（配布は NSIS / win32-x64）

仕様を変えたら本ファイルの「最終更新」を更新してください。
