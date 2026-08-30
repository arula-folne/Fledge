# 第1世代ファイナル（Ver.0.2.4f）テスト用仮データ

0.2.4b 相当の **exe 横データレイアウト** のまま、**更新上限パッチ**（0.3 以上を案内しない）を入れた状態を再現するためのフィクスチャです。  
本番の `Ver.0.2.4f` リリースは `v0.2.4b` から上限パッチのみ cherry-pick して切ります（main の 0.3.x とは別系統）。

## 構成

```
install-layout/          … 第1世代の exe 横配置（0.2.4b と同型）
  data-root.json
  Data/Settings/settings.json
  Data/Accounts/index.json
  Instances/demo-vanilla/profile.json

updater-cache/
  without-ceiling-available-0.3.0a.json   … 上限なしなら 0.3.0a を案内してしまう悪例
  with-ceiling-up-to-date-on-0.2.4f.json … 上限あり・0.2.4f 時点で最新扱い

manifest.json            … このフィクスチャのメタ情報
```

## ローカル確認

1. `install-layout/` を任意のフォルダにコピーし、そのパスを `FLEDGE_ROOT` に設定  
2. 開発起動時に第1世代を装う:

```powershell
$env:FLEDGE_DEV_APP_VERSION = "0.2.4b"
pnpm --filter @fledge/desktop dev
```

3. 更新チェックは GitHub API を叩く。キャッシュ挙動だけ見る場合は `updater-cache/` の JSON を  
   `%AppData%/Fledge/` 配下の `Data/Cache/updater-check-stable.json` にコピー（第1世代レイアウト時）。

## 期待動作（上限パッチ適用後）

| 実行中 | GitHub Latest | 案内される版 |
|--------|---------------|--------------|
| 0.2.4b | 0.3.0a (prerelease) | **0.2.4f** または 0.2.4b 系最新（0.3 は無視） |
| 0.2.4f | 0.3.0a | **更新なし**（第1世代内最新） |
| 0.3.0a | 0.3.0b | 0.3.0b（第2世代は上限なし） |

## 関連コード

- `packages/shared/src/updaterGeneration.ts` … 第1世代判定・0.3 未満フィルタ
- `packages/core/src/updater/GithubReleaseUpdater.ts` … 第1世代は releases 一覧から 0.2.x のみ選択
