**Fledge Ver.0.6.2**

アプリ内アップデート適用後の再起動で、新版が正しく起動しない問題を修正しました。

## 修正

- **アップデート適用**: 終了待機スクリプトを Job Object 外で起動し、NSIS 適用前に残留プロセスを掃除
- **再起動**: Tauri 本体（`fledge-desktop.exe`）を優先して起動し、単一インスタンス競合時はリトライ
- **更新フラグ**: `--updated` 付き再起動が古いプロセスに吸われないよう調整

## 配布

- タグ: `v0.6.2`
- インストーラ: **`Fledge_0.6.2_x64-setup.exe`**
- 表示: `Ver.0.6.2`

不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
