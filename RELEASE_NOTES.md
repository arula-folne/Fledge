**Fledge Ver.0.3.0a** を公開しました（アルファ／プレリリース）。

## 主な変更

- **データ配置を Modrinth 型に変更**
  - ランチャー設定・アカウント → AppData（アプリ更新でも消えない）
  - インスタンス・Minecraft 本体・キャッシュ → データディレクトリ（既定も AppData。設定から変更可）
  - インストール先（exe 横）にはアプリ本体のみ
- **更新時に Data / Instances が消える問題を修正**（NSIS `customRemoveFiles` で退避・復元）
- 旧レイアウト（exe 横の `Data/Settings`・`Accounts`）からの自動移行
- スクリーンショットギャラリーなど Ver.0.2.5b までの変更を含む

> **テスト用アルファ版です。** 安定版チャネルの自動更新には乗りません。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
