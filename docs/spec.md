# Fledge 技術仕様

最終更新: 2026-09-22

GitHub リポジトリ向けの実装仕様です。アプリ紹介・機能のアピールは [README](../README.md) を先に読んでください。  
開発手順は [development.md](./development.md) です。

関連: [PRIVACY.md](../PRIVACY.md) / [TERMS.md](../TERMS.md) / [data-handling.md](./data-handling.md)

---

## 1. 位置づけ

Fledge は Minecraft Java Edition 用の非公式デスクトップランチャーです。  
バージョン **Ver.0.5.15**。製品 ID は `net.folne.fledge`。  
**対応環境は Windows 11 のみ**です。

製品方針:

- **軽快さ**: 広告・利用解析・クラッシュ報告 SDK を載せず、起動・ダウンロード・日常操作を軽快に保つ
- **モダンな UI / 使い勝手**: 見た目・導線・フィードバックを重視したデスクトップ UI（テーマ、UI スケール、進捗表示など）
- **初期設定**: 新規インスタンス初回起動時に、ゲーム内の言語・映像・音声・操作をランチャーから指定
- **必要な機能を UI に集約**: Modrinth 連携、スキン・ケープ、ギャラリー、設定の `option.flg` などプレイ準備に必要な機能を載せる（機能削減による「小ささ」は目指さない）

運用方針:

- **現時点では** 広告・利用解析・クラッシュ報告 SDK は入れない
- **現時点では** 認証トークンは端末内に留め、Fledge 独自のアカウントサーバーは持たない
- 既定の UI 言語は日本語（`locale` のデフォルトは `ja`）
- Discord Rich Presence は任意（設定の既定はオフ）

将来的には、運用中の **web** と連携した着せ替え機能のために、Fledge 独自アカウントや利用率解析を導入する可能性があります。解析の想定範囲は、利用率、継続利用状況、障害調査に必要な最小限の利用状況です。その場合でも、個人情報・認証情報・秘密情報をソースコードや公開リポジトリへ含めないことを前提にします。実装時は `PRIVACY.md` と README を更新してください。

## 2. リポジトリ構成

pnpm ワークスペース（`apps/*` と `packages/*`）。

| パス | パッケージ | 役割 |
|------|------------|------|
| `apps/desktop/` | `@fledge/desktop` | Tauri シェル（Rust）+ React UI。`electron/` は 0.4 参照用・非推奨 |
| `crates/fledge-core/` | `fledge-core` | Rust ランチャー中核（0.5+） |
| `packages/core/` | `@fledge/core` | 旧 Electron 向け TypeScript 中核（0.4 互換・段階的移行） |
| `packages/shared/` | `@fledge/shared` | Zod モデル、IPC チャネル名、ブランド定数 |
| `packages/i18n/` | `@fledge/i18n` | 文言リソース（既定 `ja`、複数言語） |
| `scripts/patch-xmcl.js` | — | `@xmcl/*` の npm `main` を dist に向ける postinstall |
| `docs/` | — | 本仕様および開発ガイド |

`@fledge/core`（TS）は Electron を import しません。0.5 の実体は `crates/fledge-core` です。ウィンドウ・IPC は Tauri（`fledge_invoke`）経由です。

## 3. 技術スタック

| 層 | 技術 |
|----|------|
| デスクトップ | **Tauri 2** + Rust（Windows NSIS）。Electron 35 は 0.4.x / 非推奨 |
| UI | React 19、React Router 7、Tailwind CSS 4、Zustand、TanStack Query、i18next |
| アイコン | `@tabler/icons-react` |
| スキンプレビュー | `skinview3d` |
| 契約・検証 | TypeScript 5.8、Zod |
| Minecraft | Rust `fledge-core`（Mojang / Fabric / Forge / NeoForge / Quilt メタ取得・導入）。`@xmcl/*` は 0.4 / `packages/core` 参照用 |
| 認証 | Rust `AuthProvider` + DPAPI TokenVault（0.4 の `msmc` 経路は Electron 参照用） |
| Discord | 任意（設定の既定はオフ）。Rust `DiscordPresence` |

## 4. プロセス構成

```
Renderer (React)
    │  window.fledge / fledge_invoke
Tauri (Rust)
    │  commands::dispatch
    ▼
fledge-core  AppState
    SettingsStore / InstanceStore / JavaManager / MinecraftService
    VersionService / ContentService / LaunchOrchestrator
    SkinStore / SkinApplier / SessionJoinProxy / UpdaterService
```

- **Rust シェル**: ファイルシステム、子プロセス（ゲーム）、ダウンロード、認証、更新
- **ブリッジ**: `IPC` / `IPC_EVENTS` で公開する API のみ
- **レンダラー**: 画面と状態。起動・インストールは IPC

チャネル名とペイロードは `packages/shared/src/constants.ts` および `models.ts` が契約です。

## 5. ランタイムデータ

本番は **二層配置**です。

- **settingsRoot**（本番: `%APPDATA%\\fledge` / Roaming）: ランチャー設定・アカウント・ログ・お知らせ
- **sessionData**（本番: `%LOCALAPPDATA%\\fledge` / Local）: 更新用インストーラ退避など（0.4 では Electron Cache もここ）
- **configRoot**（既定: settingsRoot 配下またはカスタム。設定で変更可）: instances / meta / caches 等
- **installDir**（インストーラで選ぶフォルダ、例: `...\Fledge`）: `Fledge.exe`・`uninstall.exe`・（任意で）データ

開発時は settingsRoot が `apps/desktop/.fledge-root/`、configRoot が `apps/desktop/.fledge-root/data/` です。

```
<installDir>/                 例: ...\Fledge\（Tauri NSIS・0.5）
  Fledge.exe
  uninstall.exe
  （アプリ本体のみ。Data/Instances は settingsRoot / configRoot）

%APPDATA%\fledge\        settingsRoot（更新でも消えない）
  Settings/
  Accounts/
  logs/
  news/
  custom-root.json

%LOCALAPPDATA%\fledge\   Local
  updater/               アプリ内更新用インストーラー退避（%TEMP% に散らさない）
```

0.4 Electron の `installDir/data/meta/runtime/` 配置は廃止。パス解決は `crates/fledge-core` の `PathLayout`（および旧 `packages/core`）が組み立てます。  
Minecraft 本体・ライブラリ・アセット・Java は `meta/` で共有します。  
ワールド、Mod、ゲーム内設定は `instances/<id>/` です。

他製品の商標・製品固有のフォルダ名は使いません（Fledge 独自の命名）。

インスタンス配下で開いてよいサブフォルダ（`INSTANCE_SUBFOLDERS`）:

`mods` / `resourcepacks` / `shaderpacks` / `saves` / `logs` / `screenshots` / `plugins`

コンテンツの導入記録は各インスタンスの `.fledge/content-index.json` です。

## 6. 認証

- フローは Microsoft / Xbox / Minecraft の公式認証（Rust `AuthProvider`、MSA OAuth WebView）
- 表示情報: `<settingsRoot>/Accounts/index.json`（MCID、UUID、任意で XUID・アバター URL）
- トークン: `<settingsRoot>/Accounts/secrets/<accountId>.dat` を **Windows DPAPI**（ユーザー範囲）で暗号化
- 0.4 Electron `safeStorage` の秘密は読めないため、0.5 初回は **再ログインが必要**
- 複数アカウント。アクティブ ID と一覧を index で管理
- パスワードは保存しない。サインイン UI は Microsoft 側

ゲーム側の session join は、1.20.2 以降で `-Dminecraft.api.session.host` が効くとき `SessionJoinProxy`（`127.0.0.1` のローカル HTTP）が Mojang へ転送します。  
ランチャーでトークンを更新したあと、ゲームを落とさず再接続できるための仕組みです。

## 7. 起動フロー

`LaunchOrchestrator` がセッション単位で進めます。複数インスタンスを同時に起動できます。

おおよその位相:

1. `auth` — 資格情報の確認。選択中スキン適用は起動と並行（ログイン時）
2. `java` / `install` — Java 確認とクライアント準備を並行。導入済みならネット確認を省略
3. ネイティブは `meta/natives/<versionId>/` に残し、次回は再展開しない
4. 新規インスタンスなら最新の `minecraftInitialSettings` を `options.txt` に強制マージ（初回のみ。Modpack 同梱より優先）
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

ローダー実装: Vanilla、Fabric、Forge、NeoForge、Quilt（Rust `VersionService` / `minecraft` モジュール）。

## 8. Minecraft 初期設定

設定の `minecraftInitialSettings` は、**まだ初回起動していないインスタンス**には起動直前の最新値が使われます。作成時には `options.txt` を書きません。  
すべて `null`（変更なし）のときは `options.txt` を生成・変更せず、一度 spawn して終了したら `applied` にします。  
1件でも変更がある場合は、初回起動の **Minecraft プロセス起動前**に変更キーだけをマージし、`onboardAccessibility:false` を付けて検証してから起動します。  
Fabric / Mod が spawn 直後〜Options.load 前に `options.txt` を潰すことがあるため、spawn 前 burst 書き込みに加え **30ms ポーリング・fs.watch・0ms からの早期ガード**（4 秒間）で潰しを直します。1 回の起動でタイトル到達時一致、または 8 秒以上稼働して終了時 verify が通れば `applied` を立てます。製品版では `logs/latest.log` も定期ポーリングします。  
Modpack 同梱の `options.txt` より、初回起動時の Fledge パッチを優先します。

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

## 10. スキン・ケープ

- 同梱デフォルト: Steve、Alex、Ari、Efe、Kai、Makena、Noor、Sunny、Zuri（製品版は `resources/skins` と UI アセットの双方で同梱）
- ユーザーアップロードは最大 5 件（`MAX_UPLOADED_SKINS`）
- モデルは wide / slim。プレビューはレンダラーの `skinview3d`（インタラクティブ時はドラッグ回転。ズーム操作は無効）
- 適用は Mojang のスキン API（`SkinApplier`）。プロフィールは即時更新されるが、クライアントは自分の見た目をセッション中キャッシュするため、確実な反映にはゲーム再起動が必要な場合がある（UI で案内）
- **公式ケープはスキンごと**: 設定の `skinCapeIds`（`skinId → capeId | null`）に保持。デフォルトスキンもケープのみ編集可
- 一覧: `capes:list`、適用: `capes:select`（選択中スキンのとき）。プレビュー用テクスチャは `capes:fetch-texture`（CORS 回避の data URL）
- 選択 UI は楽観的更新（ハイライト即時。Mojang へのケープ適用は裏で実行）

## 11. 設定のインポート／エクスポート

アプリ設定（言語・テーマ・メモリなど）を **`option.flg`**（テキスト JSON 封筒 `fledge-option` v1）として書き出し・読み込みできます。

- IPC: `settings:export-options` / `settings:import-options`
- インスタンス・ワールド・Mod・スキン画像は含まない
- 旧バックアップ機能（`BackupService` / 同期ミラー）は **削除済み**

## 12. 設定・見た目

`Data/Settings/settings.json`（実パスは `<settingsRoot>/Settings/settings.json`）。主な項目:

- 既定メモリ（新しいインスタンスの初期値。24GB 超は UI で GC 警告）
- ゲームのフルスクリーン／ウィンドウサイズ、ランチャー窓サイズ、UI スケール（compact / normal / large / wide。既定 normal。実 zoom = 0.925 × 表示倍率）
- テーマ: light / dark / oled / color / system。カスタム時はテーマカラー。シーズンテーマ
- ハードウェアアクセラレーション、OS ウィンドウ枠の使用（変更は再起動）
- 起動時ページ（ホーム / ライブラリ）、起動時にランチャーを最小化、ホームお知らせ表示
- 同時ダウンロード数・書き込み並列数
- Discord Rich Presence のオン／オフ
- ロケール（既定 `ja`、複数言語）

## 13. ニュース・更新

- お知らせの正本は GitHub の `news/news.ja.json`。アプリ起動時に取得し `Data/News/` にキャッシュ（約 1 時間）。取得失敗時はキャッシュ → 同梱 JSON → 最小フォールバック
- 同梱フォールバック: `apps/desktop/resources/news.ja.json`
- 更新手順: [`news/README.md`](../news/README.md)
- 更新: `GithubReleaseUpdater` が GitHub Releases を確認。第1世代（0.2.x）は 0.3+、第2世代（0.3.x / 0.4.x）は 0.5+ を案内しない。適用時は現行インストール先へ NSIS サイレント上書きし、アプリを終了してインストーラーに再起動を任せる（開発版は `NoopUpdater`）

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

**Tauri 2 NSIS**（`pnpm tauri:build` → `Fledge_*_x64-setup.exe`）。ワンクリックインストーラではない（インストール先変更可）。

アプリ内更新ではインストーラを同一 `installDir` へ `/S --updated /D=...` で適用し、Data / Instances / AppData の Settings・Accounts は消さない（`.cursor/rules/updater-data-persistence.mdc`）。  
アンインストールは `uninstall.exe`（または Apps & Features）経由。更新経路と混同しないこと。

0.4 の `electron-builder` / `build/installer.nsh` は参照用。

## 16. 既知のギャップ（Beta）

README の製品説明と実装の差です。

- CurseForge なし（Modrinth のみ）
- サーバー向け **プラグイン** の導入は非対応（探索に出てもインストール不可）
- インスタンス丸ごとの ZIP バックアップはなし（`.mrpack` エクスポートはある。アプリ設定は `option.flg`）
- 作成後の Minecraft バージョン変更は未対応（UI 上リードオンリー）
- 対応 OS は **Windows 11 のみ**（配布は Tauri NSIS / win32-x64）
- `0.x.x` はベータ方針（`1.0.0` 以降を正式版とする）
- 非日本語 UI 文言の一部は英語フォールバック／機械翻訳ベータ

仕様を変えたら本ファイルの「最終更新」を更新してください。
