# Fledge 開発ガイド

最終更新: 2026-09-22

ソースから Fledge を動かす手順です。製品の紹介は [README](../README.md)、実装の詳細は [spec.md](./spec.md) です。

---

## 前提

- Node.js **20+**
- pnpm **11+**（リポジトリは `packageManager: pnpm@11.4.0`）
- **Windows 11** のみ想定（配布は Tauri NSIS / `win32-x64`）

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

開発時のデータルートは `apps/desktop/.fledge-root/` です（gitignore 済み）。本番の既定 settingsRoot は `%APPDATA%/fledge` で、インストール先（exe 横）にはアプリ本体だけを置きます。シェルは **Tauri 2**（詳細は [tauri-0.5.md](./tauri-0.5.md)）。Electron は 0.5 で非推奨です。

## バージョン表記

正本は `packages/shared/src/version.ts` の `APP_VERSION` です。表示は常に `Ver.` 付きです。

| 範囲 | `APP_VERSION` 例 | 表示例 | 扱い |
|------|------------------|--------|------|
| ベータ | `0.5.0` | Ver.0.5.0 | `0.x.x` はベータ |
| 正式版 | `1.0.0` | Ver.1.0.0 | `1.0.0` 以降 |

接尾辞（`a` / `b` / `r` / `rc` / `ut` / `up` / `f` など）は **使いません**。  
旧タグ比較のため `compareVersions` は歴史的サフィックスを解釈できますが、新規リリースには付けないでください。

世代ロックの最終版: 第1世代 `0.2.4f`（0.3+ 不可） / 第2世代 `0.4.6`（0.5+ 不可）。

変更後は `pnpm version:sync` で package.json / README / spec を同期します。  
配布インストーラ名は `Fledge_{version}_x64-setup.exe`（例: `Fledge_0.5.0_x64-setup.exe`）。

## よく使うスクリプト

| コマンド | 内容 |
|----------|------|
| `pnpm dev` | デスクトップを開発モードで起動 |
| `pnpm build` | ワークスペースをビルド |
| `pnpm typecheck` | 型チェック |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm --filter @fledge/desktop tauri:build` | Tauri NSIS インストーラ |
| `pnpm tauri:build` | 同上（ルート短縮） |

## リリース配布物

配布するのは **Tauri NSIS インストーラー**（`Fledge_*_x64-setup.exe`）だけです。0.4.x の Electron `Fledge-Setup.exe` とは別物です。portable ターゲットは配布しません。

正規の経路は GitHub Actions（将来）または手元の `pnpm tauri:build` です。0.4 系向け世代ロックにより、0.4.6 クライアントは 0.5+ を自動更新しません。

リリースページの本文はリポジトリ直下の `RELEASE_NOTES.md` から取り込みます（自動生成ノートは使いません）。タグを切る前に、そのバージョンの更新内容を `RELEASE_NOTES.md` に書いてください。見出しは `**Fledge Ver.X.Y.Z**` のみとし、「（第3世代・Tauri シェル / Latest）」のような括弧書きは付けません。お知らせ（`news/news.ja.json`）も従来どおり手動追加します。

## `@xmcl` のエントリ修正

npm 上の `@xmcl/core` / `@xmcl/installer` は `main` がソースを指していることがあります。  
`postinstall` の `scripts/patch-xmcl.js` と `pnpm-workspace.yaml` の `packageExtensions` で dist を指すようにしています。  
依存を入れ直したあとにモジュール解決がおかしいときは、`node scripts/patch-xmcl.js` を再実行してください。

## Electron（非推奨）

0.5 以降の正経路は Tauri です。`apps/desktop/electron/` は参照用に残していますが、`dev:electron` / `build:electron` / `dist:electron` は無効化しています。Electron バイナリの手動配置手順は不要です。

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
