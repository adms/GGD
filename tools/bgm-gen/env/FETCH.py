#!/usr/bin/env python3
"""Fetch the场地 scene-sound sources from 効果音ラボ and stage them for bgm-gen.

    python3 tools/bgm-gen/env/FETCH.py

Reads `MANIFEST.json`'s `scenes` table, downloads each unique clip ONCE from
soundeffect-lab.info, converts it to mono 44.1 kHz 16-bit WAV (the format the
renderer mixes in), and writes the per-clip provenance back into `clips`.

LICENCE — read `MANIFEST.json`'s `licence` block before running or editing.
Two rules bind this script specifically, both inherited from the existing pack
at content/assets/audio/sfx/lab/ACQUIRE.py:
  * Download from soundeffect-lab.info ONLY (byte-identical copies exist on
    ニコニ・コモンズ under a commercially RESTRICTED licence).
  * No hotlinking at runtime — this is a build-time fetch; the clips end up
    baked inside content/assets/audio/bgm/map.*.mp3.
"""
import hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
#: The downloaded sources, byte-identical to soundeffect-lab.info. COMMITTED —
#: these are the deterministic INPUT to thirteen rendered tracks, and a source
#: site that changes or removes a clip must not silently change our music.
MP3 = os.path.join(HERE, "mp3")
#: The decoded mono 44.1 kHz form the renderer mixes. A gitignored CACHE:
#: derived from MP3 by one ffmpeg call, and 36 MB of wav is not worth a commit
#: when the 3 MB it comes from is already committed beside it.
WAV = os.path.join(HERE, "wav")
BASE = "https://soundeffect-lab.info/sound"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")


def src_url(rel: str) -> str:
    """`<category>/<name>` -> the clip URL.

    ⚠️ The `voice/` tree is laid out differently from every other category:
    media sits at `/sound/voice/mp3/<sub>/<name>.mp3`, NOT
    `/sound/voice/<sub>/mp3/<name>.mp3`. Getting this wrong produces a curl
    exit 56 that looks exactly like the hotlink refusal above."""
    cat, name = rel.rsplit("/", 1)
    if cat.startswith("voice/"):
        sub = cat.split("/", 1)[1]
        return f"{BASE}/voice/mp3/{sub}/{name}.mp3"
    return f"{BASE}/{cat}/mp3/{name}.mp3"


def page_url(rel: str) -> str:
    cat = rel.rsplit("/", 1)[0]
    if cat.startswith("voice/"):
        return f"{BASE}/voice/game.html"
    return f"{BASE}/{cat}/"


def main() -> int:
    mpath = os.path.join(HERE, "MANIFEST.json")
    man = json.load(open(mpath, encoding="utf-8"))
    os.makedirs(MP3, exist_ok=True)
    os.makedirs(WAV, exist_ok=True)
    rels: dict[str, str] = {}
    for entries in man["scenes"].values():
        for rel, title, *_rest in entries:
            rels[rel] = title

    clips, failed = [], []
    for rel, title in sorted(rels.items()):
        stem = rel.replace("/", "__")
        out = os.path.join(WAV, stem + ".wav")
        src = os.path.join(MP3, stem + ".mp3")
        url = src_url(rel)
        tmp = src
        if not os.path.exists(src):
            try:
                # curl, not urllib: this machine's Python has no CA bundle, and
                # ⛔ the fix for that is NOT to disable certificate verification
                # on a script whose whole job is fetching third-party binaries.
                # ⚠️ The Referer is REQUIRED, not politeness: soundeffect-lab.info
                # blocks hotlinked media, and without it the TLS handshake and the
                # HTTP/2 stream both succeed while the response never arrives —
                # curl exit 56, which reads like a network fault rather than a
                # deliberate refusal. Sending the clip's own catalogue page is what
                # a browser does when you press play there.
                subprocess.run(["curl", "-sSfL", "--max-time", "60", "-A", UA,
                                "-e", page_url(rel),
                                "-H", "Accept: audio/*;q=0.9,*/*;q=0.5",
                                "-o", tmp, url], check=True, capture_output=True)
                time.sleep(0.6)                      # be a polite client
            except Exception as e:                    # noqa: BLE001
                failed.append((rel, repr(e)))
                print(f"  ⛔ {rel}: {e}", file=sys.stderr)
                continue
        # decode into the cache (idempotent; rebuilt from the committed mp3)
        if not os.path.exists(out):
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-nostdin", "-i", src,
                            "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out],
                           check=True)
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                              "format=duration", "-of", "csv=p=0", out],
                             capture_output=True, text=True).stdout.strip()
        clips.append({"rel": rel, "mp3": os.path.basename(src),
                      "wav": os.path.basename(out), "sourceTitle": title,
                      "sourceBytes": os.path.getsize(src),
                      "sha256": hashlib.sha256(open(src, "rb").read()).hexdigest()[:16],
                      "sourceUrl": url, "sourcePage": page_url(rel),
                      "bytes": os.path.getsize(out), "durationSec": round(float(dur or 0), 3)})
        print(f"  ✓ {rel:46s} {float(dur or 0):6.2f}s")

    man["clips"] = clips
    json.dump(man, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(mpath, "a", encoding="utf-8").write("\n")
    if failed:
        print(f"⛔ {len(failed)} 支沒抓到 —— ⛔ 不要當成沒事:", file=sys.stderr)
        for rel, e in failed:
            print(f"   {rel}  {e}", file=sys.stderr)
        return 1
    print(f"✓ {len(clips)} 支場景素材就緒 -> {WAV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
