#!/usr/bin/env bash
# Generate UI/motion SFX for Fledge intro (no BGM), then mix to 30s bed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DIR="$ROOT/sfx"
mkdir -p "$DIR"
cd "$DIR"

ffmpeg -y -f lavfi -i "anoisesrc=color=pink:duration=0.55:sample_rate=44100,highpass=f=200,lowpass=f=2500,afade=t=in:st=0:d=0.05,afade=t=out:st=0.25:d=0.3,volume=0.45" whoosh.wav
ffmpeg -y -f lavfi -i "sine=f=880:d=0.05,afade=t=out:st=0.01:d=0.04,volume=0.25" tick.wav
ffmpeg -y -f lavfi -i "sine=f=520:d=0.08,afade=t=out:st=0.02:d=0.06,volume=0.22" pop.wav
ffmpeg -y -f lavfi -i "sine=f=660:d=0.12,afade=t=out:st=0.03:d=0.09,volume=0.2" chime_a.wav
ffmpeg -y -f lavfi -i "sine=f=990:d=0.14,afade=t=out:st=0.04:d=0.1,volume=0.18" chime_b.wav
ffmpeg -y -f lavfi -i "anoisesrc=color=white:duration=0.35:sample_rate=44100,bandpass=f=1800:width_type=h:width=1200,afade=t=in:st=0:d=0.02,afade=t=out:st=0.12:d=0.22,volume=0.28" swoosh.wav
ffmpeg -y -f lavfi -i "sine=f=120:d=0.12,afade=t=out:st=0.02:d=0.1,volume=0.18" settle.wav
ffmpeg -y -i chime_a.wav -i chime_b.wav -filter_complex \
  "[0]adelay=0|0[a];[1]adelay=90|90[b];[a][b]amix=inputs=2:duration=longest,volume=0.9,afade=t=out:st=0.18:d=0.2" \
  -t 0.4 stinger.wav

python3 "$ROOT/mix-sfx.py"
ffmpeg -y -i fledge_sfx_mix.wav -af "volume=10dB,alimiter=limit=0.95" fledge_sfx_mix_loud.wav
echo "SFX ready:"
ls -lh fledge_sfx_mix.wav fledge_sfx_mix_loud.wav
