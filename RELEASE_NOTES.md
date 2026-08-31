**Fledge Ver.0.3.3a** を公開しました（第2世代アルファ / Latest）。

## 主な変更

### アプリ完全リセットの修正
- 完全リセット後も **更新完了ポップアップ**が出続ける問題を修正（`--updated` を引き継がない）
- **全候補 data パス**（既定 / カスタム / レガシー AppData）を削除
- `custom-root.json`・sessionData をクリアし、再起動後のデータ復元を防止
- 削除失敗時も可能な限り続行し、必ず再起動する

### 継承（Ver.0.3.2c）
- Minecraft 初期設定を 1 回起動で反映（burst 書き込み・30ms ポーリング・fs.watch・早期ガード）

> アルファ版です。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
