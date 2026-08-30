**Fledge Ver.0.3.0ut** を公開しました（アップデートテスター／プレリリース）。

## 目的

第2世代のデータ配置で、**アプリ内更新後もデータが残るか** を検証する版です。  
テスト用インスタンスを作り、続く **Ver.0.3.0up** へ更新して残存を確認します。

## 主な内容

- **二層配置**: 設定・アカウント・ログ → `%APPDATA%\\fledge`（Roaming）／Chromium キャッシュ → `%LOCALAPPDATA%\\fledge`（Local）
- **インストール先**: `Fledge.exe`（直下）・`Uninstall`・`data/`（`instances` / `meta` / `caches` 等）
- データディレクトリは設定から変更可。更新時は `data/` を退避・復元
- フォルダ名は Fledge 独自（`instances` 等）。他製品の商標・ブランド名は使用しません
- スクリーンショットギャラリー等を含む

> **更新実験用です。** stable の Latest は第1世代ファイナル（Ver.0.2.6b）のままです。不具合報告は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) へ。
