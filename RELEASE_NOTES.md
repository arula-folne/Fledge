**Fledge Ver.0.3.0ut** を公開しました（アップデートテスター／プレリリース）。

## 目的

第2世代（Modrinth 型データ配置）の **アプリ内更新でデータが消えないか** を検証するための版です。  
この版にテスト用インスタンス等を作成し、続く **Ver.0.3.0up** へ更新してデータ残存を確認します。

## 主な内容

- **データ配置を Modrinth 型に変更**（設定・アカウント・ログ → `%APPDATA%\\fledge`、ゲームデータ → 変更可能なデータディレクトリ）
- データディレクトリ直下は `profiles/` `meta/` `caches/` 等（Modrinth の App directory 相当。設定から変更可）
- AppData は `fledge` のみ（`@fledge` は使わない／起動時に削除を試行）
- インストール先ルートは `app/` に Electron ランタイムをまとめ、散らかりを軽減
- アプリ更新ではデータディレクトリ・AppData のユーザーデータを消さない
- 旧レイアウト（exe 横）からの自動移行
- スクリーンショットギャラリー等を含む

> **更新実験用です。** stable の Latest は第1世代ファイナル（Ver.0.2.6b）のままです。不具合報告は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) へ。
