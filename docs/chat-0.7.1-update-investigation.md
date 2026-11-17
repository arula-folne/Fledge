# チャット記録: Ver.0.7.1 アップデート失敗調査

- 日時: 2026-11-17（Asia/Tokyo）
- リポジトリ: `arula-folne/Fledge`
- 対象: `0.7.0` → `0.7.1` のアプリ内アップデート

---

## 1. 依頼

> ver.0.7.1をリリースしたんだけど0.7.0からアップデートしても0.7.1にならなかったので原因を探しておいてほしい  
> とりあえず探すのと修正案だけ出して

---

## 2. 初回調査（誤り含む）

### 観測

| 項目 | v0.7.0 | v0.7.1 |
|------|--------|--------|
| Pre-release | いいえ | はい |
| Latest | これが Latest | なっていない |
| インストーラ | あり | あり（`Fledge_0.7.1_x64-setup.exe`） |
| `/releases/latest` | `v0.7.0` | 見えない |

### 当時の結論（後で訂正）

`v0.7.1` が GitHub Pre-release のため、stable チャネル（`/releases/latest`）から見えない、と報告。

関連コード:

- `crates/fledge-core/src/updater/mod.rs` … stable は `/releases/latest`、prerelease を除外
- `apps/desktop/src/components/layout/UpdateAvailableBanner.tsx` … 正規版ビルドは `stable` チャネル

---

## 3. ユーザー訂正

> いや、latestにしていないのはアップデートできなくてユーザーに迷惑をかけるためプレにしただけ  
> 元々latestでアップデート動作もできているが読み込めていないかんじかな

要点:

- Pre-release は**意図的な退避**（壊れた更新をユーザーに出さないため）
- Latest だった時点でアップデート機構自体は動くが、「新版が読み込めていない」感覚
- 初回の「Pre-release が原因」は、元の失敗原因ではない

---

## 4. 再調査結果

### 4.1 成果物は正しい

`Fledge_0.7.1_x64-setup.exe` を展開して確認:

- `fledge-desktop.exe` の ProductVersion / FileVersion は **0.7.1**
- フロント `main-*.js` / `main-*.css` のハッシュは 0.7.0 と別（フロントも作り直し済み）
- アセット名 `Fledge_0.7.1_x64-setup.exe`、サイズ整合、ダウンロードも MZ ヘッダ正常

→ 「配信物が古い／壊れている」系ではない。

### 4.2 「読み込めていない」に合うコード上の弱点

`updater:check` は GitHub 取得失敗時に、**鮮度を見ずに古いキャッシュを返す**。

```rust
// crates/fledge-core/src/updater/mod.rs  (check の Err 分岐)
if let Some(cached) = self.read_cache(channel)? {
    if let Some(reconciled) =
        reconcile_cached_update_result(&cached.result, &effective_app_version())
    {
        self.sync_pending(channel, &reconciled);
        return Ok(reconciled); // ← stale でも返す
    }
}
```

典型フロー:

1. Latest がまだ 0.7.0 のとき check → `up-to-date` をキャッシュ
2. 0.7.1 を Latest にしたあと、API 失敗（未認証 60req/h 制限など）
3. 古い `up-to-date` が返り続ける → 「動いているのに新版が読めない」感

`force: true` でも、取得失敗時はこの stale フォールバックを踏む。

### 4.3 併発しうる点（workflow）

`.github/workflows/release.yml` は:

1. `gh release create`（この時点で Latest になり得る）
2. その後 `gh release upload`（asset 追加）

Latest 直後に **asset ゼロ** の瞬間があり、そのときの check は `updater.noAsset` になり、最大約 60 秒キャッシュされ得る。

### 4.4 適用後も 0.7.0 のまま、だった場合

成果物は正しいので、適用〜再起動経路の切り分け:

- ログ: `%LOCALAPPDATA%\fledge-updater\update-log.txt`
- 見る項目: `NSIS exit=` / `starting app` / `ERROR`
- 過去修正: Ver.0.6.2（再起動で新版が起動しない）、Ver.0.6.4（再起動されない）

0.7.1 の single-instance 変更は製品版パスには実質影響なし（`not(debug_assertions)` のみ）。

---

## 5. 修正案（当時は実装しない）

1. **check の失敗時**  
   stale な `up-to-date` / `unavailable` を返さない。`force` 時は特にフォールバック禁止。失敗は `fetchFailed` を出す。

2. **release workflow**  
   asset 付きで作る、または draft → upload → publish。正規版は `--latest` 明示。公開直後に `/releases/latest` と asset 存在を検証。

3. **切り分け**  
   手元の `update-log.txt` を見る。  
   - NSIS 成功なのに Ver が古い → 再起動経路  
   - check がずっと最新なし → 上記 1 が本命

---

## 6. 補足（初回調査で触れた事実）

- リリース作者: `github-actions[bot]`（`Release Installer` workflow）
- workflow の `--prerelease` 条件は版サフィックス `(a|b|c|ut|up)$` のみ（`0.7.1` には本来付かない）
- `v0.7.1` の `updated_at` が publish より後 → UI 等で Pre-release へ切り替えた痕跡と整合
- お知らせ `news/news.ja.json` / バンドル用コピー、`RELEASE_NOTES.md` は 0.7.1 エントリあり
- remote news (`raw.githubusercontent.com/.../news/news.ja.json`) も先頭が v0.7.1

---

## 7. 当時の合意・スタンス

- Pre に戻した判断は妥当（壊れた更新を Latest に出さない）
- 次の一手は「check の stale フォールバック修正」か、`update-log.txt` で取得側／適用側を確定
