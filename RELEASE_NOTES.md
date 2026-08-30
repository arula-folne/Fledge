**Fledge Ver.0.3.0up** を公開しました（アップデートチェック／プレリリース）。

## 目的

**Ver.0.3.0ut** からアプリ内更新し、データ残存を確認する版です。

## 確認手順

1. **最新の Ver.0.3.0ut** を入れ直す  
   https://github.com/arula-folne/Fledge/releases/tag/v0.3.0ut
2. ヘッダーの更新から **0.3.0up** へ（進捗 → 終了 → インストール → 自動起動）
3. instances / 設定が残っているか確認

ログ: `%LOCALAPPDATA%\\fledge\\updater\\update-log.txt`

## 修正（更新が動かなかった件）

- コンソール無しだと **`timeout` が cmd ごと終了**し、インストーラーまで届かなかった → `ping` 待ちに変更
- 更新後の再起動を **スクリプト側で Fledge.exe を起動**するよう追加
- 黒窓が一瞬出ないよう **wscript 非表示起動**

> stable Latest は Ver.0.2.6b のままです。
