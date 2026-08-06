# Fledge

日本人向けの軽量・高速・シンプルな Minecraft ランチャーです。MIT ライセンスのオープンソースプロジェクトです。

> Ready to take flight.

## 方針

- **広告・利用解析・クラッシュ報告は行いません**（詳細は [PRIVACY.md](./PRIVACY.md)）
- Discord Rich Presence は**任意**（既定オフ）
- 認証・ゲーム取得・Mod 検索は、機能利用時のみ各公式／配布サービスの API を使います

## 技術スタック

- Electron / React / TypeScript / Vite / Tailwind CSS / Zustand
- TanStack Query / Zod / React Router / i18next
- `@xmcl/core` / `@xmcl/installer`（Minecraft インストール・起動）
- `msmc`（Microsoft 認証。アダプタ経由のみ）

## リポジトリ構成

```
Fledge/
  apps/desktop/       Electron + React UI
  packages/core/      ランチャー中核（UI 非依存）
  packages/shared/    型・IPC 契約
  packages/i18n/      文言リソース
  scripts/patch-xmcl.js  @xmcl 公開パッケージのエントリ修正
```

## ランタイムデータ（インストール先集約）

本番では `Fledge.exe` と同じフォルダ配下に集約します。

```
Fledge/
  Fledge.exe
  Data/
    Accounts/
    Cache/
    java-version/  # java8 / java17 / java21 / java25
    Logs/
    Minecraft/     # 共有 libraries / assets / versions
    News/
    Settings/
    Temp/
  Instances/       # インスタンス固有（mods / saves / config 等）
```

開発時のルートは `apps/desktop/.fledge-root/` です。

## 開発手順

前提: Node.js 20+、pnpm 11+

```powershell
cd Fledge
pnpm install
pnpm approve-builds --all
node scripts/patch-xmcl.js
pnpm --filter @fledge/shared build
pnpm --filter @fledge/i18n build
pnpm --filter @fledge/core build
pnpm --filter @fledge/desktop exec electron-vite dev
```

ルートの `pnpm dev` でも起動できます。

### CurseForge（現在無効）

CurseForge 連携は**一旦無効**にしています。コンテンツ追加は **Modrinth** のみです。  
再有効化するときは `ContentService` の `CURSEFORGE_FEATURE_ENABLED` と、ローカル `.env` の `FLEDGE_CURSEFORGE_API_KEY`（コミット禁止）が必要です。

### 補足

- `@xmcl/*` は npm 上の `main` がソースを指しているため、`postinstall` で `scripts/patch-xmcl.js` が dist を指すよう修正します。
- Electron のダウンロードに失敗する場合は、GitHub Releases から `electron-v*-win32-x64.zip` を取得し `apps/desktop/node_modules/electron/dist` に展開してください。

## 主な機能

- Microsoft アカウントログイン
- Vanilla / Fabric / Forge / NeoForge 起動
- Java 自動検出・不足時ダウンロード（Temurin）
- インスタンス管理
- Modrinth コンテンツ検索・インストール（CurseForge は現在無効）
- ニュース（ローカル JSON）
- 起動ログ / 基本設定

## ライセンス

[MIT](./LICENSE) © folne

## 注意

Fledge は非公式ランチャーです。Minecraft は Mojang Studios の商標です。
