**Fledge Ver.0.3.2c** を公開しました（第2世代ベータ / Latest）。

## 主な変更

### Minecraft 初期設定（1 回起動での反映を再修正）
- spawn 前 **burst 書き込み**（4 回 × 40ms + settle）
- spawn 後 **30ms ポーリング** + **fs.watch** + **0ms からの早期ガード**（4 秒間）
- 適用世代を **11** に bump（0.3.2b で applied 済みのインスタンスも再適用）
- バニラ・Fabric 共通（製品版 latest.log ポーリングは継続）

### 0.3.2b からの修正理由
- 早期ガードが 250ms から開始で、Options.load（〜200ms）より遅かった

> ベータ版です。不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
