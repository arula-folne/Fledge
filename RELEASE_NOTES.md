**Fledge Ver.0.5.9**（第3世代・Tauri シェル / Latest）

インストーラーの表示領域がウィンドウサイズに追従するよう修正しました。あわせて Windows Defender の誤検知（`Trojan:Win32/Wacatac.B!ml`）を避けるため、インストーラー生成を見直しています。

## 修正

- **インストーラー**: 外枠 16:10 に加え、内側のページ領域・ボタン・区切り線も合わせて配置
- サイドバー／ヘッダー画像の比率はそのまま
- **誤検知対策**: NSIS 圧縮を zlib に変更し、ウィンドウ調整の Win32 呼び出しを必要最小限に整理（再ビルド）

## 配布

- タグ: `v0.5.9`
- インストーラ: **`Fledge_0.5.9_x64-setup.exe`**
- 表示: `Ver.0.5.9`

不具合や要望は [GitHub Issues](https://github.com/arula-folne/Fledge/issues) からお知らせください。
