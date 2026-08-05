# Fledge

日本人向けの軽量・高速・シンプルな Minecraft ランチャーです。

> Ready to take flight.

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
    Java/
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
cd D:\Creative\cursorProject\Fledge
pnpm install
pnpm approve-builds --all
node scripts/patch-xmcl.js
pnpm --filter @fledge/shared build
pnpm --filter @fledge/i18n build
pnpm --filter @fledge/core build
pnpm --filter @fledge/desktop exec electron-vite dev
```

ルートの `pnpm dev` でも起動できます。

### 補足

- `@xmcl/*` は npm 上の `main` がソースを指しているため、`postinstall` で `scripts/patch-xmcl.js` が dist を指すよう修正します。
- Electron のダウンロードに失敗する場合は、GitHub Releases から `electron-v*-win32-x64.zip` を取得し `apps/desktop/node_modules/electron/dist` に展開してください。

## MVP 範囲

- Microsoft アカウントログイン（Client ID は設定で差し替え可）
- Vanilla / Fabric 起動
- Java 自動検出・不足時ダウンロード
- インスタンス管理（作成・編集・複製・削除・フォルダを開く・右クリックメニュー）
- ニュース（ローカル JSON）
- 起動ログ / 基本設定（Data / Minecraft / Java / Instances を開く）
- 初回起動時のインスタンス作成ウィザード

## ライセンス

[MIT](./LICENSE) © folne

## 注意

Fledge は非公式ランチャーです。Minecraft は Mojang Studios の商標です。
