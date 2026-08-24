# Fledge 開発ガイド

最終更新: 2026-08-17

ソースから Fledge を動かす手順です。製品の紹介は [README](../README.md)、実装の詳細は [spec.md](./spec.md) です。

---

## 前提

- Node.js **20+**
- pnpm **11+**（リポジトリは `packageManager: pnpm@11.4.0`）
- **Windows 11** のみ想定（Electron の配布設定は `win32-x64` / NSIS）

## セットアップと起動

リポジトリルートで:

```powershell
pnpm install
pnpm approve-builds --all
pnpm --filter @fledge/shared build
pnpm --filter @fledge/i18n build
pnpm --filter @fledge/core build
pnpm dev
```

`pnpm install` の `postinstall` で `scripts/patch-xmcl.js` が走ります。  
ルートの `pnpm dev` は `pnpm --filter @fledge/desktop dev` と同じです。

開発時のデータルートは `apps/desktop/.fledge-root/` です（gitignore 済み）。本番の `Fledge.exe` 横配置とは場所だけが違います。

## バージョン表記

正本は `packages/shared/src/version.ts` の `APP_VERSION` です。表示は常に `Ver.` 付きです。

| 区分 | `APP_VERSION` | 表示例 |
|------|---------------|--------|
| アルファ版 | `0.0.0a` | Ver.0.0.0a |
| ベータ版 | `0.0.0b` | Ver.0.0.0b |
| 正式版候補版 | `0.0.0rc` | Ver.0.0.0rc |
| 製品版 | `0.0.0` | Ver.0.0.0 |

変更後は `pnpm version:sync` で package.json / README / spec を同期します（npm semver 用に `0.1.4a` → `0.1.4-a` へ変換されます）。

## よく使うスクリプト

| コマンド | 内容 |
|----------|------|
| `pnpm dev` | デスクトップを開発モードで起動 |
| `pnpm build` | ワークスペースをビルド |
| `pnpm typecheck` | 型チェック |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm --filter @fledge/desktop pack` | electron-builder `--dir` |
| `pnpm --filter @fledge/desktop dist` | NSIS など配布物 |

## リリース配布物

配布するのは **NSIS インストーラー**（`Fledge-Setup-<version>.exe`）だけです。portable ターゲットは配布しません（展開して直接起動するだけでインストールされず、自動更新も壊れます）。

正規の経路は GitHub Actions です。`v*` タグを push すると `.github/workflows/release.yml` が NSIS をビルドし、アンインストーラー同梱を検証したうえで Release に添付します。手元でビルドした exe を直接アップロードしないでください。

## `@xmcl` のエントリ修正

npm 上の `@xmcl/core` / `@xmcl/installer` は `main` がソースを指していることがあります。  
`postinstall` の `scripts/patch-xmcl.js` と `pnpm-workspace.yaml` の `packageExtensions` で dist を指すようにしています。  
依存を入れ直したあとにモジュール解決がおかしいときは、`node scripts/patch-xmcl.js` を再実行してください。

## Electron バイナリが取れないとき

ネットワーク制限などで Electron のダウンロードに失敗する場合:

1. [Electron Releases](https://github.com/electron/electron/releases) から、使用バージョンに合う `electron-v*-win32-x64.zip` を取得する
2. `apps/desktop/node_modules/electron/dist` に展開する

## 環境変数

`.env.example` を `.env` にコピーします（`.env` は gitignore）。

| 変数 | 用途 |
|------|------|
| `FLEDGE_DISCORD_CLIENT_ID` | Discord Rich Presence の Application ID 上書き。未設定時は `packages/shared` の既定値 |

シークレットをリポジトリに含めないでください。

## パッケージの依存方向

```
@fledge/desktop  →  @fledge/core, @fledge/shared, @fledge/i18n
@fledge/core     →  @fledge/shared
@fledge/i18n     →  （文言のみ）
```

IPC の追加は `packages/shared` のチャネル名と Zod スキーマを先に直し、メインの `registerIpc` とプリロード、レンダラーの `fledgeApi` を揃えます。

## UI

アイコンは Tabler Icons（`@tabler/icons-react`）です。新規に絵文字や他セットを置かないでください。リポジトリの Cursor ルール `.cursor/rules/tabler-icons.mdc` を参照してください。
