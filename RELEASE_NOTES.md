**Fledge Ver.0.3.1b** を公開しました（第2世代ベータ / Latest）。

## 主な変更

### Minecraft 初期設定
- **ゲーム側に反映されない問題を修正**（Fabric / Mod が起動中に `options.txt` を潰した場合）
- タイトル到達時に設定が一致していた起動でのみ「適用済み」にする
- 潰されていた場合はディスクを直して **次回起動**で Options.load し直す
- 既存インスタンスも一度だけ再適用されるよう世代を更新

### 継承（Ver.0.3.0b）
- 第2世代データ配置・アプリ内更新の安定化

> ベータ版です。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
