**Fledge Ver.0.3.0up** を公開しました（アップデートチェック／プレリリース）。

## 目的

**Ver.0.3.0ut** からアプリ内更新し、インスタンス・設定・アカウントなどが **残っているか確認** するための版です。

## 確認手順

1. **最新の Ver.0.3.0ut** を入れ直す（更新待ちの不具合修正済み）  
   https://github.com/arula-folne/Fledge/releases/tag/v0.3.0ut
2. テスト用インスタンスや設定を用意する
3. ヘッダーの更新案内から **Ver.0.3.0up** へ更新する
4. 起動後に次を確認する
   - `instances` が残っている
   - 設定・アカウントが残っている
   - インストール先ルートが `Fledge.exe` / `Uninstall Fledge.exe` / `data/` のまま

## この版の内容

- 0.3.0ut 時点の第2世代配置・更新保全を引き継ぎ
- **更新待ちを PID ベースに変更**（`find Fledge.exe` の cmd 張り付き／途中失敗で起動不能になる問題を修正）
- 更新時に `runtime` を先消ししない（退避失敗でも起動ファイルが残る）
- ルート起動 exe のアイコン埋め込み
- 更新インストーラー退避先を `%LOCALAPPDATA%\\fledge\\updater` に集約
- a / b / ut / up ビルドはプレリリースチャネルで更新を検出

> **更新実験用です。** stable の Latest は第1世代ファイナル（Ver.0.2.6b）のままです。不具合報告は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) へ。
