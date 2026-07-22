#!/usr/bin/env python3
"""Re-acquire and rebuild the 効果音ラボ packs (sfx/lab/ + voice-jp/) from scratch.

    python3 content/assets/audio/sfx/lab/ACQUIRE.py

Reads the two MANIFEST.json files, re-downloads every clip from the `sourceUrl`
recorded there, and re-runs the exact conversion pipeline described in each
manifest's `pipeline` block. Output is byte-comparable to what is checked in.

LICENCE — read sfx/lab/MANIFEST.json `licence` before running or editing this.
Two rules bind this script specifically:
  * Download from soundeffect-lab.info ONLY. Byte-identical copies exist on
    ニコニ・コモンズ under a commercial-RESTRICTED licence. Never point the URLs
    at a mirror.
  * No hotlinking at runtime. This is a build-time fetch to self-host; the
    shipped client must never request soundeffect-lab.info.
"""
import json, os, re, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.normpath(os.path.join(HERE, "..", ".."))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

TRIM = ("silenceremove=start_periods=1:start_duration=0:start_threshold=-55dB:"
        "start_silence=0.02:detection=peak,areverse,"
        "silenceremove=start_periods=1:start_duration=0:start_threshold=-55dB:"
        "start_silence=0.02:detection=peak,areverse")
BASE = "aresample=44100,aformat=channel_layouts=mono," + TRIM
SFX_PEAK_TARGET, VOX_MEAN_TARGET, VOX_PEAK_CEIL = -3.0, -15.0, -1.5


def sh(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("FAILED: %s\n%s" % (" ".join(args), r.stderr[-1500:]))
    return r


def measure(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                        "volumedetect", "-f", "null", os.devnull],
                       capture_output=True, text=True)
    return (float(re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr).group(1)),
            float(re.search(r"max_volume: (-?[\d.]+) dB", r.stderr).group(1)))


def tail_peak(path):
    d = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "csv=p=0", path]).stdout.strip())
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-ss", "%.4f" % max(0, d - .025),
                        "-i", path, "-af", "volumedetect", "-f", "null", os.devnull],
                       capture_output=True, text=True)
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else -99.0


def encode(src, dst, fmt, gain, declick):
    af = BASE
    if declick:
        af += ",areverse,afade=t=in:st=0:d=0.020,areverse"
    if abs(gain) > 0.005:
        af += ",volume=%.2fdB" % gain
    codec = (["-c:a", "pcm_s16le"] if fmt == "wav"
             else ["-c:a", "libmp3lame", "-b:a", "192k"])
    sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", af] + codec +
       ["-ar", "44100", "-ac", "1", dst])


def build(manifest_path, outdir, mode):
    man = json.load(open(manifest_path, encoding="utf-8"))
    # Cache the untouched downloads and the intermediate stage files OUTSIDE the
    # asset tree: content/assets/ is shipped, and neither the raw originals nor
    # the pre-gain stage WAVs belong in it.
    raw = os.path.join(tempfile.gettempdir(), "ggd-soundeffect-lab-raw")
    os.makedirs(raw, exist_ok=True)
    for c in man["clips"]:
        src = os.path.join(raw, c["sourceFile"])
        if not os.path.exists(src):
            # curl, not urllib: a stock python.org build has no CA bundle wired up
            # and urlopen dies with CERTIFICATE_VERIFY_FAILED on this host.
            sh(["curl", "-fsS", "-A", UA, "-e", c["sourcePage"], "-o", src,
                c["sourceUrl"]])
            got = os.path.getsize(src)
            if got != c["sourceBytes"]:
                print("  NOTE %s: %d bytes, manifest recorded %d — the origin file "
                      "changed; re-verify before trusting the rebuild"
                      % (c["sourceFile"], got, c["sourceBytes"]))
            time.sleep(0.7)                      # be polite to the origin
        dst = os.path.join(outdir, c["file"])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        fmt = "wav" if dst.endswith(".wav") else "mp3"
        stage = os.path.join(raw, os.path.basename(dst) + ".stage.wav")
        encode(src, stage, "wav", 0.0, False)
        declick = tail_peak(stage) > -35.0
        if declick:
            encode(src, stage, "wav", 0.0, True)
        mean0, peak0 = measure(stage)
        if mode == "peak":
            gain = SFX_PEAK_TARGET - peak0
        else:
            gain = VOX_MEAN_TARGET - mean0
            if peak0 + gain > VOX_PEAK_CEIL:
                gain = VOX_PEAK_CEIL - peak0
        encode(src, dst, fmt, gain, declick)
        # A source that overshoots 0 dBFS after the mono downmix reads back off a
        # clamped 16-bit stage file, so the first estimate lands hot. Correct it.
        for _ in range(3):
            _, peak = measure(dst)
            err = (SFX_PEAK_TARGET if mode == "peak" else VOX_PEAK_CEIL) - peak
            if (abs(err) <= 0.12) if mode == "peak" else (peak <= VOX_PEAK_CEIL + 0.12):
                break
            gain += err
            encode(src, dst, fmt, gain, declick)
        print("  %-40s %+6.2f dB%s" % (c["file"], gain, "  (de-clicked)" if declick else ""))


print("sfx/lab/  (peak -3.0 dBFS)")
build(os.path.join(HERE, "MANIFEST.json"), HERE, "peak")
print("voice-jp/  (mean -15.0 dB, peak ceiling -1.5 dB)")
build(os.path.join(AUD, "voice-jp", "MANIFEST.json"), os.path.join(AUD, "voice-jp"), "mean")
print("\nDone. Verify with sfx/lab/VERIFY.py")
