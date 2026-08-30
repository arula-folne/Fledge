**Fledge Ver.0.3.0ut** を公開しました（アップデートテスター／プレリリース）。

## 目的

第2世代（Modrinth 型データ配置）の **アプリ内更新でデータが消えないか** を検証するための版です。  
この版にテスト用インスタンス等を作成し、続く **Ver.0.3.0up** へ更新してデータ残存を確認します。

## 主な内容

- **インストール時に選んだフォルダ**へ `app/`（本体）・`Uninstall`・`Instance/` を配置（Modrinth App と同じ）
- `Instance/` 配下: `profiles` / `meta`（Java 含む） / `caches` / `synced-options`
- ランチャー設定・アカウント・ログは `%APPDATA%\\fledge`（更新でも消えない）
- アプリ更新時も `Instance/` を退避・復元してデータ消失を防ぐ
- データディレクトリは設定から別フォルダへ変更可
- AppData は `fledge` のみ（`@fledge` は使わない）
- スクリーンショットギャラリー等を含む

> **更新実験用です。** stable の Latest は第1世代ファイナル（Ver.0.2.6b）のままです。不具合報告は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) へ。
