**Fledge Ver.0.3.2a** を公開しました（第2世代 / Latest）。

## 主な変更

### Minecraft 初期設定（製品版向け）
- **製品版でゲームに反映されない問題を修正**
- ゲームログは stdout に出ないため `logs/latest.log` を定期ポーリングしてタイトル到達を検出
- **1 回目は primed のみ**、**2 回目以降**で applied 確定（Fabric 等で 1 回目 Options.load が潰されても 2 回目で反映）
- spawn 前書き込み後の Windows 反映待ちを追加
- 既存インスタンスも世代 9 で一度再適用

### 継承（Ver.0.3.1b まで）
- タイトル到達時の applied 確定、第2世代データ配置・アプリ内更新

> アルファ版です。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
