# Fledge 紹介モーションビデオ（Ver.0.5.35）

BGM なし・効果音ありの製品紹介映像（30秒 / 1920×1080 / 30fps）。

## 成果物

- `out/fledge_intro_v0535.mp4` … 最終書き出し

## 構成

| 秒 | 内容 |
|----|------|
| 0–5 | アイコン → Fledge / Ver.0.5.35 |
| 5–9 | タグライン（軽快・モダン / 広告・解析なし） |
| 9–13 | ホーム UI |
| 13–17 | Modrinth コンテンツ UI |
| 17–21 | スキン 3D プレビュー UI |
| 21–26 | Fledge らしさ（4 カード） |
| 26–30 | エンドカード（GitHub Releases） |

## 再生成

```bash
cd promo-video
npm install
# SFX（個別クリップ → 30s ミックス）
bash -c 'cd sfx && ffmpeg ...'  # または既存 mix-sfx.py 用クリップがある場合:
python3 mix-sfx.py
node render-frames.cjs
ffmpeg -y -framerate 30 -i frames/frame_%05d.png \
  -i sfx/fledge_sfx_mix_loud.wav \
  -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -crf 18 \
  -c:a aac -b:a 192k -shortest -movflags +faststart \
  out/fledge_intro_v0535.mp4
```

`frames/` は再生成用の中間ファイルのため Git 管理外。
