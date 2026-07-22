#!/usr/bin/env python3
"""Independent gate over the STAGED files. Reads the tree, not records.json."""
import json, os, re, subprocess, glob, sys

AUD = "/Users/Takuro/GGD/content/assets/audio"
files = sorted(glob.glob(AUD + "/sfx/lab/*.wav") + glob.glob(AUD + "/sfx/lab/*.mp3") +
               glob.glob(AUD + "/voice-jp/*.mp3") + glob.glob(AUD + "/voice-jp/candidates/*.mp3"))

fails, warns = [], []
print(f"{'file':<44}{'codec':<11}{'sr':>7}{'ch':>4}{'dur':>8}{'mean':>8}{'peak':>8}{'KB':>8}")
for f in files:
    rel = os.path.relpath(f, AUD)
    p = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                        "-of", "json", f], capture_output=True, text=True)
    if p.returncode != 0:
        fails.append(f"{rel}: ffprobe failed"); continue
    j = json.loads(p.stdout)
    au = [s for s in j["streams"] if s.get("codec_type") == "audio"]
    if len(au) != 1:
        fails.append(f"{rel}: expected exactly 1 audio stream, got {len(au)}"); continue
    s = au[0]
    dur = float(j["format"]["duration"])
    sr, ch, codec = int(s["sample_rate"]), int(s["channels"]), s["codec_name"]
    v = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", f, "-af", "volumedetect",
                        "-f", "null", "/dev/null"], capture_output=True, text=True)
    mean = float(re.search(r"mean_volume: (-?[\d.]+) dB", v.stderr).group(1))
    peak = float(re.search(r"max_volume: (-?[\d.]+) dB", v.stderr).group(1))
    kb = os.path.getsize(f) / 1024
    print(f"{rel:<44}{codec:<11}{sr:>7}{ch:>4}{dur:>8.3f}{mean:>8.1f}{peak:>8.1f}{kb:>8.1f}")

    if dur <= 0.0:               fails.append(f"{rel}: zero duration")
    if sr != 44100:              fails.append(f"{rel}: sample rate {sr} != 44100")
    if ch != 1:                  fails.append(f"{rel}: {ch} channels, expected mono")
    if mean <= -35.0:            fails.append(f"{rel}: mean {mean} dB at/below the -35 dB silence floor")
    if peak > -0.1:              fails.append(f"{rel}: peak {peak} dB — clipping risk")
    if f.endswith(".wav") and codec != "pcm_s16le":
        fails.append(f"{rel}: WAV codec is {codec}, expected pcm_s16le")
    if f.endswith(".mp3") and codec != "mp3":
        fails.append(f"{rel}: MP3 codec is {codec}")
    # advisory
    is_vox = rel.startswith("voice-jp/")
    if not is_vox and abs(peak - (-3.0)) > 0.35:
        warns.append(f"{rel}: peak {peak} dB, SFX target is -3.0")
    if is_vox and not (-18.5 <= mean <= -14.5):
        warns.append(f"{rel}: mean {mean} dB outside the announcer band -15.0..-18.2")
    if mean < -30.0:
        warns.append(f"{rel}: mean {mean} dB — very sparse; needs a high per-event gain")

print(f"\nchecked {len(files)} files")
for w in warns: print("  WARN ", w)
for x in fails: print("  FAIL ", x)
print("\nRESULT:", "FAIL" if fails else "PASS")
sys.exit(1 if fails else 0)
