#!/usr/bin/env python3
"""Build a 30s stereo SFX bed (no BGM) by placing short WAV cues on a timeline."""
from __future__ import annotations

import struct
import wave
from pathlib import Path

SR = 44100
DURATION = 30.0
N = int(SR * DURATION)
DIR = Path(__file__).resolve().parent / "sfx"


def read_mono(path: Path) -> list[float]:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == SR
        nch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw == 2:
        samples = list(struct.unpack("<" + "h" * (len(raw) // 2), raw))
    else:
        raise SystemExit(f"unsupported width {sw}")
    if nch == 2:
        samples = [(samples[i] + samples[i + 1]) / 2 for i in range(0, len(samples), 2)]
    return [s / 32768.0 for s in samples]


def place(buf: list[float], clip: list[float], t: float, gain: float = 1.0) -> None:
    start = int(t * SR)
    for i, v in enumerate(clip):
        idx = start + i
        if 0 <= idx < len(buf):
            buf[idx] += v * gain


def write_stereo(path: Path, buf: list[float]) -> None:
    # soft limiter
    peak = max(1e-9, max(abs(x) for x in buf))
    scale = min(1.0, 0.92 / peak)
    frames = bytearray()
    for x in buf:
        s = int(max(-32767, min(32767, round(x * scale * 32767))))
        frames += struct.pack("<hh", s, s)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)


def main() -> None:
    whoosh = read_mono(DIR / "whoosh.wav")
    tick = read_mono(DIR / "tick.wav")
    swoosh = read_mono(DIR / "swoosh.wav")
    pop = read_mono(DIR / "pop.wav")
    stinger = read_mono(DIR / "stinger.wav")
    settle = read_mono(DIR / "settle.wav")

    buf = [0.0] * N
    cues = [
        (whoosh, 0.45, 0.95),
        (tick, 1.55, 0.85),
        (tick, 2.15, 0.75),
        (swoosh, 5.20, 0.85),
        (tick, 5.50, 0.70),
        (settle, 6.20, 0.70),
        (swoosh, 9.40, 0.80),
        (tick, 9.80, 0.70),
        (swoosh, 13.60, 0.80),
        (tick, 14.00, 0.70),
        (swoosh, 17.60, 0.80),
        (tick, 18.00, 0.70),
        (pop, 22.00, 0.90),
        (pop, 22.22, 0.85),
        (pop, 22.44, 0.85),
        (pop, 22.66, 0.85),
        (whoosh, 26.30, 0.85),
        (tick, 26.80, 0.75),
        (stinger, 28.00, 0.95),
    ]
    for clip, t, g in cues:
        place(buf, clip, t, g)

    out = DIR / "fledge_sfx_mix.wav"
    write_stereo(out, buf)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
