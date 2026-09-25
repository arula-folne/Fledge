**Fledge Ver.0.5.32**

Forge 起動が即終了する問題を修正しました。

## 修正

- **Forge 起動**: JVM 引数の `${library_directory}` / `${classpath_separator}` が未展開のまま渡され、`BootstrapLauncher` を読めず exit code 1 になっていた問題を修正
- ログが無いときのエラー詳細に、起動前終了の可能性を追記

## 配布

- タグ: `v0.5.32`
- インストーラ: **`Fledge_0.5.32_x64-setup.exe`**
- 表示: `Ver.0.5.32`

不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
