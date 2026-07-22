#!/usr/bin/env python3
"""Assemble content/assets/audio/bgm/MANIFEST.json from the render metadata.

    python3 tools/bgm-gen/src/manifest.py            # merge + write
    python3 tools/bgm-gen/src/manifest.py --check    # print, write nothing

Each `render.py` run drops `tools/bgm-gen/build/<id>.meta.json`. This merges
those into the manifest, REPLACING the entry for every track that has been
regenerated and LEAVING every other entry exactly as it was.

That mixed state is the point: the eleven tracks are replaced in parallel, and
a half-finished pack must never claim that a self-generated track came from
魔王魂 (or that a 魔王魂 track did not). The schema note is rewritten each run to
say which tracks are which, and the attribution requirement is only dropped
once no third-party track is left.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BUILD = os.path.join(HERE, "..", "build")
MANIFEST = os.path.join(ROOT, "content", "assets", "audio", "bgm", "MANIFEST.json")

SLOTS = ["menu", "menuNocturne", "lobby", "room", "champSelect", "intermission",
         "combat", "battleStart", "victory", "defeat", "settlement", "fireRing"]

OWN_LICENSE = (
    "Own work. Synthesised from scratch by tools/bgm-gen (numpy DSP + ffmpeg); "
    "no samples, no third-party audio, no model-generated audio. No attribution "
    "required, no third-party terms apply."
)

NOTE_HEAD = (
    "Background music manifest. All files are MP3 128kbps 44.1kHz stereo, "
    "loudness-normalised to circa -16 LUFS with a two-pass LINEAR ffmpeg loudnorm "
    "(I=-16:TP=-1.5:LRA=11) so the applied gain is pure and deterministic. "
    "Tracks with loop=true are seamless self-joined loops: a whole number of bars "
    "at the track's BPM was rendered, then the 0.3s of audio immediately following "
    "the cut-end was crossfaded onto the segment's 0.3s head, so the file end flows "
    "continuously into the file start with no click — play with gapless looping "
    "enabled. Tracks with loop=false are one-shot stings that fade to silence."
)

NOTE_GEN = (
    "SELF-GENERATED TRACKS (source=bgm-gen): written and synthesised in this repo "
    "by tools/bgm-gen — a deterministic score->audio pipeline. Every sound is "
    "computed from numpy arrays (formant-synthesised SATB choir, supersaw, "
    "Karplus-Strong pluck, additive struck piano, membrane-mode taiko, noise-based "
    "kit and FX); nothing is sampled and nothing is downloaded. Re-render a track "
    "byte-for-byte with `python3 tools/bgm-gen/src/render.py <scene>`; the `seed` "
    "field is the only source of randomness. These carry NO attribution "
    "requirement. The pack shares one key family (D minor / F major), one BPM "
    "family (67.5 / 90 / 135 / 180, all rational multiples of 90 and all "
    "sample-aligned at 44.1kHz), one loop GRID (1 881 600 samples = 42.667s; every "
    "looping track is that length or an integer multiple of it, so all of them are "
    "a whole number of bars in every tempo of the family - menu, combat and "
    "intermission run at 2x = 3 763 200 samples) and one lead hook, so all of them "
    "read as a single release."
)

NOTE_THIRD = (
    "THIRD-PARTY TRACKS still present in this pack are listed with their own "
    "title/author/license/sourceUrl fields. ATTRIBUTION REQUIRED while any of them "
    "remains: every track from the 魔王魂 (Maoudamashii) library by 森田交一 "
    "(Koichi Morita) obliges the in-game credits/settings screen to display "
    "「音楽：魔王魂 (https://maou.audio/)」. See content/assets/CREDITS.md."
)

NOTE_ALL_OWN = (
    "NO THIRD-PARTY MUSIC REMAINS in this pack: every track is own work, so the "
    "魔王魂 music credit line is no longer a license requirement for BGM. Check "
    "content/assets/CREDITS.md before removing it — other asset classes may still "
    "require it. CONTRAST WITH WHAT THIS REPLACED: the 魔王魂 (Maoudamashii) pack "
    "by 森田交一 (Koichi Morita) was free for commercial game use but carried a "
    "MANDATORY credit — 「音楽：魔王魂 (https://maou.audio/)」 had to be displayed "
    "in-game, and its terms forbid AI training and track redistribution. Every "
    "track in this manifest carries NO attribution obligation, no display "
    "requirement and no third-party terms of any kind: the repo owns them "
    "outright — including menuNocturne, which has no counterpart in the pack it "
    "replaced (it is a second login theme, not a substitution). See "
    "generator.pendingSwap for what has and has not actually been switched over."
)

# The audition/approval state. The eleven files already SIT AT the paths
# audio-map.json references, so there is no path edit left to make — what is
# still pending is the licence paperwork, and the user's decision.
PENDING_SWAP = {
    "status": "PENDING USER APPROVAL",
    "auditionPage": "apps/client/public/bgm-audition.html",
    "auditionURL": "http://localhost:39527/bgm-audition.html (client dev server)",
    "regenerateAudition": "python3 tools/bgm-gen/src/audition.py",
    "audioMapChangeRequired": False,
    "audioMapNote": (
        "content/config/audio-map.json's original 11 bgm keys needed no edit: "
        "they already point at assets/audio/bgm/<scene>.mp3, which is exactly "
        "where render.py writes. ONE key was ADDED afterwards, menuNocturne "
        "(task #88) — a NEW slot with no 魔王魂 predecessor, so it replaced "
        "nothing. That is also why the swap is already real on "
        "disk — rendering OVERWROTE the 魔王魂 files in place, and this repo has "
        "no VCS history to restore them from. Restoring the old pack would mean "
        "re-downloading it from maou.audio."
    ),
    "followOnsStillPending": [
        "content/assets/CREDITS.md — the mandatory 「音楽：魔王魂」 BGM credit line "
        "can be removed once the user approves this pack. Verify no OTHER asset "
        "class still requires it before deleting.",
        "task #13 (in-game credits) — its obligation SHRINKS: 魔王魂 no longer has "
        "to appear on the in-game credits/settings screen on account of BGM. The "
        "CC-BY 4.0 dragon model and any other attribution assets are unaffected.",
    ],
}


def entry_from_meta(m: dict) -> dict:
    return {
        "scene": m["scene"],
        "file": m["file"],
        "durationSec": m["durationSec"],
        "loop": m["loop"],
        "title": m.get("title") or m["scene"],
        "author": "GGD (tools/bgm-gen)",
        "license": OWN_LICENSE,
        "source": "bgm-gen",
        "score": f"tools/bgm-gen/scores/{m['scene']}.py",
        "mood": m.get("mood", ""),
        "bpm": m.get("bpm"),
        "bars": m.get("bars"),
        "key": m.get("key"),
        "seed": m.get("seed"),
        "editNotes": (
            f"Rendered by tools/bgm-gen from scores/{m['scene']}.py "
            f"({m.get('bars')} bars @ {m.get('bpm')} bpm, key {m.get('key')}, "
            f"seed {m.get('seed')}). Pre-normalisation loudness "
            f"{m.get('inputLufs')} LUFS / true peak {m.get('inputTruePeakDb')} dB; "
            f"two-pass linear loudnorm to {m.get('targetLufs')} LUFS."
            + (" Seamless 0.3s crossfade self-join." if m["loop"]
               else " One-shot sting, fades to silence.")
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    with open(MANIFEST) as f:
        old = json.load(f)
    by_scene = {t["scene"]: t for t in old.get("tracks", [])}

    generated: list[str] = []
    for slot in SLOTS:
        p = os.path.join(BUILD, f"{slot}.meta.json")
        if not os.path.exists(p):
            continue
        with open(p) as f:
            by_scene[slot] = entry_from_meta(json.load(f))
        generated.append(slot)

    remaining = [s for s in SLOTS if by_scene.get(s, {}).get("source") != "bgm-gen"]
    note = NOTE_HEAD + " " + NOTE_GEN + " " + (NOTE_ALL_OWN if not remaining else NOTE_THIRD)
    out = {
        "schemaNote": note,
        "generator": {
            "tool": "tools/bgm-gen",
            "entry": "python3 tools/bgm-gen/src/render.py <scene>|--all",
            "manifest": "python3 tools/bgm-gen/src/manifest.py",
            "audition": "python3 tools/bgm-gen/src/audition.py",
            "gates": ["python3 tools/bgm-gen/probe/choir_check.py",
                      "python3 tools/bgm-gen/probe/track_check.py"],
            "selfGenerated": generated,
            "stillThirdParty": remaining,
            **({} if remaining else {"pendingSwap": PENDING_SWAP}),
        },
        "tracks": [by_scene[s] for s in SLOTS if s in by_scene],
    }
    print(f"self-generated: {', '.join(generated) or '(none)'}")
    print(f"still third-party: {', '.join(remaining) or '(none)'}")
    if a.check:
        return 0
    with open(MANIFEST, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
